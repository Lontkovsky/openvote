import { expect, it, vi } from 'vitest';
import { z } from 'zod';

it('constructs browser schemas without dynamic code generation and preserves validation', async () => {
  const previousJitless = z.config().jitless;
  vi.stubGlobal('window', {});
  vi.stubEnv('MODE', 'demand');
  const dynamicFunction = vi.spyOn(globalThis, 'Function');
  try {
    vi.resetModules();
    const { Policy } = await import('../packages/domain/src/index.ts');
    const { DemandChatRequest, DemandPollStatus, demandAnswers, demandPollId, demandQuestion } = await import('../packages/domain/src/demand.ts');
    const valid = { id: 'verified-rnokpp-owner', version: 1, minimumAge: 18, citizenship: 'UA' };
    expect(Policy.safeParse(valid).success).toBe(true);
    expect(Policy.safeParse({ ...valid, citizenship: 'UA1' }).success).toBe(false);
    expect(Policy.safeParse({ ...valid, unexpected: true }).success).toBe(false);
    const poll = { apiVersion: 'v1', pollId: demandPollId, version: 1, question: demandQuestion,
      answers: demandAnswers, selfSelected: true, identityVerified: false, uniquePersonGuaranteed: false,
      response: null, results: { totalResponses: 2, counts: [2, 0, 0] } };
    expect(DemandPollStatus.safeParse(poll).success).toBe(true);
    expect(DemandPollStatus.safeParse({ ...poll, results: { totalResponses: 2, counts: [2, 1, 0] } }).success).toBe(false);
    expect(DemandPollStatus.safeParse({ ...poll, identityVerified: true }).success).toBe(false);
    expect(DemandChatRequest.safeParse({ question: 'Що таке OpenVote?' }).success).toBe(true);
    expect(DemandChatRequest.safeParse({ question: '   ' }).success).toBe(false);
    expect(dynamicFunction).not.toHaveBeenCalled();
  } finally {
    dynamicFunction.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    z.config({ jitless: previousJitless });
  }
});

it('leaves the full-platform browser validation mode unchanged', async () => {
  const previousJitless = z.config().jitless;
  vi.stubGlobal('window', {});
  vi.stubEnv('MODE', 'production');
  z.config({ jitless: false });
  try {
    vi.resetModules();
    await import('../packages/domain/src/index.ts');
    expect(z.config().jitless).toBe(false);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    z.config({ jitless: previousJitless });
  }
});
