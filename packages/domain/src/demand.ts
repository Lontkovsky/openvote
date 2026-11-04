import { z } from 'zod';
import { Answers, Question } from './index.ts';

export const demandPollId = 'platform-demand-v1';
export const demandQuestion = 'Чи потрібна вам незалежна відкрита платформа голосувань?';
export const demandAnswers = Answers;

export const DemandAnswer = z.enum(demandAnswers);
export const DemandResponse = z.strictObject({ answer: DemandAnswer });
export const DemandPollResults = z.strictObject({
  totalResponses: z.number().int().nonnegative(),
  counts: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]),
}).refine(value => value.counts.reduce((sum, count) => sum + count, 0) === value.totalResponses, {
  message: 'DEMAND_RESULT_TOTAL_MISMATCH',
});
export const DemandPollStatus = z.strictObject({
  apiVersion: z.literal('v1'),
  pollId: z.literal(demandPollId),
  version: z.literal(1),
  question: Question.pipe(z.literal(demandQuestion)),
  answers: z.tuple([
    z.literal(demandAnswers[0]),
    z.literal(demandAnswers[1]),
    z.literal(demandAnswers[2]),
  ]),
  selfSelected: z.literal(true),
  identityVerified: z.literal(false),
  uniquePersonGuaranteed: z.literal(false),
  response: DemandResponse.nullable(),
  results: DemandPollResults,
});
export const DemandResponseSubmission = z.strictObject({ answer: DemandAnswer });
export const DemandResponseReceipt = z.strictObject({
  recorded: z.literal(true),
  answer: DemandAnswer,
  results: DemandPollResults,
});

export const demandFaqIntro = 'OpenVote відкрито показує, що працює зараз, що реалізовано лише на синтетичних даних, які рішення вже прийняті та які питання ще не закриті.';
export const demandFaqItems = [
  { question: 'Для чого створюється OpenVote?', answer: 'OpenVote задуманий як громадська інформаційна платформа для чітких питань, контексту, аргументів і трьох однозначних відповідей. Її результати показуватимуть позицію учасників конкретного голосування, а не матимуть сили офіційного референдуму чи автоматично репрезентуватимуть Україну.' },
  { question: 'На якому етапі зараз OpenVote?', answer: 'Публічно працює лише сторінка перевірки попиту з одним опитуванням, FAQ і Тарасом. Повна платформа реалізована в репозиторії як синтетична development-система з тестовими особами та ключами, але ще не доступна для реальних identity-verified голосувань.' },
  { question: 'Що саме працює на цьому сайті зараз?', answer: 'Зараз можна відповісти на одне добровільне опитування, побачити поточні три лічильники, переглянути синтетичну демонстрацію, прочитати FAQ і поставити Тарасу питання. Це опитування не перевіряє особу, громадянство, вік або унікальність людини.' },
  { question: 'Чому OpenVote спростив формулювання на головній сторінці?', answer: 'Ми прибрали сильнішу організаційну обіцянку, бо зараз немає зовнішніх аудиторів або окремих реальних операторів, які могли б її підтвердити. V044 змінила лише презентаційний текст: версія питання, база та вже надані відповіді не змінювалися.' },
  { question: 'OpenVote — волонтерський і відкритий проєкт?', answer: 'Так. Зараз це волонтерська open-source ініціатива. Код, рішення, прогрес, issues, pull requests і перевірки публікуються в GitHub; власний код має ліцензію AGPL-3.0-only. Секрети, ключі та приватні матеріали безпеки не публікуються.' },
  { question: 'Чим OpenVote відрізняється від петицій?', answer: 'Петиція просить установу розглянути звернення. OpenVote має показувати позицію учасників щодо однієї пропозиції за визначеними правилами, строком і базою підрахунку. Це громадський інформаційний інструмент, а не офіційний або юридично обов’язковий процес.' },
  { question: 'Хто зможе голосувати у повній версії?', answer: 'Рішення власника для початкової реальної версії — громадяни України від 14 років після BankID НБУ. Це ще не production-функція: договору й готового BankID-адаптера немає, тому повна платформа працює лише із синтетичними особами.' },
  { question: 'Як планується підтверджувати особу і які дані зберігати?', answer: 'Початковий напрям — лише BankID НБУ, без фото чи копії паспорта і без ручного введення РНОКПП або дати народження як запасного шляху. Після перевірки має залишатися лише потрібний псевдонімний ідентифікатор; сирі атрибути BankID не планується зберігати.' },
  { question: 'Як відбуватиметься голосування і підрахунок?', answer: 'У синтетичній реалізації людина обирає одну з трьох відповідей, браузер шифрує остаточний вибір, а ballot-сервіс приймає один голос для poll-scoped права. Після закриття перевіряється фінальний набір, виконується tally і публікуються точні кількості та безпечні матеріали для перевірки.' },
  { question: 'Коли будуть видимі результати і як працює дедлайн?', answer: 'Для цільової платформи розподіл відповідей не показується до закриття. Дедлайн фіксований і автоматично закриває голосування; BankID-збій його не переносить. Заплановано, що автор зможе закрити раніше лише з причиною від 50 символів. Мінімального кворуму немає.' },
  { question: 'Чи залишиться мій вибір анонімним?', answer: 'Вибір не має публікуватися під ім’ям, а ballot-сервіс не повинен отримувати identity session або відкриту відповідь. Але абсолютна анонімність не обіцяється: ризики мережевої кореляції, об’єднання сховищ, скомпрометованого браузера, ключів і одностайного результату залишаються.' },
  { question: 'Що станеться, якщо хтось отримає доступ до бази голосування?', answer: 'Окрема ballot-база не містить імені, документів, контактів чи identity session. Проте розділення сховищ не захищає від оператора, який одночасно має identity-дані, ballot-дані й runtime-ключ: синтетичний тест показав можливість зв’язати псевдонім із ciphertext. Ця межа публічно задокументована.' },
  { question: 'Чи зможе одна людина проголосувати кілька разів?', answer: 'У повній синтетичній системі один election-scoped credential дає один остаточний голос. Повторна доставка тих самих байтів не додає голос, інший пізніший вибір відхиляється, а вхід через інший тестовий provider повертає те саме право. Реальна гарантія залежатиме від затвердженого BankID-контракту.' },
  { question: 'Чи можна підробити результат?', answer: 'Репозиторій уже перевіряє пошкоджені докази, повторні права, вилучення відомого бюлетеня, зміну manifest і підроблений результат на синтетичних даних. Це робить перевірюваними конкретні атаки, але не доводить, що оператор принципово не може вплинути на систему за будь-яких умов.' },
  { question: 'Хто розшифровуватиме й публікуватиме підсумок?', answer: 'Синтетична development-система використовує тестову threshold-схему Belenios, але всі тестові ролі контролює один оператор. Для спрощеної публічної V1 остаточна production-модель ключів, раннього доступу й публікації ще не затверджена. Тарас не повинен вигадувати зовнішніх операторів або обіцяти, що власники технічно нічого не бачать.' },
  { question: 'Чи можна купити голос або змусити людину довести свій вибір?', answer: 'OpenVote не видаватиме іменних довідок про конкретний вибір. Підтвердження покаже, що голос врахований, але не розкриє, за що саме проголосувала людина. Платформа не дасть покупцю голосу вбудованого способу перевірити чужий вибір.' },
  { question: 'Як публікуються рішення і прогрес розробки?', answer: 'Вимоги, рішення, фактичний прогрес, межі гарантій, issues, pull requests і CI-докази зберігаються у відкритому репозиторії. Публічна база знань має оновлюватися разом із кожною зміною поведінки чи продуктового рішення, але не містить секретів або деталей невиправлених приватних вразливостей.' },
  { question: 'OpenVote буде безкоштовним?', answer: 'Базове користування платформою планується безкоштовним. OpenVote створюється заради суспільної користі, а не прибутку: у першій версії не буде реклами, продажу даних або платного впливу на результати.' },
] as const;

export const DemandChatRequest = z.strictObject({
  question: z.string().min(3).max(400).regex(/\S/u),
});
export const DemandChatResponse = z.strictObject({
  answer: z.string().min(1).max(5000).regex(/\S/u),
});

export type DemandAnswerType = z.infer<typeof DemandAnswer>;
export type DemandPollResultsType = z.infer<typeof DemandPollResults>;
export type DemandPollStatusType = z.infer<typeof DemandPollStatus>;
export type DemandResponseReceiptType = z.infer<typeof DemandResponseReceipt>;
export type DemandChatRequestType = z.infer<typeof DemandChatRequest>;
export type DemandChatResponseType = z.infer<typeof DemandChatResponse>;
