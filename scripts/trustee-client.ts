import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { FinalSet, verifyFinal } from '../packages/domain/src/checkpoints.ts';
import { Ceremony, writeOnce } from '../apps/api/src/provisioning.ts';
import { core, Failure, parseNativeShare, readConfig } from '../apps/api/src/common.ts';

async function operatorCore(config: Awaited<ReturnType<typeof readConfig>>, input: unknown, ceremony = false): Promise<unknown> {
  try { return await core(config, input, ceremony); }
  catch (error) {
    if (error instanceof Failure && error.statusCode === 422) throw new Error('LOCAL_REFERENCE_REJECTED');
    throw new Error('LOCAL_REFERENCE_UNAVAILABLE');
  }
}

// Shared by the actual operator CLI and adversarial tests. No private key is
// read and no share is created until the native archive and finality guard pass.
export async function prepareTrusteeShare(input: unknown, trust: unknown, directory: string, trusteeId: number, now: number) {
  const final = FinalSet.parse(input);
  let prior: string | null = null;
  try { prior = await readFile(`${directory}/final.sha256`, 'utf8'); }
  catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
  const config = await readConfig('ballot');
  const reference = await operatorCore(config, { action: 'verify', archive: final.archive });
  const { finalHash } = verifyFinal(final, trust, reference, now, prior);
  await writeOnce(`${directory}/final.sha256`, finalHash);
  let share: string;
  try {
    share = parseNativeShare(await readFile(`${directory}/share.jsons`, 'utf8'), trusteeId);
    const verified = z.strictObject({ verifiedBy: z.literal('Belenios 3.3.0 check_factor'), trusteeId: z.number().int() }).parse(
      await operatorCore(config, { action: 'verify-share', archive: final.archive, share }));
    if (verified.trusteeId !== trusteeId) throw new Error('TRUSTEE_ROLE_MISMATCH');
  }
  catch (error) {
    if (error instanceof Failure && error.statusCode === 422) throw new Error('LOCAL_REFERENCE_REJECTED');
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    const trustee = Ceremony.shape.trustees.element.parse(JSON.parse(await readFile(`${directory}/private.json`, 'utf8')));
    if (trustee.id !== trusteeId) throw new Error('TRUSTEE_ROLE_MISMATCH');
    share = parseNativeShare(z.strictObject({ share: z.string() }).parse(
      await operatorCore(config, { action: 'share', archive: final.archive, trustee }, true)).share, trusteeId);
    await writeOnce(`${directory}/share.jsons`, share);
  }
  return share;
}
