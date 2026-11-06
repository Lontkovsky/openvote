import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { Content, Poll } from '../packages/domain/src/index.ts';
import { login, ok, approvedReview } from '../tests/support/flow.ts';

let seed: { id: string } | null = null;
try { seed = z.strictObject({ id: z.string().uuid() }).parse(JSON.parse(await readFile('.runtime/active-demo-poll.json', 'utf8'))); }
catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
const author = await login('TEST-PERSON-0001');
if (seed === null) {
  const content = Content.parse({
    question: 'Чи подобаються вам фільми Квентіна Тарантіно?', context: '', consequences: '', argumentsFor: [], argumentsAgainst: [],
    category: 'Культура', authorAlias: 'OpenVote', policy: { id: 'verified-rnokpp-owner', version: 1, minimumAge: 14, citizenship: 'UA' },
    opensAt: '2026-11-01T08:00:00.000Z', closesAt: '2030-01-15T20:00:00.000Z', publicationThreshold: 3, relatedPolls: [],
  });
  const { poll } = z.object({ poll: Poll }).parse(await ok('management', '/v1/drafts', 'POST', content, author.token));
  await writeFile('.runtime/active-demo-poll.json', JSON.stringify({ id: poll.id }), { mode: 0o600, flag: 'wx' });
  seed = { id: poll.id };
}
let { poll } = z.object({ poll: Poll }).parse(await ok('management', '/v1/polls/' + seed.id, 'GET', undefined, author.token));
if (poll.state === 'Draft') {
  poll = z.object({ poll: Poll }).parse(await ok('management', `/v1/polls/${poll.id}/submit`, 'POST', {}, author.token)).poll;
}
if (poll.state === 'Review') {
  const moderator = await login('TEST-PERSON-0012');
  await ok('management', `/v1/polls/${poll.id}/review`, 'POST', approvedReview, moderator.token);
}
console.log('Test poll: http://localhost:5173/#/poll/' + poll.id);
