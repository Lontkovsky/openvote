import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import type pg from 'pg';
import { Checkpoint, Envelope, Manifest, Receipt, ResultContract, representativenessWarning } from '../../../packages/domain/src/index.ts';
import { resultCsv, resultSvg } from '../../../packages/domain/src/result-exports.ts';
import { application, authorize, core, database, envelope, Failure, parseNativeShare, required, sha, transaction } from './common.ts';
import type { ConfigType } from './common.ts';

type ElectionRow = { id: string; manifest_raw: string; manifest_hash: string; archive: string; state: string;
  opens_at: Date; closes_at: Date; threshold: number; final_archive: string | null; result: unknown };
const Params = z.strictObject({ id: z.string().regex(/^[A-Za-z0-9]{14}$/) });
const CoreVerification = z.object({ ballotCount: z.number().int().nonnegative(), election: z.looseObject({ uuid: z.string(), description: z.string() }), result: z.unknown() });
const CoreAccepted = z.strictObject({ archive: z.string(), tracker: z.string(), replayed: z.boolean(), credential: z.string() });
const CoreClosed = z.strictObject({ archive: z.string(), ballotCount: z.number().int().nonnegative() });
const CoreResult = z.strictObject({ archive: z.string(), result: z.strictObject({ result: z.tuple([z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative()])]) }) });

export async function ballotApp(config: ConfigType, publicOrigin: string) {
  const app = await application(config, publicOrigin), pool = database(config);
  app.addHook('onClose', () => pool.end());
  async function checkpoint(client: pg.PoolClient, election: ElectionRow) {
    const previous = await client.query<{ envelope: unknown; sequence: number }>('SELECT envelope,sequence FROM checkpoints WHERE poll_id=$1 ORDER BY sequence DESC LIMIT 1', [election.id]);
    const prior = previous.rows[0];
    const trackers = await client.query<{ tracker: string }>('SELECT tracker FROM ballots WHERE poll_id=$1 ORDER BY tracker', [election.id]);
    const payload = Checkpoint.parse({ protocol: 'openvote-checkpoint-v1', pollId: election.id, manifestHash: election.manifest_hash,
      sequence: prior ? prior.sequence + 1 : 0, previous: prior ? sha(JSON.stringify(Envelope.parse(prior.envelope))) : null,
      archiveHash: sha(Buffer.from(election.archive, 'base64')), state: election.state, receipts: trackers.rows.map(r => r.tracker) });
    const signed = envelope(payload, required(config.signingKey));
    await client.query('INSERT INTO checkpoints(poll_id,sequence,envelope) VALUES($1,$2,$3)', [election.id, payload.sequence, signed]);
    return signed;
  }
  async function election(id: string) {
    const result = await pool.query<ElectionRow>('SELECT * FROM elections WHERE id=$1', [id]);
    const row = result.rows[0];
    if (!row) throw new Failure('POLL_NOT_FOUND', 404);
    return row;
  }
  async function publishedResult(id: string) {
    const record = await election(id);
    if (record.state !== 'Published') throw new Failure(record.state === 'ResultsSuppressed' ? 'RESULTS_SUPPRESSED' : 'RESULT_NOT_PUBLISHED', 409);
    return ResultContract.parse(record.result);
  }
  app.post('/internal/register', async request => {
    authorize(request.headers.authorization, config.serviceToken);
    const input = z.strictObject({ id: z.string(), electionRaw: z.string(), archive: z.string() }).parse(request.body);
    const verified = CoreVerification.parse(await core(config, { action: 'verify', archive: input.archive }));
    const manifest = Manifest.parse(JSON.parse(verified.election.description));
    if (verified.ballotCount !== 0 || input.id !== verified.election.uuid || JSON.parse(input.electionRaw).uuid !== input.id
      || !isDeepStrictEqual(JSON.parse(input.electionRaw), verified.election)) throw new Failure('SETUP_MISMATCH', 422);
    if (manifest.environment !== config.environment || Date.parse(manifest.closesAt) <= Date.now()) throw new Failure('INVALID_ENVIRONMENT_OR_DEADLINE', 422);
    await transaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [input.id]);
      const prior = await client.query<ElectionRow>('SELECT * FROM elections WHERE id=$1', [input.id]);
      if (prior.rows[0]) {
        if (prior.rows[0].manifest_raw !== input.electionRaw) throw new Failure('IMMUTABLE_MANIFEST_MISMATCH', 409);
        const genesis = await client.query<{ envelope: unknown }>('SELECT envelope FROM checkpoints WHERE poll_id=$1 AND sequence=0', [input.id]);
        const payload = Checkpoint.parse(JSON.parse(Envelope.parse(required(genesis.rows[0]).envelope).payload));
        if (payload.archiveHash !== sha(Buffer.from(input.archive, 'base64'))) throw new Failure('IMMUTABLE_ROSTER_MISMATCH', 409);
        return;
      }
      await client.query('INSERT INTO elections(id,manifest_raw,manifest_hash,archive,state,opens_at,closes_at,threshold) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [input.id, input.electionRaw, sha(input.electionRaw), input.archive, 'Scheduled', manifest.opensAt, manifest.closesAt, manifest.publicationThreshold]);
      const result = await client.query<ElectionRow>('SELECT * FROM elections WHERE id=$1', [input.id]);
      await checkpoint(client, required(result.rows[0]));
    });
    return { registered: true, manifestHash: sha(input.electionRaw) };
  });
  app.get('/v1/elections/:id/manifest', async request => {
    const { id } = Params.parse(request.params), record = await election(id);
    return { electionRaw: record.manifest_raw, manifestHash: record.manifest_hash, environment: config.environment,
      state: record.state === 'Scheduled' && record.opens_at.getTime() <= Date.now() && record.closes_at.getTime() > Date.now() ? 'Open' : record.state,
      checkpointPublicKey: required(config.publicKey) };
  });
  app.post('/v1/elections/:id/ballots', async request => {
    if (request.headers.authorization !== undefined || request.headers.cookie !== undefined || request.headers['x-user-id'] !== undefined) throw new Failure('IDENTITY_METADATA_FORBIDDEN', 400);
    const { id } = Params.parse(request.params);
    const { ballot } = z.strictObject({ ballot: z.string().min(100).max(100000) }).parse(request.body);
    return transaction(pool, async client => {
      const result = await client.query<ElectionRow>('SELECT * FROM elections WHERE id=$1 FOR UPDATE', [id]);
      const record = result.rows[0];
      if (!record) throw new Failure('POLL_NOT_FOUND', 404);
      const tracker = Buffer.from(sha(ballot), 'hex').toString('base64').replace(/=+$/, '');
      const existing = await client.query<{ receipt: unknown }>('SELECT receipt FROM ballots WHERE poll_id=$1 AND tracker=$2', [id, tracker]);
      if (existing.rows[0]) return { accepted: true, idempotent: true, receipt: Envelope.parse(existing.rows[0].receipt) };
      if (!['Scheduled', 'Open'].includes(record.state) || Date.now() < record.opens_at.getTime() || Date.now() >= record.closes_at.getTime()) throw new Failure('VOTING_NOT_OPEN', 409);
      const accepted = CoreAccepted.parse(await core(config, { action: 'accept', archive: record.archive, ballot }));
      if (accepted.tracker !== tracker) throw new Failure('TRACKER_MISMATCH', 422);
      const receipt = envelope(Receipt.parse({ protocol: 'openvote-receipt-v1', pollId: id, manifestHash: record.manifest_hash, tracker }), required(config.signingKey));
      await client.query('INSERT INTO ballots(poll_id,credential,tracker,receipt) VALUES($1,$2,$3,$4)', [id, accepted.credential, tracker, receipt]);
      await client.query('UPDATE elections SET archive=$2,state=$3 WHERE id=$1', [id, accepted.archive, 'Open']);
      return { accepted: true, idempotent: false, receipt };
    });
  });
  app.get('/v1/elections/:id/tracker', async request => {
    const { id } = Params.parse(request.params);
    const { tracker } = z.strictObject({ tracker: z.string().min(40).max(50) }).parse(request.query);
    const result = await pool.query<{ receipt: unknown }>('SELECT receipt FROM ballots WHERE poll_id=$1 AND tracker=$2', [id, tracker]);
    return result.rows[0] ? { included: true, receipt: Envelope.parse(result.rows[0].receipt), scope: 'InclusionOnly' }
      : { included: false, scope: 'InclusionOnly' };
  });
  app.post('/internal/close/:id', async request => {
    authorize(request.headers.authorization, config.serviceToken);
    const { id } = Params.parse(request.params);
    return transaction(pool, async client => {
      const found = await client.query<ElectionRow>('SELECT * FROM elections WHERE id=$1 FOR UPDATE', [id]);
      const record = required(found.rows[0]);
      if (record.closes_at.getTime() > Date.now()) throw new Failure('DEADLINE_NOT_REACHED', 409);
      if (record.state === 'Closed' || record.state === 'ResultsSuppressed') return { state: record.state };
      if (!['Scheduled', 'Open'].includes(record.state)) throw new Failure('INVALID_TRANSITION', 409);
      const closed = CoreClosed.parse(await core(config, { action: 'close', archive: record.archive }));
      const state = closed.ballotCount < record.threshold ? 'ResultsSuppressed' : 'Closed';
      await client.query('UPDATE elections SET archive=$2,final_archive=$2,state=$3 WHERE id=$1', [id, closed.archive, state]);
      await checkpoint(client, { ...record, archive: closed.archive, state });
      return { state };
    });
  });
  app.post('/internal/final/:id', async request => {
    authorize(request.headers.authorization, config.serviceToken);
    const { id } = Params.parse(request.params), record = await election(id);
    if (record.state !== 'Closed' || record.final_archive === null) throw new Failure('NO_PUBLISHABLE_FINAL_SET', 409);
    const checkpoints = await pool.query<{ envelope: unknown }>('SELECT envelope FROM checkpoints WHERE poll_id=$1 ORDER BY sequence', [id]);
    return { archive: record.final_archive, checkpoints: checkpoints.rows.map(r => Envelope.parse(r.envelope)), electionRaw: record.manifest_raw };
  });
  app.post('/internal/share/:id', async request => {
    authorize(request.headers.authorization, config.serviceToken);
    const { id } = Params.parse(request.params);
    const input = z.strictObject({ trusteeId: z.number().int().min(1).max(4), share: z.unknown() }).parse(request.body);
    return transaction(pool, async client => {
      const found = await client.query<ElectionRow>('SELECT * FROM elections WHERE id=$1 FOR UPDATE', [id]);
      const record = required(found.rows[0]);
      if (record.state !== 'Closed') throw new Failure('NO_PUBLISHABLE_FINAL_SET', 409);
      const share = parseNativeShare(input.share, input.trusteeId);
      const verified = z.strictObject({ verifiedBy: z.literal('Belenios 3.3.0 check_factor'), trusteeId: z.number().int() }).parse(
        await core(config, { action: 'verify-share', archive: required(record.final_archive), share }));
      if (verified.trusteeId !== input.trusteeId) throw new Failure('TRUSTEE_ID_MISMATCH', 422);
      const existing = await client.query<{ share: string }>('SELECT share FROM shares WHERE poll_id=$1 AND trustee_id=$2', [id, input.trusteeId]);
      if (existing.rows[0]) {
        if (existing.rows[0].share !== share) throw new Failure('SHARE_ALREADY_RECORDED', 409);
      } else await client.query('INSERT INTO shares VALUES($1,$2,$3)', [id, input.trusteeId, share]);
      return { recorded: true };
    });
  });
  app.post('/internal/tally/:id', async request => {
    authorize(request.headers.authorization, config.serviceToken);
    const { id } = Params.parse(request.params);
    return transaction(pool, async client => {
      const found = await client.query<ElectionRow>('SELECT * FROM elections WHERE id=$1 FOR UPDATE', [id]);
      const record = required(found.rows[0]);
      if (record.state === 'Published') return { state: 'Published' };
      if (record.state !== 'Closed') throw new Failure('NO_PUBLISHABLE_FINAL_SET', 409);
      const shares = await client.query<{ trustee_id: number; share: string }>('SELECT trustee_id,share FROM shares WHERE poll_id=$1 ORDER BY trustee_id', [id]);
      if (!shares.rows.some(r => r.trustee_id === 1) || shares.rows.filter(r => r.trustee_id > 1).length < 2) return { state: 'WaitingForQuorum' };
      const published = CoreResult.parse(await core(config, { action: 'finalize', archive: record.archive, shares: shares.rows.map(r => r.share) }));
      const electionData = z.object({ description: z.string() }).parse(JSON.parse(record.manifest_raw));
      const manifest = Manifest.parse(JSON.parse(electionData.description));
      const counts = published.result.result[0], total = counts.reduce((sum, n) => sum + n, 0);
      const recorded = await client.query<{ tracker: string }>('SELECT tracker FROM ballots WHERE poll_id=$1', [id]);
      if (total !== recorded.rows.length || total < record.threshold) throw new Failure('RESULT_COUNT_MISMATCH', 422);
      const result = ResultContract.parse({ apiVersion: 'v1', question: manifest.question, version: manifest.version, pollId: id, policy: manifest.policy,
        acceptedVotes: total, counts, opensAt: manifest.opensAt, closesAt: manifest.closesAt, state: 'Published',
        verification: 'ReferenceVerified', selfSelected: true, representativenessWarning });
      await client.query('UPDATE elections SET archive=$2,result=$3,state=$4 WHERE id=$1', [id, published.archive, result, 'Published']);
      await checkpoint(client, { ...record, archive: published.archive, state: 'Published', result });
      return { state: 'Published' };
    });
  });
  app.post('/internal/state/:id', async request => {
    authorize(request.headers.authorization, config.serviceToken);
    const { id } = Params.parse(request.params);
    const input = z.strictObject({ state: z.enum(['Cancelled', 'Invalidated']) }).parse(request.body);
    await transaction(pool, async client => {
      const found = await client.query<ElectionRow>('SELECT * FROM elections WHERE id=$1 FOR UPDATE', [id]);
      const record = required(found.rows[0]);
      if (input.state === 'Cancelled' && record.state === 'Published') throw new Failure('INVALID_TRANSITION', 409);
      if (input.state === 'Invalidated' && record.state !== 'Published') throw new Failure('INVALID_TRANSITION', 409);
      await client.query('UPDATE elections SET state=$2 WHERE id=$1', [id, input.state]);
      await checkpoint(client, { ...record, state: input.state });
    });
    return { state: input.state };
  });
  app.get('/v1/elections/:id/result', async request => {
    return publishedResult(Params.parse(request.params).id);
  });
  app.get('/v1/elections/:id/result.csv', async (request, reply) => {
    const { id } = Params.parse(request.params), result = await publishedResult(id);
    return reply.type('text/csv; charset=utf-8; header=present').header('content-disposition', `attachment; filename="result-${id}.csv"`).send(resultCsv(result));
  });
  app.get('/v1/elections/:id/share.svg', async (request, reply) => {
    const { id } = Params.parse(request.params), result = await publishedResult(id);
    return reply.type('image/svg+xml; charset=utf-8').header('content-disposition', `attachment; filename="share-${id}.svg"`).send(resultSvg(result));
  });
  app.get('/v1/elections/:id/checkpoints', async request => {
    const { id } = Params.parse(request.params);
    const result = await pool.query<{ envelope: unknown }>('SELECT envelope FROM checkpoints WHERE poll_id=$1 ORDER BY sequence', [id]);
    return { checkpoints: result.rows.map(row => Envelope.parse(row.envelope)), publicKey: required(config.publicKey) };
  });
  app.get('/v1/elections/:id/audit', async request => {
    const { id } = Params.parse(request.params), record = await election(id);
    if (record.state !== 'Published') throw new Failure('AUDIT_NOT_PUBLISHABLE', 409);
    const checkpoints = await pool.query<{ envelope: unknown }>('SELECT envelope FROM checkpoints WHERE poll_id=$1 ORDER BY sequence', [id]);
    return { format: 'openvote-audit-v1', core: 'Belenios 3.3.0', electionRaw: record.manifest_raw, archive: record.archive,
      checkpoints: checkpoints.rows.map(r => Envelope.parse(r.envelope)), result: ResultContract.parse(record.result) };
  });
  return app;
}
