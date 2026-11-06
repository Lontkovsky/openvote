import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Manifest } from '../../../packages/domain/src/index.ts';
import { AuditPackage } from '../../../packages/domain/src/observer.ts';

const DevelopmentPublished = z.strictObject({
  managementId: z.string().uuid(),
  publicKey: z.string().min(1),
  audit: AuditPackage,
});

const stored = DevelopmentPublished.parse(JSON.parse(readFileSync(new URL('../fixtures/development-published.json', import.meta.url), 'utf8')));
const election = z.strictObject({ uuid: z.string(), description: z.string() }).passthrough().parse(JSON.parse(stored.audit.electionRaw));
const manifest = Manifest.parse(JSON.parse(election.description));

if (election.uuid !== stored.audit.result.pollId || manifest.id !== stored.managementId) {
  throw new Error('DEVELOPMENT_PUBLISHED_FIXTURE_MISMATCH');
}

export const developmentPublished = { ...stored, manifest };
