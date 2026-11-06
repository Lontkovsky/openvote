import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { Checkpoint, Envelope, Manifest, Poll, Receipt } from '../packages/domain/src/index.ts';
import { CoreReport, digest, verifyChain } from '../packages/domain/src/checkpoints.ts';
import { AuditPackage, ObserverConfig, Observation, PublicView, RecoveryApproval, compareObservations, inspectObservation, observerChain, verifyPublicAudit } from '../packages/domain/src/observer.ts';
import { observePublic } from '../scripts/observer-client.ts';
import { localCore } from '../scripts/local-core.ts';

const execute = promisify(execFile);
const fixture = AuditPackage.parse(JSON.parse(await readFile('tests/fixtures/published-audit.json', 'utf8')));
const manifest = Manifest.parse(JSON.parse(z.object({ description: z.string() }).parse(JSON.parse(fixture.electionRaw)).description));
// The archive is the real browser-downloaded native fixture. Only the observer
// operator's envelope signatures are replaced by a fresh test test signer.
const keys = generateKeyPairSync('ed25519');
const publicKey = z.string().parse(keys.publicKey.export({ type: 'spki', format: 'pem' }));
const trusted = { pollId: fixture.result.pollId, manifestHash: digest(fixture.electionRaw), publicKey };
const signed = (payload: unknown) => {
  const text = JSON.stringify(payload);
  return Envelope.parse({ payload: text, signature: sign(null, Buffer.from(text), keys.privateKey).toString('base64') });
};
function chain(payloads: z.infer<typeof Checkpoint>[]) {
  const output: z.infer<typeof Envelope>[] = [];
  for (const [index, payload] of payloads.entries()) {
    const previous = output.at(-1);
    output.push(signed({ ...payload, sequence: index, previous: previous === undefined ? null : digest(JSON.stringify(previous)) }));
  }
  return output;
}
const payloads = fixture.checkpoints.map(value => Checkpoint.parse(JSON.parse(value.payload)));
const checkpoints = chain(payloads);
const audit = { ...fixture, checkpoints };
const poll = Poll.parse({ id: manifest.id, version: manifest.version, state: 'Published',
  content: Object.fromEntries(Object.keys(Poll.shape.content.shape).map(key => [key, Reflect.get(manifest, key)])),
  createdAt: manifest.opensAt, cryptoId: trusted.pollId, manifestRaw: fixture.electionRaw, review: null, methodologyStatus: 'Reviewed', contentStatus: 'Visible' });
const now = Date.parse(manifest.closesAt) + 1000;
let report: z.infer<typeof CoreReport>;
let config: z.infer<typeof ObserverConfig>;
let view: z.infer<typeof PublicView>;
type FixtureMode = 'normal' | 'rollback' | 'hidden' | 'missing-receipt' | 'manifest' | 'removed' | 'redirect' | 'large' | 'public-result' | 'corrupt-archive' | 'signature';
let mode: FixtureMode = 'normal';
const requests: { method: string | undefined; authorization: string | undefined; cookie: string | undefined; url: string | undefined }[] = [];
const server = createServer((request, response) => {
  requests.push({ method: request.method, authorization: request.headers.authorization, cookie: request.headers.cookie, url: request.url });
  if (mode === 'redirect') { response.writeHead(302, { location: '/unexpected' }); response.end(); return; }
  response.setHeader('content-type', 'application/json; charset=utf-8');
  if (mode === 'large') { response.end(' '.repeat(8 * 1024 * 1024 + 1)); return; }
  const base = '/v1/elections/' + trusted.pollId;
  let value: unknown;
  if (request.url === base + '/manifest') value = mode === 'manifest' ? { ...view.manifest, electionRaw: view.manifest.electionRaw + ' ' } : view.manifest;
  else if (request.url === base + '/checkpoints') {
    if (mode === 'rollback') value = { ...view.checkpoints, checkpoints: checkpoints.slice(0, 1) };
    else if (mode === 'signature') value = { ...view.checkpoints, checkpoints: checkpoints.map((envelope, index) => index === 0 ? { ...envelope, signature: Buffer.alloc(64).toString('base64') } : envelope) };
    else value = view.checkpoints;
  }
  else if (request.url === base + '/audit') value = mode === 'corrupt-archive' ? { ...audit, archive: Buffer.from('not a native archive').toString('base64') } : audit;
  else if (request.url === base + '/result') value = mode === 'public-result' ? { ...audit.result, counts: [2, 1, 0] } : audit.result;
  else if (request.url?.startsWith(base + '/tracker?')) value = mode === 'missing-receipt' ? { included: false, scope: 'InclusionOnly' } : view.trackerReplies[0];
  else if (request.url === '/v1/polls') value = mode === 'hidden' ? { polls: [] } : view.catalogue;
  else if (request.url === '/v1/polls/' + manifest.id) value = mode === 'removed' ? { id: manifest.id, contentStatus: 'Removed' } : view.poll;
  else { response.writeHead(404); response.end('{}'); return; }
  response.end(JSON.stringify(value));
});

beforeAll(async () => {
  report = CoreReport.parse(await localCore({ action: 'verify', archive: fixture.archive }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('TEST_SERVER_NOT_BOUND');
  const origin = 'http://127.0.0.1:' + address.port;
  const receipt = signed(Receipt.parse({ protocol: 'openvote-receipt-v1', pollId: trusted.pollId, manifestHash: trusted.manifestHash, tracker: report.trackers[0] }));
  config = ObserverConfig.parse({ ballotOrigin: origin, managementOrigin: origin, trust: trusted, receipts: [receipt] });
  view = PublicView.parse({ manifest: { electionRaw: fixture.electionRaw, manifestHash: trusted.manifestHash, checkpointPublicKey: publicKey },
    checkpoints: { checkpoints, publicKey }, catalogue: { polls: [poll] }, poll: { poll }, trackerReplies: [{ included: true, receipt, scope: 'InclusionOnly' }], audit, result: audit.result, reference: report });
}, 30000);
beforeEach(() => { mode = 'normal'; requests.length = 0; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

describe('independent public observer', () => {
  it('checks the real native archive and binds every public result field to its manifest', () => {
    expect(verifyPublicAudit(audit, trusted, report, now)).toEqual({ archiveHash: digest(Buffer.from(audit.archive, 'base64')) });
    expect(() => verifyPublicAudit({ ...audit, result: { ...audit.result, question: 'Чи підтримуєте підмінене формулювання тестового питання?' } }, trusted, report, now)).toThrow('AUDIT_RESULT_CONTRACT_MISMATCH');
    expect(() => verifyPublicAudit(audit, trusted, report, Date.parse(manifest.closesAt) - 1)).toThrow('EARLY_PUBLICATION');
    expect(() => verifyPublicAudit({ ...audit, archive: Buffer.from('not a native archive').toString('base64') }, trusted, report, now)).toThrow('AUDIT_ARCHIVE_MISMATCH');
  });

  it('detects rollback, manifest/content replacement and a hidden completed poll', () => {
    const prior = inspectObservation(config, view, null, now);
    expect(inspectObservation(config, view, prior, now)).toEqual(prior);
    expect(() => inspectObservation(config, { ...view, checkpoints: { checkpoints: checkpoints.slice(0, 1), publicKey } }, prior, now)).toThrow('OBSERVER_HISTORY_ROLLBACK');
    expect(() => inspectObservation(config, { ...view, manifest: { ...view.manifest, electionRaw: view.manifest.electionRaw + ' ' } }, prior, now)).toThrow('OBSERVER_MANIFEST_CHANGED');
    expect(() => inspectObservation(config, { ...view, poll: { poll: { ...poll, content: { ...poll.content, context: poll.content.context + ' Підміна.' } } } }, prior, now)).toThrow('VISIBLE_CONTENT_CHANGED');
    expect(() => inspectObservation(config, { ...view, catalogue: { polls: [] } }, prior, now)).toThrow('OBSERVED_POLL_HIDDEN');
    expect(() => inspectObservation(config, view, prior, Date.parse(manifest.closesAt) - 1)).toThrow('EARLY_CLOSE_OBSERVED');
  });

  it('detects disappearing acknowledgements and never forgets previously observed receipts', () => {
    const prior = inspectObservation(config, view, null, now);
    expect(() => inspectObservation(config, { ...view, trackerReplies: [{ included: false, scope: 'InclusionOnly' }] }, prior, now)).toThrow('ACKNOWLEDGED_BALLOT_MISSING');
    expect(() => inspectObservation({ ...config, receipts: [] }, { ...view, trackerReplies: [] }, prior, now)).toThrow('OBSERVED_RECEIPT_REMOVED_FROM_CONFIG');
    const knownReceipt = config.receipts[0];
    if (knownReceipt === undefined) throw new Error('FIXTURE_RECEIPT_MISSING');
    const tracker = Receipt.parse(JSON.parse(knownReceipt.payload)).tracker;
    const omitted = chain(payloads.map(payload => ({ ...payload, receipts: payload.receipts.filter(value => value !== tracker) })));
    expect(() => inspectObservation(config, { ...view, checkpoints: { checkpoints: omitted, publicKey } }, null, now)).toThrow('ACKNOWLEDGED_BALLOT_MISSING');
  });

  it('rejects forged signatures, signer substitution and receipts for another manifest', () => {
    expect(ObserverConfig.safeParse({ ...config, trust: { ...config.trust, pollId: '../internal' } }).success).toBe(false);
    const first = checkpoints[0];
    if (first === undefined) throw new Error('FIXTURE_CHECKPOINTS_MISSING');
    expect(() => observerChain([{ ...first, signature: Buffer.alloc(64).toString('base64') }, ...checkpoints.slice(1)], trusted)).toThrow('CHECKPOINT_SIGNATURE_INVALID');
    expect(() => inspectObservation(config, { ...view, manifest: { ...view.manifest, checkpointPublicKey: 'another-signer' } }, null, now)).toThrow('OBSERVER_SIGNER_CHANGED');
    const envelope = config.receipts[0];
    if (envelope === undefined) throw new Error('FIXTURE_RECEIPT_MISSING');
    const foreignReceipt = signed({ ...Receipt.parse(JSON.parse(envelope.payload)), manifestHash: 'another-manifest' });
    expect(() => inspectObservation({ ...config, receipts: [foreignReceipt] }, view, null, now)).toThrow('RECEIPT_MANIFEST_MISMATCH');
  });

  it('rejects ballot additions after the committed closed set and illegal state transitions', () => {
    const changed = payloads.map(payload => payload.state === 'Published' ? { ...payload, receipts: [...payload.receipts, 'additional-tracker'] } : payload);
    const signedAddition = chain(changed);
    expect(() => verifyChain(signedAddition, trusted)).not.toThrow();
    expect(() => observerChain(signedAddition, trusted)).toThrow('CLOSED_BALLOT_SET_CHANGED');
    const genesis = payloads[0], published = payloads[2];
    if (genesis === undefined || published === undefined) throw new Error('FIXTURE_CHECKPOINTS_MISSING');
    expect(() => observerChain(chain([genesis, published]), trusted)).toThrow('CHECKPOINT_STATE_TRANSITION_INVALID');
  });

  it('detects split views only when incompatible signed evidence is compared', () => {
    const closedPayloads = payloads.slice(0, 2), closedChain = chain(closedPayloads);
    const forkedChain = chain(closedPayloads.map(payload => payload.state === 'Closed' ? { ...payload, archiveHash: 'operator-signed-other-archive' } : payload));
    const closedView = { ...view, checkpoints: { checkpoints: closedChain, publicKey }, poll: { poll: { ...poll, state: 'Closed' } }, audit: null, result: null, reference: null };
    const left = inspectObservation(config, closedView, null, now);
    const right = inspectObservation(config, { ...closedView, checkpoints: { checkpoints: forkedChain, publicKey } }, null, now);
    expect(left.verification).toBe('CheckpointsOnly'); expect(right.verification).toBe('CheckpointsOnly');
    expect(() => compareObservations(trusted, left, right)).toThrow('OBSERVER_SPLIT_VIEW_DETECTED');
    expect(() => inspectObservation(config, { ...closedView, checkpoints: { checkpoints: forkedChain, publicKey } }, left, now)).toThrow('OBSERVER_HISTORY_FORK');
    expect(compareObservations(trusted, left, inspectObservation(config, view, left, now)).comparedCheckpoints).toBe(2);
  });

  it('uses public GETs without identity access and performs native proof verification', async () => {
    const { observation } = await observePublic(config, null);
    expect(observation.verification).toBe('ReferenceVerified');
    expect(requests).toHaveLength(7);
    expect(requests.every(request => request.method === 'GET' && request.authorization === undefined && request.cookie === undefined)).toBe(true);
    expect(JSON.stringify(observation)).not.toContain('electionRaw');
    expect(JSON.stringify(observation)).not.toContain('"archive":');
    const failures: [FixtureMode, string][] = [
      ['rollback', 'OBSERVER_HISTORY_ROLLBACK'], ['hidden', 'OBSERVED_POLL_HIDDEN'], ['missing-receipt', 'ACKNOWLEDGED_BALLOT_MISSING'],
      ['manifest', 'OBSERVER_MANIFEST_CHANGED'], ['removed', 'PUBLIC_CONTENT_REMOVED'], ['public-result', 'PUBLIC_RESULT_VIEW_CHANGED'],
      ['corrupt-archive', 'LOCAL_REFERENCE_REJECTED'], ['signature', 'CHECKPOINT_SIGNATURE_INVALID'],
    ];
    for (const [failure, code] of failures) {
      mode = failure; requests.length = 0;
      await expect(observePublic(config, observation)).rejects.toThrow(code);
      if (failure === 'signature') expect(requests.some(request => request.url?.endsWith('/audit'))).toBe(false);
    }
  }, 30000);

  it('refuses redirects and responses larger than eight MiB without automatic retries', async () => {
    mode = 'redirect'; await expect(observePublic(config, null)).rejects.toThrow();
    expect(requests.some(request => request.url === '/unexpected')).toBe(false);
    mode = 'large'; await expect(observePublic(config, null)).rejects.toThrow('PUBLIC_RESPONSE_TOO_LARGE');
  }, 30000);

  it('initializes atomically, preserves history on failures and refuses implicit reinitialization', async () => {
    const directory = await mkdtemp('.runtime/observer-test-');
    try {
      const configFile = join(directory, 'trust.json'), stateFile = join(directory, 'state.json');
      await writeFile(configFile, JSON.stringify(config));
      const run = (action: string, target = stateFile) => execute(process.execPath, ['scripts/observer.ts', action, configFile, target], { timeout: 30000 });
      expect((await run('init')).stdout).toContain('ConsistentObservationSaved');
      const original = await readFile(stateFile, 'utf8');
      expect(Observation.parse(JSON.parse(original)).verification).toBe('ReferenceVerified');
      expect((await run('check')).stdout).toContain('ConsistentObservationSaved');
      await expect(run('init')).rejects.toThrow();
      expect(await readFile(stateFile, 'utf8')).toBe(original);
      mode = 'hidden'; await expect(run('check')).rejects.toThrow();
      expect(await readFile(stateFile, 'utf8')).toBe(original);
      await expect(run('check', join(directory, 'missing.json'))).rejects.toThrow();
      await expect(readFile(join(directory, 'missing.json'))).rejects.toMatchObject({ code: 'ENOENT' });
      const comparison = await execute(process.execPath, ['scripts/observer.ts', 'compare', configFile, stateFile, stateFile]);
      expect(comparison.stdout).toContain('CompatibleCheckpointPrefixes');
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 60000);

  it('exports a natively verified public audit without overwriting an existing package', async () => {
    const directory = await mkdtemp('.runtime/observer-export-test-');
    try {
      const configFile = join(directory, 'trust.json'), output = join(directory, 'audit.json');
      await writeFile(configFile, JSON.stringify(config));
      const run = (target: string) => execute(process.execPath, ['scripts/audit-export.ts', configFile, target], { timeout: 30000 });
      expect((await run(output)).stdout).toContain('NativeAuditExported');
      const exported = await readFile(output, 'utf8');
      expect(AuditPackage.parse(JSON.parse(exported))).toEqual(audit);
      await expect(run(output)).rejects.toThrow();
      expect(await readFile(output, 'utf8')).toBe(exported);
      mode = 'removed';
      const removed = join(directory, 'removed.json');
      await expect(run(removed)).rejects.toThrow();
      await expect(readFile(removed)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 60000);

  it('exports a static read-only mirror that needs no identity service', async () => {
    const directory = await mkdtemp('.runtime/observer-mirror-test-');
    let mirrorServer: ReturnType<typeof createServer> | null = null;
    try {
      const configFile = join(directory, 'trust.json'), output = join(directory, 'mirror');
      await writeFile(configFile, JSON.stringify(config));
      const run = (target: string) => execute(process.execPath, ['scripts/mirror-export.ts', configFile, target], { timeout: 30000 });
      expect((await run(output)).stdout).toContain('ReadOnlyMirrorExported');
      expect(JSON.parse(await readFile(join(output, 'result.json'), 'utf8'))).toEqual(audit.result);
      expect(AuditPackage.parse(JSON.parse(await readFile(join(output, 'audit.json'), 'utf8')))).toEqual(audit);
      const html = await readFile(join(output, 'index.html'), 'utf8');
      expect(html).toContain(audit.result.question);
      expect(html).toContain('result.json');
      expect(html).toContain('audit.json');
      expect(html).not.toContain('<script');
      expect(requests).toHaveLength(7);
      expect(requests.every(request => request.method === 'GET' && request.authorization === undefined && request.cookie === undefined && !request.url?.includes('identity'))).toBe(true);

      mirrorServer = createServer((request, response) => {
        if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405); response.end(); return; }
        const name = request.url === '/' ? 'index.html' : request.url?.slice(1);
        if (name === undefined || !['index.html', 'result.json', 'audit.json'].includes(name)) { response.writeHead(404); response.end(); return; }
        void readFile(join(output, name)).then(body => {
          response.setHeader('content-type', name.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8');
          response.end(request.method === 'HEAD' ? undefined : body);
        }, () => { response.writeHead(500); response.end(); });
      });
      await new Promise<void>(resolve => mirrorServer?.listen(0, '127.0.0.1', resolve));
      const address = mirrorServer.address();
      if (address === null || typeof address === 'string') throw new Error('MIRROR_TEST_SERVER_NOT_BOUND');
      const origin = 'http://127.0.0.1:' + address.port;
      expect(await (await fetch(origin + '/')).text()).toContain(audit.result.question);
      expect(await (await fetch(origin + '/result.json')).json()).toEqual(audit.result);
      expect((await fetch(origin + '/audit.json')).status).toBe(200);
      expect((await fetch(origin + '/', { method: 'POST' })).status).toBe(405);

      await expect(run(output)).rejects.toThrow();
      mode = 'removed';
      const removed = join(directory, 'removed');
      await expect(run(removed)).rejects.toThrow();
      await expect(readFile(join(removed, 'index.html'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      if (mirrorServer !== null) await new Promise<void>((resolve, reject) => mirrorServer?.close(error => error ? reject(error) : resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  }, 60000);

  it('creates recovery approval only for state consistent with retained evidence', async () => {
    const directory = await mkdtemp('.runtime/observer-recovery-test-');
    try {
      const configFile = join(directory, 'trust.json'), priorFile = join(directory, 'prior.json'), approvalFile = join(directory, 'approval.json');
      await writeFile(configFile, JSON.stringify(config));
      await writeFile(priorFile, JSON.stringify((await observePublic(config, null)).observation));
      const run = (target: string) => execute(process.execPath, ['scripts/recovery-verify.ts', configFile, priorFile, target], { timeout: 30000 });
      expect((await run(approvalFile)).stdout).toContain('RecoveryEvidenceVerified');
      const approval = RecoveryApproval.parse(JSON.parse(await readFile(approvalFile, 'utf8')));
      expect(approval).toMatchObject({ format: 'openvote-recovery-approval-v1', pollId: trusted.pollId, checkpoints: checkpoints.length,
        verification: 'ReferenceVerified', publishedArchiveHash: digest(Buffer.from(audit.archive, 'base64')) });
      await expect(run(approvalFile)).rejects.toThrow();

      mode = 'missing-receipt';
      const missing = join(directory, 'missing.json');
      await expect(run(missing)).rejects.toThrow();
      await expect(readFile(missing)).rejects.toMatchObject({ code: 'ENOENT' });
      mode = 'rollback';
      const stale = join(directory, 'stale.json');
      await expect(run(stale)).rejects.toThrow();
      await expect(readFile(stale)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 60000);
});
