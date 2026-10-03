import type { ParsedQuery, SearchFilters } from '../types';

const QUALIFIER = /([a-z_]+):(?:"([^"]+)"|([^\s]+))/gi;

function parseYear(value: string): Pick<SearchFilters, 'yearFrom' | 'yearTo'> {
  const range = value.match(/^(\d{4})-(\d{4})$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    return from <= to ? { yearFrom: from, yearTo: to } : { yearFrom: to, yearTo: from };
  }

  const year = Number(value);
  if (Number.isInteger(year) && year >= 1500 && year <= 2200) {
    return { yearFrom: year, yearTo: year };
  }

  return {};
}

function parseBoolean(value: string): boolean | undefined {
  if (/^(true|1|yes)$/i.test(value)) return true;
  if (/^(false|0|no)$/i.test(value)) return false;
  return undefined;
}

export function parseSearchQuery(raw: string, visual: Partial<SearchFilters> = {}): ParsedQuery {
  const filters: SearchFilters = { sort: visual.sort ?? 'relevance', ...visual };
  const consumed: Array<[number, number]> = [];

  for (const match of raw.matchAll(QUALIFIER)) {
    const key = match[1]?.toLowerCase();
    const value = (match[2] ?? match[3] ?? '').trim();
    if (!key || !value || match.index === undefined) continue;

    const start = match.index;
    consumed.push([start, start + match[0].length]);

    if (key === 'year') Object.assign(filters, parseYear(value));
    if (key === 'type') filters.type = value.toLowerCase();
    if (key === 'language' || key === 'lang') filters.language = value.toLowerCase();
    if (key === 'author') filters.author = value;
    if (key === 'open_access' || key === 'oa') {
      const parsed = parseBoolean(value);
      if (parsed !== undefined) filters.openAccess = parsed;
    }
  }

  const chars = [...raw];
  for (const [start, end] of consumed) {
    for (let index = start; index < end; index += 1) chars[index] = ' ';
  }

  const freeText = chars
    .join('')
    .replace(/\b(AND|OR)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { raw, freeText, filters };
}

export function matchesClientFilters(
  work: { year?: number; type: string; language?: string; authors: Array<{ name: string }>; isOpenAccess: boolean | null },
  filters: SearchFilters,
): boolean {
  if (filters.yearFrom && (!work.year || work.year < filters.yearFrom)) return false;
  if (filters.yearTo && (!work.year || work.year > filters.yearTo)) return false;
  if (filters.type && work.type.toLowerCase() !== filters.type.toLowerCase()) return false;
  if (filters.language && work.language?.toLowerCase() !== filters.language.toLowerCase()) return false;
  if (filters.openAccess !== undefined && work.isOpenAccess !== filters.openAccess) return false;
  if (
    filters.author &&
    !work.authors.some((author) => author.name.toLowerCase().includes(filters.author?.toLowerCase() ?? ''))
  ) {
    return false;
  }
  return true;
}
