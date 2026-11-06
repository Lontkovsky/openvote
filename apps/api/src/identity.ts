import { z } from 'zod';
import { Attributes, Policy, Session, eligible } from '../../../packages/domain/src/index.ts';
import { MockProviderId, TestSubject, ProviderCatalogue } from '../../../packages/domain/src/providers.ts';
import { testPersons } from '../../../packages/domain/src/fixtures.ts';
import { application, authorize, database, Failure, pseudonym, required, sealed, sha, token, transaction, unseal } from './common.ts';
import type { ConfigType } from './common.ts';
import { MockIdentityProvider, AwaitingProviderContract } from './identity-provider.ts';

export async function identityApp(config: ConfigType, publicOrigin: string) {
  const app = await application(config, publicOrigin), pool = database(config);
  app.addHook('onClose', () => pool.end());
  const Subject = TestSubject;
  const providerTokens = required(config.providerTokens), providerKeys = required(config.providerKeys);
  const providers = new Map(MockProviderId.options.map(provider => [provider, new MockIdentityProvider({ environment: config.environment, provider,
    authorization: required(providerTokens[provider]), publicKey: required(providerKeys[provider]) })]));
  const production = [new AwaitingProviderContract('diia-signature'), new AwaitingProviderContract('bankid-nbu'), new AwaitingProviderContract('qes')];
  async function session(header: string | undefined) {
    if (header === undefined || !header.startsWith('Bearer ')) throw new Failure('AUTHENTICATION_REQUIRED', 401);
    const found = await pool.query<{ person: string; role: unknown; attributes: unknown; expires_at: Date }>(
      'SELECT p.person,p.role,p.attributes,s.expires_at FROM sessions s JOIN persons p ON p.person=s.person WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT p.revoked', [sha(header.slice(7))]);
    const row = found.rows[0];
    if (!row) throw new Failure('SESSION_EXPIRED', 401);
    return Session.parse({ person: row.person, role: row.role, verifiedOwner: Attributes.parse(row.attributes).verifiedOwner, expiresAt: row.expires_at.toISOString() });
  }
  app.get('/v1/providers', async () => {
    return ProviderCatalogue.parse({ environment: config.environment, testPersons: testPersons.map(p => p.subject),
      providers: await Promise.all([...providers.values()].map(p => p.status())), production: await Promise.all(production.map(p => p.status())) });
  });
  app.post('/v1/auth/start', async request => {
    const input = z.strictObject({ provider: MockProviderId, subject: Subject }).parse(request.body);
    if (!testPersons.some(p => p.subject === input.subject)) throw new Failure('UNKNOWN_TEST_PERSON', 400);
    const id = token(), challenge = token();
    await pool.query('DELETE FROM attempts WHERE expires_at<now()');
    await pool.query('INSERT INTO attempts(id,provider,subject,challenge,expires_at) VALUES($1,$2,$3,$4,$5)',
      [id, input.provider, input.subject, challenge, new Date(Date.now() + 600000)]);
    return { attempt: id, state: 'AwaitingProvider' };
  });
  app.post('/v1/auth/finish', async request => {
    const { attempt } = z.strictObject({ attempt: z.string().min(32).max(64) }).parse(request.body);
    const found = await pool.query<{ id: string; provider: string; subject: string | null; challenge: string; completed: boolean; session_token_sealed: string | null }>(
      'SELECT id,provider,subject,challenge,completed,session_token_sealed FROM attempts WHERE id=$1 AND expires_at>now()', [attempt]);
    const row = found.rows[0];
    if (!row) throw new Failure('IDENTITY_RETURN_EXPIRED', 410);
    if (row.completed && row.session_token_sealed !== null) {
      const replayed = unseal(row.session_token_sealed, required(config.sealingKey));
      const identity = await session('Bearer ' + replayed);
      return { token: replayed, role: identity.role, expiresAt: identity.expiresAt, testOnly: true };
    }
    const attestation = await required(providers.get(MockProviderId.parse(row.provider))).authenticate({ subject: Subject.parse(row.subject), challenge: row.challenge });
    const person = pseudonym(attestation.subject, required(config.dedupKey));
    const fixture = testPersons.find(p => p.subject === attestation.subject);
    if (!fixture) throw new Failure('UNKNOWN_TEST_PERSON', 422);
    const outcome = await transaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [person]);
      const locked = await client.query<{ completed: boolean; session_token_sealed: string | null; active: boolean }>('SELECT completed,session_token_sealed,expires_at>clock_timestamp() AS active FROM attempts WHERE id=$1 FOR UPDATE', [attempt]);
      const priorAttempt = locked.rows[0];
      if (priorAttempt === undefined || !priorAttempt.active) throw new Failure('IDENTITY_RETURN_EXPIRED', 410);
      if (priorAttempt.completed && priorAttempt.session_token_sealed !== null) return { token: unseal(priorAttempt.session_token_sealed, required(config.sealingKey)), conflict: false };
      const prior = await client.query<{ attributes: unknown; revoked: boolean }>('SELECT attributes,revoked FROM persons WHERE person=$1', [person]);
      const current = prior.rows[0];
      if (current) {
        const attributes = Attributes.parse(current.attributes);
        if (current.revoked || attributes.age !== attestation.attributes.age || attributes.citizenship !== attestation.attributes.citizenship
          || attributes.verifiedOwner !== attestation.attributes.verifiedOwner) {
          await client.query('UPDATE persons SET revoked=true WHERE person=$1', [person]);
          return { token: null, conflict: true };
        }
      } else {
        await client.query('INSERT INTO persons(person,attributes,role) VALUES($1,$2,$3)', [person, attestation.attributes, fixture.role]);
      }
      const sessionToken = token();
      await client.query('INSERT INTO sessions(token_hash,person,expires_at) VALUES($1,$2,$3)', [sha(sessionToken), person, new Date(Date.now() + 3600000)]);
      await client.query('UPDATE attempts SET completed=true,subject=NULL,session_token_sealed=$2 WHERE id=$1', [attempt, sealed(sessionToken, required(config.sealingKey))]);
      return { token: sessionToken, conflict: false };
    });
    if (outcome.token === null) throw new Failure('PROVIDER_ATTRIBUTES_CONFLICT', 409);
    const identity = await session('Bearer ' + outcome.token);
    return { token: outcome.token, role: identity.role, expiresAt: identity.expiresAt, testOnly: true };
  });
  app.get('/v1/session', async request => { const identity = await session(request.headers.authorization); return { role: identity.role, expiresAt: identity.expiresAt }; });
  app.delete('/v1/session', async request => {
    await session(request.headers.authorization);
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [sha(required(request.headers.authorization).slice(7))]);
    return { signedOut: true };
  });
  app.post('/internal/introspect', async request => {
    authorize(request.headers.authorization, config.serviceToken);
    const input = z.strictObject({ token: z.string().min(32) }).parse(request.body);
    return session('Bearer ' + input.token);
  });
  app.post('/internal/roster', async request => {
    authorize(request.headers.authorization, config.serviceToken);
    const { policy } = z.strictObject({ policy: Policy }).parse(request.body);
    const revoked = await pool.query<{ person: string }>('SELECT person FROM persons WHERE revoked');
    const excluded = new Set(revoked.rows.map(row => row.person));
    return { persons: testPersons.filter(p => eligible(p.attributes, policy) && !excluded.has(pseudonym(p.subject, required(config.dedupKey)))).map(p => p.subject) };
  });
  app.post('/internal/register-roster', async request => {
    authorize(request.headers.authorization, config.serviceToken);
    const input = z.strictObject({ pollId: z.string(), manifestHash: z.string(), policy: Policy, closesAt: z.iso.datetime(),
      privateCredentials: z.record(Subject, z.string().min(20)) }).parse(request.body);
    await transaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [input.pollId]);
      const prior = await client.query<{ request_hash: string | null }>('SELECT request_hash FROM roster_locks WHERE poll_id=$1', [input.pollId]);
      const requestHash = sha(JSON.stringify(input));
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== requestHash) throw new Failure('IMMUTABLE_ROSTER_MISMATCH', 409);
        return;
      }
      await client.query('INSERT INTO roster_locks(poll_id,manifest_hash,credential_count,request_hash) VALUES($1,$2,$3,$4)', [input.pollId, input.manifestHash, Object.keys(input.privateCredentials).length, requestHash]);
      for (const [subject, credential] of Object.entries(input.privateCredentials)) {
        const fixture = testPersons.find(p => p.subject === subject);
        if (!fixture || !eligible(fixture.attributes, input.policy)) throw new Failure('INELIGIBLE_ROSTER_MEMBER', 422);
        const person = pseudonym(subject, required(config.dedupKey));
        await client.query('INSERT INTO persons(person,attributes,role) VALUES($1,$2,$3) ON CONFLICT(person) DO NOTHING', [person, fixture.attributes, fixture.role]);
        const existing = await client.query<{ revoked: boolean }>('SELECT revoked FROM persons WHERE person=$1 FOR UPDATE', [person]);
        if (required(existing.rows[0]).revoked) throw new Failure('REVOKED_PERSON', 422);
        await client.query('INSERT INTO credentials(poll_id,person,credential_sealed,manifest_hash,closes_at) VALUES($1,$2,$3,$4,$5)',
          [input.pollId, person, sealed(credential, required(config.sealingKey)), input.manifestHash, input.closesAt]);
      }
    });
    return { registered: true };
  });
  app.post('/v1/credentials/:pollId', async request => {
    const identity = await session(request.headers.authorization);
    const { pollId } = z.strictObject({ pollId: z.string().regex(/^[A-Za-z0-9]{14}$/) }).parse(request.params);
    z.strictObject({}).parse(request.body);
    const found = await pool.query<{ credential_sealed: string; manifest_hash: string }>(
      'SELECT credential_sealed,manifest_hash FROM credentials WHERE poll_id=$1 AND person=$2 AND NOT revoked AND closes_at>now()', [pollId, identity.person]);
    const credential = found.rows[0];
    if (!credential) throw new Failure('NO_ACTIVE_CREDENTIAL', 403);
    return { credential: unseal(credential.credential_sealed, required(config.sealingKey)), manifestHash: credential.manifest_hash,
      recovery: 'SameCredentialOnly', freshnessPolicy: 'ValidUntilFixedClose; provider outage does not revoke an already issued credential' };
  });
  return app;
}
