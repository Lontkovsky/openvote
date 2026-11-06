import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { developmentCatalogue } from '../apps/api/src/development-polls.ts';
import { CoreReport, digest } from '../packages/domain/src/checkpoints.ts';
import { AuditPackage, verifyPublicAudit } from '../packages/domain/src/observer.ts';
import { localCore } from '../scripts/local-core.ts';

const StoredFixture = z.strictObject({ managementId: z.string().uuid(), publicKey: z.string().min(1), audit: AuditPackage });

describe('development poll states', () => {
  it('publishes a reference-verified 100-vote result and keeps later catalogue entries scheduled', async () => {
    const fixture = StoredFixture.parse(JSON.parse(await readFile('apps/api/fixtures/development-published.json', 'utf8')));
    const report = CoreReport.parse(await localCore({ action: 'verify', archive: fixture.audit.archive }));
    const verified = verifyPublicAudit(fixture.audit, {
      pollId: fixture.audit.result.pollId,
      manifestHash: digest(fixture.audit.electionRaw),
      publicKey: fixture.publicKey,
    }, report, Date.now());

    expect(fixture.audit.result).toMatchObject({ acceptedVotes: 100, counts: [57, 28, 15], verification: 'ReferenceVerified' });
    expect(verified.archiveHash).toBe(digest(Buffer.from(fixture.audit.archive, 'base64')));
    expect(developmentCatalogue[0]).toMatchObject({
      id: fixture.managementId,
      state: 'Published',
      cryptoId: fixture.audit.result.pollId,
      manifestRaw: fixture.audit.electionRaw,
    });
    expect(developmentCatalogue.slice(1).every(poll => poll.state === 'Scheduled' && poll.cryptoId === null)).toBe(true);
  }, 30000);
});
