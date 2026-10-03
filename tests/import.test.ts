import { describe, expect, it } from 'vitest';
import { detectImportFormat, parseBibliography } from '../src/lib/import';

describe('bibliography import', () => {
  it('detecta e importa CSL-JSON', () => {
    const text = JSON.stringify([
      {
        id: 'item-1',
        type: 'article-journal',
        title: 'Evidence in Public Administration',
        author: [{ given: 'Ana', family: 'Silva' }],
        issued: { 'date-parts': [[2025]] },
        DOI: 'https://doi.org/10.1000/IMPORT.1',
        'container-title': 'Journal of Evidence',
      },
    ]);

    expect(detectImportFormat(text)).toBe('csl-json');
    const [work] = parseBibliography(text);
    expect(work?.doi).toBe('10.1000/import.1');
    expect(work?.authors[0]?.name).toBe('Ana Silva');
    expect(work?.venue).toBe('Journal of Evidence');
    expect(work?.sourceProviders).toEqual(['Imported']);
  });

  it('importa múltiplos registros RIS', () => {
    const text = `TY  - JOUR
TI  - First Study
AU  - Ana Silva
PY  - 2024
DO  - 10.1000/first
ER  -

TY  - BOOK
TI  - Second Study
AU  - Bruno Souza
PY  - 2023
ER  -
`;

    const works = parseBibliography(text);
    expect(works).toHaveLength(2);
    expect(works[0]?.type).toBe('article');
    expect(works[1]?.type).toBe('book');
  });

  it('importa BibTeX com campos multilinha', () => {
    const text = `@article{silva2025,
  title = {Machine Learning
    in Public Administration},
  author = {Ana Silva and Bruno Souza},
  year = {2025},
  journal = {Journal of Evidence},
  doi = {10.1000/readplus-import}
}`;

    const [work] = parseBibliography(text);
    expect(work?.title).toContain('Machine Learning');
    expect(work?.authors.map((author) => author.name)).toEqual([
      'Ana Silva',
      'Bruno Souza',
    ]);
    expect(work?.doi).toBe('10.1000/readplus-import');
  });

  it('rejeita conteúdo que não representa formato suportado', () => {
    expect(() => parseBibliography('texto qualquer')).toThrow(
      'Formato não reconhecido',
    );
  });
});
