import { useEffect, useRef, useState } from 'react';
import { DemandChatRequest } from '../../../packages/domain/src/demand.ts';
import type { DemandChatResponseType } from '../../../packages/domain/src/demand.ts';
import { DemandApiFailure, askDemandChat } from './demand-api.ts';
import tarasAvatar from './assets/taras-avatar.png';

type TarasChatProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened?: () => void;
  prepare?: () => Promise<unknown>;
};

export function TarasChat({ open, onOpenChange, onOpened, prepare }: TarasChatProps) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [greetingVisible, setGreetingVisible] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const interacted = useRef(false);
  const prepared = useRef(false);
  const previouslyOpen = useRef(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!interacted.current) setGreetingVisible(true);
    }, 10_000);
    return () => { window.clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (open) {
      interacted.current = true;
      setGreetingVisible(false);
      if (!previouslyOpen.current) onOpened?.();
      requestAnimationFrame(() => input.current?.focus());
    } else if (previouslyOpen.current) {
      requestAnimationFrame(() => launcher.current?.focus());
    }
    previouslyOpen.current = open;
  }, [onOpened, open]);

  useEffect(() => {
    if (!open || messages.current === null) return;
    messages.current.scrollTop = messages.current.scrollHeight;
  }, [busy, error, history, open, pendingQuestion]);

  async function askQuestion() {
    const request = DemandChatRequest.safeParse({ question });
    if (!request.success) return;
    setBusy(true);
    setError(null);
    setPendingQuestion(request.data.question);
    setQuestion('');
    try {
      if (!prepared.current && prepare !== undefined) {
        await prepare();
        prepared.current = true;
      }
      const result: DemandChatResponseType = await askDemandChat(request.data.question);
      setHistory(current => [...current, { question: request.data.question, answer: result.answer }]);
    } catch (reason) {
      setQuestion(request.data.question);
      setError(reason instanceof DemandApiFailure && reason.message === 'AI_RATE_LIMITED'
        ? 'Ліміт запитань вичерпано. Спробуйте пізніше.'
        : 'Не вдалося отримати відповідь. Спробуйте ще раз.');
    } finally {
      setPendingQuestion(null);
      setBusy(false);
    }
  }

  function toggle() {
    onOpenChange(!open);
  }

  return <>
    {open && <section className="demand-chat-panel" data-ai-chat id="demand-chat" role="dialog" aria-labelledby="demand-chat-title">
      <header className="demand-chat-header"><span className="demand-chat-avatar" aria-hidden="true"><img src={tarasAvatar} alt="" /></span><div><strong id="demand-chat-title">Тарас</strong></div><button type="button" aria-label="Закрити чат" onClick={toggle}>×</button></header>
      <div className="demand-chat-messages" ref={messages} aria-live="polite">
        <article className="demand-chat-message assistant"><p>Привіт! Я Тарас. Ви можете запитати мене про все, що стосується OpenVote.</p></article>
        {history.map((item, index) => <div key={`${index}-${item.question}`}><article className="demand-chat-message user"><p>{item.question}</p></article><article className="demand-chat-message assistant"><p>{item.answer}</p></article></div>)}
        {pendingQuestion !== null && <article className="demand-chat-message user"><p>{pendingQuestion}</p></article>}
        {busy && <article className="demand-chat-message assistant" role="status"><p>Тарас друкує…</p></article>}
        {error !== null && <p className="demand-chat-error" role="alert">{error}</p>}
      </div>
      <form className="demand-chat-composer" onSubmit={event => { event.preventDefault(); void askQuestion(); }}>
        <label className="visually-hidden" htmlFor="demand-ai-question">Повідомлення для Тараса</label>
        <textarea ref={input} id="demand-ai-question" value={question} rows={1} maxLength={400} disabled={busy} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && DemandChatRequest.safeParse({ question }).success && !busy) { event.preventDefault(); void askQuestion(); } }} />
        <button className="primary" type="submit" aria-label="Надіслати повідомлення" disabled={!DemandChatRequest.safeParse({ question }).success || busy}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.2 20.4 3c.5-.2 1 .3.8.8L13 21.2c-.2.5-.9.5-1.1 0l-2.3-6.8-6.8-2.1c-.5-.2-.5-.9.2-1.1Zm7.3 2.1 2 5.7 6.5-13.8-8.5 8.1Z" /></svg></button>
      </form>
    </section>}
    {!open && (greetingVisible
      ? <button ref={launcher} className="demand-chat-greeting" type="button" aria-expanded="false" aria-controls="demand-chat" onClick={toggle}><span className="demand-chat-avatar demand-chat-greeting-avatar" aria-hidden="true"><img src={tarasAvatar} alt="" /></span><span>Привіт! Я Тарас. Ви можете запитати мене про все, що стосується OpenVote.</span></button>
      : <button ref={launcher} className="demand-chat-launcher" type="button" aria-expanded="false" aria-controls="demand-chat" aria-label="Відкрити чат з Тарасом" onClick={toggle}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4.8 3.2A.75.75 0 0 1 6 19.6V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9h3v2.2l3.4-2.2H19V6H5Z" /></svg></button>)}
  </>;
}
