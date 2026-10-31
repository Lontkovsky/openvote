import { describe, expect, it } from 'vitest';
import { E2eRun } from './e2e/inapp.mjs';

const valid = {
  token: 'a'.repeat(64), runId: 'b'.repeat(10), sourceHash: 'c'.repeat(64),
  closesAt: '2026-01-01T00:00:00.000Z',
};

describe('in-app E2E coordinator boundary', () => {
  it('accepts the exact private run capability contract', () => {
    expect(E2eRun.parse(valid)).toEqual(valid);
  });

  it('rejects a file-supplied network destination', () => {
    expect(() => E2eRun.parse({ ...valid, endpoint: 'https://example.invalid' })).toThrow();
  });
});
