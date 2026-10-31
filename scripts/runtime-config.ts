import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, chmod, mkdir, open, readdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { Config } from '../apps/api/src/common.ts';
import type { ConfigType } from '../apps/api/src/common.ts';
import { Environment } from '../packages/domain/src/index.ts';

type EnvironmentType = z.infer<typeof Environment>;

export const databaseRoles = ['identity', 'ballot', 'management'] as const;
export const serviceRoles = ['identity', 'ballot', 'management', 'provider-A', 'provider-B'] as const;
export type DatabaseRole = typeof databaseRoles[number];

export const DatabaseSettings = z.strictObject({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  database: z.string().regex(/^openvote_(identity|ballot|management)$/),
  user: z.string().min(1),
  password: z.string().min(1),
});
export type DatabaseSettingsType = z.infer<typeof DatabaseSettings>;
export type DatabaseMap = Record<DatabaseRole, DatabaseSettingsType>;

const RuntimeMarker = z.strictObject({
  initialized: z.literal(true),
  version: z.literal(2),
  environment: z.enum(['development', 'demo']),
  publicOrigin: z.string().min(1),
});

const ports: Record<typeof serviceRoles[number], number> = {
  identity: 4301,
  ballot: 4302,
  management: 4303,
  'provider-A': 4312,
  'provider-B': 4313,
};

function secret(): string { return randomBytes(32).toString('hex'); }
function keyPair(): { signingKey: string; publicKey: string } {
  const pair = generateKeyPairSync('ed25519');
  return {
    signingKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}
async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}
function fail(code: string): never { throw new Error(code); }

export function parseDatabaseUrl(value: string, role: DatabaseRole): DatabaseSettingsType {
  let url: URL;
  try { url = new URL(value); } catch { return fail('DATABASE_URL_INVALID'); }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (url.protocol !== 'postgresql:' || url.hostname === '' || url.username === '' || url.password === '' ||
      url.pathname.split('/').length !== 2 || database !== `openvote_${role}` || url.search !== '' || url.hash !== '') {
    return fail('DATABASE_URL_INVALID');
  }
  const port = url.port === '' ? 5432 : Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fail('DATABASE_URL_INVALID');
  return DatabaseSettings.parse({
    host: url.hostname,
    port,
    database,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  });
}

export function createDevelopmentDatabases(): DatabaseMap {
  return {
    identity: { host: '127.0.0.1', port: 54329, database: 'openvote_identity', user: 'openvote_identity', password: secret() },
    ballot: { host: '127.0.0.1', port: 54329, database: 'openvote_ballot', user: 'openvote_ballot', password: secret() },
    management: { host: '127.0.0.1', port: 54329, database: 'openvote_management', user: 'openvote_management', password: secret() },
  };
}

export async function requireEmptyRuntime(root: string): Promise<void> {
  if (!await exists(root)) await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  if ((await readdir(root)).length !== 0) fail('RUNTIME_STATE_INCOMPLETE');
}

export async function runtimeMarkerExists(root: string): Promise<boolean> {
  return exists(`${root}/bootstrap.json`);
}

export async function writeRuntimeMaterial(root: string, environment: EnvironmentType, databases: DatabaseMap): Promise<void> {
  if (environment !== 'development' && environment !== 'demo') fail('RUNTIME_ENVIRONMENT_INVALID');
  const coreToken = secret(), identityToken = secret(), ballotToken = secret();
  const providerTokens = { A: secret(), B: secret() };
  const providerKeys = { A: keyPair(), B: keyPair() };
  const configs: ConfigType[] = [
    Config.parse({ environment, role: 'identity', port: ports.identity, serviceToken: identityToken,
      database: databases.identity, dedupKey: secret(), sealingKey: secret(), providerTokens,
      providerKeys: { A: providerKeys.A.publicKey, B: providerKeys.B.publicKey } }),
    Config.parse({ environment, role: 'ballot', port: ports.ballot, serviceToken: ballotToken,
      database: databases.ballot, coreToken, ...keyPair() }),
    Config.parse({ environment, role: 'management', port: ports.management, serviceToken: secret(),
      database: databases.management, coreToken, identityToken, ballotToken,
      quotas: { daily: 3, cooldownSeconds: 60, simultaneousOpen: 2 } }),
    Config.parse({ environment, role: 'provider-A', port: ports['provider-A'], serviceToken: providerTokens.A, ...providerKeys.A }),
    Config.parse({ environment, role: 'provider-B', port: ports['provider-B'], serviceToken: providerTokens.B, ...providerKeys.B }),
  ];
  await mkdir(`${root}/secrets`, { recursive: true, mode: 0o700 });
  for (const config of configs) {
    await mkdir(`${root}/${config.role}`, { recursive: true, mode: 0o700 });
    await writeFile(`${root}/${config.role}/config.json`, JSON.stringify(config, null, 2), { mode: 0o600, flag: 'wx' });
  }
  await writeFile(`${root}/secrets/core-token`, coreToken, { mode: 0o600, flag: 'wx' });
}

export async function writeRuntimeMarker(root: string, environment: 'development' | 'demo', publicOrigin: string): Promise<void> {
  const marker = RuntimeMarker.parse({ initialized: true, version: 2, environment, publicOrigin });
  await writeFile(`${root}/bootstrap.json`, JSON.stringify(marker, null, 2), { mode: 0o600, flag: 'wx' });
}

export async function readRuntimeDatabases(root: string): Promise<DatabaseMap> {
  const result: Partial<DatabaseMap> = {};
  for (const role of databaseRoles) {
    const config = Config.parse(JSON.parse(await requirePrivateFile(`${root}/${role}/config.json`)));
    if (config.role !== role || config.database === undefined) fail('RUNTIME_DATABASE_BINDING_MISMATCH');
    result[role] = DatabaseSettings.parse(config.database);
  }
  if (result.identity === undefined || result.ballot === undefined || result.management === undefined) {
    return fail('RUNTIME_DATABASE_BINDING_MISMATCH');
  }
  return { identity: result.identity, ballot: result.ballot, management: result.management };
}

function sameDatabase(actual: DatabaseSettingsType | undefined, expected: DatabaseSettingsType): boolean {
  return actual !== undefined && actual.host === expected.host && actual.port === expected.port &&
    actual.database === expected.database && actual.user === expected.user && actual.password === expected.password;
}
async function requirePrivateFile(path: string): Promise<string> {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ELOOP') {
      fail('RUNTIME_FILE_PERMISSIONS_INVALID');
    }
    throw error;
  }
  try {
    const details = await file.stat();
    if (!details.isFile() || (details.mode & 0o777) !== 0o600) fail('RUNTIME_FILE_PERMISSIONS_INVALID');
    return await file.readFile('utf8');
  } finally {
    await file.close();
  }
}

export async function validateRuntimeMaterial(root: string, environment: 'development' | 'demo', publicOrigin: string,
  databases: DatabaseMap): Promise<void> {
  const marker = RuntimeMarker.parse(JSON.parse(await requirePrivateFile(`${root}/bootstrap.json`)));
  if (marker.environment !== environment || marker.publicOrigin !== publicOrigin) fail('RUNTIME_BINDING_MISMATCH');
  const configs = new Map<string, ConfigType>();
  for (const role of serviceRoles) {
    const config = Config.parse(JSON.parse(await requirePrivateFile(`${root}/${role}/config.json`)));
    if (config.role !== role || config.environment !== environment || config.port !== ports[role]) fail('RUNTIME_BINDING_MISMATCH');
    configs.set(role, config);
  }
  for (const role of databaseRoles) {
    if (!sameDatabase(configs.get(role)?.database, databases[role])) fail('RUNTIME_DATABASE_BINDING_MISMATCH');
  }
  const identity = configs.get('identity'), ballot = configs.get('ballot'), management = configs.get('management');
  const providerA = configs.get('provider-A'), providerB = configs.get('provider-B');
  const coreToken = (await requirePrivateFile(`${root}/secrets/core-token`)).trim();
  if (identity?.providerTokens?.A !== providerA?.serviceToken || identity?.providerTokens?.B !== providerB?.serviceToken ||
      identity?.providerKeys?.A !== providerA?.publicKey || identity?.providerKeys?.B !== providerB?.publicKey ||
      ballot?.coreToken !== coreToken || management?.coreToken !== coreToken || management?.identityToken !== identity?.serviceToken ||
      management?.ballotToken !== ballot?.serviceToken) fail('RUNTIME_ROLE_BINDING_MISMATCH');
}
