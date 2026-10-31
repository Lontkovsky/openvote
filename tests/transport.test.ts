import { describe, expect, it, vi } from 'vitest';
import { setTimeout } from 'node:timers/promises';
import { application, serviceResourceLimits } from '../apps/api/src/common.ts';

it('rejects request bodies above the shared limit', async () => {
  const app = await application({ environment: 'test', role: 'management', port: 0, serviceToken: 'synthetic-body-limit-token-not-a-real-secret' }, 'http://localhost:5173');
  app.post('/bounded-body', async () => ({ accepted: true }));
  try {
    const response = await app.inject({ method: 'POST', url: '/bounded-body', headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ value: 'x'.repeat(serviceResourceLimits.requestBodyBytes) }) });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: 'INVALID_INPUT' });
  } finally { await app.close(); }
});

it('bounds sequential requests in one window and recovers at the declared boundary', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T00:00:00.000Z'));
  const app = await application({ environment: 'test', role: 'management', port: 0,
    serviceToken: 'synthetic-rate-limit-token-not-a-real-secret' }, 'http://localhost:5173');
  app.get('/bounded-rate', async () => ({ accepted: true }));
  try {
    let boundary;
    for (let index = 0; index < serviceResourceLimits.requestsPerWindow; index += 1) {
      boundary = await app.inject({ method: 'GET', url: '/bounded-rate' });
      expect(boundary.statusCode).toBe(200);
    }
    expect(boundary?.headers['x-ratelimit-limit']).toBe(String(serviceResourceLimits.requestsPerWindow));
    expect(boundary?.headers['x-ratelimit-remaining']).toBe('0');

    const overflow = await app.inject({ method: 'GET', url: '/bounded-rate' });
    expect(overflow.statusCode).toBe(429);
    expect(overflow.json()).toEqual({ error: 'RATE_LIMITED' });
    expect(overflow.headers['retry-after']).toBe(String(serviceResourceLimits.requestWindowMs / 1000));
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);

    vi.setSystemTime(new Date(Date.now() + serviceResourceLimits.requestWindowMs));
    const recovered = await app.inject({ method: 'GET', url: '/bounded-rate' });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.headers['x-ratelimit-remaining']).toBe(String(serviceResourceLimits.requestsPerWindow - 1));
  } finally {
    await app.close();
    vi.useRealTimers();
  }
});

it('bounds active requests and the waiting queue', async () => {
  const app = await application({ environment: 'test', role: 'management', port: 0, serviceToken: 'synthetic-queue-limit-token-not-a-real-secret' }, 'http://localhost:5173');
  let active = 0, maximum = 0, release!: () => void, activeLimitReached!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const activeLimit = new Promise<void>(resolve => { activeLimitReached = resolve; });
  app.get('/held', async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    if (active === serviceResourceLimits.activeRequests) activeLimitReached();
    await held;
    active -= 1;
    return { accepted: true };
  });
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  try {
    const total = serviceResourceLimits.activeRequests + serviceResourceLimits.queuedRequests + 1;
    const pending = Array.from({ length: total }, () => fetch(origin + '/held'));
    await activeLimit;
    const overflowStarted = Date.now();
    const overflow = await Promise.race(pending);
    expect(overflow.status).toBe(503);
    expect(Date.now() - overflowStarted).toBeLessThan(serviceResourceLimits.queueWaitMs);
    release();
    const responses = await Promise.all(pending);
    expect(responses.filter(response => response.status === 200)).toHaveLength(total - 1);
    expect(responses.filter(response => response.status === 503)).toHaveLength(1);
    expect(await responses.find(response => response.status === 503)?.json()).toEqual({ error: 'SERVER_BUSY' });
    expect(maximum).toBe(serviceResourceLimits.activeRequests);
  } finally { release(); await app.close(); }
});

it('expires a queued request at the declared wait limit', async () => {
  const app = await application({ environment: 'test', role: 'management', port: 0, serviceToken: 'synthetic-queue-timeout-token-not-a-real-secret' }, 'http://localhost:5173');
  let active = 0, release!: () => void, activeLimitReached!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const activeLimit = new Promise<void>(resolve => { activeLimitReached = resolve; });
  app.get('/held', async () => {
    active += 1;
    if (active === serviceResourceLimits.activeRequests) activeLimitReached();
    await held;
    return { accepted: true };
  });
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  try {
    const holders = Array.from({ length: serviceResourceLimits.activeRequests }, () => fetch(origin + '/held'));
    await activeLimit;
    const started = Date.now();
    const queued = await fetch(origin + '/held');
    const elapsed = Date.now() - started;
    expect(queued.status).toBe(503);
    expect(await queued.json()).toEqual({ error: 'SERVER_BUSY' });
    expect(elapsed).toBeGreaterThanOrEqual(serviceResourceLimits.queueWaitMs - 100);
    expect(elapsed).toBeLessThan(serviceResourceLimits.queueWaitMs + 2000);
    release();
    expect((await Promise.all(holders)).every(response => response.status === 200)).toBe(true);
  } finally { release(); await app.close(); }
});

it('keeps a bounded eleven-second native-processing response connected', async () => {
  const app = await application({ environment: 'test', role: 'management', port: 0, serviceToken: 'synthetic-transport-test-token-not-a-real-secret' }, 'http://localhost:5173');
  let responseCompleted = false;
  app.post('/synthetic-processing', async () => { await setTimeout(11000); responseCompleted = true; return { state: 'Finished' }; });
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  const started = Date.now();
  try {
    const response = await fetch(origin + '/synthetic-processing', { method: 'POST', signal: AbortSignal.timeout(15000) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: 'Finished' });
    expect(responseCompleted).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(11000);
  } finally { await app.close(); }
}, 20000);

describe('configured browser origin', () => {
  const config = { environment: 'demo' as const, role: 'management' as const, port: 0, serviceToken: 'synthetic-origin-test-token-not-a-real-secret' };

  it('accepts the local development origin only when it is explicitly configured', async () => {
    const app = await application({ ...config, environment: 'test' }, 'http://localhost:5173');
    try {
      expect((await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://localhost:5173' } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://openvote.com.ua' } })).statusCode).toBe(403);
    } finally { await app.close(); }
  });

  it('accepts the exact configured origin and requests without an Origin header', async () => {
    const app = await application(config, 'https://openvote.com.ua');
    try {
      expect((await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://openvote.com.ua' } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    } finally { await app.close(); }
  });

  it.each(['http://openvote.com.ua', 'https://www.openvote.com.ua', 'https://openvote.com.ua.attacker.example', 'https://openvote.com.ua:444'])(
    'rejects foreign origin %s', async origin => {
      const app = await application(config, 'https://openvote.com.ua');
      try {
        const response = await app.inject({ method: 'GET', url: '/health', headers: { origin } });
        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ error: 'ORIGIN_REJECTED' });
      } finally { await app.close(); }
    });

  it.each(['http://openvote.com.ua', 'https://openvote.com.ua/path', 'https://user@openvote.com.ua'])(
    'refuses invalid demo public origin %s', async origin => {
      await expect(application(config, origin)).rejects.toThrow('INVALID_PUBLIC_ORIGIN');
    });
});
