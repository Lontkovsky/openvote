import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Config } from '../apps/api/src/common.ts';
import { Content, eligible, percentage, policyText } from '../packages/domain/src/index.ts';

describe('versioned eligibility and public methodology', () => {
  it('does not silently impose age or citizenship', () => {
    expect(policyText({ id: 'verified-rnokpp-owner', version: 1 })).toBe('Підтверджений власник РНОКПП');
    fc.assert(fc.property(fc.integer({ min: 0, max: 120 }), age => {
      expect(eligible({ verifiedOwner: true, age, citizenship: 'PL' }, { id: 'verified-rnokpp-owner', version: 1 })).toBe(true);
      expect(eligible({ verifiedOwner: false, age, citizenship: 'UA' }, { id: 'verified-rnokpp-owner', version: 1 })).toBe(false);
      expect(eligible({ verifiedOwner: true, age, citizenship: 'UA' }, { id: 'verified-rnokpp-owner', version: 1, minimumAge: 18 })).toBe(age >= 18);
      expect(eligible({ verifiedOwner: true, age, citizenship: 'PL' }, { id: 'verified-rnokpp-owner', version: 1, citizenship: 'UA' })).toBe(false);
    }), { seed: 20260906, numRuns: 121 });
  });
  it('keeps abstentions in N and handles empty results', () => {
    expect(percentage(3, 5)).toBe('60,0');
    expect(percentage(1, 3)).toBe('33,3');
    expect(percentage(0, 0)).toBe('0,0');
  });
  it('supports a hidden author and publication after one response', () => {
    const content = { question: 'Чи підтримуєте відкриту перевірку тестового інтеграційного сценарію?', context: '', consequences: '',
      argumentsFor: [], argumentsAgainst: [], category: 'Технології', authorAlias: null,
      policy: { id: 'verified-rnokpp-owner' as const, version: 1 as const, minimumAge: 14, citizenship: 'UA' },
      opensAt: '2030-01-15T08:00:00.000Z', closesAt: '2030-02-15T20:00:00.000Z', publicationThreshold: 1, relatedPolls: [] };
    expect(Content.parse(content).authorAlias).toBeNull();
    expect(() => Content.parse({ ...content, publicationThreshold: 0 })).toThrow();
  });
  it('rejects production mock configuration', () => {
    expect(() => Config.parse({ environment: 'production', role: 'provider-A', port: 1, serviceToken: 'x'.repeat(32) })).toThrow();
  });
});
