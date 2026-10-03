import { matchesClientFilters, parseSearchQuery } from './query';
import { sortWorks } from './ranking';
import type {
  AcademicWork,
  ParsedQuery,
  ProviderName,
  ProviderStatus,
  SearchFilters,
  SearchResponse,
  WorkAuthor,
} from '../types';

const CACHE_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

type JsonObject = Record<string, unknown>;

interface CachedSearch {
  timestamp: number;
  response: SearchResponse;
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeDoi(value: unknown): string | undefined {
  const doi = safeString(value);
  if (!doi) return undefined;
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').toLowerCase();
}

function stripTags(value: unknown): string | undefined {
  const text = safeString(value);
  return text?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function reconstructAbstract(index: unknown): string | undefined {
  if (!index || typeof index !== 'object' || Array.isArray(index)) return undefined;
  const positions: Array<[number, string]> = [];

  for (const [word, rawPositions] of Object.entries(index as Record<string, unknown>)) {
    if (!Array.isArray(rawPositions)) continue;
    for (const position of rawPositions) {
      if (typeof position === 'number') positions.push([position, word]);
    }
  }

  if (!positions.length) return undefined;
  return positions.sort((a, b) => a[0] - b[0]).map((entry) => entry[1]).join(' ');
}

function canonicalId(work: Pick<AcademicWork, 'doi' | 'title' | 'authors' | 'year'>): string {
  if (work.doi) return `doi:${work.doi}`;
  const firstAuthor = work.authors[0]?.name ?? '';
  return `meta:${[work.title, firstAuthor, work.year ?? ''].join('|').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function mergeWorks(primary: AcademicWork, secondary: AcademicWork): AcademicWork {
  const providers = new Set<ProviderName>([...primary.sourceProviders, ...secondary.sourceProviders]);
  return {
    ...secondary,
    ...primary,
    id: canonicalId(primary.doi ? primary : secondary),
    authors: primary.authors.length ? primary.authors : secondary.authors,
    abstract: primary.abstract ?? secondary.abstract,
    doi: primary.doi ?? secondary.doi,
    venue: primary.venue ?? secondary.venue,
    publisher: primary.publisher ?? secondary.publisher,
    language: primary.language ?? secondary.language,
    citationCount: Math.max(primary.citationCount, secondary.citationCount),
    concepts: [...new Set([...primary.concepts, ...secondary.concepts])].slice(0, 8),
    isOpenAccess: primary.isOpenAccess ?? secondary.isOpenAccess,
    oaStatus: primary.oaStatus ?? secondary.oaStatus,
    officialUrl: primary.officialUrl ?? secondary.officialUrl,
    pdfUrl: primary.pdfUrl ?? secondary.pdfUrl,
    license: primary.license ?? secondary.license,
    providerIds: { ...secondary.providerIds, ...primary.providerIds },
    sourceProviders: [...providers],
  };
}

function dedupe(works: AcademicWork[]): AcademicWork[] {
  const map = new Map<string, AcademicWork>();
  for (const work of works) {
    const key = canonicalId(work);
    const current = map.get(key);
    map.set(key, current ? mergeWorks(current, work) : { ...work, id: key });
  }
  return [...map.values()];
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<JsonObject> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (response.ok) return (await response.json()) as JsonObject;

      if (response.status !== 429 && response.status < 500) {
        throw new Error(`HTTP ${response.status}`);
      }

      const retryAfter = Number(response.headers.get('Retry-After') ?? 0);
      const delay = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Falha de rede.');
      if (controller.signal.aborted && signal?.aborted) throw new DOMException('Abortado', 'AbortError');
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 400 * 2 ** attempt));
      }
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  throw lastError ?? new Error('Fonte acadêmica indisponível.');
}

function openAlexFilters(parsed: ParsedQuery): string[] {
  const filters: string[] = [];
  const { yearFrom, yearTo, type, openAccess, language } = parsed.filters;

  if (yearFrom && yearTo && yearFrom === yearTo) filters.push(`publication_year:${yearFrom}`);
  if (type) filters.push(`type:${encodeURIComponent(type)}`);
  if (openAccess === true) filters.push('open_access.is_oa:true');
  if (openAccess === false) filters.push('open_access.is_oa:false');
  if (language) filters.push(`language:${encodeURIComponent(language)}`);

  return filters;
}

async function searchOpenAlex(parsed: ParsedQuery, signal?: AbortSignal): Promise<AcademicWork[]> {
  const params = new URLSearchParams();
  params.set('search', parsed.freeText || parsed.raw);
  params.set('per_page', '35');
  params.set('sort', '-relevance_score');
  params.set(
    'select',
    'id,doi,title,publication_year,type,language,cited_by_count,authorships,abstract_inverted_index,primary_location,best_oa_location,open_access,topics',
  );
  const filters = openAlexFilters(parsed);
  if (filters.length) params.set('filter', filters.join(','));

  const data = await fetchJson(`https://api.openalex.org/works?${params.toString()}`, signal);
  const results = Array.isArray(data.results) ? data.results : [];

  return results.map((raw) => {
    const item = raw as JsonObject;
    const authorships = Array.isArray(item.authorships) ? item.authorships : [];
    const authors: WorkAuthor[] = authorships
      .map((entry) => {
        const authorship = entry as JsonObject;
        const author = (authorship.author ?? {}) as JsonObject;
        const institutions = Array.isArray(authorship.institutions) ? authorship.institutions : [];
        const name = safeString(author.display_name);
        if (!name) return null;
        return {
          name,
          orcid: safeString(author.orcid),
          institutions: institutions
            .map((institution) => safeString((institution as JsonObject).display_name))
            .filter((value): value is string => Boolean(value)),
        };
      })
      .filter((value): value is WorkAuthor => Boolean(value));

    const bestOa = (item.best_oa_location ?? {}) as JsonObject;
    const openAccess = (item.open_access ?? {}) as JsonObject;
    const primaryLocation = (item.primary_location ?? {}) as JsonObject;
    const source = (primaryLocation.source ?? {}) as JsonObject;
    const topics = Array.isArray(item.topics) ? item.topics : [];
    const doi = normalizeDoi(item.doi);
    const id = safeString(item.id) ?? canonicalId({ doi, title: safeString(item.title) ?? 'Sem título', authors, year: undefined });

    return {
      id,
      title: safeString(item.title) ?? 'Sem título',
      authors,
      year: typeof item.publication_year === 'number' ? item.publication_year : undefined,
      abstract: reconstructAbstract(item.abstract_inverted_index),
      doi,
      type: safeString(item.type) ?? 'article',
      venue: safeString(source.display_name),
      publisher: safeString(source.host_organization_name),
      language: safeString(item.language),
      citationCount: typeof item.cited_by_count === 'number' ? item.cited_by_count : 0,
      concepts: topics
        .map((topic) => safeString((topic as JsonObject).display_name))
        .filter((value): value is string => Boolean(value))
        .slice(0, 6),
      isOpenAccess: typeof openAccess.is_oa === 'boolean' ? openAccess.is_oa : null,
      oaStatus: safeString(openAccess.oa_status),
      officialUrl: doi ? `https://doi.org/${doi}` : safeString(primaryLocation.landing_page_url) ?? safeString(item.id),
      pdfUrl: safeString(bestOa.pdf_url),
      license: safeString(bestOa.license),
      providerIds: { OpenAlex: safeString(item.id) ?? id },
      sourceProviders: ['OpenAlex'],
    } satisfies AcademicWork;
  });
}

function crossrefFilters(parsed: ParsedQuery): string[] {
  const filters: string[] = [];
  const { yearFrom, yearTo, type } = parsed.filters;
  if (yearFrom) filters.push(`from-pub-date:${yearFrom}-01-01`);
  if (yearTo) filters.push(`until-pub-date:${yearTo}-12-31`);
  if (type) filters.push(`type:${type === 'article' ? 'journal-article' : type}`);
  return filters;
}

async function searchCrossref(parsed: ParsedQuery, signal?: AbortSignal): Promise<AcademicWork[]> {
  const params = new URLSearchParams();
  params.set('query.bibliographic', parsed.freeText || parsed.raw);
  if (parsed.filters.author) params.set('query.author', parsed.filters.author);
  params.set('rows', '25');
  params.set('sort', parsed.filters.sort === 'recent' ? 'published' : 'relevance');
  params.set('order', 'desc');
  const filters = crossrefFilters(parsed);
  if (filters.length) params.set('filter', filters.join(','));

  const data = await fetchJson(`https://api.crossref.org/works?${params.toString()}`, signal);
  const message = (data.message ?? {}) as JsonObject;
  const items = Array.isArray(message.items) ? message.items : [];

  return items.map((raw) => {
    const item = raw as JsonObject;
    const authorRows = Array.isArray(item.author) ? item.author : [];
    const authors: WorkAuthor[] = authorRows.map((rawAuthor) => {
      const author = rawAuthor as JsonObject;
      const name = [safeString(author.given), safeString(author.family)].filter(Boolean).join(' ') || 'Autor não identificado';
      const affiliations = Array.isArray(author.affiliation) ? author.affiliation : [];
      return {
        name,
        orcid: safeString(author.ORCID),
        institutions: affiliations
          .map((affiliation) => safeString((affiliation as JsonObject).name))
          .filter((value): value is string => Boolean(value)),
      };
    });

    const titles = Array.isArray(item.title) ? item.title : [];
    const containers = Array.isArray(item['container-title']) ? item['container-title'] : [];
    const dates = (item.published ?? item.issued ?? {}) as JsonObject;
    const parts = Array.isArray(dates['date-parts']) ? dates['date-parts'] : [];
    const firstPart = Array.isArray(parts[0]) ? parts[0] : [];
    const year = typeof firstPart[0] === 'number' ? firstPart[0] : undefined;
    const doi = normalizeDoi(item.DOI);
    const links = Array.isArray(item.link) ? item.link : [];
    const pdf = links.find((rawLink) => {
      const link = rawLink as JsonObject;
      return safeString(link['content-type']) === 'application/pdf';
    }) as JsonObject | undefined;
    const licenses = Array.isArray(item.license) ? item.license : [];
    const firstLicense = licenses[0] as JsonObject | undefined;
    const title = safeString(titles[0]) ?? 'Sem título';

    return {
      id: doi ? `doi:${doi}` : canonicalId({ doi, title, authors, year }),
      title,
      authors,
      year,
      abstract: stripTags(item.abstract),
      doi,
      type: safeString(item.type) ?? 'article',
      venue: safeString(containers[0]),
      publisher: safeString(item.publisher),
      language: safeString(item.language),
      citationCount: typeof item['is-referenced-by-count'] === 'number' ? item['is-referenced-by-count'] : 0,
      concepts: [],
      isOpenAccess: null,
      officialUrl: doi ? `https://doi.org/${doi}` : safeString(item.URL),
      pdfUrl: pdf ? safeString(pdf.URL) : undefined,
      license: firstLicense ? safeString(firstLicense.URL) : undefined,
      providerIds: { Crossref: doi ?? safeString(item.URL) ?? title },
      sourceProviders: ['Crossref'],
    } satisfies AcademicWork;
  });
}

function cacheKey(raw: string, visual: Partial<SearchFilters>): string {
  return `readplus:search:v1:${JSON.stringify({ raw: raw.trim(), visual })}`;
}

export async function searchAcademic(
  raw: string,
  visual: Partial<SearchFilters> = {},
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const parsed = parseSearchQuery(raw, visual);
  if (!parsed.freeText && !parsed.filters.author) {
    return { works: [], providers: [], fromCache: false };
  }

  const key = cacheKey(raw, visual);
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsedCache = JSON.parse(cached) as CachedSearch;
      if (Date.now() - parsedCache.timestamp < CACHE_TTL_MS) {
        return { ...parsedCache.response, fromCache: true };
      }
    }
  } catch {
    // Cache é otimização; falha local nunca impede pesquisa.
  }

  const started = performance.now();
  const providers: ProviderStatus[] = [];

  const [openAlexResult, crossrefResult] = await Promise.allSettled([
    searchOpenAlex(parsed, signal),
    searchCrossref(parsed, signal),
  ]);

  const openAlexLatency = Math.round(performance.now() - started);
  if (openAlexResult.status === 'fulfilled') {
    providers.push({ provider: 'OpenAlex', ok: true, count: openAlexResult.value.length, latencyMs: openAlexLatency });
  } else {
    providers.push({
      provider: 'OpenAlex',
      ok: false,
      count: 0,
      latencyMs: openAlexLatency,
      message: openAlexResult.reason instanceof Error ? openAlexResult.reason.message : 'Fonte indisponível',
    });
  }

  const crossrefLatency = Math.round(performance.now() - started);
  if (crossrefResult.status === 'fulfilled') {
    providers.push({ provider: 'Crossref', ok: true, count: crossrefResult.value.length, latencyMs: crossrefLatency });
  } else {
    providers.push({
      provider: 'Crossref',
      ok: false,
      count: 0,
      latencyMs: crossrefLatency,
      message: crossrefResult.reason instanceof Error ? crossrefResult.reason.message : 'Fonte indisponível',
    });
  }

  const allWorks = [
    ...(openAlexResult.status === 'fulfilled' ? openAlexResult.value : []),
    ...(crossrefResult.status === 'fulfilled' ? crossrefResult.value : []),
  ];

  const filtered = dedupe(allWorks).filter((work) => matchesClientFilters(work, parsed.filters));
  const works = sortWorks(filtered, parsed.freeText || parsed.raw, parsed.filters);
  const response: SearchResponse = { works, providers, fromCache: false };

  try {
    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), response } satisfies CachedSearch));
  } catch {
    // Ignora quota/privacidade do storage.
  }

  return response;
}
