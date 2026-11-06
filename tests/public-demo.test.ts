import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Poll } from '../packages/domain/src/index.ts';
import { checkDemoVoteId, demoRequest, demoVoteResult, submitDemoVote } from '../apps/web/src/demo-api.ts';
import { isPublicDemoPath, publicDemoHref, publicDemoRoute } from '../apps/web/src/demo-mode.ts';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const openPollId = '10000000-0000-4000-8000-000000000002';

describe('public browser-only demo', () => {
  it('uses ordinary paths for every nested demo route', () => {
    expect(isPublicDemoPath('/demo/')).toBe(true);
    expect(isPublicDemoPath('/demo/mine')).toBe(true);
    expect(isPublicDemoPath('/other')).toBe(false);
    expect(publicDemoHref('/poll/example')).toBe('/demo/poll/example');
    expect(publicDemoRoute('/demo/mine', '')).toBe('/mine');
    expect(publicDemoRoute('/demo/identity', '?return=%2Fpoll%2Fexample')).toBe('/identity?return=%2Fpoll%2Fexample');
  });

  it('serves the approved catalogue without platform services', async () => {
    const storage = new MemoryStorage();
    const result = z.object({ polls: z.array(Poll) }).parse(await demoRequest('management', '/v1/polls?', 'GET', undefined, undefined, storage));
    expect(result.polls).toHaveLength(40);
    expect(result.polls[0]?.state).toBe('Published');
    expect(result.polls[1]?.state).toBe('Open');
    expect(result.polls.slice(2).every(poll => poll.state === 'Scheduled')).toBe(true);
  });

  it('keeps a created poll in the same browser storage', async () => {
    const storage = new MemoryStorage();
    const source = z.object({ poll: Poll }).parse(await demoRequest('management', `/v1/polls/${openPollId}`, 'GET', undefined, undefined, storage)).poll;
    const created = z.object({ poll: Poll }).parse(await demoRequest('management', '/v1/drafts', 'POST', {
      ...source.content,
      question: 'Чи потрібні місту додаткові велопарковки біля станцій метро?',
      context: 'Демонстраційне опитування, створене у цьому браузері.',
    }, 'public-demo', storage)).poll;
    const mine = z.object({ polls: z.array(Poll) }).parse(await demoRequest('management', '/v1/my-drafts', 'GET', undefined, 'public-demo', storage));
    expect(created.state).toBe('Open');
    expect(mine.polls).toEqual([created]);
  });

  it('accepts one browser-local vote and verifies its ID', () => {
    const storage = new MemoryStorage();
    const accepted = submitDemoVote(openPollId, 0, storage);
    expect(accepted).toMatchObject({ counts: [1, 0, 0], total: 1 });
    expect(submitDemoVote(openPollId, 2, storage)).toEqual(accepted);
    expect(demoVoteResult(openPollId, storage)).toEqual(accepted);
    expect(checkDemoVoteId(accepted?.voteId ?? '', storage)).toMatchObject({ included: true, pollId: openPollId, state: 'Open' });
  });

  it('stores comments, replies and reactions only in the same browser', async () => {
    const storage = new MemoryStorage();
    const created = z.object({ comment: z.object({ id: z.string().uuid() }) }).parse(await demoRequest('management', `/v1/polls/${openPollId}/comments`, 'POST', {
      text: 'Підтримую обговорення цієї теми.', parentId: null,
    }, 'public-demo', storage));
    await demoRequest('management', `/v1/polls/${openPollId}/comments`, 'POST', {
      text: 'Додаю відповідь до дискусії.', parentId: created.comment.id,
    }, 'public-demo', storage);
    await demoRequest('management', `/v1/polls/${openPollId}/comments/${created.comment.id}/reaction`, 'POST', {
      actorToken: '20000000-0000-4000-8000-000000000001', kind: 'like',
    }, 'public-demo', storage);
    const comments = z.object({ comments: z.array(z.object({ id: z.string().uuid(), likes: z.number() })) }).parse(
      await demoRequest('management', `/v1/polls/${openPollId}/comments`, 'GET', undefined, 'public-demo', storage),
    );
    expect(comments.comments).toHaveLength(2);
    expect(comments.comments[0]?.likes).toBe(1);
  });

  it('rejects actions outside the public demo contract', async () => {
    const storage = new MemoryStorage();
    await expect(demoRequest('identity', '/v1/session', 'POST', {}, 'public-demo', storage)).rejects.toThrow('Ця дія недоступна у публічному демо.');
  });
});
