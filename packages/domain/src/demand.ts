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

export const demandFaqIntro = 'OpenVote створюється, щоб кожен міг винести важливе питання на відкрите голосування, побачити чесний результат і не відмовлятися заради цього від приватності.';
export const demandFaqItems = [
  { question: 'Для чого створюється OpenVote?', answer: 'Від ідей для стартапів і місцевих рішень до культурних та громадських ініціатив. Кожен підтверджений учасник зможе поставити чітке питання, додати контекст, аргументи й джерела та побачити, скільки людей його підтримують.' },
  { question: 'Чим OpenVote відрізняється від петицій?', answer: 'Петиція просить певну установу розглянути звернення. OpenVote допоможе поставити питання людям і зібрати перевірювану позицію учасників. Це не офіційний референдум, а відкритий спосіб швидко побачити реальний інтерес до конкретної ідеї.' },
  { question: 'Чи залишиться мій вибір анонімним?', answer: 'Так. Ваш вибір не публікуватиметься під вашим ім’ям. OpenVote не створюватиме історію «хто за що голосував» і не розкриватиме вашу позицію за вас. Говорити про власний вибір відкрито чи ні — вирішуватимете тільки ви.' },
  { question: 'Що станеться, якщо хтось отримає доступ до бази голосування?', answer: 'Він не побачить там вашого імені, документів, контактів або зв’язку між вами й вибором. Персональні дані не зберігатимуться разом із голосами. У базі голосування будуть лише захищені записи, потрібні для підрахунку й публічної перевірки.' },
  { question: 'Чи зможе одна людина проголосувати кілька разів?', answer: 'Ні. Повна платформа працюватиме за правилом «одна підтверджена людина — один врахований голос» у кожному голосуванні. Додаткові пристрої, облікові записи або способи підтвердження особи не збільшуватимуть вагу голосу.' },
  { question: 'Чи можна підробити результат?', answer: 'Непомітно підробити результат не вийде. Разом із підсумком OpenVote публікуватиме матеріали, за якими фахівці зможуть перевірити, що прийняті голоси враховані правильно, а результат не був змінений.' },
  { question: 'Чи можна купити голос або змусити людину довести свій вибір?', answer: 'OpenVote не видаватиме іменних довідок про конкретний вибір. Підтвердження покаже, що голос врахований, але не розкриє, за що саме проголосувала людина. Платформа не дасть покупцю голосу вбудованого способу перевірити чужий вибір.' },
  { question: 'Як переконатися, що сама платформа діє чесно?', answer: 'Код OpenVote відкритий і доступний на GitHub. Правила голосувань, методика підрахунку та матеріали для перевірки результатів також будуть публічними, щоб фахівці могли перевіряти не лише наші слова, а й роботу системи.' },
  { question: 'OpenVote буде безкоштовним?', answer: 'Базове користування платформою планується безкоштовним. OpenVote створюється заради суспільної користі, а не прибутку: у першій версії не буде реклами, продажу даних або платного впливу на результати.' },
] as const;

export const DemandChatRequest = z.strictObject({
  question: z.string().min(3).max(400).regex(/\S/u),
});
export const DemandChatResponse = z.strictObject({
  answer: z.string().min(1).max(2400).regex(/\S/u),
});

export type DemandAnswerType = z.infer<typeof DemandAnswer>;
export type DemandPollStatusType = z.infer<typeof DemandPollStatus>;
export type DemandResponseReceiptType = z.infer<typeof DemandResponseReceipt>;
export type DemandChatRequestType = z.infer<typeof DemandChatRequest>;
export type DemandChatResponseType = z.infer<typeof DemandChatResponse>;
