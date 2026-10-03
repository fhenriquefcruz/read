import { describe, expect, it } from 'vitest';
import { rankWork, sortWorks } from '../src/lib/ranking';
import type { AcademicWork } from '../src/types';

function work(overrides: Partial<AcademicWork>): AcademicWork {
  return {
    id: 'base',
    title: 'A generic paper',
    authors: [{ name: 'Researcher', institutions: [] }],
    type: 'article',
    citationCount: 0,
    concepts: [],
    isOpenAccess: null,
    providerIds: { OpenAlex: 'W1' },
    sourceProviders: ['OpenAlex'],
    ...overrides,
  };
}

describe('rankWork', () => {
  it('prioriza correspondência temática sobre contagem bruta irrelevante', () => {
    const relevant = rankWork(
      work({
        id: 'relevant',
        title: 'Machine learning in public administration',
        abstract:
          'Machine learning can support public administration decision making.',
        concepts: ['Machine learning', 'Public administration'],
        citationCount: 90,
        year: 2024,
        isOpenAccess: true,
        doi: '10.1000/relevant',
        venue: 'Public Administration Review',
      }),
      'machine learning public administration',
    );

    const popularButIrrelevant = rankWork(
      work({
        id: 'popular',
        title: 'Protein folding pathways',
        abstract: 'A molecular biology study.',
        citationCount: 12_000,
        year: 2018,
      }),
      'machine learning public administration',
    );

    expect(relevant.rankScore).toBeGreaterThan(
      popularButIrrelevant.rankScore ?? 0,
    );
    expect(relevant.rankReasons).toContain('forte correspondência no título');
  });
});

describe('sortWorks', () => {
  const older = work({
    id: 'older',
    title: 'Topic A',
    year: 2018,
    citationCount: 500,
  });
  const newer = work({
    id: 'newer',
    title: 'Topic B',
    year: 2026,
    citationCount: 20,
  });

  it('ordena por recência quando solicitado', () => {
    expect(sortWorks([older, newer], 'topic', { sort: 'recent' })[0]?.id).toBe(
      'newer',
    );
  });

  it('ordena por citações quando solicitado', () => {
    expect(
      sortWorks([older, newer], 'topic', { sort: 'citations' })[0]?.id,
    ).toBe('older');
  });
});
