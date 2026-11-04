import { spawn } from 'node:child_process';
import { OpenAiDemandChatProvider } from '../apps/api/src/demand-chat-provider.ts';
import { demandApp } from '../apps/api/src/demand.ts';
import { database, readConfig, required } from '../apps/api/src/common.ts';
import { demandPublicKnowledgePath, loadDemandPublicKnowledge } from './demand-start.ts';
import { migrateDirectory } from './migrate.ts';

const publicKnowledge = await loadDemandPublicKnowledge(demandPublicKnowledgePath);
const databasePool = database(await readConfig('management'));
await migrateDirectory(databasePool, 'migrations/demand');
const chatProvider = new OpenAiDemandChatProvider(required(process.env.OPENAI_API_KEY), fetch, publicKnowledge);
const app = await demandApp(databasePool, 'development', 'http://localhost:5174', chatProvider);
await app.listen({ host: '127.0.0.1', port: 4304 });
const web = spawn('pnpm', ['--filter', '@openvote/web', 'dev:demand'], { stdio: 'inherit' });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  web.kill('SIGTERM');
  await app.close();
}
web.once('error', () => { process.exitCode = 1; void stop(); });
web.once('exit', code => { if (!stopping && code !== 0) process.exitCode = 1; void stop(); });
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
