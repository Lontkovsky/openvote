import { afterAll, describe, expect, it } from 'vitest';
import { setTimeout } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { Content, Envelope, Manifest, Poll, Receipt, RemovedPoll, ResultContract, Session } from '../packages/domain/src/index.ts';
import { database, pseudonym, readConfig, required, sha, unseal } from '../apps/api/src/common.ts';
import { call, createPoll, fixtureContent, generateBallot, login, ok, approvedReview } from './support/flow.ts';
import { FinalSet, Trust, verifyFinal } from '../packages/domain/src/checkpoints.ts';
import { localCore } from '../scripts/local-core.ts';
import { resultCsv, resultSvg } from '../packages/domain/src/result-exports.ts';
import { Ceremony, writeOnce } from '../apps/api/src/provisioning.ts';
import { ballotApp } from '../apps/api/src/ballot.ts';
import { identityApp } from '../apps/api/src/identity.ts';
import { CoreReport } from '../packages/domain/src/checkpoints.ts';
import { ObserverConfig } from '../packages/domain/src/observer.ts';
import { observePublic } from '../scripts/observer-client.ts';
import { cleanupBrowserFixtures } from './support/cleanup.ts';

const created: { id: string; cryptoId: string }[] = [];
async function control(provider: 'A' | 'B', available: boolean, conflictingAttributes = false, delayMs = 0) {
  const config = await readConfig('provider-' + provider);
  const response = await fetch(`http://127.0.0.1:${config.port}/control`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.serviceToken }, body: JSON.stringify({ available, conflictingAttributes, delayMs }) });
  expect(response.status).toBe(200);
}
afterAll(async () => {
  await control('A', true); await control('B', true);
  for (const role of ['management', 'identity', 'ballot']) {
    const pool = database(await readConfig(role));
    for (const p of created) {
      if (role === 'management') { await pool.query('DELETE FROM events WHERE poll_id=$1', [p.id]); await pool.query('DELETE FROM appeals WHERE poll_id=$1', [p.id]); await pool.query('DELETE FROM polls WHERE id=$1', [p.id]); }
      if (role === 'identity') { await pool.query('DELETE FROM credentials WHERE poll_id=$1', [p.cryptoId]); await pool.query('DELETE FROM roster_locks WHERE poll_id=$1', [p.cryptoId]); }
      if (role === 'ballot') { for (const table of ['shares', 'checkpoints', 'ballots']) await pool.query(`DELETE FROM ${table} WHERE poll_id=$1`, [p.cryptoId]); await pool.query('DELETE FROM elections WHERE id=$1', [p.cryptoId]); }
    }
    await pool.end();
  }
  for (const p of created) for (const id of [1, 2, 3, 4]) await rm(`.runtime/trustees/${id}/${p.cryptoId}`, { recursive: true, force: true });
}, 20000);

describe('real service boundaries', () => {
  it('enforces verified pseudonymous drafting without forced analysis blocks, similar search and chronological catalog order', async () => {
    const authorA = await login('TEST-PERSON-0004', 'A'), authorB = await login('TEST-PERSON-0004', 'B');
    const other = await login('TEST-PERSON-0005', 'A'), unverified = await login('TEST-PERSON-0010', 'B');
    const tokens = [authorA.token, authorB.token, other.token, unverified.token];
    const config = await readConfig('management'), pool = database(config), pollIds: string[] = [];
    try {
      const fixture = fixtureContent(new Date(Date.now() + 3600000), 'Чи підтверджує тестовий сценарій межі авторської чернетки?');
      const content = Content.parse({ ...fixture, context: '', consequences: '', argumentsFor: [], argumentsAgainst: [] });
      expect(await call('management', '/v1/drafts', 'POST', content, unverified.token))
        .toEqual({ status: 403, value: { error: 'VERIFIED_OWNER_REQUIRED' } });

      const draft = z.object({ poll: Poll }).parse(await ok('management', '/v1/drafts', 'POST', content, authorA.token)).poll;
      pollIds.push(draft.id);
      expect({ state: draft.state, version: draft.version, alias: draft.content.authorAlias, context: draft.content.context,
        consequences: draft.content.consequences, argumentsFor: draft.content.argumentsFor, argumentsAgainst: draft.content.argumentsAgainst })
        .toEqual({ state: 'Draft', version: 1, alias: 'Тестова ініціатива', context: '', consequences: '', argumentsFor: [], argumentsAgainst: [] });

      const editedContent = { ...content, context: 'Опис додано тією самою особою через другого провайдера.' };
      const edited = z.object({ poll: Poll }).parse(await ok('management', `/v1/polls/${draft.id}`, 'PATCH', editedContent, authorB.token)).poll;
      expect({ state: edited.state, version: edited.version, context: edited.content.context })
        .toEqual({ state: 'Draft', version: 2, context: editedContent.context });
      expect(await call('management', `/v1/polls/${draft.id}`, 'PATCH', editedContent, other.token))
        .toEqual({ status: 403, value: { error: 'AUTHOR_REQUIRED' } });

      const submitted = z.object({ poll: Poll }).parse(await ok('management', `/v1/polls/${draft.id}/submit`, 'POST', {}, authorA.token)).poll;
      expect({ state: submitted.state, version: submitted.version }).toEqual({ state: 'Review', version: 2 });
      expect(await call('management', `/v1/polls/${draft.id}`, 'PATCH', editedContent, authorA.token))
        .toEqual({ status: 409, value: { error: 'OFFICIAL_CONTENT_IMMUTABLE' } });

      const sessionResponse = await fetch('http://127.0.0.1:4301/internal/introspect', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + required(config.identityToken) },
        body: JSON.stringify({ token: authorA.token }),
      });
      const author = Session.parse(await sessionResponse.json()).person;
      expect(sessionResponse.status).toBe(200);
      const newerAt = new Date(Date.now() - 30000), olderAt = new Date(Date.now() - 60000);
      const firstId = randomUUID(), secondId = randomUUID(), thirdId = randomUUID();
      const catalogueIds: string[] = [firstId, secondId, thirdId];
      const tieOrder = [firstId, secondId].sort().reverse();
      const rows = [
        { id: firstId, createdAt: newerAt, suffix: 'один' },
        { id: secondId, createdAt: newerAt, suffix: 'два' },
        { id: thirdId, createdAt: olderAt, suffix: 'три' },
      ];
      for (const row of rows) {
        const rowContent = fixtureContent(new Date(Date.now() + 3600000), `Чи підтримуєте у тестовому режимікаталоговий приклад номер ${row.suffix}?`);
        const poll = Poll.parse({ id: row.id, version: 1, state: 'Closed', content: rowContent, createdAt: row.createdAt.toISOString(),
          cryptoId: randomUUID(), manifestRaw: '{}', review: approvedReview, methodologyStatus: 'Reviewed', contentStatus: 'Visible' });
        await pool.query('INSERT INTO polls(id,author_person,doc,published_at,created_at) VALUES($1,$2,$3,$4,$5)',
          [row.id, author, poll, row.createdAt, row.createdAt]);
        pollIds.push(row.id);
      }

      const catalogue = z.object({ polls: z.array(Poll), sort: z.string() }).parse(await ok('management', '/v1/polls'));
      expect(catalogue.sort).toBe('Час створення: новіші спочатку; за однакового часу — ідентифікатор. Без персоналізації.');
      expect(catalogue.polls.filter(poll => catalogueIds.includes(poll.id)).map(poll => poll.id))
        .toEqual([...tieOrder, thirdId]);
      expect(catalogue.polls.some(poll => poll.id === draft.id)).toBe(false);

      const similar = z.object({ polls: z.array(Poll), method: z.string() }).parse(
        await ok('management', '/v1/similar?q=' + encodeURIComponent('у тестовому режимікаталоговий')),
      );
      expect(similar.method).toBe('PostgreSQL simple full-text conjunction; no automatic merging or deletion');
      expect(similar.polls.map(poll => poll.id)).toEqual([...tieOrder, thirdId]);
      expect(new Set(similar.polls.map(poll => poll.id)).size).toBe(3);
    } finally {
      if (pollIds.length > 0) {
        await pool.query('DELETE FROM events WHERE poll_id=ANY($1::uuid[])', [pollIds]);
        await pool.query('DELETE FROM appeals WHERE poll_id=ANY($1::uuid[])', [pollIds]);
        await pool.query('DELETE FROM polls WHERE id=ANY($1::uuid[])', [pollIds]);
      }
      await pool.end();
      for (const token of tokens) await call('identity', '/v1/session', 'DELETE', undefined, token);
    }
  }, 30000);

  it('enforces reviewed lifecycle, deadlines, immutable official context and successor links', async () => {
    const author = await login('TEST-PERSON-0001', 'A'), moderator = await login('TEST-PERSON-0012', 'A');
    const tokens = [author.token, moderator.token], pollIds: string[] = [];
    try {
      const base = fixtureContent(new Date(Date.now() + 600000), 'Чи зберігає нове тестове питання посилання на попереднє?');
      const invalidSchedule = { ...base, opensAt: new Date(Date.now() + 1200000).toISOString() };
      expect(await call('management', '/v1/drafts', 'POST', invalidSchedule, author.token))
        .toEqual({ status: 400, value: { error: 'INVALID_SCHEDULE' } });
      const pastDeadline = { ...base, opensAt: new Date(Date.now() - 7200000).toISOString(), closesAt: new Date(Date.now() - 3600000).toISOString() };
      expect(await call('management', '/v1/drafts', 'POST', pastDeadline, author.token))
        .toEqual({ status: 400, value: { error: 'DEADLINE_IN_PAST' } });

      const predecessorContent = { ...base, authorAlias: 'Браузерний тест',
        question: 'Чи має тестове попереднє голосування залишитися пов’язаним із наступником?' };
      const predecessor = z.object({ poll: Poll }).parse(await ok('management', '/v1/drafts', 'POST', predecessorContent, author.token)).poll;
      pollIds.push(predecessor.id);
      const content = { ...base, authorAlias: 'Браузерний тест', relatedPolls: [predecessor.id] };
      const draft = z.object({ poll: Poll }).parse(await ok('management', '/v1/drafts', 'POST', content, author.token)).poll;
      pollIds.push(draft.id);
      expect({ state: draft.state, links: draft.content.relatedPolls }).toEqual({ state: 'Draft', links: [predecessor.id] });
      const review = z.object({ poll: Poll }).parse(await ok('management', `/v1/polls/${draft.id}/submit`, 'POST', {}, author.token)).poll;
      expect(review.state).toBe('Review');
      expect(await call('management', `/v1/polls/${draft.id}/submit`, 'POST', {}, author.token))
        .toEqual({ status: 409, value: { error: 'INVALID_TRANSITION' } });

      const opened = z.object({ poll: Poll }).parse(await ok('management', `/v1/polls/${draft.id}/review`, 'POST', approvedReview, moderator.token)).poll;
      expect(opened.state).toBe('Open');
      if (opened.cryptoId === null || opened.manifestRaw === null) throw new Error('PUBLISHED_MANIFEST_MISSING');
      const embedded = Manifest.parse(JSON.parse(z.object({ description: z.string() }).parse(JSON.parse(opened.manifestRaw)).description));
      const servedRaw = z.object({ electionRaw: z.string() }).parse(await ok('ballot', `/v1/elections/${opened.cryptoId}/manifest`)).electionRaw;
      const served = Manifest.parse(JSON.parse(z.object({ description: z.string() }).parse(JSON.parse(servedRaw)).description));
      const publicPoll = z.object({ poll: Poll, events: z.array(z.unknown()) }).parse(await ok('management', `/v1/polls/${opened.id}`)).poll;
      for (const official of [opened.content, publicPoll.content, embedded, served]) {
        expect({ question: official.question, context: official.context, closesAt: official.closesAt, relatedPolls: official.relatedPolls })
          .toEqual({ question: content.question, context: content.context, closesAt: content.closesAt, relatedPolls: [predecessor.id] });
      }
      expect(await call('management', `/v1/polls/${opened.id}`, 'PATCH', { ...content, context: content.context + ' Прихована зміна.' }, author.token))
        .toEqual({ status: 409, value: { error: 'OFFICIAL_CONTENT_IMMUTABLE' } });
      expect(await call('management', `/v1/polls/${opened.id}/close`, 'POST', {}, moderator.token))
        .toEqual({ status: 409, value: { error: 'DEADLINE_NOT_REACHED' } });
      expect(await call('management', `/v1/polls/${opened.id}/demo-tally`, 'POST', {}, moderator.token))
        .toEqual({ status: 409, value: { error: 'INVALID_TRANSITION' } });
      const prematureInvalidation = { action: 'Invalidated', kind: 'InvalidProof', reason: 'Тестова передчасна спроба визнати неопублікований результат недійсним.' };
      expect(await call('management', `/v1/polls/${opened.id}/incident`, 'POST', prematureInvalidation, moderator.token))
        .toEqual({ status: 409, value: { error: 'INVALID_TRANSITION' } });
      expect(await call('management', `/v1/polls/${opened.id}/incident`, 'POST', {
        action: 'Cancelled', kind: 'SecurityIncident', reason: 'Недостатньо.' }, moderator.token))
        .toEqual({ status: 400, value: { error: 'INVALID_INPUT' } });

      const cancellation = { action: 'Cancelled', kind: 'SecurityIncident',
        reason: 'Тестовий інцидент життєвого циклу з явною причиною, не пов’язаною з результатом.' };
      const cancelled = z.object({ poll: Poll }).parse(await ok('management', `/v1/polls/${opened.id}/incident`, 'POST', cancellation, moderator.token)).poll;
      expect({ state: cancelled.state, links: cancelled.content.relatedPolls }).toEqual({ state: 'Cancelled', links: [predecessor.id] });
      const journal = z.object({ poll: Poll, events: z.array(z.object({ kind: z.string(), reason: z.string() })) })
        .parse(await ok('management', `/v1/polls/${opened.id}`));
      expect(journal.events.at(-1)).toEqual({ kind: 'SecurityIncident', reason: cancellation.reason });
    } finally {
      if (pollIds.length > 0) await cleanupBrowserFixtures(pollIds);
      for (const token of tokens) await call('identity', '/v1/session', 'DELETE', undefined, token);
    }
  }, 30000);

  it('applies author draft, publication, cooldown and simultaneous-open limits across providers', async () => {
    const authorA = await login('TEST-PERSON-0011', 'A'), authorB = await login('TEST-PERSON-0011', 'B');
    const moderator = await login('TEST-PERSON-0012', 'A'), tokens = [authorA.token, authorB.token, moderator.token];
    const config = await readConfig('management'), pool = database(config), pollIds: string[] = [];
    const clearPolls = async () => {
      if (pollIds.length === 0) return;
      await pool.query('DELETE FROM events WHERE poll_id=ANY($1::uuid[])', [pollIds]);
      await pool.query('DELETE FROM appeals WHERE poll_id=ANY($1::uuid[])', [pollIds]);
      await pool.query('DELETE FROM polls WHERE id=ANY($1::uuid[])', [pollIds]);
      pollIds.length = 0;
    };
    const reviewDraft = async (question: string) => {
      const { poll } = z.object({ poll: Poll }).parse(await ok('management', '/v1/drafts', 'POST', fixtureContent(new Date(Date.now() + 3600000), question), authorA.token));
      pollIds.push(poll.id);
      await ok('management', `/v1/polls/${poll.id}/submit`, 'POST', {}, authorA.token);
      return poll;
    };
    try {
      expect(config.quotas).toEqual({ daily: 3, cooldownSeconds: 60, simultaneousOpen: 2 });
      const introspection = await fetch('http://127.0.0.1:4301/internal/introspect', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + required(config.identityToken) }, body: JSON.stringify({ token: authorA.token }) });
      const author = Session.parse(await introspection.json()).person;
      expect(introspection.status).toBe(200);

      const paraphrases = await Promise.all(Array.from({ length: 7 }, (_, index) => call('management', '/v1/drafts', 'POST',
        fixtureContent(new Date(Date.now() + 3600000), `Чи підтримуєте тестове перефразоване питання номер ${index + 1}?`), index % 2 === 0 ? authorA.token : authorB.token)));
      for (const response of paraphrases) if (response.status === 200) pollIds.push(z.object({ poll: Poll }).parse(response.value).poll.id);
      expect(paraphrases.filter(response => response.status === 200)).toHaveLength(6);
      expect(paraphrases.filter(response => response.status === 429).map(response => response.value)).toEqual([{ error: 'DRAFT_LIMIT_REACHED' }]);
      await clearPolls();

      const seedPublished = async (state: 'Closed' | 'Open', publishedAt: Date, question: string) => {
        const id = randomUUID(), content = fixtureContent(new Date(Date.now() + 3600000), question);
        const poll = Poll.parse({ id, version: 1, state, content, createdAt: new Date().toISOString(), cryptoId: randomUUID(), manifestRaw: '{}', review: approvedReview, methodologyStatus: 'Reviewed', contentStatus: 'Visible' });
        await pool.query('INSERT INTO polls(id,author_person,doc,published_at,created_at) VALUES($1,$2,$3,$4,$5)', [id, author, poll, publishedAt, poll.createdAt]);
        pollIds.push(id);
      };

      const daily = await reviewDraft('Чи застосовується добова квота до підтвердженого автора?');
      for (let index = 0; index < 3; index++) await seedPublished('Closed', new Date(Date.now() - (index + 2) * 3600000), `Чи враховано попередню публікацію номер ${index + 1}?`);
      expect(await call('management', `/v1/polls/${daily.id}/review`, 'POST', approvedReview, moderator.token)).toEqual({ status: 429, value: { error: 'PUBLICATION_QUOTA_REACHED' } });
      await clearPolls();

      const cooldown = await reviewDraft('Чи застосовується пауза між публікаціями автора?');
      await seedPublished('Closed', new Date(), 'Чи щойно опубліковано попереднє тестове питання?');
      expect(await call('management', `/v1/polls/${cooldown.id}/review`, 'POST', approvedReview, moderator.token)).toEqual({ status: 429, value: { error: 'PUBLICATION_COOLDOWN' } });
      await clearPolls();

      const simultaneous = await reviewDraft('Чи обмежено кількість одночасно відкритих питань автора?');
      for (let index = 0; index < 2; index++) await seedPublished('Open', new Date(Date.now() - (index + 2) * 3600000), `Чи відкрите тестове питання номер ${index + 1}?`);
      expect(await call('management', `/v1/polls/${simultaneous.id}/review`, 'POST', approvedReview, moderator.token)).toEqual({ status: 429, value: { error: 'OPEN_POLL_QUOTA_REACHED' } });
    } finally {
      await clearPolls();
      await pool.end();
      for (const token of tokens) await call('identity', '/v1/session', 'DELETE', undefined, token);
    }
  }, 30000);

  it('records reasoned duplicate moderation and permits an authorized appeal', async () => {
    const author = await login('TEST-PERSON-0011', 'A'), moderator = await login('TEST-PERSON-0012', 'A');
    const participant = await login('TEST-PERSON-0002', 'B'), tokens = [author.token, moderator.token, participant.token];
    let pollId: string | null = null, appealId: string | null = null;
    try {
      const content = fixtureContent(new Date(Date.now() + 3600000), 'Чи має пояснюване рішення про дублікат бути доступним для оскарження?');
      const draft = z.object({ poll: Poll }).parse(await ok('management', '/v1/drafts', 'POST', content, author.token)).poll;
      pollId = draft.id;
      await ok('management', `/v1/polls/${pollId}/submit`, 'POST', {}, author.token);

      const incomplete = { ...approvedReview, rubric: { ...approvedReview.rubric, singleProposal: false } };
      expect(await call('management', `/v1/polls/${pollId}/review`, 'POST', incomplete, participant.token)).toEqual({ status: 403, value: { error: 'MODERATOR_REQUIRED' } });
      expect(await call('management', `/v1/polls/${pollId}/review`, 'POST', incomplete, moderator.token)).toEqual({ status: 400, value: { error: 'RUBRIC_INCOMPLETE' } });

      const duplicate = { ...incomplete, action: 'duplicate' as const, reason: 'Тестове питання позначено дублікатом із явною причиною для перевірки апеляції.' };
      const rejected = Poll.parse(z.object({ poll: Poll }).parse(await ok('management', `/v1/polls/${pollId}/review`, 'POST', duplicate, moderator.token)).poll);
      expect(rejected.state).toBe('Rejected');
      expect(rejected.review).toEqual(duplicate);

      const appeal = z.object({ id: z.string().uuid(), state: z.literal('Open') }).parse(await ok('management', `/v1/polls/${pollId}/appeals`, 'POST',
        { reason: 'Автор не погоджується з позначенням дубліката та просить повторну методологічну перевірку.' }, author.token));
      appealId = appeal.id;
      const resolution = { reason: 'Апеляцію задоволено; питання повернуто автору для уточнення.', reopen: true };
      expect(await call('management', `/v1/appeals/${appealId}/resolve`, 'POST', resolution, participant.token)).toEqual({ status: 403, value: { error: 'MODERATOR_REQUIRED' } });
      expect(await ok('management', `/v1/appeals/${appealId}/resolve`, 'POST', resolution, moderator.token)).toEqual({ state: 'Resolved' });
      expect(await call('management', `/v1/appeals/${appealId}/resolve`, 'POST', resolution, moderator.token)).toEqual({ status: 409, value: { error: 'APPEAL_RESOLVED' } });

      const reopened = z.object({ poll: Poll, events: z.array(z.object({ kind: z.string(), reason: z.string() })) }).parse(await ok('management', `/v1/polls/${pollId}`, 'GET', undefined, author.token));
      expect(reopened.poll.state).toBe('Draft');
      expect(reopened.poll.methodologyStatus).toBe('Pending');
      expect(reopened.events).toEqual([
        { kind: 'MethodologicalReview', reason: duplicate.reason },
        { kind: 'AppealResolved', reason: resolution.reason },
      ]);
    } finally {
      if (pollId !== null) {
        const pool = database(await readConfig('management'));
        await pool.query('DELETE FROM events WHERE poll_id=$1', [pollId]);
        await pool.query('DELETE FROM appeals WHERE poll_id=$1', [pollId]);
        await pool.query('DELETE FROM polls WHERE id=$1', [pollId]);
        await pool.end();
      }
      for (const token of tokens) await call('identity', '/v1/session', 'DELETE', undefined, token);
    }
  }, 30000);

  it('replaces legally removed content with a minimal public tombstone', async () => {
    const author = await login('TEST-PERSON-0011', 'A'), moderator = await login('TEST-PERSON-0012', 'A');
    const participant = await login('TEST-PERSON-0002', 'B'), tokens = [author.token, moderator.token, participant.token];
    let pollId: string | null = null;
    try {
      const content = fixtureContent(new Date(Date.now() + 3600000), 'Чи приховує законне вилучення тестовий зміст питання?');
      const draft = z.object({ poll: Poll }).parse(await ok('management', '/v1/drafts', 'POST', content, author.token)).poll;
      pollId = draft.id;
      const removal = { action: 'Cancelled', kind: 'LegalContentRemoval', reason: 'Тестовий тест законного вилучення без реального персонального або незаконного матеріалу.' };
      expect(await call('management', `/v1/polls/${pollId}/incident`, 'POST', removal, participant.token)).toEqual({ status: 403, value: { error: 'MODERATOR_REQUIRED' } });

      const tombstone = RemovedPoll.parse(z.object({ poll: RemovedPoll }).parse(await ok('management', `/v1/polls/${pollId}/incident`, 'POST', removal, moderator.token)).poll);
      expect(tombstone).toEqual({ id: pollId, state: 'Cancelled', contentStatus: 'Removed', reason: 'LegalContentRemoval' });
      expect(await ok('management', `/v1/polls/${pollId}`)).toEqual(tombstone);
      const catalogue = z.object({ polls: z.array(Poll) }).parse(await ok('management', '/v1/polls'));
      expect(catalogue.polls.some(poll => poll.id === pollId)).toBe(false);
      const authorView = z.object({ polls: z.array(Poll) }).parse(await ok('management', '/v1/my-drafts', 'GET', undefined, author.token));
      expect(authorView.polls.some(poll => poll.id === pollId)).toBe(false);
      expect(await call('management', `/v1/polls/${pollId}/incident`, 'POST', removal, moderator.token)).toEqual({ status: 410, value: { error: 'POLL_CONTENT_REMOVED' } });

      const pool = database(await readConfig('management'));
      try {
        const stored = required((await pool.query<{ doc: unknown }>('SELECT doc FROM polls WHERE id=$1', [pollId])).rows[0]).doc;
        expect(RemovedPoll.parse(stored)).toEqual(tombstone);
        expect(JSON.stringify(stored)).not.toContain(content.question);
        expect(JSON.stringify(stored)).not.toContain(content.context);
        const events = await pool.query<{ kind: string; reason: string }>('SELECT kind,reason FROM events WHERE poll_id=$1 ORDER BY id', [pollId]);
        expect(events.rows).toEqual([{ kind: 'LegalContentRemoval', reason: removal.reason }]);
      } finally { await pool.end(); }
    } finally {
      if (pollId !== null) {
        const pool = database(await readConfig('management'));
        await pool.query('DELETE FROM events WHERE poll_id=$1', [pollId]);
        await pool.query('DELETE FROM appeals WHERE poll_id=$1', [pollId]);
        await pool.query('DELETE FROM polls WHERE id=$1', [pollId]);
        await pool.end();
      }
      for (const token of tokens) await call('identity', '/v1/session', 'DELETE', undefined, token);
    }
  }, 30000);

  it('measures identity, participation and ciphertext linkage across separated stores', async () => {
    const authorA = await login('TEST-PERSON-0006', 'A'), authorB = await login('TEST-PERSON-0007', 'B');
    const voter = await login('TEST-PERSON-0008', 'A'), moderator = await login('TEST-PERSON-0012', 'A');
    const tokens = [authorA.token, authorB.token, voter.token, moderator.token];
    const identityConfig = await readConfig('identity'), identityStore = database(identityConfig);
    const ballotStore = database(await readConfig('ballot')), managementStore = database(await readConfig('management'));
    const testPolls: { id: string; cryptoId: string }[] = [];
    const flows: { privateCredential: string; publicCredential: string; tracker: string }[] = [];
    try {
      for (const [index, author] of [authorA, authorB].entries()) {
        const poll = await createPoll(author.token, moderator.token, fixtureContent(new Date(Date.now() + 3600000),
          `Чи підтримуєте тестову перевірку розділення сховищ номер ${index + 1}?`));
        if (poll.cryptoId === null) throw new Error('PRIVACY_TEST_POLL_NOT_PROVISIONED');
        const pollId = poll.cryptoId;
        const recorded = { id: poll.id, cryptoId: pollId };
        created.push(recorded);
        testPolls.push(recorded);
        const election = required((await ballotStore.query<{ archive: string }>('SELECT archive FROM elections WHERE id=$1', [pollId])).rows[0]);
        const right = z.object({ credential: z.string() }).parse(await ok('identity', `/v1/credentials/${pollId}`, 'POST', {}, voter.token));
        const ballot = await generateBallot(election.archive, right.credential, index);
        await ok('ballot', `/v1/elections/${pollId}/ballots`, 'POST', { ballot });
      }

      const person = pseudonym('TEST-PERSON-0008', required(identityConfig.dedupKey));
      const issued = await identityStore.query<{ poll_id: string; credential_sealed: string }>(
        'SELECT poll_id,credential_sealed FROM credentials WHERE person=$1 AND poll_id=ANY($2::text[]) ORDER BY poll_id', [person, testPolls.map(value => value.cryptoId)]);
      const cast = await ballotStore.query<{ poll_id: string; credential: string; tracker: string; receipt: unknown }>(
        'SELECT poll_id,credential,tracker,receipt FROM ballots WHERE poll_id=ANY($1::text[]) ORDER BY poll_id', [testPolls.map(value => value.cryptoId)]);
      expect(issued.rows).toHaveLength(2);
      expect(cast.rows).toHaveLength(2);

      for (const row of cast.rows) {
        const identityRow = required(issued.rows.find(value => value.poll_id === row.poll_id));
        const privateCredential = unseal(identityRow.credential_sealed, required(identityConfig.sealingKey));
        const election = required((await ballotStore.query<{ archive: string }>('SELECT archive FROM elections WHERE id=$1', [row.poll_id])).rows[0]);
        const derived = z.object({ credential: z.string() }).parse(JSON.parse(await generateBallot(election.archive, privateCredential, 2)));
        expect(derived.credential).toBe(row.credential);
        const receipt = Receipt.parse(JSON.parse(Envelope.parse(row.receipt).payload));
        expect(receipt).toEqual({ protocol: 'openvote-receipt-v1', pollId: row.poll_id, manifestHash: expect.any(String), tracker: row.tracker });
        expect(Object.keys(receipt)).toEqual(['protocol', 'pollId', 'manifestHash', 'tracker']);
        const report = CoreReport.parse(await localCore({ action: 'verify', archive: election.archive }));
        expect(report).toMatchObject({ ballotCount: 1, result: null });
        flows.push({ privateCredential, publicCredential: row.credential, tracker: row.tracker });
      }

      expect(new Set(flows.map(value => value.privateCredential)).size).toBe(2);
      expect(new Set(flows.map(value => value.publicCredential)).size).toBe(2);
      expect(new Set(flows.map(value => value.tracker)).size).toBe(2);
      const identityColumns = await identityStore.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='credentials' ORDER BY ordinal_position");
      expect(identityColumns.rows.map(row => row.column_name)).toEqual(['poll_id', 'person', 'credential_sealed', 'manifest_hash', 'closes_at', 'revoked']);
      const ballotColumns = await ballotStore.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='ballots' ORDER BY ordinal_position");
      expect(ballotColumns.rows.map(row => row.column_name)).toEqual(['poll_id', 'credential', 'tracker', 'receipt']);
      const managementColumns = await managementStore.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='polls' ORDER BY ordinal_position");
      expect(managementColumns.rows.map(row => row.column_name)).toEqual(['id', 'author_person', 'doc', 'published_at', 'created_at']);
      const voterAsAuthor = await managementStore.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM polls WHERE id=ANY($1::uuid[]) AND author_person=$2', [testPolls.map(value => value.id), person]);
      expect(required(voterAsAuthor.rows[0]).count).toBe(0);
    } finally {
      await identityStore.end();
      await ballotStore.end();
      await managementStore.end();
      for (const token of tokens) await call('identity', '/v1/session', 'DELETE', undefined, token);
    }
  }, 120000);

  it('rejects injection, CSRF, SSRF, IDOR and participant privilege escalation', async () => {
    const owner = await login('TEST-PERSON-0006', 'A'), other = await login('TEST-PERSON-0007', 'B');
    const tokens = [owner.token, other.token];
    let pollId: string | null = null;
    try {
      const content = fixtureContent(new Date(Date.now() + 3600000), 'Чи безпечно <script>alert(1)</script> у тестовому питанні?');
      content.argumentsFor[0] = { ...required(content.argumentsFor[0]), text: '<img src=x onerror=alert(1)> лишається текстом.', url: 'https://127.0.0.1:1/private' };
      const response = await fetch('http://127.0.0.1:4303/v1/drafts', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + owner.token }, body: JSON.stringify(content) });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
      expect(response.headers.get('content-security-policy')).not.toContain('googletagmanager.com');
      expect(response.headers.get('content-security-policy')).not.toContain('google-analytics.com');
      const draft = z.object({ poll: Poll }).parse(await response.json()).poll;
      pollId = draft.id;
      expect(draft.content.question).toBe(content.question);
      expect(draft.content.argumentsFor[0]).toEqual(content.argumentsFor[0]);

      const insecureSource = { ...content, argumentsFor: [{ ...required(content.argumentsFor[0]), url: 'http://127.0.0.1/private' }] };
      expect(await call('management', '/v1/drafts', 'POST', insecureSource, owner.token)).toEqual({ status: 400, value: { error: 'INVALID_INPUT' } });
      expect(await call('management', `/v1/polls/${pollId}`, 'GET', undefined, other.token)).toEqual({ status: 404, value: { error: 'POLL_NOT_FOUND' } });
      expect(await call('management', `/v1/polls/${pollId}`, 'PATCH', content, other.token)).toEqual({ status: 403, value: { error: 'AUTHOR_REQUIRED' } });
      expect(await call('management', `/v1/polls/${pollId}/review`, 'POST', approvedReview, other.token)).toEqual({ status: 403, value: { error: 'MODERATOR_REQUIRED' } });
      expect(await call('management', `/v1/polls/${pollId}/incident`, 'POST', {
        action: 'Cancelled', kind: 'SecurityIncident', reason: 'Тестова спроба підвищення повноважень звичайного учасника.' }, other.token))
        .toEqual({ status: 403, value: { error: 'MODERATOR_REQUIRED' } });

      const injection = await call('management', `/v1/polls?q=${encodeURIComponent("' OR 1=1 --")}`);
      expect(injection.status).toBe(200);
      expect(z.object({ polls: z.array(Poll) }).parse(injection.value).polls.some(poll => poll.id === pollId)).toBe(false);
      expect(await call('management', `/v1/polls/${encodeURIComponent("' OR 1=1 --")}`)).toEqual({ status: 400, value: { error: 'INVALID_INPUT' } });

      const crossOrigin = await fetch(`http://127.0.0.1:4303/v1/polls/${pollId}/submit`, { method: 'POST', headers: {
        'content-type': 'application/json', authorization: 'Bearer ' + owner.token, origin: 'https://attacker.invalid' }, body: '{}' });
      expect(crossOrigin.status).toBe(403);
      expect(await crossOrigin.json()).toEqual({ error: 'ORIGIN_REJECTED' });
    } finally {
      if (pollId !== null) {
        const pool = database(await readConfig('management'));
        await pool.query('DELETE FROM events WHERE poll_id=$1', [pollId]);
        await pool.query('DELETE FROM appeals WHERE poll_id=$1', [pollId]);
        await pool.query('DELETE FROM polls WHERE id=$1', [pollId]);
        await pool.end();
      }
      for (const token of tokens) await call('identity', '/v1/session', 'DELETE', undefined, token);
    }
  }, 30000);

  it('blocks stale recovery approval when an acknowledged ballot is missing', async () => {
    const author = await login('TEST-PERSON-0005', 'A'), moderator = await login('TEST-PERSON-0012', 'A');
    const voter = await login('TEST-PERSON-0008', 'B'), tokens = [author.token, moderator.token, voter.token];
    const ballotStore = database(await readConfig('ballot'));
    try {
      const poll = await createPoll(author.token, moderator.token, fixtureContent(new Date(Date.now() + 3600000),
        'Чи блокує зовнішнє свідчення відновлення застарілого backup?'));
      if (poll.cryptoId === null) throw new Error('RECOVERY_TEST_POLL_NOT_PROVISIONED');
      const pollId = poll.cryptoId;
      created.push({ id: poll.id, cryptoId: pollId });
      const before = required((await ballotStore.query<{ archive: string; state: string }>('SELECT archive,state FROM elections WHERE id=$1', [pollId])).rows[0]);
      const right = z.object({ credential: z.string() }).parse(await ok('identity', `/v1/credentials/${pollId}`, 'POST', {}, voter.token));
      const ballot = await generateBallot(before.archive, right.credential, 0);
      const accepted = z.object({ accepted: z.literal(true), idempotent: z.literal(false), receipt: Envelope })
        .parse(await ok('ballot', `/v1/elections/${pollId}/ballots`, 'POST', { ballot }));
      const trust = Trust.parse(JSON.parse(await readFile(`.runtime/trustees/1/${pollId}/trust.json`, 'utf8')));
      const config = ObserverConfig.parse({ ballotOrigin: 'http://127.0.0.1:4302', managementOrigin: 'http://127.0.0.1:4303',
        trust, receipts: [accepted.receipt] });
      const prior = (await observePublic(config, null)).observation;

      await ballotStore.query('DELETE FROM ballots WHERE poll_id=$1', [pollId]);
      await ballotStore.query('UPDATE elections SET archive=$2,state=$3 WHERE id=$1', [pollId, before.archive, before.state]);
      await expect(observePublic(config, prior)).rejects.toThrow('ACKNOWLEDGED_BALLOT_MISSING');
      expect(required((await ballotStore.query<{ count: number }>('SELECT count(*)::int AS count FROM ballots WHERE poll_id=$1', [pollId])).rows[0]).count).toBe(0);
    } finally {
      await ballotStore.end();
      for (const token of tokens) await call('identity', '/v1/session', 'DELETE', undefined, token);
    }
  }, 120000);

  it('deduplicates A/B, replays late return and exposes outages without weaker admission', async () => {
    const [a, b] = await Promise.all([login('TEST-PERSON-0002', 'A'), login('TEST-PERSON-0002', 'B')]);
    const cfg = await readConfig('identity');
    const introspect = async (token: string) => {
      const r = await fetch('http://127.0.0.1:4301/internal/introspect', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.serviceToken }, body: JSON.stringify({ token }) });
      return z.object({ person: z.string() }).parse(await r.json()).person;
    };
    expect(await introspect(a.token)).toBe(await introspect(b.token));
    const start = z.object({ attempt: z.string() }).parse(await ok('identity', '/v1/auth/start', 'POST', { provider: 'A', subject: 'TEST-PERSON-0002' }));
    await control('A', false);
    expect((await call('identity', '/v1/auth/finish', 'POST', start)).status).toBe(503);
    expect(await introspect((await login('TEST-PERSON-0002', 'B')).token)).toBe(await introspect(a.token));
    await control('A', true, false, 200);
    const [late, concurrent] = await Promise.all([ok('identity', '/v1/auth/finish', 'POST', start), ok('identity', '/v1/auth/finish', 'POST', start)]);
    expect(late).toEqual(concurrent);
    expect(await ok('identity', '/v1/auth/finish', 'POST', start)).toEqual(late);
    await control('A', false); await control('B', false);
    const unavailable = z.object({ attempt: z.string() }).parse(await ok('identity', '/v1/auth/start', 'POST', { provider: 'B', subject: 'TEST-PERSON-0002' }));
    expect((await call('identity', '/v1/auth/finish', 'POST', unavailable)).status).toBe(503);
    expect((await call('identity', '/v1/auth/start', 'POST', { provider: 'A', subject: 'NOT-A-TEST-PERSON' })).status).toBe(400);
    await control('A', true); await control('B', true);
  });

  it('expires pending identity returns before granting a session', async () => {
    const start = z.object({ attempt: z.string() }).parse(await ok('identity', '/v1/auth/start', 'POST', { provider: 'A', subject: 'TEST-PERSON-0002' }));
    await control('A', true, false, 2000);
    const finishing = call('identity', '/v1/auth/finish', 'POST', start);
    const config = await readConfig('provider-A');
    let pending = 0;
    const deadline = Date.now() + 1000;
    while (pending === 0 && Date.now() < deadline) {
      const observed = await fetch('http://127.0.0.1:4312/control', { headers: { authorization: 'Bearer ' + config.serviceToken } });
      pending = z.object({ pending: z.number() }).parse(await observed.json()).pending;
      if (pending === 0) await setTimeout(10);
    }
    expect(pending).toBe(1);
    const pool = database(await readConfig('identity'));
    await pool.query('UPDATE attempts SET expires_at=now() WHERE id=$1', [start.attempt]);
    await pool.end();
    const result = await finishing;
    expect(result.status).toBe(410);
    expect(result.value).toEqual({ error: 'IDENTITY_RETURN_EXPIRED' });
    await control('A', true);
  });

  it('checks return expiry after waiting for the person transaction lock', async () => {
    const cfg = await readConfig('identity'), pool = database(cfg), lock = await pool.connect();
    try {
      const start = z.object({ attempt: z.string() }).parse(await ok('identity', '/v1/auth/start', 'POST', { provider: 'A', subject: 'TEST-PERSON-0002' }));
      await lock.query('BEGIN');
      await lock.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [pseudonym('TEST-PERSON-0002', required(cfg.dedupKey))]);
      const finishing = call('identity', '/v1/auth/finish', 'POST', start);
      let waiting = false;
      const deadline = Date.now() + 2000;
      while (!waiting && Date.now() < deadline) {
        const activity = await pool.query<{ waiting: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory') AS waiting");
        waiting = required(activity.rows[0]).waiting;
        if (!waiting) await setTimeout(10);
      }
      expect(waiting).toBe(true);
      await pool.query('UPDATE attempts SET expires_at=clock_timestamp() WHERE id=$1', [start.attempt]);
      await lock.query('COMMIT');
      const result = await finishing;
      expect(result.status).toBe(410);
      expect(result.value).toEqual({ error: 'IDENTITY_RETURN_EXPIRED' });
    } finally { await lock.query('ROLLBACK'); lock.release(); await pool.end(); }
  });

  it('enforces proof intake, final vote, recovery, signed finality and threshold tally', async () => {
    const author = await login('TEST-PERSON-0002'), moderator = await login('TEST-PERSON-0012');
    const unverified = await login('TEST-PERSON-0010');
    expect((await call('management', '/v1/drafts', 'POST', fixtureContent(new Date(Date.now() + 60000)), unverified.token)).status).toBe(403);
    const closesAt = new Date(Date.now() + 35000);
    const content = fixtureContent(closesAt, 'Чи підтримуєте відкриту перевірку тестового інтеграційного сценарію?');
    const poll = await createPoll(author.token, moderator.token, content);
    if (poll.cryptoId === null) throw new Error('Missing crypto id');
    const id = poll.cryptoId;
    created.push({ id: poll.id, cryptoId: id });
    expect(Poll.parse(z.object({ poll: Poll }).parse(await ok('management', `/v1/polls/${poll.id}/review`, 'POST', approvedReview, moderator.token)).poll).cryptoId).toBe(id);
    expect((await call('management', `/v1/polls/${poll.id}`, 'PATCH', { ...content, context: content.context + ' Прихована зміна.' }, author.token)).status).toBe(409);
    expect((await call('management', `/v1/polls/${poll.id}/close`, 'POST', {}, author.token)).status).toBe(403);
    expect((await call('management', `/v1/polls/${poll.id}/close`, 'POST', {}, moderator.token)).status).toBe(409);
    const pool = database(await readConfig('ballot'));
    const record = required((await pool.query<{ archive: string }>('SELECT archive FROM elections WHERE id=$1', [id])).rows[0]);
    await pool.end();
    const right = z.object({ credential: z.string(), manifestHash: z.string() });
    const credential = right.parse(await ok('identity', `/v1/credentials/${id}`, 'POST', {}, author.token));
    const otherDevice = await login('TEST-PERSON-0002', 'B');
    const otherDeviceCredential = right.parse(await ok('identity', `/v1/credentials/${id}`, 'POST', {}, otherDevice.token));
    expect(otherDeviceCredential).toEqual(credential);
    await control('A', false);
    expect(right.parse(await ok('identity', `/v1/credentials/${id}`, 'POST', {}, author.token))).toEqual(credential);
    await control('A', true);
    const ballot = await generateBallot(record.archive, credential.credential, 0);
    expect((await call('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot }, author.token)).status).toBe(400);
    expect((await call('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot, choice: 0 })).status).toBe(400);
    const malformedProof = z.looseObject({ answers: z.array(z.looseObject({
      individual_proofs: z.array(z.array(z.looseObject({ response: z.string() }))),
    })) }).parse(JSON.parse(ballot));
    const damagedResponse = required(required(required(malformedProof.answers[0]).individual_proofs[0])[0]);
    damagedResponse.response = damagedResponse.response === '0' ? '1' : '0';
    expect(await call('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot: JSON.stringify(malformedProof) }))
      .toEqual({ status: 422, value: { error: 'REFERENCE_REJECTED' } });
    const otherDeviceBallot = await generateBallot(record.archive, otherDeviceCredential.credential, 0);
    expect(otherDeviceBallot).not.toBe(ballot);
    const raced = await Promise.all([ballot, otherDeviceBallot].map(value => call('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot: value })));
    expect(raced.map(response => response.status).sort()).toEqual([200, 422]);
    expect(required(raced.find(response => response.status === 422)).value).toEqual({ error: 'FINAL_VOTE_ALREADY_CAST' });
    const acceptedBallot = required([ballot, otherDeviceBallot][raced.findIndex(response => response.status === 200)]);
    const responses = await Promise.all(Array.from({ length: 5 }, () => ok('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot: acceptedBallot })));
    const accepted = z.object({ receipt: Envelope, idempotent: z.boolean() });
    expect(responses.map(r => accepted.parse(r)).every(r => r.idempotent)).toBe(true);
    const receipt = accepted.parse(responses[0]).receipt;
    const tracker = Receipt.parse(JSON.parse(receipt.payload)).tracker;
    expect(JSON.stringify(receipt)).not.toMatch(/TEST-PERSON|choice|credential|timestamp/);
    expect(z.object({ included: z.boolean() }).parse(await ok('ballot', `/v1/elections/${id}/tracker?tracker=${encodeURIComponent(tracker)}`)).included).toBe(true);
    const changed = await generateBallot(record.archive, credential.credential, 1);
    const duplicate = await call('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot: changed });
    expect(duplicate.status).toBe(422); expect(duplicate.value).toEqual({ error: 'FINAL_VOTE_ALREADY_CAST' });
    for (const [subject, choice] of [['TEST-PERSON-0003', 1], ['TEST-PERSON-0004', 2]]) {
      const input = z.tuple([z.string(), z.number()]).parse([subject, choice]);
      const voter = await login(input[0]);
      const c = right.parse(await ok('identity', `/v1/credentials/${id}`, 'POST', {}, voter.token));
      await ok('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot: await generateBallot(record.archive, c.credential, input[1]) });
    }
    for (const path of ['result', 'result.csv', 'share.svg', 'audit']) expect((await call('ballot', `/v1/elections/${id}/${path}`)).status).toBe(409);
    await setTimeout(Math.max(0, closesAt.getTime() - Date.now() + 100));
    const expiredCredential = await call('identity', `/v1/credentials/${id}`, 'POST', {}, author.token);
    expect(expiredCredential.status).toBe(403);
    expect(expiredCredential.value).toEqual({ error: 'NO_ACTIVE_CREDENTIAL' });
    await ok('management', `/v1/polls/${poll.id}/close`, 'POST', {}, moderator.token);
    const config = await readConfig('ballot');
    const final = FinalSet.parse(await ok('ballot', `/internal/final/${id}`, 'POST', {}, config.serviceToken));
    const trust = Trust.parse(JSON.parse(await readFile(`.runtime/trustees/1/${id}/trust.json`, 'utf8')));
    const report = await localCore({ action: 'verify', archive: final.archive });
    const bound = verifyFinal(final, trust, report, Date.now(), null);
    expect(() => verifyFinal(final, trust, report, closesAt.getTime() - 1, null)).toThrow('NOT_UNPUBLISHED_FINAL_TALLY');
    expect(() => verifyFinal(final, trust, report, Date.now(), 'different-final')).toThrow('TRUSTEE_FINAL_SET_ALREADY_BOUND');
    expect(verifyFinal(final, trust, report, Date.now(), bound.finalHash).finalHash).toBe(bound.finalHash);
    expect(await ok('ballot', `/internal/tally/${id}`, 'POST', {}, config.serviceToken)).toEqual({ state: 'WaitingForQuorum' });
    for (const path of ['result', 'result.csv', 'share.svg', 'audit']) expect((await call('ballot', `/v1/elections/${id}/${path}`)).status).toBe(409);
    await mkdir('artifacts/services', { recursive: true });
    await writeFile('artifacts/services/closed-public-set.json', JSON.stringify({ final, trust, report }, null, 2) + '\n');
    const trustee = Ceremony.shape.trustees.element.parse(JSON.parse(await readFile(`.runtime/trustees/1/${id}/private.json`, 'utf8')));
    const genuineShare = z.object({ share: z.string() }).parse(await localCore({ action: 'share', archive: final.archive, trustee })).share;
    const proofData = z.looseObject({ decryption_proofs: z.array(z.array(z.looseObject({ response: z.string() }))) }).parse(JSON.parse(required(genuineShare.split('\n')[0])));
    const proof = required(required(proofData.decryption_proofs[0])[0]);
    proof.response = proof.response === '0' ? '1' : '0';
    const damagedPayload = JSON.stringify(proofData), damagedShare = damagedPayload + '\n' + JSON.stringify({ owner: 1, payload: sha(damagedPayload) });
    const invalidShare = await call('ballot', `/internal/share/${id}`, 'POST', { trusteeId: 1, share: damagedShare }, config.serviceToken);
    expect(invalidShare).toEqual({ status: 422, value: { error: 'REFERENCE_REJECTED' } });
    const ballotStorage = database(config);
    expect(required((await ballotStorage.query<{ count: number }>('SELECT count(*)::int AS count FROM shares WHERE poll_id=$1', [id])).rows[0]).count).toBe(0);
    await ballotStorage.end();
    // This test acts as the first trustee. Preserve its generated bytes before
    // delivery, as the real CLI does, so the later CLI reuses this exact share.
    await writeOnce(`.runtime/trustees/1/${id}/share.jsons`, genuineShare);
    expect(await ok('ballot', `/internal/share/${id}`, 'POST', { trusteeId: 1, share: genuineShare }, config.serviceToken)).toEqual({ recorded: true });
    expect(await ok('ballot', `/internal/share/${id}`, 'POST', { trusteeId: 1, share: genuineShare }, config.serviceToken)).toEqual({ recorded: true });
    const owner = z.object({ owner: z.number(), payload: z.string() }).parse(JSON.parse(required(genuineShare.split('\n')[1])));
    const wrongOwner = required(genuineShare.split('\n')[0]) + '\n' + JSON.stringify({ ...owner, owner: 2 });
    expect((await call('ballot', `/internal/share/${id}`, 'POST', { trusteeId: 2, share: wrongOwner }, config.serviceToken)).status).toBe(422);
    await ok('management', `/v1/polls/${poll.id}/demo-tally`, 'POST', {}, moderator.token);
    const result = ResultContract.parse(await ok('ballot', `/v1/elections/${id}/result`));
    expect(result.counts).toEqual([1, 1, 1]); expect(result.acceptedVotes).toBe(3);
    expect(result.selfSelected).toBe(true);
    for (const [path, type, filename, contents] of [
      ['result.csv', 'text/csv', `result-${id}.csv`, resultCsv(result)],
      ['share.svg', 'image/svg+xml', `share-${id}.svg`, resultSvg(result)],
    ]) {
      const response = await fetch(`http://127.0.0.1:4302/v1/elections/${id}/${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(type);
      expect(response.headers.get('content-disposition')).toBe(`attachment; filename="${filename}"`);
      expect(await response.text()).toBe(contents);
    }
    expect(accepted.parse(await ok('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot: acceptedBallot })).receipt).toEqual(receipt);
    const audit = z.object({ archive: z.string() }).parse(await ok('ballot', `/v1/elections/${id}/audit`));
    await mkdir('artifacts/services', { recursive: true });
    await writeFile('artifacts/services/election.bel', Buffer.from(audit.archive, 'base64'));
    await writeFile('artifacts/services/result.json', JSON.stringify(result, null, 2) + '\n');
    await ok('ballot', `/internal/state/${id}`, 'POST', { state: 'Invalidated' }, config.serviceToken);
    for (const path of ['result', 'result.csv', 'share.svg', 'audit']) expect((await call('ballot', `/v1/elections/${id}/${path}`)).status).toBe(409);
  }, 180000);
  it.each(['TEST-PERSON-0009', 'TEST-PERSON-0006', 'TEST-PERSON-0007'])('withholds public results and all share/tally access for the small group authored by %s', async subject => {
    const voters = { 'TEST-PERSON-0009': [], 'TEST-PERSON-0006': ['TEST-PERSON-0006'], 'TEST-PERSON-0007': ['TEST-PERSON-0007', 'TEST-PERSON-0004'] };
    const participants = z.array(z.string()).parse(Reflect.get(voters, subject));
    const author = await login(subject), moderator = await login('TEST-PERSON-0012');
    const closesAt = new Date(Date.now() + 20000);
    const poll = await createPoll(author.token, moderator.token, fixtureContent(closesAt, 'Чи підтримуєте нерозкриття підсумку малої тестової групи?'));
    if (poll.cryptoId === null) throw new Error('Missing crypto id');
    created.push({ id: poll.id, cryptoId: poll.cryptoId });
    const config = await readConfig('ballot'), pool = database(config);
    try {
      const archive = required((await pool.query<{ archive: string }>('SELECT archive FROM elections WHERE id=$1', [poll.cryptoId])).rows[0]).archive;
      for (const participant of participants) {
        const identity = await login(participant);
        const right = z.object({ credential: z.string() }).parse(await ok('identity', `/v1/credentials/${poll.cryptoId}`, 'POST', {}, identity.token));
        await ok('ballot', `/v1/elections/${poll.cryptoId}/ballots`, 'POST', { ballot: await generateBallot(archive, right.credential, 0) });
      }
    } finally { await pool.end(); }
    await setTimeout(Math.max(0, closesAt.getTime() - Date.now() + 100));
    await ok('management', `/v1/polls/${poll.id}/close`, 'POST', {}, moderator.token);
    for (const path of ['result', 'result.csv', 'share.svg']) {
      const response = await call('ballot', `/v1/elections/${poll.cryptoId}/${path}`);
      expect(response.status).toBe(409);
      expect(response.value).toEqual({ error: 'RESULTS_SUPPRESSED' });
    }
    expect((await call('ballot', `/v1/elections/${poll.cryptoId}/audit`)).status).toBe(409);
    for (const [path, body] of [['final', {}], ['share', { trusteeId: 1, share: 'deliberately invalid suppressed decryption share input' }], ['tally', {}]]) {
      const response = await call('ballot', `/internal/${path}/${poll.cryptoId}`, 'POST', body, config.serviceToken);
      expect(response).toEqual({ status: 409, value: { error: 'NO_PUBLISHABLE_FINAL_SET' } });
    }
    const storage = database(config);
    try {
      expect(required((await storage.query<{ count: number }>('SELECT count(*)::int AS count FROM shares WHERE poll_id=$1', [poll.cryptoId])).rows[0]).count).toBe(0);
      const saved = required((await storage.query<{ archive: string }>('SELECT archive FROM elections WHERE id=$1', [poll.cryptoId])).rows[0]);
      const verified = z.object({ result: z.null(), ballotCount: z.number() }).parse(await localCore({ action: 'verify', archive: saved.archive }));
      expect(verified.ballotCount).toBe(participants.length);
    } finally { await storage.end(); }
  }, 60000);
  it('denies conflicting attributes and invalidates previous sessions', async () => {
    const identity = await login('TEST-PERSON-0008', 'A');
    await control('B', true, true);
    const start = z.object({ attempt: z.string() }).parse(await ok('identity', '/v1/auth/start', 'POST', { provider: 'B', subject: 'TEST-PERSON-0008' }));
    expect((await call('identity', '/v1/auth/finish', 'POST', start)).value).toEqual({ error: 'PROVIDER_ATTRIBUTES_CONFLICT' });
    expect((await call('identity', '/v1/session', 'GET', undefined, identity.token)).status).toBe(401);
    await control('B', true);
    // Restore exactly this test identity fixture for repeatable test runs.
    const { pseudonym } = await import('../apps/api/src/common.ts');
    const config = await readConfig('identity'), pool = database(config);
    await pool.query('UPDATE persons SET revoked=false WHERE person=$1', [pseudonym('TEST-PERSON-0008', required(config.dedupKey))]);
    await pool.end();
  });

  it('keeps the frozen roster and keys immutable and rejects foreign admission at the actual API boundary', async () => {
    const manifest = Manifest.parse({ ...fixtureContent(new Date(Date.now() + 600000), 'Чи підтримуєте перевірку незмінного тестового реєстру?'),
      id: randomUUID(), version: 1, environment: 'test', core: 'Belenios 3.3.0', release: '0.1.0-dev.1',
      incidentPolicy: 'SecurityIncident|LegalContentRemoval|InvalidProof; reason required; no result-based cancellation' });
    const setup = Ceremony.parse(await localCore({ action: 'setup', manifest, persons: ['TEST-PERSON-0001', 'TEST-PERSON-0003', 'TEST-PERSON-0004'] }));
    created.push({ id: manifest.id, cryptoId: setup.uuid });
    const variants = z.strictObject({ extendedRoster: z.string(), foreignBallot: z.string(), otherEnvironment: z.string(), changedContext: z.string(), otherPoll: z.string(), rotatedKeys: z.string() }).parse(await new Promise((resolve, reject) => {
      const child = spawn('docker', ['run', '--rm', '-i', '--network', 'none', '--platform', 'linux/amd64', '--read-only',
        '--tmpfs', '/tmp:size=256m,mode=1777', '--memory', '512m', '--cpus', '2', '-v', process.cwd() + '/tools:/tools:ro',
        '--entrypoint', 'python3', 'openvote-crypto:3.3.0', '/tools/test_admission_variants.py'], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 90000 });
      let output = '';
      child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; }); child.stderr.resume();
      child.on('error', reject); child.on('exit', code => {
        if (code !== 0) reject(new Error('PUBLIC_ADMISSION_FIXTURE_FAILED'));
        else { try { resolve(JSON.parse(output)); } catch { reject(new Error('PUBLIC_ADMISSION_FIXTURE_INVALID')); } }
      });
      child.stdin.end(JSON.stringify({ archive: setup.archive }));
    }));
    const ballotConfig = await readConfig('ballot'), identityConfig = await readConfig('identity');
    const box = await ballotApp({ ...ballotConfig, environment: 'test' }, 'http://localhost:5173'), identity = await identityApp(identityConfig, 'http://localhost:5173');
    const ballotStore = database(ballotConfig), identityStore = database(identityConfig);
    const boxHeaders = { authorization: 'Bearer ' + ballotConfig.serviceToken }, identityHeaders = { authorization: 'Bearer ' + identityConfig.serviceToken };
    const registration = { id: setup.uuid, electionRaw: setup.electionRaw, archive: setup.archive };
    const roster = { pollId: setup.uuid, manifestHash: sha(setup.electionRaw), policy: manifest.policy, closesAt: manifest.closesAt, privateCredentials: setup.privateCredentials };
    try {
      expect((await box.inject({ method: 'POST', url: '/internal/register', payload: registration, headers: identityHeaders })).statusCode).toBe(401);
      expect((await identity.inject({ method: 'POST', url: '/internal/register-roster', payload: roster, headers: boxHeaders })).statusCode).toBe(401);
      for (let delivery = 0; delivery < 2; delivery++) {
        expect((await box.inject({ method: 'POST', url: '/internal/register', payload: registration, headers: boxHeaders })).statusCode).toBe(200);
        expect((await identity.inject({ method: 'POST', url: '/internal/register-roster', payload: roster, headers: identityHeaders })).statusCode).toBe(200);
      }
      expect(required((await ballotStore.query<{ count: number }>('SELECT count(*)::int AS count FROM checkpoints WHERE poll_id=$1', [setup.uuid])).rows[0]).count).toBe(1);
      const PublicCredential = z.strictObject({ credential: z.string(), manifestHash: z.string(), recovery: z.literal('SameCredentialOnly'),
        freshnessPolicy: z.literal('ValidUntilFixedClose; provider outage does not revoke an already issued credential') });
      const committedSession = await login('TEST-PERSON-0001');
      const committedFirst = await call('identity', `/v1/credentials/${setup.uuid}`, 'POST', {}, committedSession.token);
      const committedSecond = await call('identity', `/v1/credentials/${setup.uuid}`, 'POST', {}, committedSession.token);
      expect(committedFirst.status).toBe(200); expect(committedSecond.status).toBe(200);
      const firstCredential = PublicCredential.parse(committedFirst.value), secondCredential = PublicCredential.parse(committedSecond.value);
      expect(firstCredential.credential === secondCredential.credential).toBe(true);
      expect(firstCredential.credential === required(setup.privateCredentials['TEST-PERSON-0001'])).toBe(true);
      expect(firstCredential.manifestHash).toBe(sha(setup.electionRaw));
      const postOpenSession = await login('TEST-PERSON-0006');
      expect(await call('identity', `/v1/credentials/${setup.uuid}`, 'POST', {}, postOpenSession.token)).toEqual({ status: 403, value: { error: 'NO_ACTIVE_CREDENTIAL' } });
      const priorRoster = (await identityStore.query('SELECT * FROM credentials WHERE poll_id=$1 ORDER BY person', [setup.uuid])).rows;
      for (const payload of [
        { ...roster, privateCredentials: { ...roster.privateCredentials, 'TEST-PERSON-0006': required(roster.privateCredentials['TEST-PERSON-0001']) } },
        { ...roster, privateCredentials: { ...roster.privateCredentials, 'TEST-PERSON-0001': required(roster.privateCredentials['TEST-PERSON-0003']) } },
        { ...roster, manifestHash: '0'.repeat(64) },
      ]) {
        const response = await identity.inject({ method: 'POST', url: '/internal/register-roster', payload, headers: identityHeaders });
        expect(response.statusCode).toBe(409); expect(response.json()).toEqual({ error: 'IMMUTABLE_ROSTER_MISMATCH' });
      }
      // Compare privately: assertion output must not print sealed credentials.
      expect(JSON.stringify((await identityStore.query('SELECT * FROM credentials WHERE poll_id=$1 ORDER BY person', [setup.uuid])).rows) === JSON.stringify(priorRoster)).toBe(true);
      const changedRoster = await box.inject({ method: 'POST', url: '/internal/register', payload: { ...registration, archive: variants.extendedRoster }, headers: boxHeaders });
      expect(changedRoster.statusCode).toBe(409); expect(changedRoster.json()).toEqual({ error: 'IMMUTABLE_ROSTER_MISMATCH' });
      for (const archive of [variants.changedContext, variants.rotatedKeys]) {
        const report = CoreReport.parse(await localCore({ action: 'verify', archive }));
        const response = await box.inject({ method: 'POST', url: '/internal/register', payload: { id: setup.uuid, electionRaw: JSON.stringify(report.election), archive }, headers: boxHeaders });
        expect(response.statusCode).toBe(409); expect(response.json()).toEqual({ error: 'IMMUTABLE_MANIFEST_MISMATCH' });
      }
      const otherEnvironment = CoreReport.parse(await localCore({ action: 'verify', archive: variants.otherEnvironment }));
      const environmentResponse = await box.inject({ method: 'POST', url: '/internal/register', payload: { id: setup.uuid, electionRaw: JSON.stringify(otherEnvironment.election), archive: variants.otherEnvironment }, headers: boxHeaders });
      expect(environmentResponse.statusCode).toBe(422); expect(environmentResponse.json()).toEqual({ error: 'INVALID_ENVIRONMENT_OR_DEADLINE' });
      const foreign = await box.inject({ method: 'POST', url: `/v1/elections/${setup.uuid}/ballots`, payload: { ballot: variants.foreignBallot } });
      expect(foreign.statusCode).toBe(422); expect(foreign.json()).toEqual({ error: 'REFERENCE_REJECTED' });
      expect(required((await ballotStore.query<{ archive: string }>('SELECT archive FROM elections WHERE id=$1', [setup.uuid])).rows[0]).archive === setup.archive).toBe(true);
      const ballot = await generateBallot(setup.archive, required(setup.privateCredentials['TEST-PERSON-0001']), 0);
      for (const headers of [{ cookie: 'test-session=forbidden' }, { 'x-user-id': 'TEST-PERSON-0001' }]) {
        const response = await box.inject({ method: 'POST', url: `/v1/elections/${setup.uuid}/ballots`, payload: { ballot }, headers });
        expect(response.statusCode).toBe(400); expect(response.json()).toEqual({ error: 'IDENTITY_METADATA_FORBIDDEN' });
      }
      const accepted = await box.inject({ method: 'POST', url: `/v1/elections/${setup.uuid}/ballots`, payload: { ballot } });
      expect(accepted.statusCode).toBe(200);
      expect((await box.inject({ method: 'POST', url: '/internal/register', payload: registration, headers: boxHeaders })).statusCode).toBe(200);
      expect(required((await ballotStore.query<{ count: number }>('SELECT count(*)::int AS count FROM checkpoints WHERE poll_id=$1', [setup.uuid])).rows[0]).count).toBe(1);
      const saved = required((await ballotStore.query<{ archive: string }>('SELECT archive FROM elections WHERE id=$1', [setup.uuid])).rows[0]);
      expect(CoreReport.parse(await localCore({ action: 'verify', archive: saved.archive })).ballotCount).toBe(1);
      const other = CoreReport.parse(await localCore({ action: 'verify', archive: variants.otherPoll }));
      created.push({ id: manifest.id, cryptoId: other.election.uuid });
      expect((await box.inject({ method: 'POST', url: '/internal/register', payload: { id: other.election.uuid, electionRaw: JSON.stringify(other.election), archive: variants.otherPoll }, headers: boxHeaders })).statusCode).toBe(200);
      expect((await box.inject({ method: 'POST', url: `/v1/elections/${other.election.uuid}/ballots`, payload: { ballot } })).statusCode).toBe(422);
    } finally { await box.close(); await identity.close(); await ballotStore.end(); await identityStore.end(); }
  }, 180000);
});
