import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { Config } from '../apps/api/src/common.ts';
import { initializeRenderRuntime, parseRenderConfiguration } from '../scripts/render-start.ts';
import { validateRuntimeMaterial, writeRuntimeMarker, writeRuntimeMaterial } from '../scripts/runtime-config.ts';
import type { DatabaseMap } from '../scripts/runtime-config.ts';

const execute = promisify(execFile);
const container = `openvote-render-test-${process.pid}`;
const bootstrapPassword = 'synthetic-render-bootstrap-password';
let port = 0;
let databases: DatabaseMap;
const temporaryDirectories: string[] = [];

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'openvote-render-'));
  temporaryDirectories.push(path);
  return path;
}

async function waitForPostgres(): Promise<void> {
  let consecutiveConnections = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const client = new pg.Client({ host: '127.0.0.1', port, database: 'postgres', user: 'bootstrap', password: bootstrapPassword });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      consecutiveConnections += 1;
      if (consecutiveConnections === 4) return;
    } catch {
      consecutiveConnections = 0;
      await client.end().catch(() => undefined);
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  throw new Error('TEST_POSTGRES_UNAVAILABLE');
}

async function runtimeSnapshot(root: string): Promise<Record<string, string>> {
  const files = ['bootstrap.json', 'secrets/core-token', ...['identity', 'ballot', 'management', 'provider-A', 'provider-B'].map(role => `${role}/config.json`)];
  const snapshot: Record<string, string> = {};
  for (const file of files) snapshot[file] = (await readFile(join(root, file))).toString('base64');
  return snapshot;
}

beforeAll(async () => {
  await execute('docker', ['run', '--detach', '--rm', '--name', container, '--publish', '127.0.0.1::5432',
    '--env', 'POSTGRES_USER=bootstrap', '--env', `POSTGRES_PASSWORD=${bootstrapPassword}`, '--env', 'POSTGRES_DB=postgres', 'postgres:18.4']);
  const published = (await execute('docker', ['port', container, '5432/tcp'])).stdout.trim();
  const match = /127\.0\.0\.1:([0-9]+)$/.exec(published);
  if (match?.[1] === undefined) throw new Error('TEST_POSTGRES_PORT_INVALID');
  port = Number(match[1]);
  await waitForPostgres();
  const admin = new pg.Client({ host: '127.0.0.1', port, database: 'postgres', user: 'bootstrap', password: bootstrapPassword });
  await admin.connect();
  try {
    for (const role of ['identity', 'ballot', 'management'] as const) {
      await admin.query(`CREATE ROLE openvote_${role} LOGIN PASSWORD 'synthetic-${role}-database-password'`);
      await admin.query(`CREATE DATABASE openvote_${role} OWNER openvote_${role}`);
      await admin.query(`REVOKE ALL ON DATABASE openvote_${role} FROM PUBLIC`);
    }
  } finally { await admin.end(); }
  databases = {
    identity: { host: '127.0.0.1', port, database: 'openvote_identity', user: 'openvote_identity', password: 'synthetic-identity-database-password' },
    ballot: { host: '127.0.0.1', port, database: 'openvote_ballot', user: 'openvote_ballot', password: 'synthetic-ballot-database-password' },
    management: { host: '127.0.0.1', port, database: 'openvote_management', user: 'openvote_management', password: 'synthetic-management-database-password' },
  };
}, 60000);

afterAll(async () => {
  await Promise.all(temporaryDirectories.map(path => rm(path, { recursive: true, force: true })));
  await execute('docker', ['rm', '--force', container]).catch(() => undefined);
});

describe('Render runtime initialization', () => {
  it('rejects runtime files reached through symbolic links', async () => {
    const root = await directory();
    const externalRoot = await directory();
    const publicOrigin = 'https://openvote.com.ua';
    await writeRuntimeMaterial(root, 'demo', databases);
    await writeRuntimeMarker(root, 'demo', publicOrigin);
    const externalMarker = join(externalRoot, 'bootstrap.json');
    await writeFile(externalMarker, await readFile(join(root, 'bootstrap.json')), { mode: 0o600 });
    await rm(join(root, 'bootstrap.json'));
    await symlink(externalMarker, join(root, 'bootstrap.json'));

    await expect(validateRuntimeMaterial(root, 'demo', publicOrigin, databases))
      .rejects.toThrow('RUNTIME_FILE_PERMISSIONS_INVALID');
  });

  it('initializes beneath provider mount entries once and reuses every runtime byte on restart', async () => {
    const diskRoot = await directory();
    await mkdir(join(diskRoot, 'lost+found'));
    const root = join(diskRoot, 'state');
    const configuration = { port: 10000, publicOrigin: 'https://openvote.com.ua', databases };
    expect(await initializeRenderRuntime(configuration, diskRoot)).toBe('created');
    expect((await readdir(diskRoot)).sort()).toEqual(['lost+found', 'state']);
    const first = await runtimeSnapshot(root);
    for (const file of Object.keys(first)) expect((await stat(join(root, file))).mode & 0o777).toBe(0o600);
    for (const role of ['identity', 'ballot', 'management'] as const) {
      const config = Config.parse(JSON.parse(await readFile(join(root, role, 'config.json'), 'utf8')));
      expect(config.environment).toBe('demo');
      expect(config.role).toBe(role);
      expect(config.database).toEqual(databases[role]);
    }
    expect(await initializeRenderRuntime(configuration, diskRoot)).toBe('reused');
    expect(await runtimeSnapshot(root)).toEqual(first);

    await expect(initializeRenderRuntime({ ...configuration, databases: {
      ...databases, identity: { ...databases.identity, password: 'changed-binding' },
    } }, diskRoot)).rejects.toThrow('RUNTIME_DATABASE_BINDING_MISMATCH');

    const management = new pg.Client(databases.management);
    await management.connect();
    try { await management.query('DROP TABLE schema_migrations'); }
    finally { await management.end(); }
    await expect(initializeRenderRuntime(configuration, diskRoot)).rejects.toThrow('DATABASE_STATE_MISSING_FOR_EXISTING_RUNTIME');
  }, 60000);

  it('refuses a missing runtime disk when application tables already exist', async () => {
    const diskRoot = await directory();
    await expect(initializeRenderRuntime({ port: 10000, publicOrigin: 'https://openvote.com.ua', databases }, diskRoot))
      .rejects.toThrow('RUNTIME_STATE_MISSING_FOR_EXISTING_DATABASE');
    expect(await readdir(join(diskRoot, 'state'))).toEqual([]);
  });

  it('refuses partial runtime state before reading database contents', async () => {
    const diskRoot = await directory();
    await mkdir(join(diskRoot, 'state'));
    await writeFile(join(diskRoot, 'state', 'partial-state'), 'synthetic incomplete state');
    await expect(initializeRenderRuntime({ port: 10000, publicOrigin: 'https://openvote.com.ua', databases }, diskRoot))
      .rejects.toThrow('RUNTIME_STATE_INCOMPLETE');
  });
});

describe('Render environment contract', () => {
  const valid = {
    OPENVOTE_ENVIRONMENT: 'demo', PORT: '10000', OPENVOTE_PUBLIC_ORIGIN: 'https://openvote.com.ua',
    IDENTITY_DATABASE_URL: 'postgresql://openvote_identity:identity-password@identity.internal:5432/openvote_identity',
    BALLOT_DATABASE_URL: 'postgresql://openvote_ballot:ballot-password@ballot.internal:5432/openvote_ballot',
    MANAGEMENT_DATABASE_URL: 'postgresql://openvote_management:management-password@management.internal:5432/openvote_management',
  };

  it('parses only the exact demo bindings', () => {
    const configuration = parseRenderConfiguration(valid);
    expect(configuration.port).toBe(10000);
    expect(configuration.publicOrigin).toBe('https://openvote.com.ua');
    expect(configuration.databases.identity.database).toBe('openvote_identity');
  });

  it('accepts Render internal database URLs with the default PostgreSQL port', () => {
    const configuration = parseRenderConfiguration({
      ...valid,
      IDENTITY_DATABASE_URL: 'postgresql://openvote_identity:identity-password@identity.internal/openvote_identity',
      BALLOT_DATABASE_URL: 'postgresql://openvote_ballot:ballot-password@ballot.internal/openvote_ballot',
      MANAGEMENT_DATABASE_URL: 'postgresql://openvote_management:management-password@management.internal/openvote_management',
    });
    expect(configuration.databases.identity.port).toBe(5432);
    expect(configuration.databases.ballot.port).toBe(5432);
    expect(configuration.databases.management.port).toBe(5432);
  });

  it.each([
    { ...valid, OPENVOTE_ENVIRONMENT: 'production' },
    { ...valid, OPENVOTE_PUBLIC_ORIGIN: 'http://openvote.com.ua' },
    { ...valid, IDENTITY_DATABASE_URL: 'postgresql://openvote_identity:password@identity.internal:5432/wrong_database' },
    { ...valid, PORT: '80' },
  ])('rejects an invalid binding', environment => {
    expect(() => parseRenderConfiguration(environment)).toThrow();
  });
});
