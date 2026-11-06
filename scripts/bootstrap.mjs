import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { createDevelopmentDatabases, readRuntimeDatabases, requireEmptyRuntime, runtimeMarkerExists,
  validateRuntimeMaterial, writeRuntimeMarker, writeRuntimeMaterial } from './runtime-config.ts';

async function run(command, args) {
  await new Promise((resolve, reject) => { const child = spawn(command, args, { stdio: 'inherit' }); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(command + ' failed'))); });
}
const runtimeRoot = '.runtime', publicOrigin = 'http://localhost:5173';
const initialized = await runtimeMarkerExists(runtimeRoot);
let databases;
if (initialized) {
  databases = await readRuntimeDatabases(runtimeRoot);
  await validateRuntimeMaterial(runtimeRoot, 'development', publicOrigin, databases);
} else {
  await requireEmptyRuntime(runtimeRoot);
  databases = createDevelopmentDatabases();
  await writeRuntimeMaterial(runtimeRoot, 'development', databases);
  await writeFile(`${runtimeRoot}/secrets/database-password`, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
}
await run('docker', ['build', '--platform', 'linux/amd64', '--target', 'crypto-runtime', '-f', 'infra/crypto.Dockerfile', '-t', 'openvote-crypto:3.3.0', '.']);
await run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '60']);
const admin = new pg.Client({ host: '127.0.0.1', port: 54329, user: 'bootstrap', database: 'postgres',
  password: await readFile('.runtime/secrets/database-password', 'utf8') });
await admin.connect();
for (const role of ['identity', 'ballot', 'management']) {
  const { database: db } = JSON.parse(await readFile('.runtime/' + role + '/config.json', 'utf8'));
  if ((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [db.user])).rowCount === 0) {
    if (!/^[a-z_]+$/.test(db.user) || !/^[a-f0-9]{64}$/.test(db.password)) throw new Error('Invalid bootstrap database material');
    await admin.query(`CREATE ROLE ${db.user} LOGIN PASSWORD '${db.password}'`);
    await admin.query(`CREATE DATABASE ${db.database} OWNER ${db.user}`);
    await admin.query(`REVOKE ALL ON DATABASE ${db.database} FROM PUBLIC`);
  }
}
await admin.end();
await run(process.execPath, ['scripts/migrate.ts']);
await mkdir('apps/web/public/crypto', { recursive: true });
await run('docker', ['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '--entrypoint', 'sh',
  '-v', process.cwd() + '/apps/web/public/crypto:/export', 'openvote-crypto:3.3.0', '-c', 'cp /opt/belenios/belenios.js /opt/belenios/libsodium.wasm /opt/belenios/COPYING.belenios /opt/belenios/LICENSE.libsodium /export/']);
if (!initialized) await writeRuntimeMarker(runtimeRoot, 'development', publicOrigin);
console.log('Test environment bootstrapped. Private local role configurations were generated without printing secrets.');
