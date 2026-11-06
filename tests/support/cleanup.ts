import { rm } from 'node:fs/promises';
import { z } from 'zod';
import { database, readConfig } from '../../apps/api/src/common.ts';

export async function cleanupBrowserFixtures(input: unknown) {
  const ids = z.array(z.string().uuid()).parse(input);
  const management = database(await readConfig('management'));
  const identity = database(await readConfig('identity'));
  const ballot = database(await readConfig('ballot'));
  try {
    for (const id of ids) {
      const rows = await management.query<{ doc: { cryptoId: string | null; content: { authorAlias: string } } }>('SELECT doc FROM polls WHERE id=$1', [id]);
      const poll = rows.rows[0]?.doc;
      if (poll === undefined) throw new Error('RECORDED_TEST_FIXTURE_MISSING');
      if (poll.content.authorAlias !== 'Браузерний тест') throw new Error('NOT_A_BROWSER_TEST_FIXTURE');
      if (poll.cryptoId !== null) {
        await identity.query('DELETE FROM credentials WHERE poll_id=$1', [poll.cryptoId]);
        await identity.query('DELETE FROM roster_locks WHERE poll_id=$1', [poll.cryptoId]);
        for (const table of ['shares', 'checkpoints', 'ballots']) await ballot.query(`DELETE FROM ${table} WHERE poll_id=$1`, [poll.cryptoId]);
        await ballot.query('DELETE FROM elections WHERE id=$1', [poll.cryptoId]);
        for (const trustee of [1, 2, 3, 4]) await rm(`.runtime/trustees/${trustee}/${poll.cryptoId}`, { recursive: true, force: true });
      }
      await management.query('DELETE FROM comment_reactions WHERE comment_id IN (SELECT id FROM comments WHERE poll_id=$1)', [id]);
      await management.query('DELETE FROM comments WHERE poll_id=$1', [id]);
      await management.query('DELETE FROM events WHERE poll_id=$1', [id]);
      await management.query('DELETE FROM appeals WHERE poll_id=$1', [id]);
      await management.query('DELETE FROM polls WHERE id=$1', [id]);
      await rm(`.runtime/provisioning/${id}`, { recursive: true, force: true });
    }
  } finally { await management.end(); await identity.end(); await ballot.end(); }
}
