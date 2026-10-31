import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Checkpoint, Envelope, Manifest } from '../packages/domain/src/index.ts';
import { CoreReport, FinalSet, Trust, digest, verifyFinal } from '../packages/domain/src/checkpoints.ts';
import { Ceremony } from '../apps/api/src/provisioning.ts';
import { fixtureContent } from './support/flow.ts';
import { localCore } from '../scripts/local-core.ts';
import { prepareTrusteeShare } from '../scripts/trustee-client.ts';

const signing = generateKeyPairSync('ed25519');
const signed = (payload: unknown) => {
  const text = JSON.stringify(Checkpoint.parse(payload));
  return Envelope.parse({ payload: text, signature: sign(null, Buffer.from(text), signing.privateKey).toString('base64') });
};
const Variants = z.strictObject({ subset: z.string(), single: z.string(), two: z.string(), empty: z.string(), open: z.string(), individualAggregate: z.string() });
let variants: z.infer<typeof Variants>, setup: z.infer<typeof Ceremony>, final: z.infer<typeof FinalSet>, trust: z.infer<typeof Trust>, report: z.infer<typeof CoreReport>;
const directories: string[] = [];
const now = Date.parse('2026-01-03T00:00:00Z');

async function directory() {
  const path = await mkdtemp('.runtime/trustee-client-test-'); directories.push(path); return path;
}
function signedFinal(archive: string, trackers: string[]) {
  const genesis = final.checkpoints[0];
  if (genesis === undefined) throw new Error('FIXTURE_GENESIS_MISSING');
  return FinalSet.parse({ ...final, archive, checkpoints: [genesis, signed({ protocol: 'openvote-checkpoint-v1',
    pollId: trust.pollId, manifestHash: trust.manifestHash, sequence: 1, previous: digest(JSON.stringify(genesis)),
    archiveHash: digest(Buffer.from(archive, 'base64')), state: 'Closed', receipts: trackers })] });
}

beforeAll(async () => {
  const manifest = Manifest.parse({ ...fixtureContent(new Date('2026-01-02T00:00:00Z'), 'Чи підтримуєте перевірку фінальності синтетичного підрахунку?'),
    opensAt: '2026-01-01T00:00:00.000Z', id: randomUUID(), version: 1, environment: 'test', core: 'Belenios 3.3.0', release: '0.1.0-dev.1',
    incidentPolicy: 'SecurityIncident|LegalContentRemoval|InvalidProof; reason required; no result-based cancellation' });
  const persons = ['TEST-PERSON-0001', 'TEST-PERSON-0002', 'TEST-PERSON-0003', 'TEST-PERSON-0004', 'TEST-PERSON-0005'];
  setup = Ceremony.parse(await localCore({ action: 'setup', manifest, persons }));
  let archive = setup.archive;
  for (const person of persons) {
    const ballot = z.object({ ballot: z.string() }).parse(await localCore({ action: 'generate-test-ballot', archive, credential: setup.privateCredentials[person], choice: [[1, 0, 0]] })).ballot;
    archive = z.object({ archive: z.string() }).parse(await localCore({ action: 'accept', archive, ballot })).archive;
  }
  archive = z.object({ archive: z.string() }).parse(await localCore({ action: 'close', archive })).archive;
  report = CoreReport.parse(await localCore({ action: 'verify', archive }));
  trust = Trust.parse({ pollId: setup.uuid, manifestHash: digest(setup.electionRaw), publicKey: signing.publicKey.export({ type: 'spki', format: 'pem' }) });
  const genesis = signed({ protocol: 'openvote-checkpoint-v1', pollId: setup.uuid, manifestHash: trust.manifestHash, sequence: 0,
    previous: null, archiveHash: digest(Buffer.from(setup.archive, 'base64')), state: 'Scheduled', receipts: [] });
  final = FinalSet.parse({ electionRaw: setup.electionRaw, archive, checkpoints: [genesis] });
  final = signedFinal(archive, report.trackers);
  variants = Variants.parse(await new Promise((resolve, reject) => {
    const child = spawn('docker', ['run', '--rm', '-i', '--network', 'none', '--platform', 'linux/amd64', '--read-only',
      '--tmpfs', '/tmp:size=256m,mode=1777', '--memory', '512m', '--cpus', '2', '-v', process.cwd() + '/tools:/tools:ro',
      '--entrypoint', 'python3', 'openvote-crypto:3.3.0', '/tools/test_archive_variants.py'], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 90000 });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; }); child.stderr.resume();
    child.on('error', reject); child.on('exit', code => {
      if (code !== 0) reject(new Error('PUBLIC_FIXTURE_CREATION_FAILED'));
      else { try { resolve(JSON.parse(output)); } catch { reject(new Error('PUBLIC_FIXTURE_INVALID')); } }
    });
    child.stdin.end(JSON.stringify({ archive }));
  }));
}, 90000);
afterAll(async () => { for (const path of directories) await rm(path, { recursive: true, force: true }); });

describe('actual native trustee client guards', () => {
  it('rejects an individual ciphertext substituted for the full aggregate before accessing a key', async () => {
    const path = await directory();
    await expect(prepareTrusteeShare(signedFinal(variants.individualAggregate, report.trackers), trust, path, 1, now)).rejects.toThrow('LOCAL_REFERENCE_REJECTED');
    expect(await readdir(path)).toEqual([]);
  });
  it('rejects removal of one of five accepted ballots even when the reduced group is above threshold', async () => {
    const path = await directory(), subset = CoreReport.parse(await localCore({ action: 'verify', archive: variants.subset }));
    expect(subset.ballotCount).toBe(4);
    await expect(prepareTrusteeShare({ ...final, archive: variants.subset }, trust, path, 1, now)).rejects.toThrow('FINAL_ARCHIVE_MISMATCH');
    await expect(prepareTrusteeShare(signedFinal(variants.subset, report.trackers), trust, path, 1, now)).rejects.toThrow('FINAL_SET_MISMATCH');
    expect(await readdir(path)).toEqual([]);
  });
  it('rejects another election and both forms of premature tally before creating any local commitment', async () => {
    const path = await directory(), other = z.object({ electionRaw: z.string(), archive: z.string() }).parse(JSON.parse(await readFile('tests/fixtures/published-audit.json', 'utf8')));
    await expect(prepareTrusteeShare({ ...final, archive: other.archive, electionRaw: other.electionRaw }, trust, path, 1, now)).rejects.toThrow('FINAL_MANIFEST_MISMATCH');
    await expect(prepareTrusteeShare(final, trust, path, 1, Date.parse('2026-01-01T12:00:00Z'))).rejects.toThrow('NOT_UNPUBLISHED_FINAL_TALLY');
    await expect(prepareTrusteeShare({ ...final, archive: variants.open }, trust, path, 1, now)).rejects.toThrow('NOT_UNPUBLISHED_FINAL_TALLY');
    expect(await readdir(path)).toEqual([]);
  });
  it.each(['empty', 'single', 'two'])('never creates or validates decryption shares for the %s sub-threshold group', async name => {
    const archive = z.string().parse(Reflect.get(variants, name)), path = await directory();
    const small = CoreReport.parse(await localCore({ action: 'verify', archive }));
    expect(small.ballotCount).toBeLessThan(3);
    await expect(prepareTrusteeShare(signedFinal(archive, small.trackers), trust, path, 1, now)).rejects.toThrow('RESULTS_SUPPRESSED');
    await expect(localCore({ action: 'share', archive, trustee: setup.trustees[0] })).rejects.toThrow('LOCAL_REFERENCE_REJECTED');
    await expect(localCore({ action: 'verify-share', archive, share: 'invalid unpublishable input' })).rejects.toThrow('LOCAL_REFERENCE_REJECTED');
    await expect(localCore({ action: 'finalize', archive, shares: [] })).rejects.toThrow('LOCAL_REFERENCE_REJECTED');
    expect(await readdir(path)).toEqual([]);
  }, 20000);
  it('persists one final set, reuses identical shares and refuses an independently valid alternative subset', async () => {
    const path = await directory();
    await writeFile(path + '/private.json', JSON.stringify(setup.trustees[0]), { mode: 0o600, flag: 'wx' });
    const share = await prepareTrusteeShare(final, trust, path, 1, now);
    expect(await localCore({ action: 'verify-share', archive: final.archive, share })).toEqual({ verifiedBy: 'Belenios 3.3.0 check_factor', trusteeId: 1 });
    expect(await prepareTrusteeShare(final, trust, path, 1, now)).toBe(share);
    const binding = await readFile(path + '/final.sha256', 'utf8');
    const subset = CoreReport.parse(await localCore({ action: 'verify', archive: variants.subset }));
    const alternate = signedFinal(variants.subset, subset.trackers);
    // A signer can produce a self-consistent first fork. External acknowledgement
    // evidence is required to distinguish that fork before any final binding.
    expect(() => verifyFinal(alternate, trust, subset, now, null)).not.toThrow();
    await expect(prepareTrusteeShare(alternate, trust, path, 1, now)).rejects.toThrow('TRUSTEE_FINAL_SET_ALREADY_BOUND');
    expect(await readFile(path + '/final.sha256', 'utf8')).toBe(binding);
    expect(await readFile(path + '/share.jsons', 'utf8')).toBe(share);
    const shares = [share];
    for (const trustee of setup.trustees.slice(1, 3)) shares.push(z.object({ share: z.string() }).parse(await localCore({ action: 'share', archive: final.archive, trustee })).share);
    const published = z.object({ archive: z.string() }).parse(await localCore({ action: 'finalize', archive: final.archive, shares }));
    const unanimous = CoreReport.parse(await localCore({ action: 'verify', archive: published.archive }));
    expect(unanimous.result).toEqual({ result: [[5, 0, 0]] });
    // The threshold permits this result; knowing that somebody participated in
    // a unanimous poll reveals their answer. No absolute privacy claim follows.
  }, 30000);

  it('rejects a replaced stored share before returning file data to the caller', async () => {
    const path = await directory(), outside = await directory();
    await writeFile(path + '/private.json', JSON.stringify(setup.trustees[0]), { mode: 0o600, flag: 'wx' });
    await prepareTrusteeShare(final, trust, path, 1, now);
    await writeFile(outside + '/not-a-share', 'synthetic file data outside the trustee directory', { mode: 0o600, flag: 'wx' });
    await rm(path + '/share.jsons');
    await symlink(resolve(outside + '/not-a-share'), path + '/share.jsons');
    await expect(prepareTrusteeShare(final, trust, path, 1, now)).rejects.toThrow('LOCAL_REFERENCE_REJECTED');
  }, 30000);
});
