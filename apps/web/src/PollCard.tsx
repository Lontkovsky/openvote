import { appHref } from './demo-mode.ts';

type PollCardProps = {
  id: string;
  question: string;
  context: string;
  category: string;
  stateLabel: string;
  opensAt: string;
  closesAt: string;
};

function dateTime(value: string): string {
  return new Date(value).toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function PollCard({ id, question, context, category, stateLabel, opensAt, closesAt }: PollCardProps) {
  return <article className="poll-card">
    <div className="card-top"><span className="category">{category}</span><span className="state">{stateLabel}</span></div>
    <h2>{question}</h2>
    {context !== '' && <p>{context}</p>}
    <div className="card-bottom"><span>Початок: {dateTime(opensAt)}</span><span>Дедлайн: {dateTime(closesAt)}</span></div>
    <a className="poll-card-details" href={appHref(`/poll/${id}`)} aria-label={`Відкрити опитування: ${question}`}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
  </article>;
}
