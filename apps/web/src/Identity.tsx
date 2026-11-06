import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ProviderCatalogue } from '../../../packages/domain/src/providers.ts';
import type { ProviderCatalogueType, MockProviderIdType } from '../../../packages/domain/src/providers.ts';
import type { Auth } from './App.tsx';
import { ApiFailure, request } from './api.ts';

const capabilityLabels = { subject: 'Унікальна особа', rnokppOwner: 'Власник РНОКПП', age: 'Вік', citizenship: 'Громадянство', freshness: 'Свіжість', signatureValidation: 'Перевірка доказу', prerequisites: 'Необхідні доступи' };
const developmentProvider: MockProviderIdType = 'A';
const identityErrors: Record<string, string> = {
  PROVIDER_UNAVAILABLE: 'Підтвердження тимчасово недоступне. Повторіть цю саму спробу пізніше.',
  PROVIDER_ATTRIBUTES_CONFLICT: 'Провайдери повернули суперечливі атрибути. Допуск і попередні сесії заблоковано; нове право голосу не створюється.',
  IDENTITY_RETURN_EXPIRED: 'Строк повернення від провайдера минув. Почніть нову ідентифікацію; це не створить додаткового права голосу.',
  ATTESTATION_REJECTED: 'Підтвердження не відповідає цій спробі або вимогам свіжості. Допуск не надано.',
  INVALID_SIGNATURE: 'Підпис провайдера не пройшов перевірку. Допуск не надано.',
};
export function Identity({ onSignedIn, drawer = false }: { onSignedIn: (auth: Auth) => void; drawer?: boolean }) {
  const [catalogue, setCatalogue] = useState<ProviderCatalogueType | null>(null), [subject, setSubject] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null), [attempt, setAttempt] = useState<string | null>(null), [tries, setTries] = useState(0), [terminal, setTerminal] = useState(false);
  const mounted = useRef(false);
  async function refresh() {
    setLoading(true); setError(null);
    try { const value = ProviderCatalogue.parse(await request('identity', '/v1/providers')); if (mounted.current) setCatalogue(value); }
    catch (e) { if (mounted.current) { setCatalogue(null); setError(e instanceof ApiFailure ? e.message : 'Сервіс допуску недоступний. Відновіть мережу й оновіть стан.'); } }
    finally { if (mounted.current) setLoading(false); }
  }
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; }; }, []);
  function restart() { setAttempt(null); setTries(0); setTerminal(false); setError(null); }
  async function confirm() {
    if (subject === null || busy || tries >= 3 || terminal) return;
    setBusy(true); setError(null); setTries(n => n + 1);
    try {
      let currentAttempt = attempt;
      if (currentAttempt === null) {
        const start = z.object({ attempt: z.string() }).parse(await request('identity', '/v1/auth/start', 'POST', { provider: developmentProvider, subject }));
        if (!mounted.current) return;
        currentAttempt = start.attempt; setAttempt(currentAttempt);
      }
      const auth = z.object({ token: z.string(), role: z.string(), expiresAt: z.string() }).parse(await request('identity', '/v1/auth/finish', 'POST', { attempt: currentAttempt }));
      if (mounted.current) onSignedIn(auth);
    } catch (e) {
      if (mounted.current) {
        if (e instanceof ApiFailure && e.status >= 400 && e.status < 500) setTerminal(true);
        setError(e instanceof ApiFailure ? (identityErrors[e.message] ?? e.message) : 'Підтвердження не отримано. Перевірте мережу; повтор використає ту саму відому спробу.');
      }
    } finally { if (mounted.current) setBusy(false); }
  }
  const selected = catalogue?.providers.find(p => p.provider === developmentProvider);
  const content = <>
    <p className="lead identity-instruction">Оберіть особу зі списку поки що.</p>
    <p className="identity-demo-note">Усі особи нижче наведені тут лише для демонстрації функціоналу.</p>
    {loading && <p role="status">Завантаження списку осіб…</p>}
    {catalogue !== null && <fieldset disabled={busy}><legend>Особа</legend><div className="person-grid">{catalogue.testPersons.map(p => <label key={p}><input type="radio" name="person" checked={subject === p} onChange={() => { setSubject(p); restart(); }} />{p}</label>)}</div></fieldset>}
    {error !== null && <p className="notice error" role="alert">{error}</p>}
    {tries >= 3 && <p role="status">Ліміт трьох спроб вичерпано. Автоматичних повторів немає.</p>}
    {terminal && <button className="secondary" disabled={busy} onClick={restart}>Розпочати нову ідентифікацію</button>}
    {catalogue !== null && <section className="provider-contracts identity-faq">
      <div className="identity-faq-list">{[...catalogue.providers.filter(p => p.provider === developmentProvider), ...catalogue.production].map(p => <details key={p.provider}><summary>{p.provider === developmentProvider ? 'Тестова інтеграція' : `${p.name} — Очікує контракту інтеграції (AwaitingProviderContract)`}</summary><dl>{Object.entries(capabilityLabels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{Reflect.get(p.capabilities, key)}</dd></div>)}</dl></details>)}</div>
      <p className="identity-faq-source"><a href="https://github.com/Lontkovsky/openvote/blob/main/docs/IDENTITY_PROVIDERS.md" target="_blank" rel="noreferrer">Матриця й офіційні джерела ↗</a></p>
    </section>}
  </>;
  const action = <button className="primary" disabled={subject === null || busy || loading || selected?.available !== true || tries >= 3 || terminal} onClick={() => void confirm()}>{busy ? 'Підтвердження…' : attempt === null ? 'Підтвердити особу' : `Повторити цю спробу (${tries}/3)`}</button>;
  return <section className={drawer ? 'identity-panel identity-drawer' : 'identity-panel'}>
    {drawer ? <><div className="identity-drawer-header"><h1>Підтвердьте право участі</h1></div><div className="identity-drawer-body">{content}</div><div className="identity-drawer-footer">{action}</div></> : <><h1>Підтвердьте право участі</h1>{content}{action}</>}
  </section>;
}
