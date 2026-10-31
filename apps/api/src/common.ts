import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, sign, verify, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Fastify, { LogController, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import pg from 'pg';
import { z } from 'zod';
import { Envelope, Environment } from '../../../packages/domain/src/index.ts';
import type { EnvelopeType } from '../../../packages/domain/src/index.ts';

export const Role = z.enum(['identity', 'ballot', 'management', 'provider-A', 'provider-B', 'demand']);
export const serviceResourceLimits = {
  requestBodyBytes: 1024 * 1024,
  activeRequests: 8,
  queuedRequests: 16,
  queueWaitMs: 2000,
  requestTimeoutMs: 100000,
  connectionTimeoutMs: 100000,
  parameterLength: 100,
} as const;
export const Config = z.strictObject({
  environment: Environment, role: Role, port: z.number().int(), serviceToken: z.string().min(32),
  database: z.strictObject({ host: z.string(), port: z.number().int(), database: z.string(), user: z.string(), password: z.string() }).optional(),
  coreToken: z.string().optional(), identityToken: z.string().optional(), ballotToken: z.string().optional(),
  providerTokens: z.record(z.string(), z.string()).optional(), providerKeys: z.record(z.string(), z.string()).optional(),
  signingKey: z.string().optional(), publicKey: z.string().optional(), dedupKey: z.string().optional(), sealingKey: z.string().optional(),
  quotas: z.strictObject({ daily: z.number().int().positive(), cooldownSeconds: z.number().int().nonnegative(), simultaneousOpen: z.number().int().positive() }).optional(),
});
export type ConfigType = z.infer<typeof Config>;
export function parsePublicOrigin(value: unknown, environment: ConfigType['environment']): string {
  const origin = z.string().url().parse(value);
  const parsed = new URL(origin);
  if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) throw new Failure('INVALID_PUBLIC_ORIGIN', 503);
  if (environment === 'demo' && parsed.protocol !== 'https:') throw new Failure('INVALID_PUBLIC_ORIGIN', 503);
  return origin;
}
export class Failure extends Error {
  statusCode: number;
  constructor(code: string, statusCode: number) { super(code); this.statusCode = statusCode; }
}
export function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Failure('CONFIGURATION_INCOMPLETE', 503);
  return value;
}
export async function readConfig(role: string, runtimeRoot = '.runtime'): Promise<ConfigType> {
  Role.parse(role);
  const config = Config.parse(JSON.parse(await readFile(`${runtimeRoot}/${role}/config.json`, 'utf8')));
  if (config.role !== role) throw new Failure('ROLE_MISMATCH', 503);
  return config;
}
export function sha(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
const PartialDecryption = z.strictObject({
  decryption_factors: z.array(z.array(z.string().min(1).max(1000)).length(3)).length(1),
  decryption_proofs: z.array(z.array(z.strictObject({
    challenge: z.string().min(1).max(1000), response: z.string().min(1).max(1000),
  })).length(3)).length(1),
});
const PartialDecryptionOwner = z.strictObject({
  owner: z.number().int().min(1).max(4), payload: z.string().regex(/^[0-9a-f]{64}$/),
});
export function parseNativeShare(value: unknown, trusteeId: number): string {
  let share: string, lines: string[], owner: z.infer<typeof PartialDecryptionOwner>;
  try {
    share = z.string().min(50).max(100000).parse(value);
    lines = share.split('\n');
    if (lines.length !== 2) throw new Error('INVALID_SHARE_FORMAT');
    PartialDecryption.parse(JSON.parse(required(lines[0])));
    owner = PartialDecryptionOwner.parse(JSON.parse(required(lines[1])));
  } catch { throw new Failure('INVALID_SHARE_FORMAT', 422); }
  if (sha(required(lines[0])) !== owner.payload) throw new Failure('INVALID_SHARE_FORMAT', 422);
  if (owner.owner !== trusteeId) throw new Failure('TRUSTEE_ID_MISMATCH', 422);
  return share;
}
export function token(): string { return randomBytes(32).toString('base64url'); }
export function pseudonym(subject: string, key: string): string { return createHmac('sha256', key).update('openvote-person-v1\0' + subject).digest('hex'); }
export function envelope(value: unknown, privateKey: string): EnvelopeType {
  const payload = JSON.stringify(value);
  return { payload, signature: sign(null, Buffer.from(payload), privateKey).toString('base64') };
}
export function openEnvelope(value: unknown, publicKey: string): unknown {
  const signed = Envelope.parse(value);
  if (!verify(null, Buffer.from(signed.payload), publicKey, Buffer.from(signed.signature, 'base64'))) throw new Failure('INVALID_SIGNATURE', 422);
  return JSON.parse(signed.payload);
}
export function sealed(value: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function unseal(value: string, key: string): string {
  const packed = Buffer.from(value, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), packed.subarray(0, 12));
  cipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([cipher.update(packed.subarray(28)), cipher.final()]).toString('utf8');
}
export function authorize(header: string | undefined, expected: string): void {
  if (header === undefined) throw new Failure('UNAUTHORIZED', 401);
  const actual = Buffer.from(header), target = Buffer.from('Bearer ' + expected);
  if (actual.length !== target.length || !timingSafeEqual(actual, target)) throw new Failure('UNAUTHORIZED', 401);
}
export function database(config: ConfigType): pg.Pool {
  return new pg.Pool({ ...required(config.database), max: 8, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000, statement_timeout: 10000 });
}
export async function transaction<T>(pool: pg.Pool, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await run(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function jsonRequest(url: string, body: unknown, authorization: string): Promise<unknown> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + authorization },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90000), redirect: 'error' });
  if (!response.ok) {
    const error = z.object({ error: z.string().regex(/^[A-Z][A-Z0-9_:/-]+$/) }).parse(await response.json());
    throw new Failure(error.error, response.status);
  }
  return response.json();
}
export async function core(config: ConfigType, request: unknown, ceremony = false): Promise<unknown> {
  return jsonRequest(`http://127.0.0.1:${ceremony ? 4311 : 4310}/run`, request, required(config.coreToken));
}

function requestGate() {
  type Waiter = { request: FastifyRequest; resolve: () => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
  let active = 0;
  const held = new WeakSet<FastifyRequest>();
  const queued: Waiter[] = [];
  const waiting = new WeakMap<FastifyRequest, Waiter>();

  function remove(waiter: Waiter) {
    const index = queued.indexOf(waiter);
    if (index >= 0) queued.splice(index, 1);
    waiting.delete(waiter.request);
    clearTimeout(waiter.timer);
  }

  function promote() {
    const waiter = queued.shift();
    if (waiter === undefined) return;
    waiting.delete(waiter.request);
    clearTimeout(waiter.timer);
    active += 1;
    held.add(waiter.request);
    waiter.resolve();
  }

  async function acquire(request: FastifyRequest) {
    if (active < serviceResourceLimits.activeRequests) {
      active += 1;
      held.add(request);
      return;
    }
    if (queued.length >= serviceResourceLimits.queuedRequests) throw new Failure('SERVER_BUSY', 503);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiter = waiting.get(request);
        if (waiter === undefined) return;
        remove(waiter);
        reject(new Failure('SERVER_BUSY', 503));
      }, serviceResourceLimits.queueWaitMs);
      const waiter = { request, resolve, reject, timer };
      waiting.set(request, waiter);
      queued.push(waiter);
    });
  }

  function release(request: FastifyRequest) {
    const waiter = waiting.get(request);
    if (waiter !== undefined) {
      remove(waiter);
      waiter.reject(new Error('REQUEST_ABORTED'));
      return;
    }
    if (!held.delete(request)) return;
    active -= 1;
    promote();
  }

  return { acquire, release };
}

export async function application<T extends Pick<ConfigType, 'environment' | 'role'>>(config: T, publicOrigin: string) {
  const origin = parsePublicOrigin(publicOrigin, config.environment);
  const gate = requestGate();
  const app = Fastify({ logger: false, bodyLimit: serviceResourceLimits.requestBodyBytes, requestTimeout: serviceResourceLimits.requestTimeoutMs,
    connectionTimeout: serviceResourceLimits.connectionTimeoutMs, routerOptions: { maxParamLength: serviceResourceLimits.parameterLength },
    logController: new LogController({ disableRequestLogging: true }) });
  await app.register(cors, { origin, credentials: false, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  await app.register(helmet, { referrerPolicy: { policy: 'no-referrer' } });
  app.addHook('onRequest', async (request, reply) => {
    reply.raw.once('close', () => gate.release(request));
    reply.header('cache-control', 'no-store');
    if (request.headers.origin !== undefined && request.headers.origin !== origin) throw new Failure('ORIGIN_REJECTED', 403);
    await gate.acquire(request);
  });
  app.addHook('onResponse', async request => { gate.release(request); });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Failure) return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof z.ZodError) return reply.code(400).send({ error: 'INVALID_INPUT' });
    if (error instanceof Error && error.message === 'INVALID_SCHEDULE') return reply.code(400).send({ error: error.message });
    if (error instanceof Error && 'code' in error && error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.code(413).send({ error: 'INVALID_INPUT' });
    return reply.code(500).send({ error: 'REQUEST_FAILED' });
  });
  app.get('/health', () => ({ state: 'ok', role: config.role, environment: config.environment }));
  return app;
}
