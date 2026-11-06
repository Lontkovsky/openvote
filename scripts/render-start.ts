import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { z } from 'zod';
import { parsePublicOrigin } from '../apps/api/src/common.ts';
import { migrateAll } from './migrate.ts';
import { databaseRoles, parseDatabaseUrl, requireEmptyRuntime, runtimeMarkerExists,
  validateRuntimeMaterial, writeRuntimeMarker, writeRuntimeMaterial } from './runtime-config.ts';
import type { DatabaseMap, DatabaseSettingsType } from './runtime-config.ts';

const runtimeDiskRoot = '.runtime-disk';
const runtimeRoot = '.runtime';
const internalPath = '/opt/belenios:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

type RenderConfiguration = { port: number; publicOrigin: string; databases: DatabaseMap };
type ManagedChild = { name: string; process: ChildProcess; exited: Promise<void> };

function fail(code: string): never { throw new Error(code); }

export function parseRenderConfiguration(environment: NodeJS.ProcessEnv): RenderConfiguration {
  if (environment.OPENVOTE_ENVIRONMENT !== 'demo') return fail('RENDER_ENVIRONMENT_INVALID');
  const publicOrigin = parsePublicOrigin(environment.OPENVOTE_PUBLIC_ORIGIN, 'demo');
  const rawPort = z.string().regex(/^[1-9][0-9]{3,4}$/).parse(environment.PORT);
  const port = Number(rawPort);
  if (port < 1024 || port > 65535) return fail('RENDER_PORT_INVALID');
  const identityUrl = z.string().min(1).parse(environment.IDENTITY_DATABASE_URL);
  const ballotUrl = z.string().min(1).parse(environment.BALLOT_DATABASE_URL);
  const managementUrl = z.string().min(1).parse(environment.MANAGEMENT_DATABASE_URL);
  return {
    port,
    publicOrigin,
    databases: {
      identity: parseDatabaseUrl(identityUrl, 'identity'),
      ballot: parseDatabaseUrl(ballotUrl, 'ballot'),
      management: parseDatabaseUrl(managementUrl, 'management'),
    },
  };
}

async function databaseHasApplicationTables(settings: DatabaseSettingsType): Promise<boolean> {
  const client = new pg.Client(settings);
  await client.connect();
  try {
    const result = await client.query<{ present: boolean }>("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS present");
    return result.rows[0]?.present === true;
  } finally { await client.end(); }
}

async function databaseHasMigrationTable(settings: DatabaseSettingsType): Promise<boolean> {
  const client = new pg.Client(settings);
  await client.connect();
  try {
    const result = await client.query<{ present: boolean }>("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present");
    return result.rows[0]?.present === true;
  } finally { await client.end(); }
}

async function requireEmptyDatabases(databases: DatabaseMap): Promise<void> {
  for (const role of databaseRoles) if (await databaseHasApplicationTables(databases[role])) fail('RUNTIME_STATE_MISSING_FOR_EXISTING_DATABASE');
}

async function requireInitializedDatabases(databases: DatabaseMap): Promise<void> {
  for (const role of databaseRoles) if (!await databaseHasMigrationTable(databases[role])) fail('DATABASE_STATE_MISSING_FOR_EXISTING_RUNTIME');
}

function renderStateRoot(diskRoot: string): string { return join(diskRoot, 'state'); }

export async function initializeRenderRuntime(configuration: RenderConfiguration, diskRoot = runtimeDiskRoot): Promise<'created' | 'reused'> {
  const root = renderStateRoot(diskRoot);
  if (await runtimeMarkerExists(root)) {
    await validateRuntimeMaterial(root, 'demo', configuration.publicOrigin, configuration.databases);
    await requireInitializedDatabases(configuration.databases);
    await migrateAll(root);
    return 'reused';
  }
  await requireEmptyRuntime(root);
  await requireEmptyDatabases(configuration.databases);
  await writeRuntimeMaterial(root, 'demo', configuration.databases);
  await migrateAll(root);
  await requireInitializedDatabases(configuration.databases);
  await writeRuntimeMarker(root, 'demo', configuration.publicOrigin);
  return 'created';
}

async function requireRuntimeLink(): Promise<void> {
  const stateRoot = renderStateRoot(runtimeDiskRoot);
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  const [actual, expected] = await Promise.all([realpath(runtimeRoot), realpath(stateRoot)]);
  if (actual !== expected) fail('RUNTIME_LINK_INVALID');
}

export async function renderNginxConfiguration(port: number, destination = '/tmp/openvote-nginx.conf'): Promise<string> {
  const template = await readFile('infra/nginx.conf.template', 'utf8');
  const rendered = template.replaceAll('{{PORT}}', String(port));
  if (rendered.includes('{{PORT}}')) return fail('NGINX_TEMPLATE_INVALID');
  await writeFile(destination, rendered, { mode: 0o600 });
  return destination;
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: 'inherit', env: { PATH: internalPath } });
    child.once('error', rejectPromise);
    child.once('exit', code => code === 0 ? resolvePromise() : rejectPromise(new Error('STARTUP_COMMAND_FAILED')));
  });
}

function start(name: string, command: string, args: string[], environment: NodeJS.ProcessEnv,
  onUnexpectedExit: (error: Error) => void, stopping: () => boolean): ManagedChild {
  const child = spawn(command, args, { stdio: 'inherit', env: environment });
  const exited = new Promise<void>(resolvePromise => {
    let completed = false;
    const complete = (error: Error) => {
      if (completed) return;
      completed = true;
      resolvePromise();
      if (!stopping()) onUnexpectedExit(error);
    };
    child.once('error', () => complete(new Error(`${name.toUpperCase().replaceAll('-', '_')}_SPAWN_FAILED`)));
    child.once('exit', (code, signal) => {
      complete(new Error(`${name.toUpperCase().replaceAll('-', '_')}_EXITED_${code ?? signal ?? 'UNKNOWN'}`));
    });
  });
  return { name, process: child, exited };
}

async function waitForHealth(port: number, name: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* The bounded readiness window continues. */ }
    await delay(250);
  }
  fail(`${name.toUpperCase().replaceAll('-', '_')}_READINESS_FAILED`);
}

async function stop(children: ManagedChild[]): Promise<void> {
  for (const child of children) if (child.process.exitCode === null && child.process.signalCode === null) child.process.kill('SIGTERM');
  await Promise.all(children.map(child => child.exited));
}

export async function startRenderService(configuration: RenderConfiguration): Promise<void> {
  await requireRuntimeLink();
  await initializeRenderRuntime(configuration);
  const nginxConfig = await renderNginxConfiguration(configuration.port);
  await run('/usr/sbin/nginx', ['-t', '-c', nginxConfig]);

  let stopping = false;
  let rejectUnexpected: (error: Error) => void = () => undefined;
  const unexpectedExit = new Promise<never>((_resolvePromise, rejectPromise) => { rejectUnexpected = rejectPromise; });
  const children: ManagedChild[] = [];
  const add = (name: string, command: string, args: string[], environment: NodeJS.ProcessEnv) => {
    children.push(start(name, command, args, environment, rejectUnexpected, () => stopping));
  };
  const coreTokenPath = resolve(runtimeRoot, 'secrets/core-token');
  const bridgeEnvironment = (actions: string, port: number): NodeJS.ProcessEnv => ({
    PATH: internalPath,
    PYTHONUNBUFFERED: '1',
    CORE_ACTIONS: actions,
    CORE_HOST: '127.0.0.1',
    CORE_PORT: String(port),
    CORE_TOKEN_PATH: coreTokenPath,
  });
  const serviceEnvironment: NodeJS.ProcessEnv = {
    PATH: internalPath,
    NODE_ENV: 'production',
    OPENVOTE_PUBLIC_ORIGIN: configuration.publicOrigin,
  };
  add('crypto-public', '/usr/bin/python3', ['tools/bridge.py'], bridgeEnvironment('verify,accept,close,verify-share,finalize', 4310));
  add('crypto-ceremony', '/usr/bin/python3', ['tools/bridge.py'], bridgeEnvironment('setup,share', 4311));
  try {
    await Promise.race([Promise.all([waitForHealth(4310, 'crypto-public'), waitForHealth(4311, 'crypto-ceremony')]), unexpectedExit]);
    for (const role of ['provider-A', 'provider-B', 'identity', 'ballot', 'management']) {
      add(role, process.execPath, ['apps/api/src/server.ts', role], serviceEnvironment);
    }
    await Promise.race([Promise.all([
      waitForHealth(4312, 'provider-A'), waitForHealth(4313, 'provider-B'), waitForHealth(4301, 'identity'),
      waitForHealth(4302, 'ballot'), waitForHealth(4303, 'management'),
    ]), unexpectedExit]);
    add('nginx', '/usr/sbin/nginx', ['-c', nginxConfig, '-g', 'daemon off;'], { PATH: internalPath });
    await Promise.race([waitForHealth(configuration.port, 'gateway'), unexpectedExit]);
    console.log(`Test demo gateway is healthy on port ${configuration.port}.`);
    await Promise.race([
      unexpectedExit,
      new Promise<void>(resolvePromise => {
        process.once('SIGINT', resolvePromise);
        process.once('SIGTERM', resolvePromise);
      }),
    ]);
  } finally {
    stopping = true;
    await stop(children);
  }
}

async function main(): Promise<void> {
  await startRenderService(parseRenderConfiguration(process.env));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(error => {
    console.error(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'RENDER_START_FAILED');
    process.exitCode = 1;
  });
}
