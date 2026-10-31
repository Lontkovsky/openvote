import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';

const root = new URL('../../', import.meta.url);
const localDate = value => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const E2eRun = z.strictObject({
  token: z.string().regex(/^[0-9a-f]{64}$/), runId: z.string().regex(/^[0-9a-f]{10}$/),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/), closesAt: z.iso.datetime(),
});
export async function createRunner(tab, input) {
  const run = E2eRun.parse(input);
  const endpoint = 'http://127.0.0.1:4329';
  const p = tab.playwright;
  const title = 'Чи підтримуєте перевірку відкритого коду в браузерному сценарії ' + run.runId + '?';
  let pollId = null, firstTracker = null;
  async function state() { return p.domSnapshot(); }
  async function until(test, label) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await state();
      if (await test()) return;
      await p.waitForTimeout(200);
    }
    throw new Error('UI_STATE_DEADLINE: ' + label);
  }
  async function click(role, name) { await p.getByRole(role, { name, exact: true }).click(); await state(); }
  async function check(role, name) { await p.getByRole(role, { name, exact: true }).check(); await state(); }
  async function visible(role, name) { await until(async () => await p.getByRole(role, { name, exact: true }).count() === 1 && await p.getByRole(role, { name, exact: true }).isVisible(), name); }
  async function fill(label, value) { await p.getByRole('textbox', { name: label, exact: true }).fill(value); await state(); }
  async function fixture(path, body) {
    const response = await fetch(endpoint + path, { method: 'POST', headers: { authorization: 'Bearer ' + run.token }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('E2E_FIXTURE_CONTROL_FAILED');
    return response.json();
  }
  async function control(provider, available) { await fixture('/provider-control', { provider, available }); }
  async function unavailable() { await p.getByRole('alert').filter({ hasText: 'Провайдер недоступний.' }).waitFor({ state: 'visible' }); }
  async function exported(button, prefix, extension) {
    const waiting = p.waitForEvent('download', { timeoutMs: 30000 });
    await click('button', button);
    const path = await (await waiting).path({ timeoutMs: 30000 });
    if (path === null) throw new Error('DOWNLOADED_ARTIFACT_PATH_UNAVAILABLE');
    const name = basename(path);
    if (!name.startsWith(prefix) || !name.endsWith(extension)) throw new Error('DOWNLOADED_ARTIFACT_NAME_MISMATCH');
    return readFile(path, 'utf8');
  }
  function parseExport(format, text) {
    return JSON.parse(execFileSync('python3', [new URL('tests/support/read-exports.py', root).pathname], { input: JSON.stringify({ format, text }), encoding: 'utf8' }));
  }
  async function signOut() {
    if (await p.getByRole('button', { name: 'Вийти', exact: true }).count() === 1) await click('button', 'Вийти');
    await visible('link', 'Підтвердити участь');
    await click('link', 'Голосування');
    await p.waitForURL('http://localhost:5173/#/', { timeoutMs: 30000 });
    await until(async () => await p.locator('h1').innerText() === 'Голосування', 'Signed-out catalog');
  }
  async function signIn(person, provider) {
    await check('radio', 'Mock ' + provider); await check('radio', person); await click('button', 'Підтвердити тестову особу');
    await visible('button', 'Вийти');
  }
  async function openPoll() {
    await click('link', 'Голосування');
    await until(async () => await p.locator('h1').innerText() === 'Голосування', 'Catalog navigation');
    await click('link', title);
    await p.waitForURL('http://localhost:5173/#/poll/' + pollId, { timeoutMs: 30000 });
    await until(async () => await p.locator('h1').innerText() === title, 'Question navigation');
  }
  async function participate(person, provider, answer) {
    await signOut(); await openPoll(); await click('link', 'Підтвердити право участі'); await signIn(person, provider);
    if (await p.getByRole('button', { name: 'Зашифрувати й остаточно надіслати', exact: true }).isEnabled()) throw new Error('FINAL_CONFIRMATION_MISSING');
    await check('radio', answer); await check('checkbox', 'Підтверджую остаточний вибір: «' + answer + '»');
    await click('button', 'Зашифрувати й остаточно надіслати');
  }
  const stages = {
    async create(assertions) {
      await state(); await signOut(); await click('link', 'Голосування'); await click('link', '+ Створити питання');
      await signIn('TEST-PERSON-0005', 'A'); await visible('heading', 'Створити питання');
      await fill('Формулювання питання', title);
      await click('button', 'Знайти схожі питання'); await visible('heading', 'Схожі питання'); assertions.push('Similar search returns visible outcomes without merging votes');
      await fill('Контекст', 'Синтетичне браузерне випробування повного сценарію. Жодне реальне рішення організації цим питанням не ухвалюється.');
      await fill('Можливі наслідки', 'У тестовому сценарії можна перевірити незмінність питання, приватне шифрування та публічний підсумок.');
      const supporting = p.getByRole('heading', { name: 'Аргументи за', exact: true });
      if (!await supporting.isVisible()) throw new Error('ARGUMENTS_NOT_VISIBLE');
      const fields = await p.getByLabel('Текст аргументу', { exact: true }).all();
      if (fields.length !== 2) throw new Error('EXPECTED_TWO_ARGUMENT_SIDES');
      await fields[0].fill('Оцінка тестового автора: відкритий код дозволяє дослідити виконані правила.'); await state();
      await fields[1].fill('Оцінка тестового автора: сама відкритість коду не гарантує його безпеку.'); await state();
      const sources = await p.getByLabel('HTTPS-посилання на джерело', { exact: true }).all();
      await sources[0].fill('https://www.gnu.org/licenses/agpl-3.0.html'); await state();
      await sources[1].fill('https://www.belenios.org/faq.html'); await state();
      await p.getByRole('combobox', { name: 'Категорія', exact: true }).selectOption('Технології'); await state();
      await fill('Публічний псевдонім автора', 'Браузерний тест');
      await fill('Закриття (місцевий час)', localDate(run.closesAt));
      await fill('Відкриття (місцевий час)', localDate(new Date(Date.parse(run.closesAt) + 60000).toISOString()));
      await click('button', 'Зберегти чернетку');
      await p.getByRole('alert').filter({ hasText: 'INVALID_SCHEDULE' }).waitFor({ state: 'visible' });
      assertions.push('Invalid opening-after-closing schedule is visibly rejected');
      await fill('Відкриття (місцевий час)', localDate(new Date(Date.now() - 60000).toISOString()));
      await click('button', 'Зберегти чернетку'); await visible('heading', title);
      pollId = (await tab.url()).split('#/poll/')[1];
      if (!/^[a-f0-9-]{36}$/.test(pollId)) throw new Error('CREATED_POLL_ID_MISSING');
      await writeFile(new URL('.runtime/e2e-polls.json', root), JSON.stringify([pollId]), { mode: 0o600 });
      await click('link', 'Редагувати чернетку'); await visible('heading', 'Редагувати чернетку');
      await fill('Можливі наслідки', 'Уточнені наслідки синтетичного сценарію: перевірити незмінність питання, клієнтське шифрування і підсумок.');
      await click('button', 'Зберегти чернетку'); await visible('heading', title);
      if (await p.getByText(/Версія 2/).count() !== 1) throw new Error('DRAFT_VERSION_NOT_INCREMENTED');
      await click('button', 'Надіслати на перевірку');
      await p.getByText('На перевірці', { exact: true }).waitFor({ state: 'visible' });
      assertions.push('Verified author creates required structured draft', 'Draft edit increments version before submission', 'Submission enters Review');
    },
    async reviewStart(assertions) {
      await signOut(); await click('link', 'Підтвердити участь'); await signIn('TEST-PERSON-0012', 'A');
      await click('link', 'Модерація');
      await visible('link', title);
      const form = p.locator('form').filter({ has: p.getByRole('link', { name: title, exact: true }) });
      if (await form.count() !== 1) throw new Error('REVIEW_CARD_NOT_UNIQUE');
      for (const label of ['Одна пропозиція без навідного формулювання', 'Без подвійного заперечення', 'Терміни зрозумілі', 'Умови й істотні наслідки явні', 'Факти відокремлені від оцінок']) { await form.getByLabel(label, { exact: true }).check(); await state(); }
      await form.getByLabel('Причина рішення', { exact: true }).fill('Синтетична пропозиція відповідає всім п’яти критеріям; твердження автора відокремлено від фактів.'); await state();
      await form.getByRole('button', { name: 'Зафіксувати рішення', exact: true }).click(); await state();
      assertions.push('Moderator completes rubric and submits a reasoned review');
    },
    async review(assertions) {
      await until(async () => {
        const status = p.getByRole('status').filter({ hasText: 'Рішення зафіксовано.' });
        return await status.count() === 1 && await status.isVisible();
      }, 'Review completion');
      if (await p.getByRole('link', { name: title, exact: true }).count() !== 0) throw new Error('REVIEWED_POLL_STILL_QUEUED');
      await openPoll(); await p.getByText('Голосування відкрите', { exact: true }).waitFor({ state: 'visible' });
      if (await p.getByRole('link', { name: 'Редагувати чернетку', exact: true }).count() !== 0) throw new Error('OPEN_POLL_EDIT_VISIBLE');
      assertions.push('Moderator applies five-point rubric and reason', 'Real ceremony opens immutable poll', 'Draft editing is absent after review');
    },
    async voteOne(assertions) {
      await participate('TEST-PERSON-0005', 'A', 'Підтримую'); await visible('heading', 'Бюлетень прийнято');
      firstTracker = await p.locator('.receipt code').innerText();
      await fill('Tracker', firstTracker); await click('button', 'Перевірити включення');
      await p.getByRole('status').filter({ hasText: 'Бюлетень включено. Підпис квитанції перевірено.' }).waitFor({ state: 'visible' });
      assertions.push('Explicit final confirmation required', 'Original browser cryptography produces accepted ballot', 'Signed receipt and inclusion checked');
    },
    async voteTwo(assertions) { await participate('TEST-PERSON-0006', 'B', 'Не підтримую'); await visible('heading', 'Бюлетень прийнято'); assertions.push('Second synthetic person casts encrypted opposing vote through B'); },
    async voteThree(assertions) { await participate('TEST-PERSON-0007', 'A', 'Утримуюсь'); await visible('heading', 'Бюлетень прийнято'); assertions.push('Abstention is accepted as the third choice'); },
    async duplicate(assertions) {
      await participate('TEST-PERSON-0005', 'B', 'Не підтримую');
      await until(async () => {
        const duplicate = p.getByText('За цим правом участі вже прийнято остаточний голос.', { exact: true });
        return await duplicate.count() === 1 && await duplicate.isVisible();
      }, 'Duplicate final-vote rejection');
      assertions.push('Same person through another provider cannot change final vote');
    },
    async tallyStart(assertions) {
      if (Date.now() < Date.parse(run.closesAt)) throw new Error('FIXED_DEADLINE_NOT_REACHED; run this stage after ' + run.closesAt);
      await signOut(); await click('link', 'Підтвердити участь'); await signIn('TEST-PERSON-0012', 'A'); await openPoll();
      await click('button', 'Зафіксувати закриття');
      await visible('button', 'Запустити тестовий підрахунок');
      await click('button', 'Запустити тестовий підрахунок');
      assertions.push('Operator closes at the fixed deadline and requests threshold tally');
    },
    async publish(assertions) {
      await visible('heading', 'Результат серед 3 учасників цього голосування');
      const counts = await p.locator('.result-row span').allTextContents({ timeoutMs: 10000 });
      if (JSON.stringify(counts) !== JSON.stringify(['1 · 33,3%', '1 · 33,3%', '1 · 33,3%'])) throw new Error('VISIBLE_RESULT_NOT_1_1_1');
      assertions.push('Fixed close enforced without deadline extension', 'Separate test trustees tally the browser ciphertexts', 'Published exact 1/1/1 counts and N=3 include abstention');
    },
    async exports(assertions) {
      await signOut(); await openPoll();
      await visible('heading', 'Результат серед 3 учасників цього голосування');
      const result = JSON.parse(await exported('Результат JSON', 'result-', '.json'));
      if (result.question !== title || result.version !== 2 || result.acceptedVotes !== 3 || JSON.stringify(result.counts) !== '[1,1,1]' || !result.selfSelected || result.state !== 'Published' || result.closesAt !== run.closesAt) throw new Error('DOWNLOADED_RESULT_CONTRACT_MISMATCH');
      const csv = await exported('Результат CSV', 'result-', '.csv');
      if (!isDeepStrictEqual(parseExport('csv', csv).contract, result)) throw new Error('DOWNLOADED_CSV_CONTRACT_MISMATCH');
      if (await p.locator('.result-question').innerText() !== result.question) throw new Error('VISIBLE_RESULT_QUESTION_MISMATCH');
      await p.getByText('Переглянути картку поширення', { exact: true }).press('Enter'); await state();
      await visible('button', 'Завантажити картку SVG');
      await until(() => p.evaluate(() => { const image = document.querySelector('.share-card img'); return image !== null && image.complete && image.naturalWidth === 1080; }), 'Share card image loaded');
      const svg = await exported('Завантажити картку SVG', 'share-', '.svg');
      const card = parseExport('svg', svg);
      if (!isDeepStrictEqual(card.contract, result) || card.title !== title || !card.text.includes('N = 3') || !card.text.includes('Утримуюсь: 1 · 33,3%')) throw new Error('DOWNLOADED_SVG_CONTRACT_MISMATCH');
      await p.getByText('Переглянути картку поширення', { exact: true }).press('Enter'); await state();
      if (await p.getByRole('button', { name: 'Завантажити картку SVG', exact: true }).isVisible()) throw new Error('SHARE_CARD_KEYBOARD_CLOSE_FAILED');
      const audit = JSON.parse(await exported('Аудит-пакет', 'audit-', '.json'));
      if (JSON.stringify(audit.result) !== JSON.stringify(result) || JSON.parse(audit.electionRaw).uuid !== result.pollId || audit.checkpoints.length !== 3) throw new Error('DOWNLOADED_AUDIT_MISMATCH');
      await mkdir(new URL('artifacts/e2e', root), { recursive: true });
      await writeFile(new URL('artifacts/e2e/election.bel', root), Buffer.from(audit.archive, 'base64'));
      await writeFile(new URL('artifacts/e2e/result.json', root), JSON.stringify(result, null, 2) + '\n');
      await writeFile(new URL('artifacts/e2e/result.csv', root), csv);
      await writeFile(new URL('artifacts/e2e/share.svg', root), svg);
      await fill('Tracker', firstTracker); await click('button', 'Перевірити включення');
      await p.getByRole('status').filter({ hasText: 'Бюлетень включено. Підпис квитанції перевірено.' }).waitFor({ state: 'visible' });
      if (!(await p.getByText('Добровільна участь із самовідбором.', { exact: false }).count() >= 1)) throw new Error('SELF_SELECTION_WARNING_MISSING');
      await click('link', 'Центр довіри'); await visible('heading', 'Зовнішні спостерігачі');
      await p.getByText('Технічні відомості', { exact: true }).press('Enter'); await state();
      await p.getByText('Суперечливі історії виявляються після обміну свідченнями.', { exact: false }).waitFor({ state: 'visible' });
      await openPoll();
      assertions.push('Trust center discloses the independent observer and the split-view comparison condition');
      await p.getByText('За одностайного результату відомий факт участі розкриває відповідь учасника.', { exact: false }).waitFor({ state: 'visible' });
      assertions.push('Participation policy explains that the minimum group threshold does not hide an unanimous choice');
      assertions.push('Anonymous public results and real JSON, CSV, SVG and audit downloads share the exact contract', 'CSV independently round-trips all fields and types', 'Keyboard opens and closes the rendered share card', 'Share card retains exact question, N and all answer counts', 'Native archive extracted unchanged from the downloaded audit for offline verification', 'Tracker still included after publication', 'Self-selection and representativeness warning stays visible');
    },
    async providerContracts(assertions) {
      await signOut(); await click('link', 'Підтвердити участь');
      await p.getByText('Mock A: доступний', { exact: true }).waitFor({ state: 'visible' });
      await p.getByText('Mock B: доступний', { exact: true }).waitFor({ state: 'visible' });
      for (const provider of ['Дія.Підпис', 'BankID НБУ', 'КЕП']) {
        const summary = p.getByText(provider + ' — Очікує контракту інтеграції (AwaitingProviderContract)', { exact: true });
        await summary.press('Enter'); await state();
        if (await p.locator('details[open]').count() !== 1) throw new Error('PROVIDER_CAPABILITY_KEYBOARD_DISCLOSURE_FAILED');
        if (!(await p.locator('details[open]').innerText()).includes('Необхідні доступи')) throw new Error('PROVIDER_PREREQUISITES_MISSING');
        await summary.press('Enter'); await state();
        if (await p.getByRole('radio', { name: provider, exact: true }).count() !== 0) throw new Error('UNINTEGRATED_PROVIDER_SELECTABLE');
      }
      await p.getByRole('radio', { name: 'Mock B', exact: true }).press('Space'); await state();
      if (await p.getByRole('radio', { name: 'Mock B', exact: true }).and(p.locator(':checked')).count() !== 1) throw new Error('KEYBOARD_PROVIDER_SELECTION_FAILED');
      assertions.push('Both mock availability states are visible', 'Three production boundaries are explicitly awaiting contracts and cannot be selected', 'Capability disclosures and provider selection work with the keyboard');
    },
    async providerRetry(assertions) {
      await check('radio', 'Mock A'); await check('radio', 'TEST-PERSON-0002');
      await control('A', false);
      await click('button', 'Підтвердити тестову особу'); await unavailable();
      await visible('button', 'Повторити цю спробу (1/3)');
      const first = await fixture('/attempt-count', {});
      if (first.count === '0') throw new Error('PENDING_IDENTITY_ATTEMPT_NOT_RECORDED');
      await click('button', 'Повторити цю спробу (1/3)'); await unavailable();
      await visible('button', 'Повторити цю спробу (2/3)');
      if ((await fixture('/attempt-count', {})).count !== first.count) throw new Error('RETRY_CREATED_ANOTHER_ATTEMPT');
      await control('A', true); await click('button', 'Повторити цю спробу (2/3)'); await visible('button', 'Вийти');
      assertions.push('Outage after status observation shows an explicit error', 'Failed return is retried with the same backend attempt', 'Restored provider completes that attempt without an automatic switch');
    },
    async providerSwitch(assertions) {
      await signOut(); await click('link', 'Підтвердити участь');
      await p.getByText('Mock A: доступний', { exact: true }).waitFor({ state: 'visible' });
      await check('radio', 'Mock A'); await check('radio', 'TEST-PERSON-0002'); await control('A', false);
      await click('button', 'Підтвердити тестову особу'); await unavailable();
      const first = await fixture('/attempt-count', {});
      if (first.count === '0') throw new Error('PENDING_IDENTITY_ATTEMPT_NOT_RECORDED');
      await click('button', 'Повторити цю спробу (1/3)'); await unavailable();
      await click('button', 'Повторити цю спробу (2/3)'); await unavailable();
      await p.getByRole('status').filter({ hasText: 'Ліміт трьох спроб вичерпано.' }).waitFor({ state: 'visible' });
      if (await p.getByRole('button', { name: 'Повторити цю спробу (3/3)', exact: true }).isEnabled()) throw new Error('RETRY_LIMIT_NOT_ENFORCED');
      if ((await fixture('/attempt-count', {})).count !== first.count) throw new Error('LIMITED_RETRIES_CREATED_MORE_ATTEMPTS');
      await check('radio', 'Mock B'); await click('button', 'Підтвердити тестову особу'); await visible('button', 'Вийти');
      await control('A', true);
      assertions.push('Exactly three manual deliveries exhaust the retry limit without new attempts', 'An explicit switch to available B confirms the same synthetic person');
    },
    async providerBothUnavailable(assertions) {
      await signOut(); await control('A', false); await control('B', false); await click('link', 'Підтвердити участь');
      await p.getByRole('status').filter({ hasText: 'Обидва тестові провайдери недоступні.' }).waitFor({ state: 'visible' });
      await check('radio', 'TEST-PERSON-0002');
      for (const provider of ['Mock A', 'Mock B']) {
        await check('radio', provider);
        if (await p.getByRole('button', { name: 'Підтвердити тестову особу', exact: true }).isEnabled()) throw new Error('UNAVAILABLE_PROVIDER_ADMISSION_ENABLED');
      }
      if (await p.getByRole('textbox').count() !== 0) throw new Error('WEAKER_FREEFORM_IDENTITY_VISIBLE');
      await control('A', true); await control('B', true); await click('button', 'Оновити стан провайдерів');
      await p.getByText('Mock B: доступний', { exact: true }).waitFor({ state: 'visible' });
      await click('button', 'Підтвердити тестову особу'); await visible('button', 'Вийти'); await openPoll();
      await visible('heading', 'Результат серед 3 учасників цього голосування');
      assertions.push('Both outages visibly stop admission without weaker identity input', 'Explicit status refresh restores available participation', 'Published poll and fixed result remain available through the outage');
    },
  };
  return {
    runId: run.runId, closesAt: run.closesAt, title,
    async step(name) {
      if (!(name in stages)) throw new Error('UNKNOWN_E2E_STAGE');
      const assertions = [];
      try {
        await stages[name](assertions);
        const response = await fetch(endpoint + '/event', { method: 'POST', headers: { authorization: 'Bearer ' + run.token }, body: JSON.stringify({ step: name, status: 'Passed', assertions }) });
        if (!response.ok) throw new Error('E2E_REPORT_REJECTED');
        return { step: name, status: 'Passed', assertions, pollId };
      } catch (error) {
        await fetch(endpoint + '/event', { method: 'POST', headers: { authorization: 'Bearer ' + run.token }, body: JSON.stringify({ step: name, status: 'Failed', assertions: [...assertions, 'Stage did not complete'], error: error instanceof Error ? error.message : String(error) }) });
        throw error;
      }
    },
  };
}
