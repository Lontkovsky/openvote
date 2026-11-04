import { useEffect, useRef, useState } from 'react';
import { DemandChatRequest, demandFaqIntro, demandFaqItems } from '../../../packages/domain/src/demand.ts';
import type { DemandAnswerType, DemandChatResponseType, DemandPollStatusType } from '../../../packages/domain/src/demand.ts';
import { DemandApiFailure, askDemandChat, loadDemandPoll, recordDemandResponse } from './demand-api.ts';
import openVoteMark from './assets/openvote-mark.svg';
import walkthroughPoster from './assets/platform-walkthrough-poster.jpg';
import walkthroughVideo from './assets/platform-walkthrough.mp4';

const launchSupportGoal = 10_000;

function errorText(error: unknown): string {
  if (error instanceof DemandApiFailure) {
    if (error.message === 'FINAL_RESPONSE_ALREADY_RECORDED') return 'Попередню остаточну відповідь уже прийнято. Нову відповідь не прийнято.';
    if (error.message === 'DEMAND_CREDENTIAL_REQUIRED') return 'Не вдалося підтвердити сесію. Відповідь не надіслано.';
    if (error.message === 'INVALID_DEMAND_CREDENTIAL') return 'Не вдалося підтвердити сесію. Відповідь не надіслано.';
    if (error.message === 'ORIGIN_REJECTED') return 'Не вдалося перевірити запит. Відповідь не надіслано.';
    return 'Не вдалося прийняти відповідь. Спробуйте ще раз.';
  }
  return 'Відповідь не надіслано. Спробуйте ще раз.';
}

export function DemandApp() {
  const [poll, setPoll] = useState<DemandPollStatusType | null>(null);
  const [selected, setSelected] = useState<DemandAnswerType | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [recorded, setRecorded] = useState<DemandAnswerType | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const [pendingChatQuestion, setPendingChatQuestion] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const chatInput = useRef<HTMLTextAreaElement>(null);
  const chatMessages = useRef<HTMLDivElement>(null);
  const chatLauncher = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    loadDemandPoll().then(value => {
      if (!active) return;
      setPoll(value);
      setRecorded(value.response === null ? null : value.response.answer);
    }).catch((reason: unknown) => { if (active) setError(errorText(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submit() {
    if (selected === null || !confirmed || poll === null) return;
    setBusy(true); setError(null);
    try {
      const result = await recordDemandResponse(selected);
      setRecorded(result.answer);
      setPoll({ ...poll, response: { answer: result.answer }, results: result.results });
      setSelected(null); setConfirmed(false);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function askQuestion() {
    const request = DemandChatRequest.safeParse({ question: chatQuestion });
    if (!request.success) return;
    setChatBusy(true); setChatError(null); setPendingChatQuestion(request.data.question); setChatQuestion('');
    requestAnimationFrame(() => { if (chatMessages.current !== null) chatMessages.current.scrollTop = chatMessages.current.scrollHeight; });
    try {
      const result: DemandChatResponseType = await askDemandChat(request.data.question);
      setChatHistory(history => [...history, { question: request.data.question, answer: result.answer }]);
    } catch (reason) {
      setChatQuestion(request.data.question);
      setChatError(reason instanceof DemandApiFailure && reason.message === 'AI_RATE_LIMITED'
        ? 'Ліміт запитань вичерпано. Спробуйте пізніше.'
        : 'Не вдалося отримати відповідь. Спробуйте ще раз.');
    } finally {
      setPendingChatQuestion(null);
      setChatBusy(false);
      requestAnimationFrame(() => { if (chatMessages.current !== null) chatMessages.current.scrollTop = chatMessages.current.scrollHeight; });
    }
  }

  function toggleChat() {
    setChatOpen(open => {
      const next = !open;
      if (next) requestAnimationFrame(() => chatInput.current?.focus());
      else requestAnimationFrame(() => chatLauncher.current?.focus());
      return next;
    });
  }

  const supportingResponses = poll === null ? null : poll.results.counts[0];

  return <div className="demand-page">
    <a className="skip" href="#main">До основного вмісту</a>
    <header className="demand-header">
      <a className="brand" href="#top" aria-label="OpenVote — на початок сторінки"><span className="brand-mark" aria-hidden="true"><img src={openVoteMark} alt="" /></span><span>OpenVote<small>Чесно. Прозоро. Анонімно.</small></span></a>
      <a className="button primary" href="#poll">Проголосувати</a>
    </header>
    <main id="main" className="demand-main">
      <section className="demand-hero" id="top">
        <div className="demand-hero-copy"><h1>Чи потрібна вам відкрита платформа громадських голосувань?</h1><p className="demand-lead">Ми розробляємо платформу, де можна буде брати участь у відкритих голосуваннях і розміщувати власні. Допоможіть зрозуміти, чи потрібна вам така платформа.</p><p className="demand-citizen-statement">Платформа від громадян України — для голосувань громадянами України.</p>{supportingResponses !== null && <aside className="demand-launch-goal" aria-labelledby="demand-launch-goal-title"><p className="eyebrow" id="demand-launch-goal-title">МЕТА ЗАПУСКУ</p><p className="demand-launch-goal-target"><strong>{supportingResponses.toLocaleString('uk-UA')}</strong> із {launchSupportGoal.toLocaleString('uk-UA')} голосів «Підтримую»</p>{supportingResponses < launchSupportGoal ? <><p className="demand-launch-goal-note">Коли досягнемо мети, запустимо повну платформу.</p><p className="demand-launch-goal-status">До мети: <strong>{(launchSupportGoal - supportingResponses).toLocaleString('uk-UA')}</strong></p></> : <p className="demand-launch-goal-status"><strong>Мету досягнуто. Запускаємо OpenVote.</strong></p>}</aside>}</div>
        <section className="demand-poll-card demand-hero-poll" id="poll" aria-label="Опитування">
          {loading ? <p role="status">Завантаження опитування…</p> : poll === null ? <div className="notice error" role="alert">{error}</div> : <>
            {recorded !== null ? <div className="demand-success" role="status"><span aria-hidden="true">✓</span><h2>Дякуємо за ваш голос.</h2></div> : <form onSubmit={event => { event.preventDefault(); void submit(); }}><fieldset disabled={busy}><legend>{poll.question}</legend><div className="demand-answers">{poll.answers.map(answer => <label className="choice" key={answer}><input type="radio" name="demand-answer" checked={selected === answer} onChange={() => { setSelected(answer); setConfirmed(false); }} />{answer}</label>)}</div></fieldset>{selected !== null && <label className="choice demand-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Підтверджую вибір: «{selected}».</label>}{error !== null && <p className="notice error" role="alert">{error}</p>}<button className="primary" type="submit" disabled={selected === null || !confirmed || busy}>{busy ? 'Надсилання…' : 'Надіслати відповідь'}</button></form>}
            <section className="demand-results" aria-labelledby="demand-results-title">
              <h3 id="demand-results-title">Поточні результати</h3>
              <p className="demand-results-total">Всього відповідей: <strong>{poll.results.totalResponses}</strong></p>
              <dl>{poll.answers.map((answer, index) => <div key={answer}><dt>{answer}</dt><dd>{poll.results.counts[index]}</dd></div>)}</dl>
            </section>
          </>}
        </section>
      </section>

      <section className="demand-about" id="about" aria-labelledby="about-title"><div className="demand-section-heading"><p className="eyebrow">ЩО МИ РОЗРОБЛЯЄМО</p><h2 id="about-title">Місце для відкритих громадських питань</h2><p>Мета повної платформи — дати людям зрозумілий спосіб ставити питання, брати участь і перевіряти оприлюднені результати.</p></div><div className="demand-feature-grid"><article><span>01</span><h3>Розміщувати питання</h3><p>Автори зможуть пропонувати громадські, соціальні, економічні, культурні та інші теми.</p></article><article><span>02</span><h3>Брати участь</h3><p>Учасники зможуть прочитати контекст і зробити остаточний вибір за відкритими правилами.</p></article><article><span>03</span><h3>Перевіряти результат</h3><p>Оприлюднений підсумок матиме зрозумілу базу розрахунку й матеріали для публічної перевірки.</p></article></div></section>

      <section className="demand-demo" id="demo" aria-labelledby="demo-title">
        <div className="demand-demo-heading"><h2 id="demo-title">Як працює платформа</h2></div>
        <div className="demand-demo-grid">
          <div className="demand-video-frame"><video controls muted playsInline preload="metadata" poster={walkthroughPoster} aria-label="Демонстрація створення питання, голосування та перегляду результату"><source src={walkthroughVideo} type="video/mp4" />Не вдалося відтворити відео.</video></div>
          <ol className="demand-demo-steps" aria-label="Етапи роботи платформи" role="list"><li><span>01</span><div><h3>Створити питання</h3><p>Додати контекст, аргументи та правила участі.</p></div></li><li><span>02</span><div><h3>Проголосувати</h3><p>Ознайомитися з умовами й підтвердити остаточний вибір.</p></div></li><li><span>03</span><div><h3>Перевірити результат</h3><p>Побачити підсумок і матеріали для публічної перевірки.</p></div></li></ol>
        </div>
      </section>

      <section className="demand-privacy" id="privacy" aria-labelledby="privacy-title"><div><p className="eyebrow">ПРИВАТНІСТЬ</p><h2 id="privacy-title">Без документів і контактних даних</h2></div><div><p>Для участі не потрібні ПІБ, РНОКПП, документи, email або номер телефону. Відповідь не пов’язується з іменем або контактними даними.</p><p>Участь добровільна. Опитування не перевіряє особу, громадянство або унікальність учасників, тому результат показує відповіді учасників цього опитування, а не думку українців загалом.</p></div></section>

      <section className="demand-faq" id="faq" aria-labelledby="faq-title">
        <div className="demand-faq-heading"><h2 id="faq-title">Питання і відповіді</h2><p>{demandFaqIntro}</p></div>
        <div className="demand-faq-list">
          {demandFaqItems.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
        </div>
      </section>
    </main>
    {chatOpen && <section className="demand-chat-panel" data-ai-chat id="demand-chat" role="dialog" aria-labelledby="demand-chat-title">
      <header className="demand-chat-header"><span className="demand-chat-avatar" aria-hidden="true">Т</span><div><strong id="demand-chat-title">Тарас</strong></div><button type="button" aria-label="Закрити чат" onClick={toggleChat}>×</button></header>
      <div className="demand-chat-messages" ref={chatMessages} aria-live="polite">
        <article className="demand-chat-message assistant"><span aria-hidden="true">Т</span><p>Привіт! Я Тарас. Запитайте мене про OpenVote.</p></article>
        {chatHistory.map((item, index) => <div key={`${index}-${item.question}`}><article className="demand-chat-message user"><p>{item.question}</p></article><article className="demand-chat-message assistant"><span aria-hidden="true">Т</span><p>{item.answer}</p></article></div>)}
        {pendingChatQuestion !== null && <article className="demand-chat-message user"><p>{pendingChatQuestion}</p></article>}
        {chatBusy && <article className="demand-chat-message assistant" role="status"><span aria-hidden="true">Т</span><p>Тарас друкує…</p></article>}
        {chatError !== null && <p className="demand-chat-error" role="alert">{chatError}</p>}
      </div>
      <form className="demand-chat-composer" onSubmit={event => { event.preventDefault(); void askQuestion(); }}>
        <label className="visually-hidden" htmlFor="demand-ai-question">Повідомлення для Тараса</label>
        <textarea ref={chatInput} id="demand-ai-question" value={chatQuestion} rows={1} maxLength={400} disabled={chatBusy} onChange={event => setChatQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && DemandChatRequest.safeParse({ question: chatQuestion }).success && !chatBusy) { event.preventDefault(); void askQuestion(); } }} />
        <button className="primary" type="submit" aria-label="Надіслати повідомлення" disabled={!DemandChatRequest.safeParse({ question: chatQuestion }).success || chatBusy}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.2 20.4 3c.5-.2 1 .3.8.8L13 21.2c-.2.5-.9.5-1.1 0l-2.3-6.8-6.8-2.1c-.5-.2-.5-.9.2-1.1Zm7.3 2.1 2 5.7 6.5-13.8-8.5 8.1Z" /></svg></button>
      </form>
    </section>}
    <button ref={chatLauncher} className="demand-chat-launcher" type="button" aria-expanded={chatOpen} aria-controls="demand-chat" aria-label={chatOpen ? 'Закрити чат з Тарасом' : 'Відкрити чат з Тарасом'} onClick={toggleChat}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4.8 3.2A.75.75 0 0 1 6 19.6V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9h3v2.2l3.4-2.2H19V6H5Z" /></svg></button>
    <footer><span>OpenVote · Відкритий код AGPL-3.0</span><span>Не державний сервіс. Не офіційне голосування.</span><a href="https://github.com/Lontkovsky/openvote">GitHub ↗</a></footer>
  </div>;
}
