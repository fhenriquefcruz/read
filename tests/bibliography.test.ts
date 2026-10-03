import { describe, expect, it } from 'vitest';
import {
  bibliographyFilename,
  serializeBibliography,
  toBibTeX,
  toCSLJSON,
  toRIS,
} from '../src/lib/bibliography';
import type { AcademicWork } from '../src/types';

const work: AcademicWork = {
  id: 'doi:10.1000/readplus',
  title: 'Machine Learning in Public Administration',
  authors: [
    {
      name: 'Ana Silva',
      orcid: 'https://orcid.org/0000-0000-0000-0001',
      institutions: ['UFMS'],
    },
  ],
  year: 2025,
  doi: '10.1000/readplus',
  type: 'article',
  venue: 'Journal of Public Administration Research',
  publisher: 'Academic Publisher',
  language: 'en',
  citationCount: 42,
  concepts: ['Machine Learning'],
  isOpenAccess: true,
  officialUrl: 'https://doi.org/10.1000/readplus',
  providerIds: { OpenAlex: 'https://openalex.org/W123' },
  sourceProviders: ['OpenAlex', 'Crossref'],
};

describe('bibliography exports', () => {
  it('gera BibTeX estruturado sem inventar campos ausentes', () => {
    const value = toBibTeX(work);

    expect(value).toContain('@article{');
    expect(value).toContain('author = {Ana Silva}');
    expect(value).toContain('journal = {Journal of Public Administration Research}');
    expect(value).toContain('doi = {10.1000/readplus}');
  });

  it('gera RIS interoperável', () => {
    const value = toRIS(work);

    expect(value).toContain('TY  - JOUR');
    expect(value).toContain('AU  - Ana Silva');
    expect(value).toContain('DO  - 10.1000/readplus');
    expect(value.endsWith('ER  - \n')).toBe(true);
  });

  it('gera CSL-JSON preservando autoria literal em vez de adivinhar nome/sobrenome', () => {
    const parsed = JSON.parse(toCSLJSON(work)) as Record<string, unknown>;

    expect(parsed.type).toBe('article-journal');
    expect(parsed.DOI).toBe('10.1000/readplus');
    expect(parsed.author).toEqual([{ literal: 'Ana Silva' }]);
  });

  it('expõe serialização e extensão coerentes', () => {
    expect(serializeBibliography(work, 'ris')).toBe(toRIS(work));
    expect(bibliographyFilename(work, 'bibtex')).toBe(
      'machine-learning-in-public-administration.bib',
    );
  });
});
