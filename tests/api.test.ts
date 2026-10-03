import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchAcademic } from '../src/lib/api';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const openAlexPayload = {
  results: [
    {
      id: 'https://openalex.org/W123',
      doi: 'https://doi.org/10.1000/readplus',
      title: 'Artificial intelligence in public administration',
      publication_year: 2025,
      type: 'article',
      language: 'en',
      cited_by_count: 42,
      authorships: [
        {
          author: { display_name: 'Ada Researcher' },
          institutions: [{ display_name: 'Example University' }],
        },
      ],
      abstract_inverted_index: {
        Artificial: [0],
        intelligence: [1],
        improves: [2],
        evidence: [3],
      },
      primary_location: {
        landing_page_url: 'https://example.org/article',
        source: {
          display_name: 'Journal of Evidence',
          host_organization_name: 'Evidence Press',
        },
      },
      best_oa_location: {
        pdf_url: 'https://example.org/article.pdf',
        license: 'cc-by',
      },
      open_access: { is_oa: true, oa_status: 'gold' },
      topics: [{ display_name: 'Artificial intelligence' }],
    },
  ],
};

const crossrefPayload = {
  message: {
    items: [
      {
        DOI: '10.1000/readplus',
        title: ['Artificial intelligence in public administration'],
        author: [{ given: 'Ada', family: 'Researcher', affiliation: [] }],
        published: { 'date-parts': [[2025, 1, 1]] },
        type: 'journal-article',
        'container-title': ['Journal of Evidence'],
        publisher: 'Evidence Press',
        language: 'en',
        'is-referenced-by-count': 40,
        URL: 'https://doi.org/10.1000/readplus',
      },
    ],
  },
};

describe('searchAcademic integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('agrega e deduplica OpenAlex e Crossref por DOI', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(openAlexPayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(crossrefPayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
    );

    const result = await searchAcademic('artificial intelligence', {
      sort: 'relevance',
    });

    expect(result.providers).toHaveLength(2);
    expect(result.providers.every((provider) => provider.ok)).toBe(true);
    expect(result.works).toHaveLength(1);
    expect(result.works[0]?.doi).toBe('10.1000/readplus');
    expect(result.works[0]?.sourceProviders.sort()).toEqual([
      'Crossref',
      'OpenAlex',
    ]);
    expect(result.works[0]?.pdfUrl).toBe('https://example.org/article.pdf');
  });

  it('não propaga URL executável fornecida por um provedor', async () => {
    const maliciousPayload = structuredClone(openAlexPayload);
    maliciousPayload.results[0].best_oa_location.pdf_url = 'javascript:alert(1)';

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(maliciousPayload), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: { items: [] } }), {
            status: 200,
          }),
        ),
    );

    const result = await searchAcademic('artificial intelligence', {
      sort: 'relevance',
    });

    expect(result.works[0]?.pdfUrl).toBeUndefined();
  });
});
