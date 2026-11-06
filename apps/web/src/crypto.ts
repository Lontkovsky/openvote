import { z } from 'zod';
import { Envelope, Manifest, Receipt, ResultContract } from '../../../packages/domain/src/index.ts';
import type { ResultType } from '../../../packages/domain/src/index.ts';
import { request } from './api.ts';
declare global {
  interface Window {
    belenios: {
      checkCredential(params: unknown, credential: string, callbacks: { success(election: unknown): void; failure(code: string, detail: unknown): void }): void;
      encryptBallot(election: unknown, plaintext: number[][], callbacks: { success(ballot: string, tracker: string): void; failure(error: string): void }): void;
    };
  }
}
export async function hash(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function encrypt(electionRaw: string, credential: string, choice: number) {
  if (window.belenios === undefined) throw new Error('Криптографічний клієнт не завантажено. Голос не надіслано.');
  const election = await new Promise<unknown>((resolve, reject) => window.belenios.checkCredential(JSON.parse(electionRaw), credential,
    { success: resolve, failure: () => reject(new Error('Право участі не пройшло перевірку Belenios.')) }));
  return new Promise<{ ballot: string; tracker: string }>((resolve, reject) => window.belenios.encryptBallot(election,
    [[choice === 0 ? 1 : 0, choice === 1 ? 1 : 0, choice === 2 ? 1 : 0]],
    { success: (ballot, tracker) => resolve({ ballot, tracker }), failure: () => reject(new Error('Шифрування не завершено. Голос не надіслано.')) }));
}
export async function verifyReceipt(value: unknown, publicKey: string, pollId: string, manifestHash: string, expectedTracker?: string) {
  const signed = Envelope.parse(value);
  const der = publicKey.replace('-----BEGIN PUBLIC KEY-----', '').replace('-----END PUBLIC KEY-----', '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey('spki', Uint8Array.from(atob(der), c => c.charCodeAt(0)), { name: 'Ed25519' }, false, ['verify']);
  const valid = await crypto.subtle.verify({ name: 'Ed25519' }, key, Uint8Array.from(atob(signed.signature), c => c.charCodeAt(0)), new TextEncoder().encode(signed.payload));
  if (!valid) throw new Error('Підпис квитанції недійсний.');
  const receipt = Receipt.parse(JSON.parse(signed.payload));
  if (receipt.pollId !== pollId || receipt.manifestHash !== manifestHash || (expectedTracker !== undefined && receipt.tracker !== expectedTracker)) throw new Error('Квитанція належить іншому бюлетеню або питанню.');
  return receipt;
}
export const ElectionState = z.enum(['Scheduled', 'Open', 'Closed', 'Published', 'ResultsSuppressed', 'Cancelled', 'Invalidated']);
export type ElectionStateType = z.infer<typeof ElectionState>;
export const ElectionInfo = z.strictObject({ electionRaw: z.string(), manifestHash: z.string(), environment: z.string(), state: ElectionState, checkpointPublicKey: z.string() });

const TrackerReply = z.union([
  z.strictObject({ included: z.literal(false), scope: z.literal('InclusionOnly') }),
  z.strictObject({ included: z.literal(true), receipt: Envelope, scope: z.literal('InclusionOnly') }),
]);
const VoteId = z.string().regex(/^[A-Za-z0-9+/]{43}$/);
const VoteIdReply = z.union([
  z.strictObject({ included: z.literal(false), scope: z.literal('InclusionOnly') }),
  z.strictObject({ included: z.literal(true), pollId: z.string().regex(/^[A-Za-z0-9]{14}$/), receipt: Envelope, scope: z.literal('InclusionOnly') }),
]);

async function checkInclusion(pollId: string, tracker: string, receipt?: unknown): Promise<boolean> {
  const info = ElectionInfo.parse(await request('ballot', `/v1/elections/${pollId}/manifest`));
  if (receipt !== undefined) await verifyReceipt(receipt, info.checkpointPublicKey, pollId, info.manifestHash, tracker);
  const result = TrackerReply.parse(await request('ballot', `/v1/elections/${pollId}/tracker?tracker=${encodeURIComponent(tracker)}`));
  if (!result.included) return false;
  await verifyReceipt(result.receipt, info.checkpointPublicKey, pollId, info.manifestHash, tracker);
  return true;
}

export async function checkTrackerInclusion(pollId: string, tracker: string): Promise<boolean> {
  return checkInclusion(pollId, tracker);
}

export async function checkVoteIdInclusion(value: string): Promise<{ included: false } | {
  included: true; pollId: string; question: string; context: string; category: string;
  opensAt: string; closesAt: string; state: ElectionStateType; result: ResultType | null;
}> {
  const tracker = VoteId.parse(value);
  const result = VoteIdReply.parse(await request('ballot', `/v1/tracker?tracker=${encodeURIComponent(tracker)}`));
  if (!result.included) return { included: false };
  const info = ElectionInfo.parse(await request('ballot', `/v1/elections/${result.pollId}/manifest`));
  if (await hash(info.electionRaw) !== info.manifestHash) throw new Error('Зафіксований опис опитування не пройшов перевірку.');
  const manifest = Manifest.parse(JSON.parse(z.object({ description: z.string() }).parse(JSON.parse(info.electionRaw)).description));
  await verifyReceipt(result.receipt, info.checkpointPublicKey, result.pollId, info.manifestHash, tracker);
  const published = info.state === 'Published'
    ? ResultContract.parse(await request('ballot', `/v1/elections/${result.pollId}/result`))
    : null;
  return {
    included: true, pollId: manifest.id, question: manifest.question, context: manifest.context,
    category: manifest.category, opensAt: manifest.opensAt, closesAt: manifest.closesAt,
    state: info.state, result: published,
  };
}

export async function checkReceiptInclusion(value: unknown): Promise<boolean> {
  const receipt = Envelope.parse(value);
  const claim = Receipt.parse(JSON.parse(receipt.payload));
  return checkInclusion(claim.pollId, claim.tracker, receipt);
}
