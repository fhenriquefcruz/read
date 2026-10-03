import type { Page, Route } from '@playwright/test';

export const OPENALEX_WORK = {
  id: 'https://openalex.org/W123',
  doi: 'https://doi.org/10.1000/readplus.2025.1',
  title: 'Machine Learning in Public Administration',
  publication_year: 2025,
  type: 'article',
  language: 'en',
  cited_by_count: 42,
  authorships: [
    {
      author: {
        display_name: 'Ana Silva',
        orcid: 'https://orcid.org/0000-0000-0000-0001',
      },
      institutions: [
        { display_name: 'Universidade Federal de Mato Grosso do Sul' },
      ],
    },
  ],
  abstract_inverted_index: {
    Machine: [0],
    learning: [1],
    supports: [2],
    evidence: [3],
    in: [4],
    public: [5],
    administration: [6],
  },
  primary_location: {
    landing_page_url: 'https://doi.org/10.1000/readplus.2025.1',
    source: {
      display_name: 'Journal of Public Administration Research',
      host_organization_name: 'Academic Publisher',
    },
  },
  best_oa_location: {
    pdf_url: 'https://example.org/readplus-paper.pdf',
    license: 'cc-by',
  },
  open_access: {
    is_oa: true,
    oa_status: 'gold',
  },
  topics: [
    { display_name: 'Public Administration' },
    { display_name: 'Machine Learning' },
  ],
};

function relatedWork(id: string, title: string, year: number) {
  return {
    ...OPENALEX_WORK,
    id: `https://openalex.org/${id}`,
    doi: undefined,
    title,
    publication_year: year,
    cited_by_count: 7,
    best_oa_location: {},
    open_access: { is_oa: false, oa_status: 'closed' },
    topics: [{ display_name: 'Public Administration' }],
  };
}

export const OPENALEX_REFERENCE = relatedWork(
  'WREF',
  'Foundations of Digital Government',
  2019,
);
export const OPENALEX_CITING = relatedWork(
  'WCITE',
  'Accountable AI in Government',
  2026,
);
export const OPENALEX_RELATED = relatedWork(
  'WREL',
  'Algorithmic Decision Support in the Public Sector',
  2024,
);

export const CROSSREF_WORK = {
  DOI: '10.1000/readplus.2025.1',
  title: ['Machine Learning in Public Administration'],
  author: [{ given: 'Ana', family: 'Silva', affiliation: [{ name: 'UFMS' }] }],
  published: { 'date-parts': [[2025, 3, 2]] },
  type: 'journal-article',
  'container-title': ['Journal of Public Administration Research'],
  publisher: 'Academic Publisher',
  language: 'en',
  'is-referenced-by-count': 40,
  URL: 'https://doi.org/10.1000/readplus.2025.1',
  link: [
    {
      URL: 'https://example.org/readplus-paper.pdf',
      'content-type': 'application/pdf',
    },
  ],
};

export async function mockAcademicApis(
  page: Page,
  options: { openAlexFails?: boolean; crossrefFails?: boolean } = {},
) {
  await page.route('**://api.openalex.org/**', async (route: Route) => {
    if (options.openAlexFails) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"unavailable"}',
      });
      return;
    }

    const url = new URL(route.request().url());

    if (url.pathname.endsWith('/works/W123')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'https://openalex.org/W123',
          referenced_works: ['https://openalex.org/WREF'],
          related_works: ['https://openalex.org/WREL'],
        }),
      });
      return;
    }

    const filter = url.searchParams.get('filter') ?? '';
    if (filter.startsWith('openalex:WREF')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ meta: { count: 1 }, results: [OPENALEX_REFERENCE] }),
      });
      return;
    }
    if (filter.startsWith('openalex:WREL')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ meta: { count: 1 }, results: [OPENALEX_RELATED] }),
      });
      return;
    }
    if (filter === 'cites:W123') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ meta: { count: 1 }, results: [OPENALEX_CITING] }),
      });
      return;
    }

    if (/\/works\/W(?:REF|REL|CITE)$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: `https://openalex.org/${url.pathname.split('/').at(-1)}`,
          referenced_works: [],
          related_works: [],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ meta: { count: 1 }, results: [OPENALEX_WORK] }),
    });
  });

  await page.route('**://api.crossref.org/**', async (route: Route) => {
    if (options.crossrefFails) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"message":"unavailable"}',
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        message: { items: [CROSSREF_WORK] },
      }),
    });
  });
}
