type VoteSuccessProps = {
  answers: readonly string[];
  counts: readonly number[];
  total: number;
};

export function VoteSuccess({ answers, counts, total }: VoteSuccessProps) {
  if (answers.length !== counts.length) throw new Error('VOTE_SUCCESS_RESULT_MISMATCH');
  return <div className="vote-success-surface">
    <div className="demand-success" role="status">
      <div className="demand-success-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
      <span className="demand-success-mark" aria-hidden="true">✓</span>
      <h2>Дякуємо за ваш голос.</h2>
    </div>
    <section className="demand-results" aria-label="Результати голосування">
      <p className="demand-results-total">Всього відповідей: <strong>{total}</strong></p>
      <dl>{answers.map((answer, index) => <div key={answer}><dt>{answer}</dt><dd>{counts[index]}</dd></div>)}</dl>
    </section>
  </div>;
}
