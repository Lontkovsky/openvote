import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Answers, Envelope, Manifest, Poll, ResultContract, percentage } from '../../../packages/domain/src/index.ts';
import type { PollType, ResultType, EnvelopeType } from '../../../packages/domain/src/index.ts';
import { resultCsv } from '../../../packages/domain/src/result-exports.ts';
import type { Auth } from './App.tsx';
import { ApiFailure, request } from './api.ts';
import { ElectionInfo, encrypt, hash, verifyReceipt } from './crypto.ts';
import { Comments } from './Comments.tsx';
import { demoVoteResult, submitDemoVote } from './demo-api.ts';
import { VoteSuccess } from './VoteSuccess.tsx';

export const stateNames = { Draft: 'Чернетка', Review: 'На перевірці', Scheduled: 'Заплановано', Open: 'Голосування відкрите', Closed: 'Голосування закрите', Tallying: 'Очікує підрахунку', Published: 'Результат опубліковано', Rejected: 'Відхилено', Cancelled: 'Скасовано', Invalidated: 'Результат визнано недійсним', ResultsSuppressed: 'Результат не розкривається' } satisfies Record<PollType['state'], string>;
export function ErrorMessage({ message }: { message: string | null }) { return message === null ? null : <p className="notice error" role="alert">{message}</p>; }
function dateTime(value: string): string {
  return new Date(value).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function download(name: string, contents: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}
const acceptedVoteKey = (pollId: string) => `openvote:accepted-vote:${pollId}`;
export function PollPage({ id, auth, demo = false }: { id: string; auth: Auth | null; demo?: boolean }) {
  const [poll, setPoll] = useState<PollType | null>(null), [error, setError] = useState<string | null>(null);
  const [publishedResult, setPublishedResult] = useState<ResultType | null>(null), [publishedResultError, setPublishedResultError] = useState<string | null>(null);
  const [demoResult, setDemoResult] = useState(() => demo ? demoVoteResult(id) : null);
  const [votedInThisBrowser, setVotedInThisBrowser] = useState(() => window.localStorage.getItem(acceptedVoteKey(id)) === 'accepted');
  const [removed, setRemoved] = useState(false);
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { setPoll(null); setError(null); setRemoved(false);
    request('management', '/v1/polls/' + id, 'GET', undefined, auth?.token).then(value => {
      if (z.object({ contentStatus: z.literal('Removed') }).safeParse(value).success) { setRemoved(true); return; }
      const data = z.object({ poll: Poll }).parse(value);
      setPoll(data.poll);
    }).catch((e: Error) => setError(e.message));
  }, [id, auth, revision]);
  useEffect(() => { setVotedInThisBrowser(window.localStorage.getItem(acceptedVoteKey(id)) === 'accepted'); }, [id]);
  useEffect(() => {
    setPublishedResult(null); setPublishedResultError(null);
    if (poll?.state !== 'Published' || poll.cryptoId === null) return;
    request('ballot', `/v1/elections/${poll.cryptoId}/result`).then(value => setPublishedResult(ResultContract.parse(value))).catch((e: Error) => setPublishedResultError(e.message));
  }, [poll?.state, poll?.cryptoId]);
  async function action(name: string, body: unknown) {
    if (auth === null) return;
    setBusy(true); setError(null); setNotice(null);
    try { await request('management', `/v1/polls/${id}/${name}`, 'POST', body, auth.token); setRevision(r => r + 1); setNotice('Дію виконано й записано.'); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  if (removed) return <section className="reading"><h1>Матеріал вилучено</h1><p>Залишено мінімальне свідчення існування питання. Автоматичне відтворення вилучених матеріалів заборонене.</p><p>Ідентифікатор: {id}</p></section>;
  if (poll === null) return <><ErrorMessage message={error} />{error === null && <p role="status">Завантаження питання…</p>}</>;
  const summary = poll.content.context.split('\n\n')[0];
  const showParticipation = poll.state !== 'Published' || votedInThisBrowser;
  return <><a className="poll-back" href="#/">← Усі опитування</a><div className={`detail-layout${showParticipation ? '' : ' detail-layout-single'}`}><section className="poll-heading"><h1>{poll.content.question}</h1>{summary !== '' && <p>{summary}</p>}</section>
    {showParticipation && <aside className="participation">{demoResult !== null ? <><VoteSuccess answers={Answers} counts={demoResult.counts} total={demoResult.total} /><div className="demo-vote-receipt"><span>ID голосу</span><code>{demoResult.voteId}</code><a href="#/trust">Перевірити</a></div></> : poll.state === 'Published' ? <CompletedParticipation result={publishedResult} error={publishedResultError} /> : poll.state === 'Open' && auth !== null ? demo ? <DemoVote pollId={poll.id} onAccepted={setDemoResult} /> : <Vote poll={poll} auth={auth} onAccepted={() => { window.localStorage.setItem(acceptedVoteKey(id), 'accepted'); setVotedInThisBrowser(true); }} /> : <><h2>Ваша відповідь</h2><fieldset className="vote-options" disabled><legend className="visually-hidden">Варіанти відповіді</legend>{Answers.map(answer => <label className="choice" key={answer}><input type="radio" name={`vote-preview-${poll.id}`} />{answer}</label>)}</fieldset>
      {poll.state === 'Open' && auth === null && <a className="button primary" href={`#/identity?return=${encodeURIComponent(`#/poll/${id}`)}`}>Проголосувати</a>}
      {poll.state === 'Scheduled' && <button className="primary" disabled>Проголосувати</button>}
      {poll.state === 'Draft' && <><a className="button secondary" href={`#/edit/${id}`}>Редагувати чернетку</a><button className="primary" disabled={busy} onClick={() => void action('submit', {})}>Надіслати на перевірку</button></>}
      {poll.state === 'ResultsSuppressed' && <div className="notice">Учасників менше за поріг публікації. Відповіді не розшифровуються й недоступні через API.</div>}
      {['Closed', 'Tallying'].includes(poll.state) && <p className="poll-state-note">Приймання завершене. Підрахунок очікує перевірки фінального набору та кворуму операторів.</p>}
      {auth?.role === 'moderator' && ['Closed', 'Tallying'].includes(poll.state) && <div className="operator-actions"><h3>Тестовий оператор</h3><button className="secondary" disabled={busy} onClick={() => void action('close', {})}>Зафіксувати закриття</button><button className="primary" disabled={busy} onClick={() => void action('demo-tally', {})}>Запустити тестовий підрахунок</button><p className="muted">Локальна симуляція: обов’язковий trustee + 2 із 3. Це не незалежні організації.</p></div>}
    </>}</aside>}
    <section className="content-paper poll-overview">
      {poll.content.context !== '' && <section className="poll-description"><h2>Про опитування</h2><p className="preserve">{poll.content.context}</p></section>}
      <div className="poll-information"><dl><div><dt>Початок</dt><dd>{dateTime(poll.content.opensAt)}</dd></div><div><dt>Категорія</dt><dd>{poll.content.category}</dd></div><div><dt>Дедлайн</dt><dd>{dateTime(poll.content.closesAt)}</dd></div><div><dt>Автор</dt><dd>{poll.content.authorAlias ?? 'Автор прихований'}</dd></div><div><dt>Статус</dt><dd>{stateNames[poll.state]}</dd></div><div className="poll-information-id"><dt>ID</dt><dd>{poll.id}</dd></div></dl></div>
      {poll.content.relatedPolls.length > 0 && <section className="poll-related"><h2>Пов’язані опитування</h2><ul>{poll.content.relatedPolls.map(p => <li key={p}><a href={`#/poll/${p}`}>{p}</a></li>)}</ul><p>Голоси різних опитувань не об’єднуються.</p></section>}
    </section></div>
    <ErrorMessage message={error} />{notice && <p role="status">{notice}</p>}
    {poll.state === 'Published' && poll.cryptoId !== null && <Results pollId={poll.cryptoId} result={publishedResult} error={publishedResultError} />}
    {!['Draft', 'Review', 'Rejected'].includes(poll.state) && <Comments pollId={poll.id} />}
  </>;
}

function DemoVote({ pollId, onAccepted }: { pollId: string; onAccepted: (result: NonNullable<ReturnType<typeof demoVoteResult>>) => void }) {
  const [choice, setChoice] = useState<number | null>(null);
  function submit() {
    if (choice === null) return;
    const result = submitDemoVote(pollId, choice);
    if (result !== null) onAccepted(result);
  }
  return <section className="vote-box"><h2>Ваша відповідь</h2><fieldset><legend className="visually-hidden">Відповідь</legend>{Answers.map((answer, index) => <label className="choice" key={answer}><input type="radio" name="demo-vote" checked={choice === index} onChange={() => setChoice(index)} />{answer}</label>)}</fieldset><button className="primary" disabled={choice === null} onClick={submit}>Проголосувати</button></section>;
}

function Vote({ poll, auth, onAccepted }: { poll: PollType; auth: Auth; onAccepted: () => void }) {
  const [choice, setChoice] = useState<number | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [pending, setPending] = useState<{ ballot: string; tracker: string } | null>(null);
  const [receipt, setReceipt] = useState<EnvelopeType | null>(null), [attempts, setAttempts] = useState(0);
  const [tracker, setTracker] = useState<string | null>(null);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  async function submit() {
    if (poll.cryptoId === null || choice === null) return;
    setBusy(true); setError(null);
    try {
      const info = ElectionInfo.parse(await request('ballot', `/v1/elections/${poll.cryptoId}/manifest`));
      const manifest = Manifest.parse(JSON.parse(z.object({ description: z.string() }).parse(JSON.parse(info.electionRaw)).description));
      if (info.electionRaw !== poll.manifestRaw || await hash(info.electionRaw) !== info.manifestHash || !Object.entries(poll.content).every(([key, value]) => JSON.stringify(value) === JSON.stringify(Reflect.get(manifest, key)))) throw new Error('Текст питання не збігається із зафіксованою версією. Голосування заблоковано.');
      let encrypted = pending;
      if (encrypted === null) {
        const right = z.object({ credential: z.string(), manifestHash: z.string() }).parse(await request('identity', `/v1/credentials/${poll.cryptoId}`, 'POST', {}, auth.token));
        if (right.manifestHash !== info.manifestHash) throw new Error('Право участі належить іншому manifest.');
        encrypted = await encrypt(info.electionRaw, right.credential, choice);
        setPending(encrypted);
      }
      setAttempts(n => n + 1);
      const accepted = z.object({ accepted: z.literal(true), receipt: Envelope }).parse(await request('ballot', `/v1/elections/${poll.cryptoId}/ballots`, 'POST', { ballot: encrypted.ballot }));
      const verified = await verifyReceipt(accepted.receipt, info.checkpointPublicKey, poll.cryptoId, info.manifestHash, encrypted.tracker);
      setReceipt(accepted.receipt); setTracker(verified.tracker); setChoice(null); setPending(null); onAccepted();
    } catch (e) {
      if (e instanceof ApiFailure && e.message === 'FINAL_VOTE_ALREADY_CAST') { setAlreadyVoted(true); setPending(null); setChoice(null); }
      else { if (e instanceof ApiFailure && e.status >= 400 && e.status < 500) setPending(null); setError(e instanceof Error ? e.message : String(e)); }
    } finally { setBusy(false); }
  }
  if (alreadyVoted) return <div className="notice"><strong>За цим правом участі вже прийнято остаточний голос.</strong><p>Зміна провайдера або пристрою не дає другого голосу. Цей новий бюлетень відхилено. Для перевірки попереднього потрібен збережений tracker; відновлення права не відновлює його автоматично.</p></div>;
  if (receipt !== null && tracker !== null) return <div className="receipt"><h3>Голос прийнято</h3><p>Збережіть ID голосу, щоб потім перевірити, чи його враховано.</p><code>{tracker}</code><a className="button secondary" href="#/trust">Перевірити голос</a></div>;
  return <section className="vote-box"><h2>Ваша відповідь</h2><fieldset disabled={busy || pending !== null}><legend className="visually-hidden">Відповідь</legend>{Answers.map((answer, i) => <label className="choice" key={answer}><input type="radio" name="vote" checked={choice === i} onChange={() => setChoice(i)} />{answer}</label>)}</fieldset>
    <ErrorMessage message={error} />{error !== null && pending !== null && <p>Підтвердження приймання не отримано. Стан доставки невідомий; повтор надсилає той самий зашифрований бюлетень. Не закривайте сторінку.</p>}
    <button className="primary" disabled={choice === null || busy || attempts >= 3} onClick={() => void submit()}>{busy ? 'Надсилаємо…' : pending === null ? 'Проголосувати' : `Повторити (${attempts}/3)`}</button>
    {attempts >= 3 && <p>Ліміт трьох спроб вичерпано. Перевірте tracker зашифрованого бюлетеня: <code>{pending?.tracker}</code></p>}
  </section>;
}

function CompletedParticipation({ result, error }: { result: ResultType | null; error: string | null }) {
  if (result === null) return error === null ? <p role="status">Завантаження результатів…</p> : <ErrorMessage message={error} />;
  return <VoteSuccess answers={Answers} counts={result.counts} total={result.acceptedVotes} />;
}

export function Results({ pollId, result, error }: { pollId: string; result: ResultType | null; error: string | null }) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  async function audit() { try { const value = await request('ballot', `/v1/elections/${pollId}/audit`); download(`audit-${pollId}.json`, JSON.stringify(value, null, 2), 'application/json'); } catch (e) { setDownloadError(e instanceof Error ? e.message : String(e)); } }
  if (result === null) return error === null ? <section className="content-paper results"><p role="status">Завантаження результатів…</p></section> : <ErrorMessage message={error} />;
  return <section className="content-paper results"><h2>Результати голосування</h2><p className="results-total">Всього голосів: <strong>{result.acceptedVotes}</strong></p><div>{result.counts.map((count, i) => {
      const answer = Answers[i];
      if (answer === undefined) throw new Error('RESULT_ANSWER_MISMATCH');
      const share = percentage(count, result.acceptedVotes), tone = i === 0 ? 'positive' : i === 1 ? 'negative' : 'neutral';
      return <div className={`result-row result-row-${tone}`} key={answer}><div className="result-row-heading"><strong>{answer}</strong><span>{count} із {result.acceptedVotes}</span></div><div className="result-bar"><progress max={result.acceptedVotes === 0 ? 1 : result.acceptedVotes} value={count} aria-label={`${answer}: ${count} із ${result.acceptedVotes}, ${share}%`} /><span aria-hidden="true">{share}%</span></div></div>;
    })}</div>
    <div className="action-row"><button className="secondary" onClick={() => download('result-' + pollId + '.json', JSON.stringify(result, null, 2), 'application/json')}>Результат JSON</button><button className="secondary" onClick={() => download('result-' + pollId + '.csv', resultCsv(result), 'text/csv;charset=utf-8')}>Результат CSV</button><button className="secondary" onClick={() => void audit()}>Аудит-пакет</button></div>
    <ErrorMessage message={downloadError} /></section>;
}
