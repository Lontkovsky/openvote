import { arch, cpus, platform, release, totalmem } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { Environment, Poll } from '../packages/domain/src/index.ts';
import { serviceResourceLimits } from '../apps/api/src/common.ts';

const profile = { requests: 1000, concurrency: 8, warmupRequests: 16, requestTimeoutMs: 10000 } as const;
const Catalogue = z.strictObject({ polls: z.array(Poll), sort: z.string(), environment: Environment });
const Report = z.strictObject({
  format: z.literal('openvote-load-report-v1'),
  startedAt: z.iso.datetime(),
  target: z.literal('GET /v1/polls'),
  environment: z.literal('local-development'),
  client: z.strictObject({ node: z.string(), platform: z.string(), release: z.string(), arch: z.string(),
    cpuModel: z.string(), logicalCpus: z.number().int().positive(), totalMemoryBytes: z.number().int().positive() }),
  dataset: z.strictObject({ polls: z.number().int().nonnegative(), responseBytes: z.number().int().positive(),
    states: z.record(z.string(), z.number().int().nonnegative()) }),
  profile: z.strictObject({ requests: z.number().int().positive(), concurrency: z.number().int().positive(),
    warmupRequests: z.number().int().nonnegative(), requestTimeoutMs: z.number().int().positive() }),
  serviceLimits: z.strictObject({ requestBodyBytes: z.number().int().positive(), activeRequests: z.number().int().positive(),
    queuedRequests: z.number().int().positive(), queueWaitMs: z.number().int().positive(), requestTimeoutMs: z.number().int().positive(),
    connectionTimeoutMs: z.number().int().positive(), parameterLength: z.number().int().positive(),
    requestsPerWindow: z.number().int().positive(), requestWindowMs: z.number().int().positive() }),
  results: z.strictObject({ succeeded: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(), requestsPerSecond: z.number().nonnegative(),
    latencyMs: z.strictObject({ min: z.number().nonnegative(), mean: z.number().nonnegative(), p50: z.number().nonnegative(),
      p95: z.number().nonnegative(), p99: z.number().nonnegative(), max: z.number().nonnegative() }) }),
});

function rounded(value: number): number { return Math.round(value * 1000) / 1000; }
function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function main() {
  const [managementOrigin, output] = z.tuple([z.url(), z.string().min(1)]).parse(process.argv.slice(2));
  const parsedOrigin = new URL(managementOrigin);
  if (parsedOrigin.origin !== managementOrigin || parsedOrigin.protocol !== 'http:'
    || !['127.0.0.1', 'localhost'].includes(parsedOrigin.hostname)) throw new Error('LOCAL_MANAGEMENT_ORIGIN_REQUIRED');
  const target = managementOrigin + '/v1/polls';
  const request = async () => {
    const response = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(profile.requestTimeoutMs) });
    const body = await response.text();
    if (response.status !== 200) throw new Error('LOAD_RESPONSE_REJECTED');
    return { catalogue: Catalogue.parse(JSON.parse(body)), bytes: Buffer.byteLength(body) };
  };

  const sample = await request();
  for (let index = 0; index < profile.warmupRequests; index += 1) await request();
  const states: Record<string, number> = {};
  for (const poll of sample.catalogue.polls) states[poll.state] = (states[poll.state] ?? 0) + 1;

  let next = 0, failed = 0;
  const latency: number[] = [];
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const worker = async () => {
    while (true) {
      const current = next;
      next += 1;
      if (current >= profile.requests) return;
      const requestStarted = performance.now();
      try {
        await request();
        latency.push(performance.now() - requestStarted);
      } catch { failed += 1; }
    }
  };
  await Promise.all(Array.from({ length: profile.concurrency }, worker));
  const durationMs = performance.now() - started;
  const ordered = latency.toSorted((left, right) => left - right);
  const processor = cpus();
  const report = Report.parse({
    format: 'openvote-load-report-v1',
    startedAt,
    target: 'GET /v1/polls',
    environment: 'local-development',
    client: { node: process.version, platform: platform(), release: release(), arch: arch(),
      cpuModel: processor[0]?.model ?? '', logicalCpus: processor.length, totalMemoryBytes: totalmem() },
    dataset: { polls: sample.catalogue.polls.length, responseBytes: sample.bytes, states },
    profile,
    serviceLimits: serviceResourceLimits,
    results: { succeeded: latency.length, failed, durationMs: rounded(durationMs),
      requestsPerSecond: rounded(latency.length / (durationMs / 1000)),
      latencyMs: { min: rounded(ordered[0] ?? 0), mean: rounded(ordered.reduce((sum, value) => sum + value, 0) / Math.max(1, ordered.length)),
        p50: rounded(percentile(ordered, 0.5)), p95: rounded(percentile(ordered, 0.95)),
        p99: rounded(percentile(ordered, 0.99)), max: rounded(ordered.at(-1) ?? 0) } },
  });
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output, ...report.results }));
  if (failed > 0) process.exitCode = 1;
}

await main().catch(error => {
  console.error(error instanceof Error && /^[A-Z][A-Z0-9_]{1,100}$/.test(error.message) ? error.message : 'LOAD_TEST_FAILED');
  process.exitCode = 1;
});
