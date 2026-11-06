import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CommentReactionKind, CommentResponse, CommentsResponse } from '../../../packages/domain/src/index.ts';
import type { CommentReactionKindType, DiscussionCommentType } from '../../../packages/domain/src/index.ts';
import { request } from './api.ts';

const reactionTokenKey = (commentId: string) => `openvote-comment-reaction-token:${commentId}`;
const reactionKindKey = (commentId: string) => `openvote-comment-reaction-kind:${commentId}`;

function dateTime(value: string): string {
  return new Date(value).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function Comments({ pollId }: { pollId: string }) {
  const [comments, setComments] = useState<DiscussionCommentType[]>([]);
  const [draft, setDraft] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reactionKinds, setReactionKinds] = useState<Record<string, CommentReactionKindType | null>>({});
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    request('management', `/v1/polls/${pollId}/comments`).then(value => {
      const result = CommentsResponse.parse(value);
      setComments(result.comments);
      setReactionKinds(Object.fromEntries(result.comments.map(comment => {
        const stored = window.localStorage.getItem(reactionKindKey(comment.id));
        const parsed = CommentReactionKind.safeParse(stored);
        return [comment.id, parsed.success ? parsed.data : null];
      })));
    }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => setLoading(false));
  }, [pollId]);

  async function publish(text: string, parentId: string | null) {
    if (!/\S/u.test(text)) return;
    setBusy(true); setError(null);
    try {
      const result = CommentResponse.parse(await request('management', `/v1/polls/${pollId}/comments`, 'POST', { text, parentId }));
      setComments(current => [...current, result.comment]);
      if (parentId === null) setDraft('');
      else { setReplyDraft(''); setReplyTo(null); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  async function react(comment: DiscussionCommentType, kind: CommentReactionKindType) {
    setBusy(true); setError(null);
    try {
      let actorToken = window.localStorage.getItem(reactionTokenKey(comment.id));
      if (actorToken === null) {
        actorToken = crypto.randomUUID();
        window.localStorage.setItem(reactionTokenKey(comment.id), actorToken);
      }
      const nextKind = reactionKinds[comment.id] === kind ? null : kind;
      const result = CommentResponse.parse(await request('management', `/v1/polls/${pollId}/comments/${comment.id}/reaction`, 'POST', { actorToken, kind: nextKind }));
      if (nextKind === null) window.localStorage.removeItem(reactionKindKey(comment.id));
      else window.localStorage.setItem(reactionKindKey(comment.id), nextKind);
      setReactionKinds(current => ({ ...current, [comment.id]: nextKind }));
      setComments(current => current.map(item => item.id === comment.id ? result.comment : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  function thread(comment: DiscussionCommentType): ReactNode {
    const children = comments.filter(item => item.parentId === comment.id);
    return <li className="comment-item" key={comment.id}>
      <article className={comment.deleted ? 'comment-body deleted' : 'comment-body'}>
        <time dateTime={comment.createdAt}>{dateTime(comment.createdAt)}</time>
        {comment.deleted ? <p className="comment-tombstone">Коментар видалено.</p> : <p className="comment-text">{comment.text}</p>}
        {!comment.deleted && <div className="comment-actions">
          <button className="comment-action comment-reaction" type="button" title="Лайк" aria-label={`Лайк, ${comment.likes}`} aria-pressed={reactionKinds[comment.id] === 'like'} disabled={busy} onClick={() => void react(comment, 'like')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 0 4-7a2.5 2.5 0 0 1 4.7 1.6L15 8h4a3 3 0 0 1 2.9 3.8l-2 7A3 3 0 0 1 17 21H7" /></svg><span>{comment.likes}</span></button>
          <button className="comment-action comment-reaction" type="button" title="Дизлайк" aria-label={`Дизлайк, ${comment.dislikes}`} aria-pressed={reactionKinds[comment.id] === 'dislike'} disabled={busy} onClick={() => void react(comment, 'dislike')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14V3H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3Zm0 0 4 7a2.5 2.5 0 0 0 4.7-1.6L15 16h4a3 3 0 0 0 2.9-3.8l-2-7A3 3 0 0 0 17 3H7" /></svg><span>{comment.dislikes}</span></button>
          <button className="comment-action comment-reply-action" type="button" title="Відповісти" aria-label="Відповісти" disabled={busy} onClick={() => { setReplyTo(comment.id); setReplyDraft(''); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 8-5 4 5 4" /><path d="M5 12h7a7 7 0 0 1 7 7" /></svg></button>
        </div>}
        {replyTo === comment.id && <form className="comment-inline-reply" onSubmit={event => { event.preventDefault(); void publish(replyDraft, comment.id); }}>
          <label className="visually-hidden" htmlFor={`reply-${comment.id}`}>Ваша відповідь</label>
          <textarea id={`reply-${comment.id}`} autoFocus value={replyDraft} maxLength={2000} rows={2} disabled={busy} onChange={event => setReplyDraft(event.target.value)} />
          <div className="comment-inline-reply-actions">
            <button className="comment-action" type="button" disabled={busy} onClick={() => { setReplyTo(null); setReplyDraft(''); }}>Скасувати</button>
            <button className="primary" type="submit" disabled={busy || !/\S/u.test(replyDraft)}>Відповісти</button>
          </div>
        </form>}
      </article>
      {children.length > 0 && <ol className="comment-children">{children.map(thread)}</ol>}
    </li>;
  }

  const roots = comments.filter(comment => comment.parentId === null);
  return <section className="content-paper comments" aria-labelledby={`comments-${pollId}`}>
    <h2 id={`comments-${pollId}`}>Коментарі та обговорення</h2>
    <form className="comment-form" onSubmit={event => { event.preventDefault(); void publish(draft, null); }}>
      <label>Ваш коментар<textarea value={draft} maxLength={2000} rows={2} disabled={busy} onChange={event => setDraft(event.target.value)} /></label>
      <button className="primary" type="submit" disabled={busy || !/\S/u.test(draft)}>Опублікувати</button>
    </form>
    {error !== null && <p className="notice error" role="alert">{error}</p>}
    {loading && <p role="status">Завантаження коментарів…</p>}
    {!loading && comments.length === 0 && <p className="comment-empty">Поки що коментарів немає.</p>}
    {roots.length > 0 && <ol className="comment-list">{roots.map(thread)}</ol>}
  </section>;
}
