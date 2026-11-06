import { z } from 'zod';

export const Environment = z.enum(['development', 'test', 'demo']);
export const PollState = z.enum(['Draft', 'Review', 'Scheduled', 'Open', 'Closed', 'Tallying', 'Published', 'Rejected', 'Cancelled', 'Invalidated', 'ResultsSuppressed']);
export const Answers = ['Підтримую', 'Не підтримую', 'Утримуюсь'] as const;
export const representativenessWarning = 'Добровільна участь із самовідбором. Результат описує учасників цього голосування й не є автоматично репрезентативною думкою населення.';
export const Question = z.string().min(12).max(240).regex(/^[\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]*$/u, 'Питання містить неприпустимий керівний символ');
export const Categories = ['Громада', 'Освіта', 'Культура', 'Технології', 'Економіка', 'Довкілля', 'Соціальні питання', 'Політика'];
export const Policy = z.strictObject({
  id: z.literal('verified-rnokpp-owner'), version: z.literal(1),
  minimumAge: z.number().int().min(0).max(120).optional(), citizenship: z.string().regex(/^[A-Z]{2}$/).optional(),
});
export const Attributes = z.strictObject({
  verifiedOwner: z.boolean(), age: z.number().int().min(0).max(120), citizenship: z.string().regex(/^[A-Z]{2}$/),
});
export const Source = z.strictObject({
  text: z.string().min(5).max(1500),
  url: z.url().refine(value => new URL(value).protocol === 'https:', 'Потрібне HTTPS-посилання'),
});
export const Content = z.strictObject({
  question: Question, context: z.string().max(8000), consequences: z.string().max(3000),
  argumentsFor: z.array(Source).max(5), argumentsAgainst: z.array(Source).max(5),
  category: z.string().refine(value => Categories.includes(value)), authorAlias: z.string().min(3).max(60).nullable(),
  policy: Policy, opensAt: z.iso.datetime(), closesAt: z.iso.datetime(),
  publicationThreshold: z.number().int().min(1).max(10000),
  relatedPolls: z.array(z.string().uuid()).max(10),
});
export const Manifest = Content.extend({
  id: z.string().uuid(), version: z.number().int().positive(), environment: Environment,
  core: z.literal('Belenios 3.3.0'), release: z.string().min(5),
  incidentPolicy: z.literal('SecurityIncident|LegalContentRemoval|InvalidProof; reason required; no result-based cancellation'),
});
export const Rubric = z.strictObject({
  singleProposal: z.boolean(), noDoubleNegation: z.boolean(), clearTerms: z.boolean(),
  explicitConsequences: z.boolean().optional(), factsSeparated: z.boolean(),
});
export const Review = z.strictObject({
  action: z.enum(['approve', 'reject', 'duplicate']), reason: z.string().min(12).max(2000), rubric: Rubric,
});
export const Envelope = z.strictObject({ payload: z.string(), signature: z.string() });
export const Session = z.strictObject({ person: z.string(), role: z.enum(['participant', 'moderator']), verifiedOwner: z.boolean(), expiresAt: z.iso.datetime() });
export const Attestation = z.strictObject({
  provider: z.enum(['A', 'B']), subject: z.string().regex(/^TEST-PERSON-\d{4}$/), challenge: z.string(),
  attributes: Attributes, issuedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
});
export const Poll = z.strictObject({
  id: z.string().uuid(), version: z.number().int().positive(), state: PollState, content: Content,
  createdAt: z.iso.datetime(), cryptoId: z.string().nullable(), manifestRaw: z.string().nullable(),
  review: Review.nullable(), methodologyStatus: z.enum(['Pending', 'Reviewed', 'Rejected']),
  contentStatus: z.enum(['Visible', 'Removed']),
});
export const CommentText = z.string().min(1).max(2000).refine(value => /\S/u.test(value), 'Коментар не може бути порожнім');
export const CommentReactionKind = z.enum(['like', 'dislike']);
export const CommentReactionToken = z.string().uuid();
export const DiscussionComment = z.strictObject({
  id: z.string().uuid(), pollId: z.string().uuid(), parentId: z.string().uuid().nullable(),
  text: CommentText.nullable(), createdAt: z.iso.datetime(), deleted: z.boolean(),
  likes: z.number().int().nonnegative(), dislikes: z.number().int().nonnegative(),
});
export const CommentsResponse = z.strictObject({ comments: z.array(DiscussionComment) });
export const CommentResponse = z.strictObject({ comment: DiscussionComment });
export const RemovedPoll = z.strictObject({
  id: z.string().uuid(), state: z.enum(['Cancelled', 'Invalidated']),
  contentStatus: z.literal('Removed'), reason: z.literal('LegalContentRemoval'),
});
export const Checkpoint = z.strictObject({
  protocol: z.literal('openvote-checkpoint-v1'), pollId: z.string(), manifestHash: z.string(),
  sequence: z.number().int().nonnegative(), previous: z.string().nullable(),
  archiveHash: z.string(), state: z.enum(['Scheduled', 'Open', 'Closed', 'Published', 'ResultsSuppressed', 'Cancelled', 'Invalidated']),
  receipts: z.array(z.string()),
});
export const Receipt = z.strictObject({ protocol: z.literal('openvote-receipt-v1'), pollId: z.string(), manifestHash: z.string(), tracker: z.string() });
export const ResultContract = z.strictObject({
  apiVersion: z.literal('v1'), question: Question, version: z.number().int().positive(), pollId: z.string().regex(/^[A-Za-z0-9]{14}$/), policy: Policy,
  acceptedVotes: z.number().int().nonnegative(),
  counts: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative()]),
  opensAt: z.iso.datetime(), closesAt: z.iso.datetime(), state: z.literal('Published'),
  verification: z.literal('ReferenceVerified'), selfSelected: z.literal(true), representativenessWarning: z.literal(representativenessWarning),
}).refine(value => value.counts.reduce((sum, count) => sum + count, 0) === value.acceptedVotes, 'RESULT_COUNT_MISMATCH')
  .refine(value => Date.parse(value.opensAt) < Date.parse(value.closesAt), 'INVALID_SCHEDULE');
export type PolicyType = z.infer<typeof Policy>;
export type AttributesType = z.infer<typeof Attributes>;
export type ContentType = z.infer<typeof Content>;
export type ManifestType = z.infer<typeof Manifest>;
export type PollType = z.infer<typeof Poll>;
export type DiscussionCommentType = z.infer<typeof DiscussionComment>;
export type CommentReactionKindType = z.infer<typeof CommentReactionKind>;
export type RemovedPollType = z.infer<typeof RemovedPoll>;
export type SessionType = z.infer<typeof Session>;
export type ResultType = z.infer<typeof ResultContract>;
export type EnvelopeType = z.infer<typeof Envelope>;

export function eligible(attributes: AttributesType, policy: PolicyType): boolean {
  return attributes.verifiedOwner && (policy.minimumAge === undefined || attributes.age >= policy.minimumAge)
    && (policy.citizenship === undefined || attributes.citizenship === policy.citizenship);
}
export function policyText(policy: PolicyType): string {
  return ['Підтверджений власник РНОКПП',
    ...(policy.minimumAge === undefined ? [] : [`вік від ${policy.minimumAge} років, підтверджений провайдером`]),
    ...(policy.citizenship === undefined ? [] : [`громадянство ${policy.citizenship}, підтверджене провайдером`])].join('; ');
}
export function percentage(count: number, total: number): string {
  if (total === 0) return '0,0';
  return (count / total * 100).toFixed(1).replace('.', ',');
}
export function validateSchedule(content: ContentType): void {
  if (Date.parse(content.closesAt) <= Date.parse(content.opensAt)) throw new Error('INVALID_SCHEDULE');
}
