import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { Categories, CommentReactionKind, CommentReactionToken, CommentResponse, CommentsResponse, CommentText, DiscussionComment, Content, Manifest, Poll, Policy, RemovedPoll, Review, Session, validateSchedule } from '../../../packages/domain/src/index.ts';
import type { PollType } from '../../../packages/domain/src/index.ts';
import { application, core, database, Failure, jsonRequest, required, sha, transaction } from './common.ts';
import type { ConfigType } from './common.ts';
import { provision, writeOnce } from './provisioning.ts';
import { developmentCatalogue } from './development-polls.ts';

const Params = z.strictObject({ id: z.string().uuid() });
const CommentParams = z.strictObject({ id: z.string().uuid(), commentId: z.string().uuid() });
type CommentRow = {
  id: string; poll_id: string; parent_id: string | null; body: string | null;
  created_at: Date; deleted_at: Date | null; likes: number; dislikes: number;
};
function discussionComment(row: CommentRow) {
  return DiscussionComment.parse({
    id: row.id, pollId: row.poll_id, parentId: row.parent_id, text: row.body,
    createdAt: row.created_at.toISOString(), deleted: row.deleted_at !== null,
    likes: row.likes, dislikes: row.dislikes,
  });
}
function currentPoll(value: unknown): PollType {
  const poll = Poll.parse(value), now = Date.now();
  if (poll.state === 'Scheduled' && Date.parse(poll.content.opensAt) <= now) poll.state = 'Open';
  if (poll.state === 'Open' && Date.parse(poll.content.closesAt) <= now) poll.state = 'Closed';
  return poll;
}
function cryptoId(poll: PollType): string {
  if (poll.cryptoId === null) throw new Failure('POLL_NOT_PROVISIONED', 409);
  return poll.cryptoId;
}
export async function managementApp(config: ConfigType, publicOrigin: string) {
  const app = await application(config, publicOrigin), pool = database(config), quotas = required(config.quotas);
  app.addHook('onClose', () => pool.end());
  async function identity(header: string | undefined) {
    if (header === undefined || !header.startsWith('Bearer ')) throw new Failure('AUTHENTICATION_REQUIRED', 401);
    const result = Session.parse(await jsonRequest('http://127.0.0.1:4301/internal/introspect', { token: header.slice(7) }, required(config.identityToken)));
    if (!result.verifiedOwner) throw new Failure('VERIFIED_OWNER_REQUIRED', 403);
    return result;
  }
  async function moderator(header: string | undefined) {
    const person = await identity(header);
    if (person.role !== 'moderator') throw new Failure('MODERATOR_REQUIRED', 403);
    return person;
  }
  async function stored(id: string) {
    const result = await pool.query<{ doc: unknown; author_person: string }>('SELECT doc,author_person FROM polls WHERE id=$1', [id]);
    const row = result.rows[0];
    if (!row) throw new Failure('POLL_NOT_FOUND', 404);
    return row;
  }
  async function find(id: string) {
    const row = await stored(id);
    if (RemovedPoll.safeParse(row.doc).success) throw new Failure('POLL_CONTENT_REMOVED', 410);
    return { poll: currentPoll(row.doc), author: row.author_person };
  }
  async function publicPoll(id: string) {
    const developmentPoll = config.environment === 'development' ? developmentCatalogue.find(poll => poll.id === id) : undefined;
    if (developmentPoll !== undefined) return currentPoll(developmentPoll);
    const { poll } = await find(id);
    if (['Draft', 'Review', 'Rejected'].includes(poll.state)) throw new Failure('POLL_NOT_FOUND', 404);
    return poll;
  }
  app.get('/v1/polls', async request => {
    const input = z.strictObject({ q: z.string().max(150).optional(), category: z.union([z.string().max(60), z.array(z.string().max(60)).min(1).max(Categories.length)]).optional(), state: z.string().max(30).optional() }).parse(request.query);
    const selectedCategories = input.category === undefined ? [] : Array.isArray(input.category) ? input.category : [input.category];
    const result = await pool.query<{ doc: unknown }>("SELECT doc FROM polls WHERE doc->>'contentStatus'='Visible' ORDER BY created_at DESC,id DESC");
    const storedPolls = result.rows.map(r => currentPoll(r.doc)).filter(p => !['Draft', 'Review', 'Rejected'].includes(p.state));
    const visiblePolls = config.environment === 'development'
      ? [...storedPolls.filter(p => p.content.question !== 'Чи підтримуєте відкриту публікацію коду тестового проєкту?'), ...developmentCatalogue]
      : storedPolls;
    const polls = visiblePolls
      .filter(p => input.q === undefined || p.content.question.toLocaleLowerCase('uk').includes(input.q.toLocaleLowerCase('uk')))
      .filter(p => selectedCategories.length === 0 || selectedCategories.includes(p.content.category))
      .filter(p => input.state === undefined || p.state === input.state);
    return { polls, sort: 'Час створення: новіші спочатку; за однакового часу — ідентифікатор. Без персоналізації.', environment: config.environment };
  });
  app.get('/v1/polls/:id', async request => {
    const { id } = Params.parse(request.params);
    const developmentPoll = config.environment === 'development' ? developmentCatalogue.find(poll => poll.id === id) : undefined;
    if (developmentPoll !== undefined) return { poll: currentPoll(developmentPoll), events: [] };
    const row = await stored(id), removed = RemovedPoll.safeParse(row.doc);
    if (removed.success) return removed.data;
    const poll = currentPoll(row.doc), author = row.author_person;
    if (['Draft', 'Review', 'Rejected'].includes(poll.state)) {
      const person = await identity(request.headers.authorization);
      if (person.person !== author && person.role !== 'moderator') throw new Failure('POLL_NOT_FOUND', 404);
    }
    const events = await pool.query<{ kind: string; reason: string; actor_role: string; payload: unknown }>('SELECT kind,reason,actor_role,payload FROM events WHERE poll_id=$1 ORDER BY id', [id]);
    return { poll, events: events.rows };
  });
  app.get('/v1/polls/:id/comments', async request => {
    const { id } = Params.parse(request.params);
    await publicPoll(id);
    const result = await pool.query<CommentRow>(`SELECT c.id,c.poll_id,c.parent_id,c.body,c.created_at,c.deleted_at,
      count(*) FILTER (WHERE r.kind='like')::int AS likes,
      count(*) FILTER (WHERE r.kind='dislike')::int AS dislikes
      FROM comments c LEFT JOIN comment_reactions r ON r.comment_id=c.id
      WHERE c.poll_id=$1 GROUP BY c.id ORDER BY c.created_at,c.id`, [id]);
    return CommentsResponse.parse({ comments: result.rows.map(discussionComment) });
  });
  app.post('/v1/polls/:id/comments', async request => {
    const { id } = Params.parse(request.params);
    const input = z.strictObject({ text: CommentText, parentId: z.string().uuid().nullable().optional() }).parse(request.body);
    await publicPoll(id);
    const commentId = randomUUID(), createdAt = new Date();
    const comment = await transaction(pool, async client => {
      if (input.parentId !== undefined && input.parentId !== null) {
        const parent = await client.query<{ deleted_at: Date | null }>('SELECT deleted_at FROM comments WHERE id=$1 AND poll_id=$2 FOR SHARE', [input.parentId, id]);
        if (parent.rows[0] === undefined) throw new Failure('PARENT_COMMENT_NOT_FOUND', 404);
        if (parent.rows[0].deleted_at !== null) throw new Failure('PARENT_COMMENT_DELETED', 409);
      }
      await client.query('INSERT INTO comments(id,poll_id,parent_id,body,created_at,deleted_at) VALUES($1,$2,$3,$4,$5,NULL)',
        [commentId, id, input.parentId ?? null, input.text, createdAt]);
      return DiscussionComment.parse({ id: commentId, pollId: id, parentId: input.parentId ?? null, text: input.text,
        createdAt: createdAt.toISOString(), deleted: false, likes: 0, dislikes: 0 });
    });
    return CommentResponse.parse({ comment });
  });
  app.post('/v1/polls/:id/comments/:commentId/reaction', async request => {
    const { id, commentId } = CommentParams.parse(request.params);
    const input = z.strictObject({ actorToken: CommentReactionToken, kind: CommentReactionKind.nullable() }).parse(request.body);
    await publicPoll(id);
    const comment = await transaction(pool, async client => {
      const found = await client.query<{ deleted_at: Date | null }>('SELECT deleted_at FROM comments WHERE id=$1 AND poll_id=$2 FOR UPDATE', [commentId, id]);
      const row = found.rows[0];
      if (row === undefined) throw new Failure('COMMENT_NOT_FOUND', 404);
      if (row.deleted_at !== null) throw new Failure('COMMENT_DELETED', 409);
      const actorTokenHash = sha(input.actorToken);
      if (input.kind === null) await client.query('DELETE FROM comment_reactions WHERE comment_id=$1 AND actor_token_hash=$2', [commentId, actorTokenHash]);
      else await client.query(`INSERT INTO comment_reactions(comment_id,actor_token_hash,kind) VALUES($1,$2,$3)
        ON CONFLICT(comment_id,actor_token_hash) DO UPDATE SET kind=EXCLUDED.kind`, [commentId, actorTokenHash, input.kind]);
      const updated = await client.query<CommentRow>(`SELECT c.id,c.poll_id,c.parent_id,c.body,c.created_at,c.deleted_at,
        count(*) FILTER (WHERE r.kind='like')::int AS likes,
        count(*) FILTER (WHERE r.kind='dislike')::int AS dislikes
        FROM comments c LEFT JOIN comment_reactions r ON r.comment_id=c.id
        WHERE c.id=$1 AND c.poll_id=$2 GROUP BY c.id`, [commentId, id]);
      return discussionComment(required(updated.rows[0]));
    });
    return CommentResponse.parse({ comment });
  });
  app.get('/v1/similar', async request => {
    const { q } = z.strictObject({ q: z.string().min(5).max(240) }).parse(request.query);
    const result = await pool.query<{ doc: unknown }>(`SELECT doc FROM polls
      WHERE doc->>'contentStatus'='Visible' AND doc->>'state' NOT IN ('Draft','Review','Rejected')
      AND to_tsvector('simple',doc->'content'->>'question') @@ plainto_tsquery('simple',$1)
      ORDER BY created_at DESC,id DESC LIMIT 10`, [q]);
    return { polls: result.rows.map(row => currentPoll(row.doc)), method: 'PostgreSQL simple full-text conjunction; no automatic merging or deletion' };
  });
  app.get('/v1/my-drafts', async request => {
    const person = await identity(request.headers.authorization);
    const rows = await pool.query<{ doc: unknown }>("SELECT doc FROM polls WHERE author_person=$1 AND doc->>'contentStatus'='Visible' ORDER BY created_at DESC", [person.person]);
    return { polls: rows.rows.map(r => currentPoll(r.doc)) };
  });
  app.get('/v1/review-queue', async request => {
    await moderator(request.headers.authorization);
    const rows = await pool.query<{ doc: unknown }>("SELECT doc FROM polls WHERE doc->>'state'='Review' ORDER BY created_at");
    const appeals = await pool.query<{ id: string; poll_id: string; reason: string; state: string }>("SELECT id,poll_id,reason,state FROM appeals WHERE state='Open'");
    return { polls: rows.rows.map(r => currentPoll(r.doc)), appeals: appeals.rows };
  });
  app.post('/v1/drafts', async request => {
    const person = await identity(request.headers.authorization), content = Content.parse(request.body);
    validateSchedule(content);
    if (Date.parse(content.closesAt) <= Date.now()) throw new Failure('DEADLINE_IN_PAST', 400);
    const poll = Poll.parse({ id: randomUUID(), version: 1, state: 'Draft', content, createdAt: new Date().toISOString(), cryptoId: null,
      manifestRaw: null, review: null, methodologyStatus: 'Pending', contentStatus: 'Visible' });
    await transaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [person.person]);
      const drafts = await client.query<{ id: string }>("SELECT id FROM polls WHERE author_person=$1 AND doc->>'state' IN ('Draft','Review')", [person.person]);
      if (drafts.rows.length >= 6) throw new Failure('DRAFT_LIMIT_REACHED', 429);
      await client.query('INSERT INTO polls(id,author_person,doc,created_at) VALUES($1,$2,$3,$4)', [poll.id, person.person, poll, poll.createdAt]);
    });
    return { poll };
  });
  app.patch('/v1/polls/:id', async request => {
    const { id } = Params.parse(request.params), person = await identity(request.headers.authorization), content = Content.parse(request.body);
    validateSchedule(content);
    return transaction(pool, async client => {
      const found = await client.query<{ doc: unknown; author_person: string }>('SELECT doc,author_person FROM polls WHERE id=$1 FOR UPDATE', [id]);
      const row = required(found.rows[0]), poll = currentPoll(row.doc);
      if (row.author_person !== person.person) throw new Failure('AUTHOR_REQUIRED', 403);
      if (poll.state !== 'Draft') throw new Failure('OFFICIAL_CONTENT_IMMUTABLE', 409);
      const edited = Poll.parse({ ...poll, content, version: poll.version + 1 });
      await client.query('UPDATE polls SET doc=$2 WHERE id=$1', [id, edited]);
      return { poll: edited };
    });
  });
  app.post('/v1/polls/:id/submit', async request => {
    const { id } = Params.parse(request.params), person = await identity(request.headers.authorization);
    z.strictObject({}).parse(request.body);
    return transaction(pool, async client => {
      const found = await client.query<{ doc: unknown; author_person: string }>('SELECT doc,author_person FROM polls WHERE id=$1 FOR UPDATE', [id]);
      const row = required(found.rows[0]), poll = currentPoll(row.doc);
      if (row.author_person !== person.person) throw new Failure('AUTHOR_REQUIRED', 403);
      if (poll.state !== 'Draft') throw new Failure('INVALID_TRANSITION', 409);
      const updated = Poll.parse({ ...poll, state: 'Review' });
      await client.query('UPDATE polls SET doc=$2 WHERE id=$1', [id, updated]);
      return { poll: updated };
    });
  });
  app.post('/v1/polls/:id/review', async request => {
    const { id } = Params.parse(request.params), person = await moderator(request.headers.authorization), review = Review.parse(request.body);
    const initial = await find(id);
    const result = await transaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [initial.author]);
      const found = await client.query<{ doc: unknown }>('SELECT doc FROM polls WHERE id=$1 FOR UPDATE', [id]);
      let poll = currentPoll(required(found.rows[0]).doc);
      if (!['Draft', 'Review'].includes(poll.state) && poll.review !== null && JSON.stringify(poll.review) === JSON.stringify(review)) return { poll };
      if (poll.state !== 'Review') throw new Failure('INVALID_TRANSITION', 409);
      if (review.action === 'approve') {
        if (!Object.values(review.rubric).every(Boolean)) throw new Failure('RUBRIC_INCOMPLETE', 400);
        if (Date.parse(poll.content.closesAt) <= Date.now()) throw new Failure('DEADLINE_IN_PAST', 409);
        const recent = await client.query<{ published_at: Date; doc: unknown }>('SELECT published_at,doc FROM polls WHERE author_person=$1 AND published_at>now()-interval \'24 hours\' ORDER BY published_at DESC', [initial.author]);
        if (recent.rows.length >= quotas.daily) throw new Failure('PUBLICATION_QUOTA_REACHED', 429);
        if (recent.rows[0] && Date.now() - recent.rows[0].published_at.getTime() < quotas.cooldownSeconds * 1000) throw new Failure('PUBLICATION_COOLDOWN', 429);
        const authorsPolls = await client.query<{ doc: unknown }>('SELECT doc FROM polls WHERE author_person=$1', [initial.author]);
        if (authorsPolls.rows.map(r => currentPoll(r.doc)).filter(p => ['Open', 'Scheduled'].includes(p.state)).length >= quotas.simultaneousOpen) throw new Failure('OPEN_POLL_QUOTA_REACHED', 429);
        const manifest = Manifest.parse({ ...poll.content, id, version: poll.version, environment: config.environment, core: 'Belenios 3.3.0',
          release: '0.1.0-dev.1', incidentPolicy: 'SecurityIncident|LegalContentRemoval|InvalidProof; reason required; no result-based cancellation' });
        const roster = z.strictObject({ persons: z.array(z.string()) }).parse(await jsonRequest('http://127.0.0.1:4301/internal/roster', { policy: Policy.parse(poll.content.policy) }, required(config.identityToken)));
        const setup = await provision(id, sha(JSON.stringify(manifest)), () => core(config, { action: 'setup', manifest, persons: roster.persons }, true));
        // Test-only ceremony orchestrates separate local operator files. This is
        // explicitly a simulation, not independent production key custody.
        const signer = z.strictObject({ publicKey: z.string() }).parse(JSON.parse(await readFile('.runtime/ballot/public-key.json', 'utf8')));
        for (const trustee of setup.trustees) {
          const directory = `.runtime/trustees/${trustee.id}/${setup.uuid}`;
          await mkdir(directory, { recursive: true, mode: 0o700 });
          await writeOnce(`${directory}/private.json`, JSON.stringify(trustee));
          await writeOnce(`${directory}/trust.json`, JSON.stringify({ pollId: setup.uuid, manifestHash: sha(setup.electionRaw), publicKey: signer.publicKey }));
        }
        await jsonRequest('http://127.0.0.1:4301/internal/register-roster', { pollId: setup.uuid, manifestHash: sha(setup.electionRaw),
          policy: manifest.policy, closesAt: manifest.closesAt, privateCredentials: setup.privateCredentials }, required(config.identityToken));
        await jsonRequest('http://127.0.0.1:4302/internal/register', { id: setup.uuid, electionRaw: setup.electionRaw, archive: setup.archive }, required(config.ballotToken));
        poll = Poll.parse({ ...poll, state: 'Scheduled', cryptoId: setup.uuid, manifestRaw: setup.electionRaw, review, methodologyStatus: 'Reviewed' });
        await client.query('UPDATE polls SET published_at=now() WHERE id=$1', [id]);
      } else poll = Poll.parse({ ...poll, state: 'Rejected', review, methodologyStatus: 'Rejected' });
      await client.query('UPDATE polls SET doc=$2 WHERE id=$1', [id, poll]);
      await client.query('INSERT INTO events(poll_id,kind,reason,actor_role,payload,created_at) VALUES($1,$2,$3,$4,$5,now())',
        [id, 'MethodologicalReview', review.reason, person.role, review.rubric]);
      return { poll: currentPoll(poll) };
    });
    if (result.poll.cryptoId !== null) await rm(`.runtime/provisioning/${id}`, { recursive: true, force: true });
    return result;
  });
  app.post('/v1/polls/:id/close', async request => {
    await moderator(request.headers.authorization);
    const { id } = Params.parse(request.params), { poll } = await find(id);
    z.strictObject({}).parse(request.body);
    const closed = z.strictObject({ state: z.enum(['Closed', 'ResultsSuppressed']) }).parse(await jsonRequest(`http://127.0.0.1:4302/internal/close/${cryptoId(poll)}`, {}, required(config.ballotToken)));
    const updated = Poll.parse({ ...poll, state: closed.state });
    await pool.query('UPDATE polls SET doc=$2 WHERE id=$1', [id, updated]);
    return { poll: updated };
  });
  app.post('/v1/polls/:id/demo-tally', async request => {
    await moderator(request.headers.authorization);
    const { id } = Params.parse(request.params), { poll } = await find(id);
    z.strictObject({}).parse(request.body);
    if (!['Closed', 'Tallying'].includes(poll.state)) throw new Failure('INVALID_TRANSITION', 409);
    await pool.query('UPDATE polls SET doc=$2 WHERE id=$1', [id, { ...poll, state: 'Tallying' }]);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/tally.ts', cryptoId(poll)], { stdio: ['ignore', 'ignore', 'ignore'], timeout: 120000 });
      child.on('error', () => reject(new Failure('TALLY_FAILED', 503)));
      child.on('exit', code => code === 0 ? resolve() : reject(new Failure('TALLY_FAILED', 503)));
    });
    const result = z.strictObject({ state: z.enum(['Published', 'WaitingForQuorum']) }).parse(await jsonRequest(`http://127.0.0.1:4302/internal/tally/${cryptoId(poll)}`, {}, required(config.ballotToken)));
    const updated = Poll.parse({ ...poll, state: result.state === 'Published' ? 'Published' : 'Tallying' });
    await pool.query('UPDATE polls SET doc=$2 WHERE id=$1', [id, updated]);
    return { poll: updated };
  });
  app.post('/v1/polls/:id/appeals', async request => {
    const person = await identity(request.headers.authorization), { id } = Params.parse(request.params);
    const { reason } = z.strictObject({ reason: z.string().min(15).max(2000) }).parse(request.body);
    await find(id);
    const appealId = randomUUID();
    await pool.query('INSERT INTO appeals VALUES($1,$2,$3,$4,NULL,$5)', [appealId, id, person.person, reason, 'Open']);
    return { id: appealId, state: 'Open' };
  });
  app.post('/v1/appeals/:id/resolve', async request => {
    const person = await moderator(request.headers.authorization), { id } = Params.parse(request.params);
    const input = z.strictObject({ reason: z.string().min(15).max(2000), reopen: z.boolean() }).parse(request.body);
    return transaction(pool, async client => {
      const result = await client.query<{ poll_id: string; state: string }>('SELECT poll_id,state FROM appeals WHERE id=$1 FOR UPDATE', [id]);
      const appeal = required(result.rows[0]);
      if (appeal.state !== 'Open') throw new Failure('APPEAL_RESOLVED', 409);
      if (input.reopen) {
        const found = await client.query<{ doc: unknown }>('SELECT doc FROM polls WHERE id=$1 FOR UPDATE', [appeal.poll_id]);
        const poll = currentPoll(required(found.rows[0]).doc);
        if (poll.state !== 'Rejected') throw new Failure('IMMUTABLE_POLL_CANNOT_REOPEN', 409);
        await client.query('UPDATE polls SET doc=$2 WHERE id=$1', [appeal.poll_id, { ...poll, state: 'Draft', methodologyStatus: 'Pending' }]);
      }
      await client.query('UPDATE appeals SET resolution=$2,state=$3 WHERE id=$1', [id, input.reason, 'Resolved']);
      await client.query('INSERT INTO events(poll_id,kind,reason,actor_role,payload,created_at) VALUES($1,$2,$3,$4,$5,now())', [appeal.poll_id, 'AppealResolved', input.reason, person.role, { reopened: input.reopen }]);
      return { state: 'Resolved' };
    });
  });
  app.post('/v1/polls/:id/incident', async request => {
    const person = await moderator(request.headers.authorization), { id } = Params.parse(request.params), { poll } = await find(id);
    const input = z.strictObject({ action: z.enum(['Cancelled', 'Invalidated']), kind: z.enum(['SecurityIncident', 'LegalContentRemoval', 'InvalidProof']), reason: z.string().min(20).max(2000) }).parse(request.body);
    if (input.action === 'Invalidated' && poll.state !== 'Published') throw new Failure('INVALID_TRANSITION', 409);
    if (input.action === 'Cancelled' && ['Published', 'Invalidated'].includes(poll.state)) throw new Failure('INVALID_TRANSITION', 409);
    if (poll.cryptoId !== null) await jsonRequest(`http://127.0.0.1:4302/internal/state/${poll.cryptoId}`, { state: input.action }, required(config.ballotToken));
    const updated = Poll.parse({ ...poll, state: input.action });
    const storedDocument = input.kind === 'LegalContentRemoval'
      ? RemovedPoll.parse({ id, state: input.action, contentStatus: 'Removed', reason: 'LegalContentRemoval' })
      : updated;
    await transaction(pool, async client => {
      await client.query('UPDATE polls SET doc=$2 WHERE id=$1', [id, storedDocument]);
      await client.query('INSERT INTO events(poll_id,kind,reason,actor_role,payload,created_at) VALUES($1,$2,$3,$4,$5,now())', [id, input.kind, input.reason, person.role, { action: input.action }]);
    });
    return { poll: storedDocument };
  });
  return app;
}
