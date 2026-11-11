import openVoteMark from './assets/openvote-mark.svg';

type DemandHeaderProps = {
  brandHref: string;
  voteHref: string;
  onVoteClick?: () => void;
};

type DemandFooterProps = {
  brandHref: string;
};

function DemandBrand({ href, showFlag }: { href: string; showFlag: boolean }) {
  return <a className="brand" href={href}>
    <span className="brand-mark" aria-hidden="true"><img src={openVoteMark} alt="" /></span>
    <span>OpenVote{showFlag ? ' 🇺🇦' : ''}<small>Чесно. Прозоро. Анонімно.</small></span>
    <span className="visually-hidden">на головну</span>
  </a>;
}

export function DemandHeader({ brandHref, voteHref, onVoteClick }: DemandHeaderProps) {
  return <header className="demand-header">
    <DemandBrand href={brandHref} showFlag />
    <div className="demand-header-actions">
      <a className="button secondary demand-demo-link" href="/demo/" target="_blank" rel="noreferrer">Демо платформи</a>
      <a className="button primary" href={voteHref} onClick={onVoteClick}>Проголосувати</a>
    </div>
  </header>;
}

export function DemandFooter({ brandHref }: DemandFooterProps) {
  return <footer className="demand-footer">
    <div className="demand-footer-inner">
      <div className="demand-footer-brand"><DemandBrand href={brandHref} showFlag={false} /></div>
      <nav aria-label="Навігація в підвалі">
        <a href="/about/">Про OpenVote</a>
        <a href="/how-it-works/">Як це працює</a>
        <a href="/methodology/">Методологія</a>
        <a href="/privacy/">Приватність</a>
        <a href="/faq/">FAQ</a>
        <a href="https://github.com/Lontkovsky/openvote">GitHub ↗</a>
      </nav>
      <div className="demand-footer-notes"><span>Відкритий код AGPL-3.0</span><span>Не державний сервіс. Не офіційне голосування.</span></div>
    </div>
  </footer>;
}
