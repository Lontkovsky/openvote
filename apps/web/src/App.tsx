import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { Poll } from '../../../packages/domain/src/index.ts';
import type { PollType } from '../../../packages/domain/src/index.ts';
import { demandFaqItems } from '../../../packages/domain/src/demand.ts';
import { request } from './api.ts';
import { loadDemandPoll } from './demand-api.ts';
import { PollPage, stateNames } from './PollPage.tsx';
import { PollCard } from './PollCard.tsx';
import { Identity } from './Identity.tsx';
import { DraftEditor, MyPolls, ReviewQueue } from './Workspace.tsx';
import { CategorySelect } from './CategorySelect.tsx';
import { TarasChat } from './TarasChat.tsx';
import { VerificationPage } from './Verification.tsx';
import { appHref, currentAppRoute, navigateApp } from './demo-mode.ts';
import openVoteMark from './assets/openvote-mark.svg';

function PollDrawer({ children, label, onDismiss }: { children: ReactNode; label: string; onDismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const current = dialog.current;
    document.body.classList.add('drawer-open');
    if (current !== null && !current.open) current.showModal();
    return () => { document.body.classList.remove('drawer-open'); if (current?.open) current.close(); };
  }, []);
  return <dialog ref={dialog} className="poll-drawer" aria-label={label} onCancel={event => { event.preventDefault(); onDismiss(); }} onClick={event => { if (event.target === event.currentTarget) onDismiss(); }}>
    <div className="poll-drawer-panel">
      <button className="poll-drawer-close" type="button" aria-label="Закрити" onClick={onDismiss}><span aria-hidden="true">×</span></button>
      {children}
    </div>
  </dialog>;
}

export function App({ demo = false }: { demo?: boolean }) {
  const [route, setRoute] = useState(currentAppRoute);
  const [auth, setAuth] = useState<Auth | null>(demo ? publicDemoAuth : null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  useEffect(() => {
    if (auth === null || demo) return;
    const timer = setTimeout(() => setAuth(null), Math.max(0, Date.parse(auth.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [auth, demo]);
  const [polls, setPolls] = useState<PollType[]>([]), [query, setQuery] = useState(''), [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(true);
  const mineActive = route === '/mine' || route === '/mine/new';
  const createActive = route === '/new' || route === '/mine/new';
  useEffect(() => {
    const update = () => { setRoute(currentAppRoute()); setMobileNavOpen(false); };
    const event = demo ? 'popstate' : 'hashchange';
    addEventListener(event, update);
    return () => removeEventListener(event, update);
  }, [demo]);
  useEffect(() => { window.scrollTo(0, 0); }, [route]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    categories.forEach(category => params.append('category', category));
    setLoading(true); setError(null);
    request('management', '/v1/polls?' + params.toString()).then(value => {
      const result = z.object({ polls: z.array(Poll) }).parse(value);
      if (active) setPolls(result.polls);
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Помилка запиту'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, categories, route]);
  return <>
    <a className="skip" href="#main">До основного вмісту</a>
    <header className={`site-header${mobileNavOpen ? ' mobile-nav-open' : ''}`}><a className="brand" href={demo ? '/' : appHref('/')} aria-label={demo ? 'OpenVote — на головну сторінку' : 'OpenVote — на початок сторінки'}><span className="brand-mark" aria-hidden="true"><img src={openVoteMark} alt="" /></span><span>OpenVote 🇺🇦<small>Чесно. Прозоро. Анонімно.</small></span></a>
      <nav id="platform-navigation" aria-label="Основна навігація" onClick={() => setMobileNavOpen(false)}><a href={appHref('/')} aria-current={route === '/' || mineActive || createActive ? 'page' : undefined}>Опитування</a><a href={appHref('/trust')} aria-current={route === '/trust' ? 'page' : undefined}>Перевірка</a><a href={appHref('/help')} aria-current={route === '/help' ? 'page' : undefined}>FAQ</a></nav>
      <div className="header-actions"><a className="button primary header-create" href={appHref(mineActive ? '/mine/new' : '/new')}><span className="header-create-full">Створити опитування</span><span className="header-create-short">Створити</span></a><button className="mobile-menu-toggle" type="button" aria-controls="platform-navigation" aria-expanded={mobileNavOpen} aria-label={mobileNavOpen ? 'Закрити меню' : 'Відкрити меню'} onClick={() => setMobileNavOpen(open => !open)}><span /><span /><span /></button></div></header>
    {demo && <div className="public-demo-notice"><strong>Демо OpenVote.</strong> Тут можна переглядати й створювати опитування. Усі ваші дії залишаються лише у цьому браузері.</div>}
    <main id="main" tabIndex={-1}>
      {route === '/trust' ? <VerificationPage demo={demo} />
      : route === '/help' ? <section className="platform-faq" aria-labelledby="platform-faq-title">
        <header className="platform-faq-heading"><h1 id="platform-faq-title">Поширені питання і відповіді.</h1></header>
        <div className="platform-faq-list">
          {demandFaqItems.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
        </div>
        <section className="faq-support" aria-labelledby="faq-support-title"><div><h2 id="faq-support-title">Зв’язок із підтримкою</h2><p>Привіт! Я Тарас. Ви можете запитати мене про все, що стосується OpenVote.</p></div><button className="secondary" type="button" aria-controls="demand-chat" onClick={() => setChatOpen(true)}>Запитати Тараса</button></section>
      </section>
      : route.startsWith('/identity') ? <Identity onSignedIn={signedIn => { setAuth(signedIn); const destination = new URLSearchParams(route.split('?')[1]).get('return'); navigateApp(destination !== null && destination.startsWith('/poll/') ? destination : '/'); }} />
      : route.startsWith('/poll/') ? <PollPage key={route} id={route.slice(6)} auth={auth} demo={demo} />
      : route.startsWith('/edit/') ? auth === null ? <Identity onSignedIn={setAuth} /> : <DraftEditor auth={auth} id={route.slice(6)} />
      : route === '/moderation' ? auth === null ? <Identity onSignedIn={setAuth} /> : <ReviewQueue auth={auth} />
      : <section className="poll-workspace">
        <nav className="poll-workspace-tabs" aria-label="Перегляд опитувань"><a href={appHref('/')} aria-current={mineActive ? undefined : 'page'}>Усі</a><a href={appHref('/mine')} aria-current={mineActive ? 'page' : undefined}>Мої</a></nav>
        {mineActive ? auth === null ? <Identity onSignedIn={setAuth} /> : <MyPolls auth={auth} /> : <section className="catalog-home"><h1 className="visually-hidden">Усі опитування</h1><div className="catalog-tools"><label className="search"><span className="visually-hidden">Пошук опитувань</span><input type="search" value={query} placeholder="Знайти опитування" aria-label="Пошук опитувань" onChange={e => setQuery(e.target.value)} /></label><CategorySelect multiple selected={categories} onChange={setCategories} />{categories.length > 0 && <div className="category-chips" aria-label="Обрані категорії">{categories.map(category => <button type="button" key={category} aria-label={`Прибрати категорію ${category}`} onClick={() => setCategories(current => current.filter(item => item !== category))}><span>{category}</span><span aria-hidden="true">×</span></button>)}</div>}</div>
          <section className="catalog-results" aria-label="Усі опитування"><h2>Усі опитування</h2>{loading ? <p role="status">Завантаження опитувань…</p> : error ? <div className="notice error" role="alert">Не вдалося завантажити опитування: {error}</div> : polls.length === 0 ? <div className="empty"><span className="empty-symbol">+</span><h2>Опитувань ще немає</h2><p>{query || categories.length > 0 ? 'За цими умовами опитувань не знайдено.' : 'Створіть перше опитування.'}</p></div> : <div className="poll-list">{polls.map(poll => <PollCard key={poll.id} id={poll.id} question={poll.content.question} context={poll.content.context} category={poll.content.category} stateLabel={stateNames[poll.state]} opensAt={poll.content.opensAt} closesAt={poll.content.closesAt} />)}</div>}</section></section>}
        {createActive && <PollDrawer label={auth === null ? 'Підтвердження участі для створення опитування' : 'Створити опитування'} onDismiss={() => navigateApp(mineActive ? '/mine' : '/')}>{auth === null ? <Identity onSignedIn={setAuth} drawer /> : <DraftEditor auth={auth} id={null} drawer />}</PollDrawer>}
      </section>}
    </main><TarasChat open={chatOpen} onOpenChange={setChatOpen} prepare={loadDemandPoll} /><footer className="platform-footer"><div className="platform-footer-inner"><a className="brand" href={appHref('/')}><span className="brand-mark" aria-hidden="true"><img src={openVoteMark} alt="" /></span><span>OpenVote<small>Чесно. Прозоро. Анонімно.</small></span></a><nav aria-label="Навігація в підвалі"><a href={appHref('/')}>Опитування</a><a href={appHref('/trust')}>Перевірка</a><a href={appHref('/help')}>FAQ</a><a href="https://github.com/Lontkovsky/openvote">GitHub ↗</a></nav><div className="platform-footer-notes"><span>Відкритий код AGPL-3.0</span><span>Не державний сервіс. Не офіційне голосування.</span></div></div></footer>
  </>;
}

export type Auth = { token: string; role: string; expiresAt: string };

const publicDemoAuth: Auth = { token: 'public-demo', role: 'participant', expiresAt: '2099-12-31T23:59:59.000Z' };
