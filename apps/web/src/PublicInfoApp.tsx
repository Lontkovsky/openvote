import { demandFaqItems } from '../../../packages/domain/src/demand.ts';
import { DemandFooter, DemandHeader } from './DemandChrome.tsx';
import { publicInfoPage, publicInfoPages } from './public-info-content.ts';
import type { PublicInfoPage } from './public-info-content.ts';

export function PublicInfoApp({ slug }: { slug: PublicInfoPage['slug'] }) {
  const page = publicInfoPage(slug);

  return <div className="demand-page demand-info-page">
    <a className="skip" href="#main">До основного вмісту</a>
    <DemandHeader brandHref="/" voteHref="/#poll" />
    <main id="main" className="demand-info-main">
      <header className="demand-info-hero">
        <div className="demand-info-container">
          <nav className="demand-breadcrumbs" aria-label="Навігаційний шлях"><a href="/">Головна</a><span aria-hidden="true">/</span><span>{page.heading}</span></nav>
          <h1>{page.heading}</h1>
          <p>{page.lead}</p>
        </div>
      </header>
      <nav className="demand-info-navigation" aria-label="Інформація про OpenVote">
        {publicInfoPages.map(item => <a key={item.slug} href={`/${item.slug}/`} aria-current={item.slug === slug ? 'page' : undefined}>{item.navigationLabel}</a>)}
      </nav>
      {slug === 'faq'
        ? <section className="demand-info-content demand-info-faq" aria-label="Питання і відповіді">
            <div className="demand-faq-list">
              {demandFaqItems.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
            </div>
          </section>
        : <div className="demand-info-content">
            {page.sections.map(section => <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
              {section.items === undefined ? null : <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
            </section>)}
          </div>}
      <section className="demand-info-cta" aria-labelledby="info-cta-title">
        <div><h2 id="info-cta-title">Подивіться, як OpenVote працює в демо.</h2><p>Демо доступне без реєстрації. Усі створені там дані залишаються лише у вашому браузері.</p></div>
        <a className="button primary" href="/demo/">Відкрити демо</a>
      </section>
    </main>
    <DemandFooter brandHref="/" />
  </div>;
}
