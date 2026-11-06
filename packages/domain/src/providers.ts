import { z } from 'zod';
import { Environment } from './index.ts';

export const TestSubject = z.string().regex(/^TEST-PERSON-\d{4}$/);
export const MockProviderId = z.enum(['A', 'B']);
export const ProductionProviderId = z.enum(['diia-signature', 'bankid-nbu', 'qes']);
export const MockIdentityRequest = z.strictObject({ subject: TestSubject, challenge: z.string().min(32).max(64) });
export const ProviderCapabilities = z.strictObject({
  subject: z.string(), rnokppOwner: z.string(), age: z.string(), citizenship: z.string(),
  freshness: z.string(), signatureValidation: z.string(), prerequisites: z.string(),
});
export const MockProviderStatus = z.strictObject({
  provider: MockProviderId, name: z.string(), available: z.boolean(), testOnly: z.literal(true), upstream: z.string(),
  state: z.literal('TestImplemented'), observation: z.enum(['ProviderReported', 'TransportUnavailable']), capabilities: ProviderCapabilities,
});
export const DisabledProviderStatus = z.strictObject({
  provider: ProductionProviderId, name: z.string(), state: z.literal('AwaitingProviderContract'),
  available: z.literal(false), testOnly: z.literal(false), upstream: z.array(z.string()), capabilities: ProviderCapabilities,
});
export const ProviderCatalogue = z.strictObject({
  environment: Environment, testPersons: z.array(TestSubject),
  providers: z.array(MockProviderStatus).length(2).refine(values => new Set(values.map(v => v.provider)).size === 2),
  production: z.array(DisabledProviderStatus).length(3).refine(values => new Set(values.map(v => v.provider)).size === 3),
});
export type ProviderCatalogueType = z.infer<typeof ProviderCatalogue>;
export type MockProviderIdType = z.infer<typeof MockProviderId>;
export type ProviderStatusType = z.infer<typeof MockProviderStatus> | z.infer<typeof DisabledProviderStatus>;

export const mockCapabilities = ProviderCapabilities.parse({
  subject: 'Особа зі списку; лише тестовий реєстр.',
  rnokppOwner: 'Тестова ознака verifiedOwner; справжній номер не приймається.',
  age: 'Явний вік тестової особи.', citizenship: 'Явний код громадянства тестової особи; не виводиться з інших даних.',
  freshness: 'Підтвердження чинне 120 секунд і прив’язане до одноразового challenge.',
  signatureValidation: 'Ed25519; окремий заздалегідь довірений ключ кожної інтеграції.',
  prerequisites: 'Локальний процес і згенеровані тестові ключі; зовнішніх договорів немає.',
});
export const disabledProviders = z.array(DisabledProviderStatus).parse([
  { provider: 'diia-signature', name: 'Дія.Підпис', state: 'AwaitingProviderContract', available: false, testOnly: false,
    upstream: ['Інтеграція Дії', 'Надавач довірчих послуг Дія.Підпис'], capabilities: {
      subject: 'Контракт стабільного subject для цієї інтеграції не отримано.',
      rnokppOwner: 'Атрибути й перевірка власника РНОКПП очікують технічного контракту.',
      age: 'Не підтверджується цією непідключеною інтеграцією.', citizenship: 'Не підтверджується цією непідключеною інтеграцією.',
      freshness: 'Challenge, строки й правила callback потребують контракту.',
      signatureValidation: 'Формат доказу, довірені сертифікати й перевірка статусу ще не інтегровані.',
      prerequisites: 'Доступ від команди інтеграції, погоджений контракт, тестове середовище й сертифікати.',
    } },
  { provider: 'bankid-nbu', name: 'BankID НБУ', state: 'AwaitingProviderContract', available: false, testOnly: false,
    upstream: ['Центральний вузол BankID НБУ', 'Обраний банк або інший абонент-ідентифікатор'], capabilities: {
      subject: 'Cross-provider зіставлення має спиратися на погоджені підтверджені дані, а не на обліковий запис банку.',
      rnokppOwner: 'Потрібен дозволений НБУ набір даних із РНОКПП та перевірена відповідь.',
      age: 'Лише якщо дозволений набір містить підтверджену дату народження.', citizenship: 'Не припускається з РНОКПП чи факту банківського обслуговування.',
      freshness: 'Параметри сесії та свіжості мають відповідати чинній специфікації; виконання не інтегровано.',
      signatureValidation: 'Криптографічний транспорт і перевірка відповіді за специфікацією ще не інтегровані.',
      prerequisites: 'Допуск абонента, договір, дозволені набори даних, вузол і тестування взаємодії.',
    } },
  { provider: 'qes', name: 'КЕП', state: 'AwaitingProviderContract', available: false, testOnly: false,
    upstream: ['Обраний кваліфікований надавач', 'Довірчий список ЦЗО', 'Сервіси перевірки чинності сертифіката'], capabilities: {
      subject: 'Узгоджений профіль сертифіката та правило зіставлення фізичної особи ще не визначено.',
      rnokppOwner: 'Потрібні перевірений підпис challenge та визначений атрибут фізичної особи в довіреному сертифікаті.',
      age: 'Не припускається з наявності КЕП.', citizenship: 'Не припускається з наявності КЕП.',
      freshness: 'Одноразовий challenge, строк сертифіката й статус відкликання потребують інтеграції.',
      signatureValidation: 'Кваліфікований verifier, ланцюжок довіри й статус сертифіката ще не інтегровані.',
      prerequisites: 'Профіль сертифікатів, перевірена бібліотека/сервіс, trust anchors та правила відкликання.',
    } },
]);
