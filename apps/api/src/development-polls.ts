import { Poll } from '../../../packages/domain/src/index.ts';
import type { PollType } from '../../../packages/domain/src/index.ts';
import { developmentQuestions } from '../../../packages/domain/src/development-catalogue.ts';
import { developmentPublished } from './development-published.ts';

const review = {
  action: 'approve',
  reason: 'Питання підготовлено для локальної демонстрації інтерфейсу OpenVote.',
  rubric: { singleProposal: true, noDoubleNegation: true, clearTerms: true, factsSeparated: true },
};

export const developmentCatalogue: PollType[] = developmentQuestions.map((entry, index) => {
  const published = index === 0;
  return Poll.parse({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    version: 1,
    state: published ? 'Published' : 'Scheduled',
    content: published ? {
      question: developmentPublished.manifest.question,
      context: developmentPublished.manifest.context,
      consequences: developmentPublished.manifest.consequences,
      argumentsFor: developmentPublished.manifest.argumentsFor,
      argumentsAgainst: developmentPublished.manifest.argumentsAgainst,
      category: developmentPublished.manifest.category,
      authorAlias: developmentPublished.manifest.authorAlias,
      policy: developmentPublished.manifest.policy,
      opensAt: developmentPublished.manifest.opensAt,
      closesAt: developmentPublished.manifest.closesAt,
      publicationThreshold: developmentPublished.manifest.publicationThreshold,
      relatedPolls: developmentPublished.manifest.relatedPolls,
    } : {
      question: entry.question,
      context: entry.context,
      consequences: '',
      argumentsFor: [],
      argumentsAgainst: [],
      category: entry.category,
      authorAlias: 'OpenVote',
      policy: { id: 'verified-rnokpp-owner', version: 1, minimumAge: 14, citizenship: 'UA' },
      opensAt: '2030-01-15T08:00:00.000Z',
      closesAt: '2030-02-15T20:00:00.000Z',
      publicationThreshold: 3,
      relatedPolls: [],
    },
    createdAt: new Date(Date.parse('2026-11-05T18:00:00.000Z') - index * 60_000).toISOString(),
    cryptoId: published ? developmentPublished.audit.result.pollId : null,
    manifestRaw: published ? developmentPublished.audit.electionRaw : null,
    review,
    methodologyStatus: 'Reviewed',
    contentStatus: 'Visible',
  });
});
