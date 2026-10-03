import { matchesClientFilters, parseSearchQuery } from './query';
import { sortWorks } from './ranking';
import { safeExternalUrl } from './url';
import type {
  AcademicWork,
  ParsedQuery,
  ProviderName,
  ProviderStatus,
  SearchFilters,
  SearchResponse,
  WorkAuthor,
  WorkRelations,
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
  return text
    ?.replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function reconstructAbstract(index: unknown): string | undefined {
  if (!index || typeof index !== 'object' || Array.isArray(index))
    return undefined;
  const positions: Array<[number, string]> = [];

  for (const [word, rawPositions] of Object.entries(
    index as Record<string, unknown>,
  )) {
    if (!Array.isArray(rawPositions)) continue;
    for (const position of rawPositions) {
      if (typeof position === 'number') positions.push([position, word]);
    }
  }

  if (!positions.length) return undefined;
  return positions
    .sort((a, b) => a[0] - b[0])
    .map((entry) => entry[1])
    .join(' ');
}

function canonicalId(
  work: Pick<AcademicWork, 'doi' | 'title' | 'authors' | 'year'>,
): string {
  if (work.doi) return `doi:${work.doi}`;
  const firstAuthor = work.authors[0]?.name ?? '';
  return `meta:${[work.title, firstAuthor, work.year ?? '']
    .join('|')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`;
}

function mergeWorks(
  primary: AcademicWork,
  secondary: AcademicWork,
): AcademicWork {
  const providers = new Set<ProviderName>([
    ...primary.sourceProviders,
    ...secondary.sourceProviders,
  ]);
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
    concepts: [...new Set([...primary.concepts, ...secondary.concepts])].slice(
      0,
      8,
    ),
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

async function fetchJson(
  url: string,
  signal?: AbortSignal,
): Promise<JsonObject> {
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
      if (controller.signal.aborted && signal?.aborted)
        throw new DOMException('Abortado', 'AbortError');
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, 400 * 2 ** attempt),
        );
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

  if (yearFrom) filters.push(`from_publication_date:${yearFrom}-01-01`);
  if (yearTo) filters.push(`to_publication_date:${yearTo}-12-31`);
  if (type) filters.push(`type:${encodeURIComponent(type)}`);
  if (openAccess === true) filters.push('open_access.is_oa:true');
  if (openAccess === false) filters.push('open_access.is_oa:false');
  if (language) filters.push(`language:${encodeURIComponent(language)}`);

  return filters;
}

const OPENALEX_SELECT =
  'id,doi,title,publication_year,type,language,cited_by_count,authorships,abstract_inverted_index,primary_location,best_oa_location,open_access,topics';

function mapOpenAlexWork(raw: unknown): AcademicWork {
  const item = raw as JsonObject;
  const authorships = Array.isArray(item.authorships) ? item.authorships : [];
  const authors = authorships.reduce<WorkAuthor[]>((list, entry) => {
    const authorship = entry as JsonObject;
    const author = (authorship.author ?? {}) as JsonObject;
    const institutions = Array.isArray(authorship.institutions)
      ? authorship.institutions
      : [];
    const name = safeString(author.display_name);
    if (!name) return list;

    const orcid = safeString(author.orcid);
    list.push({
      name,
      ...(orcid ? { orcid } : {}),
      institutions: institutions
        .map((institution) =>
          safeString((institution as JsonObject).display_name),
        )
        .filter((value): value is string => Boolean(value)),
    });
    return list;
  }, []);

  const bestOa = (item.best_oa_location ?? {}) as JsonObject;
  const openAccess = (item.open_access ?? {}) as JsonObject;
  const primaryLocation = (item.primary_location ?? {}) as JsonObject;
  const source = (primaryLocation.source ?? {}) as JsonObject;
  const topics = Array.isArray(item.topics) ? item.topics : [];
  const doi = normalizeDoi(item.doi);
  const id =
    safeString(item.id) ??
    canonicalId({
      doi,
      title: safeString(item.title) ?? 'Sem título',
      authors,
      year: undefined,
    });

  return {
    id,
    title: safeString(item.title) ?? 'Sem título',
    authors,
    year:
      typeof item.publication_year === 'number'
        ? item.publication_year
        : undefined,
    abstract: reconstructAbstract(item.abstract_inverted_index),
    doi,
    type: safeString(item.type) ?? 'article',
    venue: safeString(source.display_name),
    publisher: safeString(source.host_organization_name),
    language: safeString(item.language),
    citationCount:
      typeof item.cited_by_count === 'number' ? item.cited_by_count : 0,
    concepts: topics
      .map((topic) => safeString((topic as JsonObject).display_name))
      .filter((value): value is string => Boolean(value))
      .slice(0, 6),
    isOpenAccess:
      typeof openAccess.is_oa === 'boolean' ? openAccess.is_oa : null,
    oaStatus: safeString(openAccess.oa_status),
    officialUrl: safeExternalUrl(
      doi
        ? `https://doi.org/${doi}`
        : (safeString(primaryLocation.landing_page_url) ??
            safeString(item.id)),
    ),
    pdfUrl: safeExternalUrl(safeString(bestOa.pdf_url)),
    license: safeString(bestOa.license),
    providerIds: { OpenAlex: safeString(item.id) ?? id },
    sourceProviders: ['OpenAlex'],
  };
}

function extractOpenAlexId(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(W\d+)$/i);
  return match?.[1]?.toUpperCase();
}

async function fetchOpenAlexBatch(
  ids: string[],
  signal?: AbortSignal,
): Promise<AcademicWork[]> {
  const normalized = [
    ...new Set(ids.map((id) => extractOpenAlexId(id)).filter(Boolean)),
  ].filter((id): id is string => Boolean(id));

  if (!normalized.length) return [];

  const params = new URLSearchParams();
  params.set('filter', `openalex:${normalized.join('|')}`);
  params.set('per_page', String(Math.min(100, normalized.length)));
  params.set('select', OPENALEX_SELECT);

  const data = await fetchJson(
    `https://api.openalex.org/works?${params.toString()}`,
    signal,
  );
  const results = Array.isArray(data.results)
    ? data.results.map(mapOpenAlexWork)
    : [];

  const byId = new Map(
    results
      .map((work) => [extractOpenAlexId(work.providerIds.OpenAlex), work] as const)
      .filter((entry): entry is readonly [string, AcademicWork] =>
        Boolean(entry[0]),
      ),
  );

  return normalized
    .map((id) => byId.get(id))
    .filter((work): work is AcademicWork => Boolean(work));
}

async function searchOpenAlex(
  parsed: ParsedQuery,
  signal?: AbortSignal,
): Promise<AcademicWork[]> {
  const params = new URLSearchParams();
  params.set('search', parsed.freeText || parsed.raw);
  params.set('per_page', '35');
  params.set('sort', 'relevance_score:desc');
  params.set('select', OPENALEX_SELECT);
  const filters = openAlexFilters(parsed);
  if (filters.length) params.set('filter', filters.join(','));

  const data = await fetchJson(
    `https://api.openalex.org/works?${params.toString()}`,
    signal,
  );
  const results = Array.isArray(data.results) ? data.results : [];

  return results.map(mapOpenAlexWork);
}

export async function fetchWorkRelations(
  work: AcademicWork,
  signal?: AbortSignal,
): Promise<WorkRelations | null> {
  const openAlexId = extractOpenAlexId(work.providerIds.OpenAlex);
  if (!openAlexId) return null;

  const detailParams = new URLSearchParams();
  detailParams.set('select', 'id,referenced_works,related_works');
  const detail = await fetchJson(
    `https://api.openalex.org/works/${openAlexId}?${detailParams.toString()}`,
    signal,
  );

  const references = Array.isArray(detail.referenced_works)
    ? detail.referenced_works
        .map((id) => safeString(id))
        .filter((id): id is string => Boolean(id))
        .slice(0, 8)
    : [];

  const related = Array.isArray(detail.related_works)
    ? detail.related_works
        .map((id) => safeString(id))
        .filter((id): id is string => Boolean(id))
        .slice(0, 8)
    : [];

  const citedByParams = new URLSearchParams();
  citedByParams.set('filter', `cites:${openAlexId}`);
  citedByParams.set('sort', 'publication_date:desc');
  citedByParams.set('per_page', '8');
  citedByParams.set('select', OPENALEX_SELECT);

  const [referenceWorks, relatedWorks, citedByData] = await Promise.all([
    fetchOpenAlexBatch(references, signal),
    fetchOpenAlexBatch(related, signal),
    fetchJson(
      `https://api.openalex.org/works?${citedByParams.toString()}`,
      signal,
    ),
  ]);

  const citedBy = Array.isArray(citedByData.results)
    ? citedByData.results.map(mapOpenAlexWork)
    : [];

  return {
    references: referenceWorks,
    citedBy,
    related: relatedWorks,
  };
}

function crossrefFilters(parsed: ParsedQuery): string[] {
  const filters: string[] = [];
  const { yearFrom, yearTo, type } = parsed.filters;
  if (yearFrom) filters.push(`from-pub-date:${yearFrom}-01-01`);
  if (yearTo) filters.push(`until-pub-date:${yearTo}-12-31`);
  if (type)
    filters.push(`type:${type === 'article' ? 'journal-article' : type}`);
  return filters;
}

function mapCrossrefWork(raw: unknown): AcademicWork {
  const item = raw as JsonObject;
  const authorRows = Array.isArray(item.author) ? item.author : [];
  const authors: WorkAuthor[] = authorRows.map((rawAuthor) => {
    const author = rawAuthor as JsonObject;
    const name =
      [safeString(author.given), safeString(author.family)]
        .filter(Boolean)
        .join(' ') || 'Autor não identificado';
    const affiliations = Array.isArray(author.affiliation)
      ? author.affiliation
      : [];
    return {
      name,
      orcid: safeString(author.ORCID),
      institutions: affiliations
        .map((affiliation) => safeString((affiliation as JsonObject).name))
        .filter((value): value is string => Boolean(value)),
    };
  });

  const titles = Array.isArray(item.title) ? item.title : [];
  const containers = Array.isArray(item['container-title'])
    ? item['container-title']
    : [];
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
    citationCount:
      typeof item['is-referenced-by-count'] === 'number'
        ? item['is-referenced-by-count']
        : 0,
    concepts: [],
    isOpenAccess: null,
    officialUrl: safeExternalUrl(
      doi ? `https://doi.org/${doi}` : safeString(item.URL),
    ),
    pdfUrl: safeExternalUrl(pdf ? safeString(pdf.URL) : undefined),
    license: firstLicense ? safeString(firstLicense.URL) : undefined,
    providerIds: { Crossref: doi ?? safeString(item.URL) ?? title },
    sourceProviders: ['Crossref'],
  };
}

export async function resolveDoi(
  rawDoi: string,
  signal?: AbortSignal,
): Promise<AcademicWork> {
  const doi = normalizeDoi(rawDoi);
  if (!doi || !/^10\.\d{4,9}\/.+/.test(doi)) {
    throw new Error('Informe um DOI válido, por exemplo 10.1000/exemplo.');
  }

  const openAlexParams = new URLSearchParams();
  openAlexParams.set('filter', `doi:${doi}`);
  openAlexParams.set('per_page', '1');
  openAlexParams.set('select', OPENALEX_SELECT);

  const [openAlexResult, crossrefResult] = await Promise.allSettled([
    fetchJson(`https://api.openalex.org/works?${openAlexParams.toString()}`, signal),
    fetchJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, signal),
  ]);

  const works: AcademicWork[] = [];

  if (openAlexResult.status === 'fulfilled') {
    const rows = Array.isArray(openAlexResult.value.results)
      ? openAlexResult.value.results
      : [];
    if (rows[0]) works.push(mapOpenAlexWork(rows[0]));
  }

  if (crossrefResult.status === 'fulfilled') {
    const message = crossrefResult.value.message;
    if (message && typeof message === 'object' && !Array.isArray(message)) {
      works.push(mapCrossrefWork(message));
    }
  }

  const merged = dedupe(works)[0];
  if (!merged) {
    throw new Error('DOI não encontrado nas fontes acadêmicas consultadas.');
  }
  return merged;
}

async function searchCrossref(
  parsed: ParsedQuery,
  signal?: AbortSignal,
): Promise<AcademicWork[]> {
  const params = new URLSearchParams();
  params.set('query.bibliographic', parsed.freeText || parsed.raw);
  if (parsed.filters.author) params.set('query.author', parsed.filters.author);
  params.set('rows', '25');
  params.set(
    'sort',
    parsed.filters.sort === 'recent' ? 'published' : 'relevance',
  );
  params.set('order', 'desc');
  const filters = crossrefFilters(parsed);
  if (filters.length) params.set('filter', filters.join(','));

  const data = await fetchJson(
    `https://api.crossref.org/works?${params.toString()}`,
    signal,
  );
  const message = (data.message ?? {}) as JsonObject;
  const items = Array.isArray(message.items) ? message.items : [];

  return items.map(mapCrossrefWork);
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
      if (!navigator.onLine) {
        return {
          ...parsedCache.response,
          providers: parsedCache.response.providers.map((provider) => ({
            ...provider,
            ok: false,
            count: 0,
            message: 'Offline — exibindo resultados armazenados localmente.',
          })),
          fromCache: true,
        };
      }

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
    providers.push({
      provider: 'OpenAlex',
      ok: true,
      count: openAlexResult.value.length,
      latencyMs: openAlexLatency,
    });
  } else {
    providers.push({
      provider: 'OpenAlex',
      ok: false,
      count: 0,
      latencyMs: openAlexLatency,
      message:
        openAlexResult.reason instanceof Error
          ? openAlexResult.reason.message
          : 'Fonte indisponível',
    });
  }

  const crossrefLatency = Math.round(performance.now() - started);
  if (crossrefResult.status === 'fulfilled') {
    providers.push({
      provider: 'Crossref',
      ok: true,
      count: crossrefResult.value.length,
      latencyMs: crossrefLatency,
    });
  } else {
    providers.push({
      provider: 'Crossref',
      ok: false,
      count: 0,
      latencyMs: crossrefLatency,
      message:
        crossrefResult.reason instanceof Error
          ? crossrefResult.reason.message
          : 'Fonte indisponível',
    });
  }

  const allWorks = [
    ...(openAlexResult.status === 'fulfilled' ? openAlexResult.value : []),
    ...(crossrefResult.status === 'fulfilled' ? crossrefResult.value : []),
  ];

  const filtered = dedupe(allWorks).filter((work) =>
    matchesClientFilters(work, parsed.filters),
  );
  const works = sortWorks(
    filtered,
    parsed.freeText || parsed.raw,
    parsed.filters,
  );
  const response: SearchResponse = { works, providers, fromCache: false };

  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        timestamp: Date.now(),
        response,
      } satisfies CachedSearch),
    );
  } catch {
    // Ignora quota/privacidade do storage.
  }

  return response;
}
