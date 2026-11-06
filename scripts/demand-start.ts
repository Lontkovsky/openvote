import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import staticPlugin from '@fastify/static';
import pg from 'pg';
import { z } from 'zod';
import { DemandPublicKnowledge, OpenAiDemandChatProvider } from '../apps/api/src/demand-chat-provider.ts';
import { demandApp } from '../apps/api/src/demand.ts';
import { parsePublicOrigin } from '../apps/api/src/common.ts';
import { migrateDirectory } from './migrate.ts';

type DemandConfiguration = { port: number; publicOrigin: string; databaseUrl: string; openAiApiKey: string };

export const demandPublicKnowledgePath = resolve('docs/PUBLIC_KNOWLEDGE.md');

function fail(code: string): never { throw new Error(code); }

export function parseDemandConfiguration(environment: NodeJS.ProcessEnv): DemandConfiguration {
  if (environment.OPENVOTE_ENVIRONMENT !== 'demand') return fail('DEMAND_ENVIRONMENT_INVALID');
  const publicOrigin = parsePublicOrigin(environment.OPENVOTE_PUBLIC_ORIGIN, 'demo');
  const rawPort = z.string().regex(/^[1-9][0-9]{3,4}$/).parse(environment.PORT);
  const port = Number(rawPort);
  if (port < 1024 || port > 65535) return fail('DEMAND_PORT_INVALID');
  const databaseUrl = z.string().min(1).parse(environment.DEMAND_DATABASE_URL);
  const openAiApiKey = z.string().min(20).regex(/^\S+$/).parse(environment.OPENAI_API_KEY);
  let parsed: URL;
  try { parsed = new URL(databaseUrl); } catch { return fail('DEMAND_DATABASE_URL_INVALID'); }
  if (parsed.protocol !== 'postgresql:' || parsed.hostname === '' || parsed.username === '' ||
      parsed.password === '' || decodeURIComponent(parsed.pathname) !== '/openvote_demand' || parsed.search !== '' || parsed.hash !== '') {
    return fail('DEMAND_DATABASE_URL_INVALID');
  }
  return { port, publicOrigin, databaseUrl, openAiApiKey };
}

function pool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 8, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000, statement_timeout: 10000 });
}

export async function loadDemandPublicKnowledge(filePath: string): Promise<string> {
  return DemandPublicKnowledge.parse(await readFile(filePath, 'utf8'));
}

export async function createDemandService(configuration: DemandConfiguration, staticRoot: string) {
  const publicKnowledge = await loadDemandPublicKnowledge(demandPublicKnowledgePath);
  const databasePool = pool(configuration.databaseUrl);
  try {
    await migrateDirectory(databasePool, 'migrations/demand');
    const chatProvider = new OpenAiDemandChatProvider(configuration.openAiApiKey, fetch, publicKnowledge);
    const app = await demandApp(databasePool, 'demo', configuration.publicOrigin, chatProvider);
    await app.register(staticPlugin, { root: staticRoot, index: false });
    app.get('/', (_request, reply) => reply.sendFile('demand.html'));
    app.get('/demo', (_request, reply) => reply.redirect('/demo/', 308));
    app.get('/demo/', (_request, reply) => reply.sendFile('demo.html'));
    app.get('/demo/*', (_request, reply) => reply.sendFile('demo.html'));
    return app;
  } catch (error) {
    await databasePool.end();
    throw error;
  }
}

async function main(): Promise<void> {
  const configuration = parseDemandConfiguration(process.env);
  const app = await createDemandService(configuration, resolve('apps/web/dist-demand'));
  await app.listen({ host: '0.0.0.0', port: configuration.port });
  console.log(`Demand launch service is healthy on port ${configuration.port}.`);
  const stop = async () => { await app.close(); };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(error => {
    console.error(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'DEMAND_START_FAILED');
    process.exitCode = 1;
  });
}
