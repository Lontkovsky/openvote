import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { demandApp, demandCredentialCookie } from '../apps/api/src/demand.ts';
import type { DemandChatProvider } from '../apps/api/src/demand-chat-provider.ts';
import { database, readConfig, sha } from '../apps/api/src/common.ts';
import { DemandPollStatus, DemandResponseReceipt, demandAnswers, demandPollId, demandQuestion } from '../packages/domain/src/demand.ts';
import type { DemandPollResultsType } from '../packages/domain/src/demand.ts';
import { migrateDirectory } from '../scripts/migrate.ts';
import { parseDemandConfiguration } from '../scripts/demand-start.ts';

const origin = 'http://localhost:5174';
let pool: pg.Pool;
let app: Awaited<ReturnType<typeof demandApp>>;
let receivedChatRequests: Array<{ question: string; results: DemandPollResultsType }>;
const testChatProvider: DemandChatProvider = {
  async answer(question, results) {
    receivedChatRequests.push({ question, results });
    return 'Підтверджена тестова відповідь.';
  },
};

function cookiePair(response: { headers: Record<string, string | string[] | number | undefined> }): string {
  const header = response.headers['set-cookie'];
  if (typeof header !== 'string') throw new Error('SET_COOKIE_MISSING');
  const pair = header.split(';')[0];
  if (pair === undefined) throw new Error('SET_COOKIE_INVALID');
  return pair;
}

async function bootstrap() {
  const response = await app.inject({ method: 'GET', url: '/api/v1/demand-poll' });
  expect(response.statusCode).toBe(200);
  return { response, cookie: cookiePair(response) };
}

async function submit(cookie: string, answer: string, requestOrigin = origin) {
  return app.inject({ method: 'POST', url: '/api/v1/demand-poll',
    headers: { cookie, origin: requestOrigin, 'content-type': 'application/json' }, payload: { answer } });
}

beforeAll(async () => {
  pool = database(await readConfig('management'));
  await migrateDirectory(pool, 'migrations/demand');
  app = await demandApp(pool, 'test', origin, testChatProvider);
});

beforeEach(() => { receivedChatRequests = []; });

afterEach(async () => {
  await pool.query('DELETE FROM demand_responses');
});

afterAll(async () => {
  await app.close();
});

describe('minimal demand poll', () => {
  it('bootstraps one private browser credential and returns the zero-result public contract', async () => {
    const { response, cookie } = await bootstrap();
    expect(cookie).toMatch(new RegExp(`^${demandCredentialCookie}=[A-Za-z0-9_-]{43}$`));
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Strict');
    expect(response.headers['set-cookie']).toContain('Path=/');
    expect(response.headers['set-cookie']).toContain('Max-Age=31536000');
    expect(response.headers['set-cookie']).not.toContain('Secure');
    const status = DemandPollStatus.parse(response.json());
    expect(status).toEqual({ apiVersion: 'v1', pollId: demandPollId, version: 1, question: demandQuestion,
      answers: demandAnswers, selfSelected: true, identityVerified: false, uniquePersonGuaranteed: false, response: null,
      results: { totalResponses: 0, counts: [0, 0, 0] } });
    expect(response.body).not.toContain(cookie.split('=')[1] ?? 'missing');
    expect(response.body).not.toMatch(/credential|hash|percentage/i);
  });

  it('sets Secure on the production-origin credential', async () => {
    const securePool = database(await readConfig('management'));
    const secureApp = await demandApp(securePool, 'demo', 'https://openvote.com.ua', testChatProvider);
    try {
      const response = await secureApp.inject({ method: 'GET', url: '/api/v1/demand-poll' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['set-cookie']).toContain('Secure');
      expect(response.headers['set-cookie']).not.toContain('Domain=');
    } finally { await secureApp.close(); }
  });

  it('records one final answer and returns the authoritative aggregate after submission and reload', async () => {
    const { cookie } = await bootstrap();
    const response = await submit(cookie, demandAnswers[0]);
    expect(response.statusCode).toBe(200);
    expect(DemandResponseReceipt.parse(response.json())).toEqual({ recorded: true, answer: demandAnswers[0],
      results: { totalResponses: 1, counts: [1, 0, 0] } });
    const reload = await app.inject({ method: 'GET', url: '/api/v1/demand-poll', headers: { cookie } });
    const status = DemandPollStatus.parse(reload.json());
    expect(status.response).toEqual({ answer: demandAnswers[0] });
    expect(status.results).toEqual({ totalResponses: 1, counts: [1, 0, 0] });
    expect(reload.body).not.toMatch(/credential|hash|percentage/i);
    const rows = await pool.query('SELECT poll_id,poll_version,credential_hash,answer FROM demand_responses');
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toEqual({ poll_id: demandPollId, poll_version: 1,
      credential_hash: sha(cookie.split('=')[1] ?? ''), answer: demandAnswers[0] });
    expect(JSON.stringify(rows.rows)).not.toContain(cookie);
    const columns = await pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='demand_responses' ORDER BY ordinal_position",
    );
    expect(columns.rows.map(row => row.column_name)).toEqual(['poll_id', 'poll_version', 'credential_hash', 'answer']);
  });

  it('publishes exact counts and passes the same current aggregate to Taras', async () => {
    const first = await bootstrap();
    const second = await bootstrap();
    const third = await bootstrap();
    const fourth = await bootstrap();
    expect((await submit(first.cookie, demandAnswers[0])).statusCode).toBe(200);
    expect((await submit(second.cookie, demandAnswers[1])).statusCode).toBe(200);
    expect((await submit(third.cookie, demandAnswers[1])).statusCode).toBe(200);
    expect((await submit(fourth.cookie, demandAnswers[2])).statusCode).toBe(200);
    const response = await app.inject({ method: 'GET', url: '/api/v1/demand-poll', headers: { cookie: first.cookie } });
    const status = DemandPollStatus.parse(response.json());
    expect(status.response).toEqual({ answer: demandAnswers[0] });
    expect(status.results).toEqual({ totalResponses: 4, counts: [1, 2, 1] });
    expect(status.results.counts.reduce((sum, count) => sum + count, 0)).toBe(status.results.totalResponses);
    expect(response.body).not.toMatch(/credential|hash|percentage/i);
    const question = 'скільки зараз голосів за відкриття платформи?';
    const chat = await app.inject({ method: 'POST', url: '/api/v1/demand-chat',
      headers: { cookie: first.cookie, origin, 'content-type': 'application/json' }, payload: { question } });
    expect(chat.statusCode).toBe(200);
    expect(receivedChatRequests).toEqual([{ question, results: { totalResponses: 4, counts: [1, 2, 1] } }]);
    expect(JSON.stringify(receivedChatRequests)).not.toContain(first.cookie);
  });

  it('treats the same final answer as idempotent and rejects a changed answer', async () => {
    const { cookie } = await bootstrap();
    const first = await submit(cookie, demandAnswers[1]);
    const repeated = await submit(cookie, demandAnswers[1]);
    expect(DemandResponseReceipt.parse(first.json()).results).toEqual({ totalResponses: 1, counts: [0, 1, 0] });
    expect(DemandResponseReceipt.parse(repeated.json()).results).toEqual({ totalResponses: 1, counts: [0, 1, 0] });
    const changed = await submit(cookie, demandAnswers[2]);
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toEqual({ error: 'FINAL_RESPONSE_ALREADY_RECORDED' });
    const status = DemandPollStatus.parse((await app.inject({ method: 'GET', url: '/api/v1/demand-poll', headers: { cookie } })).json());
    expect(status.results).toEqual({ totalResponses: 1, counts: [0, 1, 0] });
    const result = await pool.query<{ answer: string; count: string }>('SELECT min(answer) AS answer,count(*) FROM demand_responses');
    expect(result.rows[0]).toEqual({ answer: demandAnswers[1], count: '1' });
  });

  it('stores one row for ten concurrent identical submissions', async () => {
    const { cookie } = await bootstrap();
    const responses = await Promise.all(Array.from({ length: 10 }, () => submit(cookie, demandAnswers[0])));
    expect(responses.every(response => response.statusCode === 200)).toBe(true);
    expect(responses.every(response => DemandResponseReceipt.parse(response.json()).results.totalResponses === 1)).toBe(true);
    expect((await pool.query('SELECT 1 FROM demand_responses')).rowCount).toBe(1);
  });

  it('makes one of two simultaneous conflicting answers final', async () => {
    const { cookie } = await bootstrap();
    const responses = await Promise.all([submit(cookie, demandAnswers[0]), submit(cookie, demandAnswers[1])]);
    expect(responses.map(response => response.statusCode).sort()).toEqual([200, 409]);
    const stored = await pool.query<{ answer: string }>('SELECT answer FROM demand_responses');
    expect(stored.rows).toHaveLength(1);
    expect(demandAnswers).toContain(stored.rows[0]?.answer);
    const status = DemandPollStatus.parse((await app.inject({ method: 'GET', url: '/api/v1/demand-poll', headers: { cookie } })).json());
    expect(status.results.totalResponses).toBe(1);
    expect(status.results.counts.reduce((sum, count) => sum + count, 0)).toBe(1);
  });

  it('rejects missing or malformed credentials without minting replacements', async () => {
    const missing = await app.inject({ method: 'POST', url: '/api/v1/demand-poll',
      headers: { origin, 'content-type': 'application/json' }, payload: { answer: demandAnswers[0] } });
    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toEqual({ error: 'DEMAND_CREDENTIAL_REQUIRED' });
    expect(missing.headers['set-cookie']).toBeUndefined();
    const malformed = await app.inject({ method: 'GET', url: '/api/v1/demand-poll',
      headers: { cookie: `${demandCredentialCookie}=damaged` } });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({ error: 'INVALID_DEMAND_CREDENTIAL' });
    expect(malformed.headers['set-cookie']).toBeUndefined();
    expect((await pool.query('SELECT 1 FROM demand_responses')).rowCount).toBe(0);
  });

  it('requires the exact write origin', async () => {
    const { cookie } = await bootstrap();
    const missing = await app.inject({ method: 'POST', url: '/api/v1/demand-poll',
      headers: { cookie, 'content-type': 'application/json' }, payload: { answer: demandAnswers[0] } });
    expect(missing.statusCode).toBe(403);
    expect(missing.json()).toEqual({ error: 'ORIGIN_REJECTED' });
    for (const foreign of ['https://openvote.com.ua.attacker.example', 'https://localhost:5174', 'http://localhost:5174.attacker.example']) {
      const response = await submit(cookie, demandAnswers[0], foreign);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'ORIGIN_REJECTED' });
    }
    expect((await pool.query('SELECT 1 FROM demand_responses')).rowCount).toBe(0);
  });

  it('rejects unknown answers, missing fields and extra fields', async () => {
    const { cookie } = await bootstrap();
    for (const payload of [{}, { answer: 'Так' }, { answer: demandAnswers[0], extra: true }]) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/demand-poll',
        headers: { cookie, origin, 'content-type': 'application/json' }, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'INVALID_INPUT' });
    }
    expect((await pool.query('SELECT 1 FROM demand_responses')).rowCount).toBe(0);
  });

  it('keeps the stored response across a repeated migration pass', async () => {
    const { cookie } = await bootstrap();
    expect((await submit(cookie, demandAnswers[2])).statusCode).toBe(200);
    await migrateDirectory(pool, 'migrations/demand');
    expect((await pool.query('SELECT answer FROM demand_responses')).rows).toEqual([{ answer: demandAnswers[2] }]);
  });

  it('enforces answer, poll and credential constraints in PostgreSQL', async () => {
    await expect(pool.query('INSERT INTO demand_responses VALUES($1,$2,$3,$4)',
      [demandPollId, 1, 'bad-hash', demandAnswers[0]])).rejects.toThrow();
    await expect(pool.query('INSERT INTO demand_responses VALUES($1,$2,$3,$4)',
      [demandPollId, 1, 'a'.repeat(64), 'Так'])).rejects.toThrow();
    await expect(pool.query('INSERT INTO demand_responses VALUES($1,$2,$3,$4)',
      ['other-poll', 1, 'a'.repeat(64), demandAnswers[0]])).rejects.toThrow();
  });

  it('does not set a browser credential or claim success when the database is unavailable', async () => {
    const unavailablePool = new pg.Pool({ host: '127.0.0.1', port: 1, user: 'none', database: 'none', password: 'none', connectionTimeoutMillis: 100 });
    const unavailableApp = await demandApp(unavailablePool, 'test', origin, testChatProvider);
    try {
      const response = await unavailableApp.inject({ method: 'GET', url: '/api/v1/demand-poll' });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: 'REQUEST_FAILED' });
      expect(response.headers['set-cookie']).toBeUndefined();
    } finally { await unavailableApp.close(); }
  });

  it('keeps the aggregate on the versioned poll route instead of adding a second route', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/demand-poll/results' });
    expect(response.statusCode).toBe(404);
  });
});

describe('demand Render configuration', () => {
  const valid = {
    OPENVOTE_ENVIRONMENT: 'demand',
    OPENVOTE_PUBLIC_ORIGIN: 'https://openvote.com.ua',
    PORT: '10000',
    DEMAND_DATABASE_URL: 'postgresql://openvote_demand:synthetic-password@internal.example:5432/openvote_demand',
    OPENAI_API_KEY: 'synthetic-openai-key-for-tests-only',
  };

  it('accepts only the exact minimal launch configuration', () => {
    expect(parseDemandConfiguration(valid)).toEqual({ port: 10000, publicOrigin: 'https://openvote.com.ua', databaseUrl: valid.DEMAND_DATABASE_URL, openAiApiKey: valid.OPENAI_API_KEY });
  });

  it('accepts the Render internal URL with the default PostgreSQL port', () => {
    const environment = { ...valid, DEMAND_DATABASE_URL: 'postgresql://openvote_demand:synthetic-password@internal.example/openvote_demand' };
    expect(parseDemandConfiguration(environment)).toEqual({ port: 10000, publicOrigin: 'https://openvote.com.ua', databaseUrl: environment.DEMAND_DATABASE_URL, openAiApiKey: valid.OPENAI_API_KEY });
  });

  it.each([
    { ...valid, OPENVOTE_ENVIRONMENT: 'demo' },
    { ...valid, OPENVOTE_PUBLIC_ORIGIN: 'http://openvote.com.ua' },
    { ...valid, PORT: '80' },
    { ...valid, DEMAND_DATABASE_URL: 'postgresql://openvote_demand:password@internal.example:5432/other' },
    { ...valid, DEMAND_DATABASE_URL: 'https://internal.example/openvote_demand' },
    { ...valid, OPENAI_API_KEY: undefined },
    { ...valid, OPENAI_API_KEY: 'short' },
  ])('rejects an invalid launch binding', environment => {
    expect(() => parseDemandConfiguration(environment)).toThrow();
  });
});
