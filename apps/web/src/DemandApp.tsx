import { useEffect, useRef, useState } from 'react';
import { DemandChatRequest, demandFaqItems, demandGtmContainerId } from '../../../packages/domain/src/demand.ts';
import type { DemandAnswerType, DemandChatResponseType, DemandPollStatusType } from '../../../packages/domain/src/demand.ts';
import { DemandApiFailure, askDemandChat, loadDemandPoll, recordDemandResponse } from './demand-api.ts';
import {
  demandAnalyticsConsentKey,
  enableDemandAnalytics,
  trackDemandAnalytics,
} from './demand-analytics.ts';
import type { DemandAnalyticsConsent, DemandAnalyticsSection } from './demand-analytics.ts';
import openVoteMark from './assets/openvote-mark.svg';
import tarasAvatar from './assets/taras-avatar.png';
import walkthroughPoster from './assets/platform-walkthrough-poster.jpg';
import walkthroughVideo from './assets/platform-walkthrough.mp4';

const launchSupportGoal = 10_000;
const analyticsSections: DemandAnalyticsSection[] = ['problem', 'how-it-works', 'privacy', 'open-source', 'goal', 'demo', 'faq'];

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

function StepIcon({ step }: { step: 1 | 2 | 3 }) {
  if (step === 1) return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 8h18l6 6v26H12V8Z" /><path d="M30 8v8h8M18 24h12M18 31h8" /></svg>;
  if (step === 2) return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 10h32v22H24l-9 7v-7H8V10Z" /><path d="M16 19h16M16 25h11" /></svg>;
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 39V24h8v15M20 39V14h8v25M31 39V8h8v31M7 39h34" /></svg>;
}

export function DemandApp() {
  const [poll, setPoll] = useState<DemandPollStatusType | null>(null);
  const [selected, setSelected] = useState<DemandAnswerType | null>(null);
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
  const [chatGreetingVisible, setChatGreetingVisible] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState<DemandAnalyticsConsent | 'pending' | null>(null);
  const chatInput = useRef<HTMLTextAreaElement>(null);
  const chatMessages = useRef<HTMLDivElement>(null);
  const chatLauncher = useRef<HTMLButtonElement>(null);
  const chatInteracted = useRef(false);

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

  useEffect(() => {
    const saved = localStorage.getItem(demandAnalyticsConsentKey);
    if (saved === 'accepted') {
      enableDemandAnalytics(demandGtmContainerId);
      setAnalyticsConsent('accepted');
      return;
    }
    if (saved === 'rejected') {
      setAnalyticsConsent('rejected');
      return;
    }
    if (saved !== null) throw new Error('DEMAND_ANALYTICS_CONSENT_INVALID');
    setAnalyticsConsent('pending');
  }, []);

  useEffect(() => {
    if (analyticsConsent !== 'accepted') return;
    const mapped = new Map<Element, DemandAnalyticsSection>();
    for (const section of analyticsSections) {
      const element = document.getElementById(section);
      if (element === null) throw new Error('DEMAND_ANALYTICS_SECTION_MISSING');
      mapped.set(element, section);
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const section = mapped.get(entry.target);
        if (section === undefined) throw new Error('DEMAND_ANALYTICS_SECTION_UNKNOWN');
        trackDemandAnalytics({ name: 'section_view', section });
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.35 });
    for (const element of mapped.keys()) observer.observe(element);
    return () => { observer.disconnect(); };
  }, [analyticsConsent]);

  useEffect(() => {
    if (!chatOpen || chatMessages.current === null) return;
    chatMessages.current.scrollTop = chatMessages.current.scrollHeight;
  }, [chatBusy, chatError, chatHistory, chatOpen, pendingChatQuestion]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!chatInteracted.current) setChatGreetingVisible(true);
    }, 10_000);
    return () => { window.clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.demand-page');
    if (page === null) throw new Error('DEMAND_PAGE_MISSING');
    const sections = document.querySelectorAll<HTMLElement>('.demand-section');
    page.classList.add('demand-motion-ready');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('demand-section-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12 });
    for (const section of sections) observer.observe(section);
    return () => { observer.disconnect(); };
  }, []);

  async function submit() {
    if (selected === null || poll === null) return;
    setBusy(true); setError(null);
    try {
      const result = await recordDemandResponse(selected);
      setRecorded(result.answer);
      setPoll({ ...poll, response: { answer: result.answer }, results: result.results });
      setSelected(null);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function askQuestion() {
    const request = DemandChatRequest.safeParse({ question: chatQuestion });
    if (!request.success) return;
    setChatBusy(true); setChatError(null); setPendingChatQuestion(request.data.question); setChatQuestion('');
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
    }
  }

  function toggleChat() {
    const next = !chatOpen;
    setChatOpen(next);
    if (next) {
      chatInteracted.current = true;
      setChatGreetingVisible(false);
      trackDemandAnalytics({ name: 'taras_open' });
      requestAnimationFrame(() => chatInput.current?.focus());
    } else requestAnimationFrame(() => chatLauncher.current?.focus());
  }

  function acceptAnalytics() {
    localStorage.setItem(demandAnalyticsConsentKey, 'accepted');
    enableDemandAnalytics(demandGtmContainerId);
    setAnalyticsConsent('accepted');
  }

  function rejectAnalytics() {
    localStorage.setItem(demandAnalyticsConsentKey, 'rejected');
    setAnalyticsConsent('rejected');
  }

  const supportingResponses = poll === null ? null : poll.results.counts[0];
  const launchProgress = supportingResponses === null ? 0 : Math.min((supportingResponses / launchSupportGoal) * 100, 100);

  return <div className={`demand-page${analyticsConsent === 'pending' ? ' demand-page-consent-pending' : ''}`}>
    <a className="skip" href="#main">До основного вмісту</a>
    <header className="demand-header">
      <a className="brand" href="#top" aria-label="OpenVote, на початок сторінки"><span className="brand-mark" aria-hidden="true"><img src={openVoteMark} alt="" /></span><span>OpenVote<small>Чесно. Прозоро. Анонімно.</small></span></a>
      <a className="button primary" href="#poll" onClick={() => { trackDemandAnalytics({ name: 'support_launch_click', location: 'header' }); }}>Проголосувати</a>
    </header>
    <main id="main" className="demand-main">
      <section className="demand-hero" id="top">
        <div className="demand-hero-copy">
          <p className="demand-label">Волонтерський open source проєкт</p>
          <h1>Важливі питання не мають вирішуватися навмання.</h1>
          <p className="demand-lead">Ми створюємо OpenVote, волонтерську open source платформу, де громадяни України зможуть ставити питання, обговорювати їх, голосувати та бачити зрозумілу картину громадської думки.</p>
        </div>
        <section className="demand-poll-card demand-hero-poll" id="poll" aria-label="Опитування">
          {loading ? <p role="status">Завантаження опитування…</p> : poll === null ? <div className="notice error" role="alert">{error}</div> : <>
            {recorded !== null ? <div className="demand-success" role="status"><div className="demand-success-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div><span className="demand-success-mark" aria-hidden="true">✓</span><h2>Дякуємо за ваш голос.</h2></div> : <form onSubmit={event => { event.preventDefault(); void submit(); }}><fieldset disabled={busy}><legend>{poll.question}</legend><div className="demand-answers">{poll.answers.map(answer => <label className="choice" key={answer}><input type="radio" name="demand-answer" checked={selected === answer} onChange={() => setSelected(answer)} />{answer}</label>)}</div></fieldset>{error !== null && <p className="notice error" role="alert">{error}</p>}<button className="primary" type="submit" disabled={selected === null || busy}>{busy ? 'Надсилання…' : 'Проголосувати'}</button></form>}
            {recorded !== null && <section className="demand-results" aria-label="Результати голосування">
              <p className="demand-results-total">Всього відповідей: <strong>{poll.results.totalResponses}</strong></p>
              <dl>{poll.answers.map((answer, index) => <div key={answer}><dt>{answer}</dt><dd>{poll.results.counts[index]}</dd></div>)}</dl>
            </section>}
          </>}
        </section>
      </section>

      <section className="demand-section demand-problem" id="problem" aria-labelledby="problem-title" data-analytics-section>
        <div className="demand-split-heading"><h2 id="problem-title">Гучність не дорівнює громадській думці</h2><p>У соцмережах найпомітніші голоси не завжди представляють більшість. OpenVote допоможе винести конкретне питання на відкрите голосування та побачити зрозумілий результат.</p></div>
      </section>

      <section className="demand-section demand-how" id="how-it-works" aria-labelledby="how-title" data-analytics-section>
        <div className="demand-section-intro"><h2 id="how-title">Досить здогадок. Нехай люди скажуть самі.</h2></div>
        <div className="demand-feature-grid">
          <article><div className="demand-step-top"><StepIcon step={1} /></div><h3>Поставте питання</h3><p>Винесіть на голосування тему, яка потребує спільної відповіді.</p></article>
          <article><div className="demand-step-top"><StepIcon step={2} /></div><h3>Почуйте аргументи</h3><p>Обговоріть питання та ознайомтеся з думками інших людей.</p></article>
          <article><div className="demand-step-top"><StepIcon step={3} /></div><h3>Побачте результат</h3><p>Проголосуйте й отримайте зрозумілу картину громадської думки.</p></article>
        </div>
      </section>

      <section className="demand-section demand-privacy" id="privacy" aria-labelledby="privacy-title" data-analytics-section>
        <div><h2 id="privacy-title">Говорити правду має бути не страшно.</h2></div>
        <div><p className="demand-privacy-lead">Ми створюємо OpenVote так, щоб люди могли чесно висловлювати свою думку без страху, тиску чи небажаної уваги. Результати голосувань і опитувань завжди будуть відкритими і агрегованими.</p></div>
      </section>

      <section className="demand-section demand-open-source" id="open-source" aria-labelledby="open-source-title" data-analytics-section>
        <div><h2 id="open-source-title">Довіра народжується там, де нічого не приховують.</h2><p>OpenVote є безкоштовним волонтерським open source проєктом. Код, рішення й увесь процес розробки відкриті. Кожен може перевірити їх і долучитися до створення платформи.</p><a href="https://github.com/Lontkovsky/openvote">Переглянути код на GitHub <span aria-hidden="true">↗</span></a></div>
      </section>

      <section className="demand-section demand-goal" id="goal" aria-labelledby="goal-title" data-analytics-section>
        <div className="demand-goal-copy"><h2 id="goal-title">10 000 голосів можуть запустити OpenVote.</h2><p>Саме стільки підтримки ми хочемо зібрати, щоб підтвердити потребу в платформі та перейти до її повноцінного запуску. Кожен голос наближає нас до цієї мети.</p></div>
        {supportingResponses !== null && <div className="demand-goal-progress" aria-label={`${supportingResponses.toLocaleString('uk-UA')} із ${launchSupportGoal.toLocaleString('uk-UA')} голосів підтримки`}><div className="demand-goal-numbers"><strong>{supportingResponses.toLocaleString('uk-UA')}</strong><span>із {launchSupportGoal.toLocaleString('uk-UA')}</span></div><div className="demand-progress-track" aria-hidden="true"><span style={{ width: `${launchProgress}%` }} /></div><p>{supportingResponses < launchSupportGoal ? <>До мети: <strong>{(launchSupportGoal - supportingResponses).toLocaleString('uk-UA')}</strong></> : <strong>Мету досягнуто.</strong>}</p></div>}
      </section>

      <section className="demand-section demand-demo" id="demo" aria-labelledby="demo-title" data-analytics-section>
        <div className="demand-demo-heading"><h2 id="demo-title">Думаєте, ваш голос нічого не змінить?</h2><p>Подивіться, як OpenVote перетворює окремі відповіді на зрозумілу картину громадської думки.</p></div>
        <div className="demand-video-frame"><video controls muted playsInline preload="metadata" poster={walkthroughPoster} aria-label="Демонстрація створення питання, голосування та перегляду результату" onPlay={() => { trackDemandAnalytics({ name: 'video_start' }); }} onEnded={() => { trackDemandAnalytics({ name: 'video_complete' }); }}><source src={walkthroughVideo} type="video/mp4" />Не вдалося відтворити відео.</video></div>
      </section>

      <section className="demand-section demand-faq" id="faq" aria-labelledby="faq-title" data-analytics-section>
        <div className="demand-faq-heading"><h2 id="faq-title">У вас є питання. Ми відповідаємо відкрито.</h2><p>Тут зібрано найважливіше про OpenVote, голосування, приватність і поточний етап розробки.</p></div>
        <div className="demand-faq-list">
          {demandFaqItems.map((item, index) => <details key={item.question} onToggle={event => { if (event.currentTarget.open) trackDemandAnalytics({ name: 'faq_open', item: index + 1 }); }}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
        </div>
      </section>

      <section className="demand-section demand-final" aria-labelledby="final-title">
        <div><h2 id="final-title">OpenVote починається з тих, кому не байдуже.</h2><p>Підтримайте запуск платформи своїм голосом і допоможіть перетворити ідею на відкритий громадський інструмент.</p></div><a className="button demand-final-button" href="#poll" onClick={() => { trackDemandAnalytics({ name: 'support_launch_click', location: 'final' }); }}>Проголосувати</a>
      </section>
    </main>

    {chatOpen && <section className="demand-chat-panel" data-ai-chat id="demand-chat" role="dialog" aria-labelledby="demand-chat-title">
      <header className="demand-chat-header"><span className="demand-chat-avatar" aria-hidden="true"><img src={tarasAvatar} alt="" /></span><div><strong id="demand-chat-title">Тарас</strong></div><button type="button" aria-label="Закрити чат" onClick={toggleChat}>×</button></header>
      <div className="demand-chat-messages" ref={chatMessages} aria-live="polite">
        <article className="demand-chat-message assistant"><p>Привіт! Я Тарас. Ви можете запитати мене про все, що стосується OpenVote.</p></article>
        {chatHistory.map((item, index) => <div key={`${index}-${item.question}`}><article className="demand-chat-message user"><p>{item.question}</p></article><article className="demand-chat-message assistant"><p>{item.answer}</p></article></div>)}
        {pendingChatQuestion !== null && <article className="demand-chat-message user"><p>{pendingChatQuestion}</p></article>}
        {chatBusy && <article className="demand-chat-message assistant" role="status"><p>Тарас друкує…</p></article>}
        {chatError !== null && <p className="demand-chat-error" role="alert">{chatError}</p>}
      </div>
      <form className="demand-chat-composer" onSubmit={event => { event.preventDefault(); void askQuestion(); }}>
        <label className="visually-hidden" htmlFor="demand-ai-question">Повідомлення для Тараса</label>
        <textarea ref={chatInput} id="demand-ai-question" value={chatQuestion} rows={1} maxLength={400} disabled={chatBusy} onChange={event => setChatQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && DemandChatRequest.safeParse({ question: chatQuestion }).success && !chatBusy) { event.preventDefault(); void askQuestion(); } }} />
        <button className="primary" type="submit" aria-label="Надіслати повідомлення" disabled={!DemandChatRequest.safeParse({ question: chatQuestion }).success || chatBusy}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.2 20.4 3c.5-.2 1 .3.8.8L13 21.2c-.2.5-.9.5-1.1 0l-2.3-6.8-6.8-2.1c-.5-.2-.5-.9.2-1.1Zm7.3 2.1 2 5.7 6.5-13.8-8.5 8.1Z" /></svg></button>
      </form>
    </section>}
    {!chatOpen && (chatGreetingVisible
      ? <button ref={chatLauncher} className="demand-chat-greeting" type="button" aria-expanded="false" aria-controls="demand-chat" onClick={toggleChat}><span className="demand-chat-avatar demand-chat-greeting-avatar" aria-hidden="true"><img src={tarasAvatar} alt="" /></span><span>Привіт! Я Тарас. Ви можете запитати мене про все, що стосується OpenVote.</span></button>
      : <button ref={chatLauncher} className="demand-chat-launcher" type="button" aria-expanded="false" aria-controls="demand-chat" aria-label="Відкрити чат з Тарасом" onClick={toggleChat}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4.8 3.2A.75.75 0 0 1 6 19.6V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9h3v2.2l3.4-2.2H19V6H5Z" /></svg></button>)}

    <footer className="demand-footer">
      <div className="demand-footer-inner">
        <div className="demand-footer-brand"><a className="brand" href="#top"><span className="brand-mark" aria-hidden="true"><img src={openVoteMark} alt="" /></span><span>OpenVote<small>Чесно. Прозоро. Анонімно.</small></span></a></div>
        <nav aria-label="Навігація в підвалі"><a href="#how-it-works">Як це працює</a><a href="#faq">FAQ</a><a href="#goal">Мета: 10 000 голосів</a><a href="https://github.com/Lontkovsky/openvote">GitHub ↗</a></nav>
        <div className="demand-footer-notes"><span>Відкритий код AGPL-3.0</span><span>Не державний сервіс. Не офіційне голосування.</span></div>
      </div>
    </footer>

    {analyticsConsent === 'pending' && <aside className="demand-consent" role="dialog" aria-labelledby="analytics-consent-title" aria-describedby="analytics-consent-description">
      <div><h2 id="analytics-consent-title">Аналітичні cookies</h2><p id="analytics-consent-description">Дозволити збір статистики відвідування цього сайту?</p></div><div className="demand-consent-actions"><button className="secondary" type="button" onClick={rejectAnalytics}>Відмовитися</button><button className="primary" type="button" onClick={acceptAnalytics}>Дозволити</button></div>
    </aside>}
  </div>;
}
