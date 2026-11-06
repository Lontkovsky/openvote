import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CommentResponse, CommentsResponse } from '../packages/domain/src/index.ts';
import { database, readConfig } from '../apps/api/src/common.ts';
import { call, ok } from './support/flow.ts';

const pollId = '10000000-0000-4000-8000-000000000011';
const otherPollId = '10000000-0000-4000-8000-000000000012';

describe('anonymous poll discussions', () => {
  it('supports permanent text comments, replies and reactions on scheduled polls', async () => {
    const pool = database(await readConfig('management'));
    const createdIds: string[] = [];
    try {
      const initial = CommentsResponse.parse(await ok('management', `/v1/polls/${pollId}/comments`));
      expect(Array.isArray(initial.comments)).toBe(true);

      expect(await call('management', `/v1/polls/${pollId}/comments`, 'POST', { text: '   ', parentId: null }))
        .toEqual({ status: 400, value: { error: 'INVALID_INPUT' } });
      expect(await call('management', `/v1/polls/${pollId}/comments`, 'POST', { text: 'Коментар без вкладень.', parentId: null, attachment: 'file.pdf' }))
        .toEqual({ status: 400, value: { error: 'INVALID_INPUT' } });

      const root = CommentResponse.parse(await ok('management', `/v1/polls/${pollId}/comments`, 'POST', {
        text: 'Перший тестовий коментар до запланованого опитування.', parentId: null,
      }));
      createdIds.push(root.comment.id);
      expect(root.comment).toMatchObject({ pollId, parentId: null, deleted: false, likes: 0, dislikes: 0 });

      const stored = await pool.query<{ body: string }>('SELECT body FROM comments WHERE id=$1', [root.comment.id]);
      expect(stored.rows[0]).toEqual({ body: root.comment.text });
      const deletionColumn = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='comments' AND column_name='owner_token_hash'");
      expect(deletionColumn.rowCount).toBe(0);

      const reply = CommentResponse.parse(await ok('management', `/v1/polls/${pollId}/comments`, 'POST', {
        text: 'Відповідь зберігається окремо від особи автора.', parentId: root.comment.id,
      }));
      createdIds.push(reply.comment.id);
      expect(reply.comment.parentId).toBe(root.comment.id);
      expect(await call('management', `/v1/polls/${otherPollId}/comments`, 'POST', { text: 'Хибна відповідь.', parentId: root.comment.id }))
        .toEqual({ status: 404, value: { error: 'PARENT_COMMENT_NOT_FOUND' } });

      const actorA = randomUUID(), actorB = randomUUID();
      const liked = CommentResponse.parse(await ok('management', `/v1/polls/${pollId}/comments/${root.comment.id}/reaction`, 'POST', { actorToken: actorA, kind: 'like' }));
      expect({ likes: liked.comment.likes, dislikes: liked.comment.dislikes }).toEqual({ likes: 1, dislikes: 0 });
      const switched = CommentResponse.parse(await ok('management', `/v1/polls/${pollId}/comments/${root.comment.id}/reaction`, 'POST', { actorToken: actorA, kind: 'dislike' }));
      expect({ likes: switched.comment.likes, dislikes: switched.comment.dislikes }).toEqual({ likes: 0, dislikes: 1 });
      const split = CommentResponse.parse(await ok('management', `/v1/polls/${pollId}/comments/${root.comment.id}/reaction`, 'POST', { actorToken: actorB, kind: 'like' }));
      expect({ likes: split.comment.likes, dislikes: split.comment.dislikes }).toEqual({ likes: 1, dislikes: 1 });
      const removedReaction = CommentResponse.parse(await ok('management', `/v1/polls/${pollId}/comments/${root.comment.id}/reaction`, 'POST', { actorToken: actorA, kind: null }));
      expect({ likes: removedReaction.comment.likes, dislikes: removedReaction.comment.dislikes }).toEqual({ likes: 1, dislikes: 0 });

      expect((await call('management', `/v1/polls/${pollId}/comments/${root.comment.id}`, 'DELETE', {})).status).toBe(404);

      const thread = CommentsResponse.parse(await ok('management', `/v1/polls/${pollId}/comments`));
      expect(thread.comments.filter(comment => createdIds.includes(comment.id)).map(comment => ({ id: comment.id, parentId: comment.parentId, deleted: comment.deleted, text: comment.text })))
        .toEqual([
          { id: root.comment.id, parentId: null, deleted: false, text: root.comment.text },
          { id: reply.comment.id, parentId: root.comment.id, deleted: false, text: reply.comment.text },
        ]);
      expect(await call('management', `/v1/polls/${randomUUID()}/comments`)).toEqual({ status: 404, value: { error: 'POLL_NOT_FOUND' } });
    } finally {
      for (const id of createdIds.reverse()) {
        await pool.query('DELETE FROM comment_reactions WHERE comment_id=$1', [id]);
        await pool.query('DELETE FROM comments WHERE id=$1', [id]);
      }
      await pool.end();
    }
  }, 15000);
});
