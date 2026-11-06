import { useState } from 'react';
import { z } from 'zod';
import type { ResultType } from '../../../packages/domain/src/index.ts';
import { checkVoteIdInclusion } from './crypto.ts';
import { checkDemoVoteId } from './demo-api.ts';
import type { ElectionStateType } from './crypto.ts';
import { Results, stateNames } from './PollPage.tsx';
import { PollCard } from './PollCard.tsx';

type VerificationResult =
  | { kind: 'success'; title: string; pollId: string; question: string; context: string; category: string; opensAt: string; closesAt: string; state: ElectionStateType; result: ResultType | null }
  | { kind: 'missing' | 'error'; title: string; message: string };

export function VerificationPage({ demo = false }: { demo?: boolean }) {
  const [voteId, setVoteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  async function verify() {
    setBusy(true);
    setResult(null);
    try {
      const verification = demo ? checkDemoVoteId(voteId) : await checkVoteIdInclusion(voteId);
      setResult(verification.included
        ? { kind: 'success', title: 'Голос враховано', pollId: verification.pollId, question: verification.question, context: verification.context, category: verification.category, opensAt: verification.opensAt, closesAt: verification.closesAt, state: verification.state, result: verification.result }
        : { kind: 'missing', title: 'Голос не знайдено', message: 'Голосу з таким ID немає серед прийнятих бюлетенів.' });
    } catch (error) {
      setResult({
        kind: 'error',
        title: 'Перевірку не завершено',
        message: error instanceof z.ZodError ? 'ID голосу має неправильний формат.' : 'Не вдалося перевірити ID голосу. Спробуйте ще раз.',
      });
    } finally {
      setBusy(false);
    }
  }

  return <section className="verification-page">
    <h1>Перевірте свій голос</h1>
    <form className="content-paper verification-form" onSubmit={event => { event.preventDefault(); void verify(); }}>
      <label className="visually-hidden" htmlFor="verification-vote-id">ID голосу</label>
      <input id="verification-vote-id" value={voteId} placeholder="Введіть ID голосу" spellCheck={false} autoComplete="off" onChange={event => { setVoteId(event.target.value); setResult(null); }} />
      <button className="primary" type="submit" disabled={voteId === '' || busy}>{busy ? 'Перевіряємо…' : 'Перевірити'}</button>
    </form>
    {result !== null && <>
      {result.kind === 'success' ? <section className="verification-match" aria-labelledby="verification-match-title"><h2 id="verification-match-title" role="status">{result.title}</h2><PollCard id={result.pollId} question={result.question} context={result.context} category={result.category} stateLabel={stateNames[result.state]} opensAt={result.opensAt} closesAt={result.closesAt} /></section> : <div className={`verification-result ${result.kind}`} role={result.kind === 'error' ? 'alert' : 'status'}><h2>{result.title}</h2><p>{result.message}</p></div>}
      {result.kind === 'success' && result.result !== null && <Results pollId={result.result.pollId} result={result.result} error={null} />}
    </>}
  </section>;
}
