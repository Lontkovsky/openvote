import { z } from 'zod';
import { Content, Poll } from '../../packages/domain/src/index.ts';
import { localCore } from '../../scripts/local-core.ts';

export const origins = { identity: 'http://127.0.0.1:4301', ballot: 'http://127.0.0.1:4302', management: 'http://127.0.0.1:4303' };
export async function call(service: keyof typeof origins, path: string, method = 'GET', body?: unknown, token?: string) {
  const headers = new Headers();
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (token !== undefined) headers.set('authorization', 'Bearer ' + token);
  const options: RequestInit = { method, headers, signal: AbortSignal.timeout(150000) };
  if (body !== undefined) options.body = JSON.stringify(body);
  const response = await fetch(origins[service] + path, options);
  const value: unknown = await response.json();
  return { status: response.status, value };
}
export async function ok(service: keyof typeof origins, path: string, method = 'GET', body?: unknown, token?: string) {
  const response = await call(service, path, method, body, token);
  if (response.status !== 200) throw new Error(`${service} ${method} ${path}: HTTP ${response.status} ${JSON.stringify(response.value)}`);
  return response.value;
}
export async function login(subject: string, provider = 'A') {
  const { attempt } = z.object({ attempt: z.string() }).parse(await ok('identity', '/v1/auth/start', 'POST', { subject, provider }));
  return z.object({ token: z.string(), role: z.string() }).parse(await ok('identity', '/v1/auth/finish', 'POST', { attempt }));
}
export function fixtureContent(closesAt: Date, question = 'Чи підтримуєте відкриту публікацію коду тестового проєкту?') {
  return Content.parse({ question, context: 'Тестовий сценарій для перевірки платформи. Питання не стосується реального рішення громади чи організації.',
    consequences: 'У тестовому сценарії код залишається доступним для ознайомлення та перевірки відповідно до ліцензії.',
    argumentsFor: [{ text: 'Відкритий код дає можливість дослідити правила програми. Це оцінка автора тестового сценарію.', url: 'https://www.gnu.org/licenses/agpl-3.0.html' }],
    argumentsAgainst: [{ text: 'Публікація коду сама по собі не доводить безпеку розгорнутого сервісу. Це обмеження сценарію.', url: 'https://www.belenios.org/faq.html' }],
    category: 'Технології', authorAlias: 'Тестова ініціатива', policy: { id: 'verified-rnokpp-owner', version: 1 },
    opensAt: new Date(Date.now() - 1000).toISOString(), closesAt: closesAt.toISOString(), publicationThreshold: 3, relatedPolls: [] });
}
export const approvedReview = { action: 'approve', reason: 'Перевірено одну тестову пропозицію, контекст, наслідки та відокремлення оцінок.',
  rubric: { singleProposal: true, noDoubleNegation: true, clearTerms: true, explicitConsequences: true, factsSeparated: true } };
export async function createPoll(authorToken: string, moderatorToken: string, content: unknown) {
  const { poll } = z.object({ poll: Poll }).parse(await ok('management', '/v1/drafts', 'POST', content, authorToken));
  await ok('management', `/v1/polls/${poll.id}/submit`, 'POST', {}, authorToken);
  return z.object({ poll: Poll }).parse(await ok('management', `/v1/polls/${poll.id}/review`, 'POST', approvedReview, moderatorToken)).poll;
}
export async function encryptedBallot(pollId: string, identityToken: string, choice: number) {
  const credential = z.object({ credential: z.string(), manifestHash: z.string() }).parse(await ok('identity', `/v1/credentials/${pollId}`, 'POST', {}, identityToken));
  const { electionRaw } = z.object({ electionRaw: z.string() }).parse(await ok('ballot', `/v1/elections/${pollId}/manifest`));
  // Tests use the native command on the exact registered archive; the browser
  // uses the original Belenios JS library. No plaintext goes to the ballot API.
  return { credential, electionRaw, choice };
}
export async function generateBallot(archive: string, credential: string, choice: number) {
  return z.strictObject({ ballot: z.string() }).parse(await localCore({ action: 'generate-test-ballot', archive, credential, choice: [[choice === 0 ? 1 : 0, choice === 1 ? 1 : 0, choice === 2 ? 1 : 0]] })).ballot;
}
