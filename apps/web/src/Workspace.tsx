import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { z } from 'zod';
import { Content, Poll, Rubric } from '../../../packages/domain/src/index.ts';
import type { ContentType, PollType } from '../../../packages/domain/src/index.ts';
import type { Auth } from './App.tsx';
import { request } from './api.ts';
import { CategorySelect } from './CategorySelect.tsx';
import { ErrorMessage, stateNames } from './PollPage.tsx';
import { PollCard } from './PollCard.tsx';

function localDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function DraftEditor({ auth, id, drawer = false }: { auth: Auth; id: string | null; drawer?: boolean }) {
  const [initial, setInitial] = useState<ContentType | null>(null), [ready, setReady] = useState(id === null);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [authorVisibility, setAuthorVisibility] = useState<'hidden' | 'shown' | null>(null);
  const [category, setCategory] = useState('');
  useEffect(() => { if (id === null) return;
    request('management', '/v1/polls/' + id, 'GET', undefined, auth.token).then(value => {
      const { poll } = z.object({ poll: Poll }).parse(value);
      if (poll.state !== 'Draft') throw new Error('Офіційний зміст зафіксовано. Створіть нове пов’язане опитування.');
      setInitial(poll.content); setCategory(poll.content.category); setAuthorVisibility(poll.content.authorAlias === null ? 'hidden' : 'shown'); setReady(true);
    }).catch((e: Error) => setError(e.message));
  }, [id, auth.token]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const form = event.currentTarget, data = new FormData(form);
    const field = (name: string) => z.string().parse(data.get(name));
    try {
      if (category === '') throw new Error('Оберіть категорію.');
      const visibility = z.enum(['hidden', 'shown']).parse(data.get('authorVisibility'));
      const policy = initial === null
        ? { id: 'verified-rnokpp-owner' as const, version: 1 as const, minimumAge: 14, citizenship: 'UA' }
        : initial.policy;
      const content = Content.parse({ question: field('question'), context: field('context'), consequences: '',
        argumentsFor: [], argumentsAgainst: [],
        category, authorAlias: visibility === 'shown' ? field('authorAlias') : null, policy,
        opensAt: initial === null ? new Date().toISOString() : initial.opensAt, closesAt: new Date(field('deadline')).toISOString(),
        publicationThreshold: initial === null ? 1 : initial.publicationThreshold, relatedPolls: initial === null ? [] : initial.relatedPolls });
      const path = id === null ? '/v1/drafts' : '/v1/polls/' + id;
      const { poll } = z.object({ poll: Poll }).parse(await request('management', path, id === null ? 'POST' : 'PATCH', content, auth.token));
      location.hash = '#/poll/' + poll.id;
    } catch (e) { setError(e instanceof z.ZodError ? e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  if (!ready) return <><ErrorMessage message={error} />{error === null && <p role="status">Завантаження чернетки…</p>}</>;
  const title = id === null ? 'Створити опитування' : 'Редагувати опитування';
  const fields = <><label>Питання<input name="question" required minLength={12} maxLength={240} defaultValue={initial?.question} /></label>
      <label>Опис<textarea className="editor-description" name="context" maxLength={8000} defaultValue={initial?.context} /></label>
      <div className="form-grid"><div className="editor-category"><span className="field-label">Категорія</span><CategorySelect multiple={false} selected={category === '' ? [] : [category]} onChange={selected => setCategory(selected[0] ?? '')} /></div><label>Дедлайн<input name="deadline" type="datetime-local" required defaultValue={initial === null ? undefined : localDate(initial.closesAt)} /></label></div>
      <fieldset className="author-visibility"><legend>Автор опитування</legend><div className="author-visibility-options"><label className="choice"><input type="radio" name="authorVisibility" value="hidden" required checked={authorVisibility === 'hidden'} onChange={() => setAuthorVisibility('hidden')} />Приховати автора</label><label className="choice"><input type="radio" name="authorVisibility" value="shown" required checked={authorVisibility === 'shown'} onChange={() => setAuthorVisibility('shown')} />Показувати псевдонім</label></div>
        {authorVisibility === 'shown' && <label>Псевдонім автора<input name="authorAlias" required minLength={3} maxLength={60} defaultValue={initial?.authorAlias ?? ''} /></label>}
      </fieldset>
      <ErrorMessage message={error} /></>;
  const submit = <button className="primary editor-submit" type="submit" disabled={busy}>{busy ? (id === null ? 'Створення…' : 'Збереження…') : (id === null ? 'Створити опитування' : 'Зберегти зміни')}</button>;
  return <section className={`editor${drawer ? ' editor-drawer' : ''}`}>
    {drawer ? <div className="editor-drawer-header"><h1>{title}</h1></div> : <h1>{title}</h1>}
    <form onSubmit={e => void save(e)} className={`content-paper${drawer ? ' editor-drawer-form' : ''}`}>
      {drawer ? <><div className="editor-drawer-body"><fieldset disabled={busy}>{fields}</fieldset></div><div className="editor-drawer-footer">{submit}</div></> : <fieldset disabled={busy}>{fields}{submit}</fieldset>}
    </form>
  </section>;
}

export function MyPolls({ auth }: { auth: Auth }) {
  const [polls, setPolls] = useState<PollType[] | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => { request('management', '/v1/my-drafts', 'GET', undefined, auth.token).then(value => setPolls(z.object({ polls: z.array(Poll) }).parse(value).polls)).catch((e: Error) => setError(e.message)); }, [auth.token]);
  return <section className="my-polls" aria-label="Мої опитування"><p className="my-polls-intro">Тут показано лише ваше авторство. Історія ваших відповідей не збирається в публічному профілі.</p><ErrorMessage message={error} />{polls === null ? <p role="status">Завантаження…</p> : polls.length === 0 ? <p>Ви ще не створили опитувань.</p> : <div className="poll-list">{polls.map(poll => <PollCard key={poll.id} id={poll.id} question={poll.content.question} context={poll.content.context} category={poll.content.category} stateLabel={stateNames[poll.state]} opensAt={poll.content.opensAt} closesAt={poll.content.closesAt} />)}</div>}</section>;
}
const rubricLabels = { singleProposal: 'Одна пропозиція без навідного формулювання', noDoubleNegation: 'Без подвійного заперечення', clearTerms: 'Терміни зрозумілі', factsSeparated: 'Факти відокремлені від оцінок' };
export function ReviewQueue({ auth }: { auth: Auth }) {
  const [polls, setPolls] = useState<PollType[] | null>(null), [appeals, setAppeals] = useState<{ id: string; poll_id: string; reason: string }[]>([]);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { request('management', '/v1/review-queue', 'GET', undefined, auth.token).then(value => { const data = z.object({ polls: z.array(Poll), appeals: z.array(z.object({ id: z.string(), poll_id: z.string(), reason: z.string() })) }).parse(value); setPolls(data.polls); setAppeals(data.appeals); }).catch((e: Error) => setError(e.message)); }, [auth.token]);
  async function submit(event: FormEvent<HTMLFormElement>, id: string, appeal: boolean) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(null); setNotice(null);
    try { const reason = z.string().parse(data.get('reason'));
      const body = appeal ? { reason, reopen: data.get('reopen') === 'on' } : { reason, action: z.string().parse(data.get('action')),
        rubric: Rubric.parse(Object.fromEntries(Object.keys(rubricLabels).map(key => [key, data.get(key) === 'on']))) };
      await request('management', appeal ? `/v1/appeals/${id}/resolve` : `/v1/polls/${id}/review`, 'POST', body, auth.token);
      if (appeal) setAppeals(current => current.filter(item => item.id !== id));
      else setPolls(current => current === null ? null : current.filter(poll => poll.id !== id));
      setNotice('Рішення зафіксовано.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return <section><p className="eyebrow">ПРОЗОРІ РІШЕННЯ</p><h1>Модерація й оскарження</h1><p>Публікація вимагає всіх чотирьох критеріїв. Відхилення й позначення дубліката потребують пояснення та можуть бути оскаржені.</p><ErrorMessage message={error} />{notice !== null && <p role="status">{notice}</p>}{polls === null ? <p role="status">Завантаження…</p> : polls.length === 0 ? <p>Питань у черзі немає.</p> : polls.map(p => <form className="content-paper" key={p.id} onSubmit={e => void submit(e, p.id, false)}><h2><a href={`#/poll/${p.id}`}>{p.content.question}</a></h2>{p.content.context !== '' && <p>{p.content.context}</p>}<fieldset disabled={busy}><legend>Методологічні критерії</legend>{Object.entries(rubricLabels).map(([key, label]) => <label className="choice" key={key}><input type="checkbox" name={key} />{label}</label>)}<label>Рішення<select name="action"><option value="approve">Схвалити</option><option value="reject">Відхилити</option><option value="duplicate">Позначити дублікатом</option></select></label><label>Причина рішення<textarea name="reason" required minLength={15} maxLength={2000} /></label><button className="primary" type="submit">{busy ? 'Перевірка та фіксація…' : 'Зафіксувати рішення'}</button></fieldset></form>)}
    <h2>Відкриті звернення</h2>{appeals.length === 0 ? <p>Відкритих звернень немає.</p> : appeals.map(a => <form className="content-paper" key={a.id} onSubmit={e => void submit(e, a.id, true)}><a href={`#/poll/${a.poll_id}`}>Переглянути питання</a><p className="preserve">{a.reason}</p><fieldset disabled={busy}><label>Обґрунтування відповіді<textarea name="reason" required minLength={15} maxLength={2000} /></label><label className="choice"><input type="checkbox" name="reopen" />Повернути відхилене питання в чернетку</label><button className="secondary" type="submit">Закрити звернення з відповіддю</button></fieldset></form>)}</section>;
}
