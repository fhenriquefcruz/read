import { describe, expect, it } from 'vitest';
import { matchesClientFilters, parseSearchQuery } from '../src/lib/query';

describe('parseSearchQuery', () => {
  it('separa texto livre de qualificadores avançados', () => {
    const parsed = parseSearchQuery(
      'machine learning AND education author:"Daniel Kahneman" year:2020-2026 type:article open_access:true language:pt',
    );

    expect(parsed.freeText).toBe('machine learning education');
    expect(parsed.filters).toMatchObject({
      author: 'Daniel Kahneman',
      yearFrom: 2020,
      yearTo: 2026,
      type: 'article',
      openAccess: true,
      language: 'pt',
      sort: 'relevance',
    });
  });

  it('aceita ano único e preserva filtro visual explícito', () => {
    const parsed = parseSearchQuery('governança year:2024', {
      sort: 'citations',
    });
    expect(parsed.freeText).toBe('governança');
    expect(parsed.filters.yearFrom).toBe(2024);
    expect(parsed.filters.yearTo).toBe(2024);
    expect(parsed.filters.sort).toBe('citations');
  });
});

describe('matchesClientFilters', () => {
  const work = {
    year: 2025,
    type: 'article',
    language: 'pt',
    authors: [{ name: 'Ana Silva' }],
    isOpenAccess: true,
  };

  it('mantém trabalho compatível com os filtros', () => {
    expect(
      matchesClientFilters(work, {
        yearFrom: 2020,
        yearTo: 2026,
        type: 'article',
        language: 'pt',
        author: 'ana',
        openAccess: true,
        sort: 'relevance',
      }),
    ).toBe(true);
  });

  it('remove trabalho incompatível sem inventar substituto', () => {
    expect(
      matchesClientFilters(work, { language: 'en', sort: 'relevance' }),
    ).toBe(false);
  });
});
