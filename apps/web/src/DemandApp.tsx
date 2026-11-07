import { useEffect, useState } from 'react';
import { demandFaqItems, demandGtmContainerId } from '../../../packages/domain/src/demand.ts';
import type { DemandAnswerType, DemandPollStatusType } from '../../../packages/domain/src/demand.ts';
import { DemandApiFailure, loadDemandPoll, recordDemandResponse } from './demand-api.ts';
import {
  enableDemandAnalytics,
  trackDemandAnalytics,
} from './demand-analytics.ts';
import type { DemandAnalyticsSection } from './demand-analytics.ts';
import { TarasChat } from './TarasChat.tsx';
import { VoteSuccess } from './VoteSuccess.tsx';
import openVoteMark from './assets/openvote-mark.svg';
import walkthroughPoster from './assets/platform-walkthrough-poster.jpg';
import walkthroughVideo from './assets/platform-walkthrough.mp4';

const launchSupportGoal = 10_000;
const analyticsSections: DemandAnalyticsSection[] = ['problem', 'how-it-works', 'privacy', 'open-source', 'goal', 'demo', 'faq'];
const heroPublicationQuotes = [
  '72% киян готові терпіти війну стільки, скільки буде потрібно.',
  '90% опитаних вважають важливим бути громадянином України.',
  '74% опитаних жінок не мають резервного джерела енергії.',
  '79% українців підтримують вступ України до Європейського Союзу.',
  '55% українців вважають, що в боротьбі з корупцією є позитивні зрушення.',
];
const heroPublicationSources = [
  {
    quote: heroPublicationQuotes[0],
    organization: 'КМІС',
    period: '12–21 вересня 2026',
    sample: '1002 дорослих загалом. 72% стосується Києва.',
    method: 'CATI, випадкова вибірка мобільних номерів',
    href: 'https://www.kiis.com.ua/?cat=reports&id=1639&lang=ukr&page=2',
  },
  {
    quote: heroPublicationQuotes[1],
    organization: 'Rating Group',
    period: '4–9 серпня 2026',
    sample: '2000 дорослих',
    method: 'CATI, випадкова вибірка мобільних номерів',
    href: 'https://www.ratinggroup.ua/news/socpol-aug2026-2',
  },
  {
    quote: heroPublicationQuotes[2],
    organization: 'Rating Group і Voluntas на замовлення UN Women',
    period: '25–26 лютого 2026',
    sample: '1200 дорослих',
    method: 'CATI',
    href: 'https://www.ratinggroup.ua/news/energy-genderdiff-2025-2026-news',
  },
  {
    quote: heroPublicationQuotes[3],
    organization: 'Rating Group для IRI',
    period: '30 травня – 3 червня 2026',
    sample: '2404 дорослих',
    method: 'CATI',
    href: 'https://www.ratinggroup.ua/news/iri-jun2026',
  },
  {
    quote: heroPublicationQuotes[4],
    organization: 'КМІС',
    period: '8–16 жовтня 2026',
    sample: '1031 дорослий',
    method: 'CATI, випадкова вибірка мобільних номерів',
    href: 'https://www.kiis.com.ua/?cat=reports&id=1645&lang=ukr&page=1.Kyiv',
  },
];

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
  const [chatOpen, setChatOpen] = useState(false);
  const [activeHeroQuote, setActiveHeroQuote] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveHeroQuote(current => (current + 1) % heroPublicationQuotes.length);
    }, 8_000);
    return () => { window.clearInterval(interval); };
  }, []);

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
    enableDemandAnalytics(demandGtmContainerId);
  }, []);

  useEffect(() => {
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

  const supportingResponses = poll === null ? null : poll.results.counts[0];
  const launchProgress = supportingResponses === null ? 0 : Math.min((supportingResponses / launchSupportGoal) * 100, 100);

  return <div className="demand-page">
    <a className="skip" href="#main">До основного вмісту</a>
    <header className="demand-header">
      <a className="brand" href="#top" aria-label="OpenVote, на початок сторінки"><span className="brand-mark" aria-hidden="true"><img src={openVoteMark} alt="" /></span><span>OpenVote 🇺🇦<small>Чесно. Прозоро. Анонімно.</small></span></a>
      <div className="demand-header-actions">
        <a className="button secondary demand-demo-link" href="/demo/" target="_blank" rel="noreferrer">Демо платформи</a>
        <a className="button primary" href="#poll" onClick={() => { trackDemandAnalytics({ name: 'support_launch_click', location: 'header' }); }}>Проголосувати</a>
      </div>
    </header>
    <main id="main" className="demand-main">
      <section className="demand-hero" id="top">
        <div className="demand-hero-copy">
          <div className="demand-hero-quote-slider">
            <blockquote className="demand-hero-quote" key={activeHeroQuote} aria-live="polite">{heroPublicationQuotes[activeHeroQuote]}</blockquote>
            <div className="demand-hero-quote-dots" aria-label="Цитати з публікацій">
              {heroPublicationQuotes.map((quote, index) => <button key={quote} type="button" aria-label={`Показати цитату ${index + 1}`} aria-pressed={activeHeroQuote === index} onClick={() => { setActiveHeroQuote(index); }} />)}
            </div>
          </div>
          <h1>А вас питали?</h1>
          <p className="demand-lead">Як саме проводилось опитування і як рахували результат, невідомо. Але такі цифри все рівно публікують і поширюють у ЗМІ.<span className="demand-lead-paragraph">Саме тому ми створюємо <strong className="demand-lead-brand">OpenVote</strong>, щоб кожен міг проголосувати, створити власне опитування і побачити чесний і реальний результат.</span></p>
        </div>
        <section className="demand-poll-card demand-hero-poll" id="poll" aria-label="Опитування">
          {loading ? <p role="status">Завантаження опитування…</p> : poll === null ? <div className="notice error" role="alert">{error}</div> : <>
            {recorded !== null ? <VoteSuccess answers={poll.answers} counts={poll.results.counts} total={poll.results.totalResponses} /> : <form onSubmit={event => { event.preventDefault(); void submit(); }}><fieldset disabled={busy}><legend>{poll.question}</legend><div className="demand-answers">{poll.answers.map(answer => <label className="choice" key={answer}><input type="radio" name="demand-answer" checked={selected === answer} onChange={() => setSelected(answer)} />{answer}</label>)}</div></fieldset>{error !== null && <p className="notice error" role="alert">{error}</p>}<button className="primary" type="submit" disabled={selected === null || busy}>{busy ? 'Надсилання…' : 'Проголосувати'}</button></form>}
          </>}
        </section>
      </section>

      <section className="demand-section demand-problem" id="problem" aria-labelledby="problem-title" data-analytics-section>
        <div className="demand-source-heading"><h2 id="problem-title">Покажіть, звідки взялися ці відсотки.</h2><p>Відсоток без дати, вибірки й методики неможливо перевірити. Ось що стоїть за п’ятьма цитатами, які ви щойно побачили.</p></div>
        <div className="demand-source-grid">
          {heroPublicationSources.map((source, index) => <article className={`demand-source-card${index === 0 ? ' demand-source-card-featured' : ''}`} key={source.quote}>
            <p className="demand-source-quote">{source.quote}</p>
            <dl className="demand-source-meta">
              <div><dt>Хто</dt><dd>{source.organization}</dd></div>
              <div><dt>Коли</dt><dd>{source.period}</dd></div>
              <div><dt>Вибірка</dt><dd>{source.sample}</dd></div>
              <div><dt>Метод</dt><dd>{source.method}</dd></div>
            </dl>
            <a href={source.href} target="_blank" rel="noreferrer">Перевірити першоджерело <span aria-hidden="true">↗</span></a>
          </article>)}
        </div>
      </section>

      <section className="demand-section demand-how" id="how-it-works" aria-labelledby="how-title" data-analytics-section>
        <div className="demand-section-intro"><h2 id="how-title">Ніхто не має говорити за людей. Запитайте їх напряму.</h2></div>
        <div className="demand-feature-grid">
          <article><div className="demand-step-top"><StepIcon step={1} /></div><h3>Поставте питання</h3><p>Винесіть на голосування тему, про яку всі говорять, але ніхто не запитує людей напряму.</p></article>
          <article><div className="demand-step-top"><StepIcon step={2} /></div><h3>Почуйте людей</h3><p>Дайте кожному висловитися, проголосувати, побачити аргументи й зробити власний вибір.</p></article>
          <article><div className="demand-step-top"><StepIcon step={3} /></div><h3>Побачте результат</h3><p>Отримайте відкритий підрахунок без чужих трактувань і вирваних із контексту відсотків.</p></article>
        </div>
      </section>

      <section className="demand-section demand-privacy" id="privacy" aria-labelledby="privacy-title" data-analytics-section>
        <div className="demand-privacy-heading"><h2 id="privacy-title">Говорити правду має бути просто.</h2><p className="demand-privacy-lead">Люди часто мовчать не тому, що їм нічого сказати. Вони бояться осуду, тиску або небажаної уваги. OpenVote створюється, щоб кожен міг відповісти чесно, а всі бачили спільний результат, а не вибір конкретної людини.</p></div>
      </section>

      <section className="demand-section demand-open-source" id="open-source" aria-labelledby="open-source-title" data-analytics-section>
        <div><h2 id="open-source-title">Довіра народжується там, де нічого не приховують.</h2><p>Нас надто часто просять повірити готовим цифрам, не показуючи, як їх отримали. В OpenVote код, правила й процес розробки відкриті. Кожен зможе побачити, як працює платформа і звідки береться результат.</p><a href="https://github.com/Lontkovsky/openvote">Переглянути код на GitHub <span aria-hidden="true">↗</span></a></div>
      </section>

      <section className="demand-section demand-goal" id="goal" aria-labelledby="goal-title" data-analytics-section>
        <div className="demand-goal-copy"><h2 id="goal-title">10 000 голосів покажуть, що OpenVote справді потрібен.</h2><p>Нам не потрібні припущення про те, чи варто створювати платформу. Ми запитуємо людей напряму. Коли OpenVote підтримають 10 000 людей, це стане чітким сигналом переходити від ідеї до повноцінного запуску.</p></div>
        {supportingResponses !== null && <div className="demand-goal-progress" aria-label={`${supportingResponses.toLocaleString('uk-UA')} із ${launchSupportGoal.toLocaleString('uk-UA')} голосів підтримки`}><div className="demand-goal-numbers"><strong>{supportingResponses.toLocaleString('uk-UA')}</strong><span>із {launchSupportGoal.toLocaleString('uk-UA')}</span></div><div className="demand-progress-track" aria-hidden="true"><span style={{ width: `${launchProgress}%` }} /></div><p>{supportingResponses < launchSupportGoal ? <>До мети: <strong>{(launchSupportGoal - supportingResponses).toLocaleString('uk-UA')}</strong></> : <strong>Мету досягнуто.</strong>}</p></div>}
      </section>

      <section className="demand-section demand-demo" id="demo" aria-labelledby="demo-title" data-analytics-section>
        <div className="demand-demo-heading"><h2 id="demo-title">Думаєте, ваш голос нічого не змінить?</h2><p>Окремий голос легко не помітити. Тисячі чесних відповідей уже неможливо замінити чужими припущеннями. Подивіться, як OpenVote перетворює голоси людей на відкритий і зрозумілий результат.</p></div>
        <div className="demand-video-frame"><video controls muted playsInline preload="metadata" poster={walkthroughPoster} aria-label="Демонстрація створення питання, голосування та перегляду результату" onPlay={() => { trackDemandAnalytics({ name: 'video_start' }); }} onEnded={() => { trackDemandAnalytics({ name: 'video_complete' }); }}><source src={walkthroughVideo} type="video/mp4" />Не вдалося відтворити відео.</video></div>
      </section>

      <section className="demand-section demand-faq" id="faq" aria-labelledby="faq-title" data-analytics-section>
        <div className="demand-faq-heading"><h2 id="faq-title">Поширені питання і відповіді.</h2></div>
        <div className="demand-faq-list">
          {demandFaqItems.map((item, index) => <details key={item.question} onToggle={event => { if (event.currentTarget.open) trackDemandAnalytics({ name: 'faq_open', item: index + 1 }); }}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
        </div>
      </section>

      <section className="demand-section demand-final" aria-labelledby="final-title">
        <div><h2 id="final-title">Вас не питали? Тоді скажіть самі.</h2><p>Проголосуйте за створення OpenVote. Ваш голос покаже, що людям потрібна відкрита платформа, де їхню думку не вигадують за них, а запитують напряму.</p></div><a className="button demand-final-button" href="#poll" onClick={() => { trackDemandAnalytics({ name: 'support_launch_click', location: 'final' }); }}>Проголосувати</a>
      </section>
    </main>

    <TarasChat open={chatOpen} onOpenChange={setChatOpen} onOpened={() => { trackDemandAnalytics({ name: 'taras_open' }); }} />

    <footer className="demand-footer">
      <div className="demand-footer-inner">
        <div className="demand-footer-brand"><a className="brand" href="#top"><span className="brand-mark" aria-hidden="true"><img src={openVoteMark} alt="" /></span><span>OpenVote<small>Чесно. Прозоро. Анонімно.</small></span></a></div>
        <nav aria-label="Навігація в підвалі"><a href="#how-it-works">Як це працює</a><a href="#faq">FAQ</a><a href="#goal">Мета: 10 000 голосів</a><a href="https://github.com/Lontkovsky/openvote">GitHub ↗</a></nav>
        <div className="demand-footer-notes"><span>Відкритий код AGPL-3.0</span><span>Не державний сервіс. Не офіційне голосування.</span></div>
      </div>
    </footer>

  </div>;
}
