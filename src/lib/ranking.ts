import type { AcademicWork, SearchFilters } from '../types';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length > 2);
}

function overlapScore(haystack: string, needles: string[]): number {
  if (!needles.length) return 0;
  const normalized = normalize(haystack);
  const hits = needles.filter((needle) => normalized.includes(needle)).length;
  return hits / needles.length;
}

export function rankWork(work: AcademicWork, query: string): AcademicWork {
  const queryTokens = tokens(query);
  const titleMatch = overlapScore(work.title, queryTokens);
  const abstractMatch = overlapScore(work.abstract ?? '', queryTokens);
  const conceptMatch = overlapScore(work.concepts.join(' '), queryTokens);

  const age = work.year
    ? Math.max(1, new Date().getFullYear() - work.year + 1)
    : 10;
  const citationsPerYear = work.citationCount / age;
  const citationScore = Math.min(1, Math.log10(citationsPerYear + 1) / 3);

  const completenessFields = [
    Boolean(work.doi),
    Boolean(work.abstract),
    work.authors.length > 0,
    Boolean(work.venue),
    Boolean(work.year),
    work.concepts.length > 0,
  ];
  const completeness =
    completenessFields.filter(Boolean).length / completenessFields.length;

  const recency = work.year
    ? Math.max(0, 1 - (new Date().getFullYear() - work.year) / 12)
    : 0;
  const oa = work.isOpenAccess ? 1 : 0;

  const score =
    titleMatch * 45 +
    abstractMatch * 18 +
    conceptMatch * 10 +
    citationScore * 12 +
    completeness * 8 +
    oa * 4 +
    recency * 3;

  const reasons: string[] = [];
  if (titleMatch >= 0.5) reasons.push('forte correspondência no título');
  if (abstractMatch >= 0.4) reasons.push('tema presente no resumo');
  if (citationScore >= 0.55)
    reasons.push('impacto de citações ajustado pela idade');
  if (work.isOpenAccess) reasons.push('acesso aberto disponível');
  if (completeness >= 0.8) reasons.push('metadados completos');

  return {
    ...work,
    rankScore: Number(score.toFixed(2)),
    rankReasons: reasons.slice(0, 3),
  };
}

export function sortWorks(
  works: AcademicWork[],
  query: string,
  filters: Pick<SearchFilters, 'sort'>,
): AcademicWork[] {
  const ranked = works.map((work) => rankWork(work, query));

  if (filters.sort === 'recent') {
    return ranked.sort(
      (a, b) =>
        (b.year ?? 0) - (a.year ?? 0) ||
        (b.rankScore ?? 0) - (a.rankScore ?? 0),
    );
  }

  if (filters.sort === 'citations') {
    return ranked.sort(
      (a, b) =>
        b.citationCount - a.citationCount ||
        (b.rankScore ?? 0) - (a.rankScore ?? 0),
    );
  }

  return ranked.sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));
}
