import { z } from 'zod';
import {
  Answers, CommentReactionKind, CommentReactionToken, CommentText, Content, DiscussionComment, Poll, ResultContract,
  representativenessWarning,
} from '../../../packages/domain/src/index.ts';
import type { ContentType, DiscussionCommentType, PollType, ResultType } from '../../../packages/domain/src/index.ts';
import { developmentQuestions } from '../../api/src/development-catalogue.ts';

const storageKey = 'openvote:public-demo:v1';
const DemoVote = z.strictObject({ pollId: z.string().uuid(), choice: z.number().int().min(0).max(2), voteId: z.string().regex(/^[A-Za-z0-9+/]{43}$/) });
const DemoReaction = z.strictObject({ commentId: z.string().uuid(), actorToken: CommentReactionToken, kind: CommentReactionKind });
const DemoState = z.strictObject({
  polls: z.array(Poll),
  comments: z.array(DiscussionComment),
  votes: z.array(DemoVote),
  reactions: z.array(DemoReaction),
});
type DemoStateType = z.infer<typeof DemoState>;

const emptyState: DemoStateType = { polls: [], comments: [], votes: [], reactions: [] };
const policy = { id: 'verified-rnokpp-owner' as const, version: 1 as const, minimumAge: 14, citizenship: 'UA' };
const review = {
  action: 'approve' as const,
  reason: 'Опитування доступне у публічній демонстрації OpenVote.',
  rubric: { singleProposal: true, noDoubleNegation: true, clearTerms: true, factsSeparated: true },
};
const publishedPollId = '10000000-0000-4000-8000-000000000001';
const publishedCryptoId = 'jCvVAjvd9aK2BA';

export const demoPublishedResult: ResultType = ResultContract.parse({
  apiVersion: 'v1', question: developmentQuestions[0]?.question, version: 1, pollId: publishedCryptoId, policy,
  acceptedVotes: 100, counts: [57, 28, 15], opensAt: '2026-10-01T08:00:00.000Z', closesAt: '2026-10-31T20:00:00.000Z',
  state: 'Published', verification: 'ReferenceVerified', selfSelected: true, representativenessWarning,
});

function content(entry: (typeof developmentQuestions)[number], index: number): ContentType {
  if (index === 0) return Content.parse({
    question: entry.question, context: entry.context, consequences: '', argumentsFor: [], argumentsAgainst: [], category: entry.category,
    authorAlias: 'OpenVote', policy, opensAt: demoPublishedResult.opensAt, closesAt: demoPublishedResult.closesAt,
    publicationThreshold: 1, relatedPolls: [],
  });
  const open = index === 1;
  return Content.parse({
    question: entry.question, context: entry.context, consequences: '', argumentsFor: [], argumentsAgainst: [], category: entry.category,
    authorAlias: 'OpenVote', policy, opensAt: open ? '2026-11-01T08:00:00.000Z' : '2030-01-15T08:00:00.000Z',
    closesAt: open ? '2027-12-31T20:00:00.000Z' : '2030-02-15T20:00:00.000Z', publicationThreshold: 1, relatedPolls: [],
  });
}

const catalogue: PollType[] = developmentQuestions.map((entry, index) => Poll.parse({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  version: 1,
  state: index === 0 ? 'Published' : index === 1 ? 'Open' : 'Scheduled',
  content: content(entry, index),
  createdAt: new Date(Date.parse('2026-11-05T18:00:00.000Z') - index * 60_000).toISOString(),
  cryptoId: index === 0 ? publishedCryptoId : index === 1 ? 'DemoOpenPoll02' : null,
  manifestRaw: null,
  review,
  methodologyStatus: 'Reviewed',
  contentStatus: 'Visible',
}));

function readState(storage: Storage): DemoStateType {
  const raw = storage.getItem(storageKey);
  return raw === null ? emptyState : DemoState.parse(JSON.parse(raw));
}

function writeState(storage: Storage, state: DemoStateType): void {
  storage.setItem(storageKey, JSON.stringify(DemoState.parse(state)));
}

function allPolls(storage: Storage): PollType[] {
  return [...readState(storage).polls, ...catalogue];
}

function findPoll(storage: Storage, id: string): PollType {
  const poll = allPolls(storage).find(item => item.id === id);
  if (poll === undefined) throw new Error('Опитування не знайдено.');
  return poll;
}

function resultForPoll(poll: PollType): ResultType | null {
  return poll.id === publishedPollId ? demoPublishedResult : null;
}

function tracker(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/=$/u, '');
}

export function demoVoteResult(pollId: string, storage: Storage = window.localStorage): { counts: [number, number, number]; total: number; voteId: string } | null {
  const vote = readState(storage).votes.find(item => item.pollId === pollId);
  if (vote === undefined) return null;
  const counts: [number, number, number] = [0, 0, 0];
  counts[vote.choice] = 1;
  return { counts, total: 1, voteId: vote.voteId };
}

export function submitDemoVote(pollId: string, choice: number, storage: Storage = window.localStorage) {
  const poll = findPoll(storage, pollId);
  if (poll.state !== 'Open') throw new Error('Це опитування зараз не приймає голоси.');
  const parsedChoice = z.number().int().min(0).max(2).parse(choice);
  const state = readState(storage);
  const existing = state.votes.find(item => item.pollId === pollId);
  if (existing !== undefined) return demoVoteResult(pollId, storage);
  const vote = DemoVote.parse({ pollId, choice: parsedChoice, voteId: tracker() });
  writeState(storage, { ...state, votes: [...state.votes, vote] });
  return demoVoteResult(pollId, storage);
}

export function checkDemoVoteId(value: string, storage: Storage = window.localStorage) {
  const voteId = z.string().regex(/^[A-Za-z0-9+/]{43}$/).parse(value);
  const vote = readState(storage).votes.find(item => item.voteId === voteId);
  if (vote === undefined) return { included: false as const };
  const poll = findPoll(storage, vote.pollId);
  return {
    included: true as const, pollId: poll.id, question: poll.content.question, context: poll.content.context,
    category: poll.content.category, opensAt: poll.content.opensAt, closesAt: poll.content.closesAt,
    state: poll.state === 'Published' ? 'Published' as const : poll.state === 'Open' ? 'Open' as const : 'Scheduled' as const,
    result: resultForPoll(poll),
  };
}

function createPoll(input: unknown, storage: Storage): PollType {
  const supplied = Content.parse(input);
  const id = crypto.randomUUID();
  const poll = Poll.parse({
    id, version: 1, state: 'Open', content: supplied, createdAt: new Date().toISOString(),
    cryptoId: `Demo${id.replaceAll('-', '').slice(0, 10)}`, manifestRaw: null, review,
    methodologyStatus: 'Reviewed', contentStatus: 'Visible',
  });
  const state = readState(storage);
  writeState(storage, { ...state, polls: [poll, ...state.polls] });
  return poll;
}

function commentsFor(storage: Storage, pollId: string): DiscussionCommentType[] {
  return readState(storage).comments.filter(comment => comment.pollId === pollId);
}

export async function demoRequest(area: 'identity' | 'ballot' | 'management', path: string, method = 'GET', body?: unknown,
  _token?: string, storage: Storage = window.localStorage): Promise<unknown> {
  if (area === 'management' && path.startsWith('/v1/polls?') && method === 'GET') {
    const params = new URLSearchParams(path.slice(path.indexOf('?') + 1));
    const query = params.get('q')?.trim().toLocaleLowerCase('uk-UA') ?? '';
    const categories = params.getAll('category');
    const polls = allPolls(storage).filter(poll => (query === '' || `${poll.content.question} ${poll.content.context}`.toLocaleLowerCase('uk-UA').includes(query))
      && (categories.length === 0 || categories.includes(poll.content.category)));
    return { polls };
  }
  if (area === 'management' && path === '/v1/drafts' && method === 'POST') return { poll: createPoll(body, storage) };
  if (area === 'management' && path === '/v1/my-drafts' && method === 'GET') return { polls: readState(storage).polls };
  const commentReaction = /^\/v1\/polls\/([0-9a-f-]{36})\/comments\/([0-9a-f-]{36})\/reaction$/u.exec(path);
  if (area === 'management' && commentReaction !== null && method === 'POST') {
    const pollId = z.string().uuid().parse(commentReaction[1]);
    const commentId = z.string().uuid().parse(commentReaction[2]);
    const input = z.strictObject({ actorToken: CommentReactionToken, kind: CommentReactionKind.nullable() }).parse(body);
    const state = readState(storage);
    const comment = state.comments.find(item => item.pollId === pollId && item.id === commentId);
    if (comment === undefined) throw new Error('Коментар не знайдено.');
    const reactions = state.reactions.filter(item => !(item.commentId === commentId && item.actorToken === input.actorToken));
    if (input.kind !== null) reactions.push({ commentId, actorToken: input.actorToken, kind: input.kind });
    const updated = { ...comment,
      likes: reactions.filter(item => item.commentId === commentId && item.kind === 'like').length,
      dislikes: reactions.filter(item => item.commentId === commentId && item.kind === 'dislike').length };
    writeState(storage, { ...state, comments: state.comments.map(item => item.id === commentId ? updated : item), reactions });
    return { comment: updated };
  }
  const comments = /^\/v1\/polls\/([0-9a-f-]{36})\/comments$/u.exec(path);
  if (area === 'management' && comments !== null) {
    const pollId = z.string().uuid().parse(comments[1]);
    findPoll(storage, pollId);
    if (method === 'GET') return { comments: commentsFor(storage, pollId) };
    if (method === 'POST') {
      const input = z.strictObject({ text: CommentText, parentId: z.string().uuid().nullable() }).parse(body);
      const state = readState(storage);
      if (input.parentId !== null && !state.comments.some(item => item.pollId === pollId && item.id === input.parentId)) throw new Error('Коментар для відповіді не знайдено.');
      const comment = DiscussionComment.parse({ id: crypto.randomUUID(), pollId, parentId: input.parentId, text: input.text,
        createdAt: new Date().toISOString(), deleted: false, likes: 0, dislikes: 0 });
      writeState(storage, { ...state, comments: [...state.comments, comment] });
      return { comment };
    }
  }
  const pollMatch = /^\/v1\/polls\/([0-9a-f-]{36})$/u.exec(path);
  if (area === 'management' && pollMatch !== null && method === 'GET') return { poll: findPoll(storage, z.string().uuid().parse(pollMatch[1])) };
  const resultMatch = /^\/v1\/elections\/([A-Za-z0-9]+)\/result$/u.exec(path);
  if (area === 'ballot' && resultMatch !== null && method === 'GET') {
    const poll = allPolls(storage).find(item => item.cryptoId === resultMatch[1]);
    const result = poll === undefined ? null : resultForPoll(poll);
    if (result === null) throw new Error('Результат ще не опубліковано.');
    return result;
  }
  const auditMatch = /^\/v1\/elections\/([A-Za-z0-9]+)\/audit$/u.exec(path);
  if (area === 'ballot' && auditMatch !== null && method === 'GET') {
    const poll = allPolls(storage).find(item => item.cryptoId === auditMatch[1]);
    const result = poll === undefined ? null : resultForPoll(poll);
    if (result === null) throw new Error('Аудит-пакет ще не опубліковано.');
    return { format: 'openvote-public-demo-v1', pollId: result.pollId, result };
  }
  throw new Error('Ця дія недоступна у публічному демо.');
}

export { Answers };
