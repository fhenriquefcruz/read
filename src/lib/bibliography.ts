import type { AcademicWork } from '../types';

export type BibliographyFormat = 'bibtex' | 'ris' | 'csl-json';

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function bibEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[{}]/g, (match) => `\\${match}`);
}

function citationKey(work: AcademicWork): string {
  const author = work.authors[0]?.name.split(/\s+/).at(-1) ?? 'readplus';
  const year = work.year ?? 'nd';
  const titleWord = work.title.split(/\s+/).find((word) => word.length > 3) ?? 'work';
  return slug(`${author}-${year}-${titleWord}`).replace(/-/g, '');
}

function bibType(type: string): string {
  if (type === 'book') return 'book';
  if (type === 'book-chapter') return 'incollection';
  if (type === 'dissertation' || type === 'thesis') return 'phdthesis';
  if (type === 'proceedings-article') return 'inproceedings';
  return 'article';
}

function risType(type: string): string {
  if (type === 'book') return 'BOOK';
  if (type === 'book-chapter') return 'CHAP';
  if (type === 'dissertation' || type === 'thesis') return 'THES';
  if (type === 'preprint') return 'PREPRINT';
  return 'JOUR';
}

function cslType(type: string): string {
  if (type === 'book') return 'book';
  if (type === 'book-chapter') return 'chapter';
  if (type === 'dissertation' || type === 'thesis') return 'thesis';
  if (type === 'proceedings-article') return 'paper-conference';
  return 'article-journal';
}

export function toBibTeX(work: AcademicWork): string {
  const fields: Array<[string, string | undefined]> = [
    ['title', work.title],
    ['author', work.authors.length ? work.authors.map((author) => author.name).join(' and ') : undefined],
    ['year', work.year ? String(work.year) : undefined],
    [bibType(work.type) === 'article' ? 'journal' : 'booktitle', work.venue],
    ['publisher', work.publisher],
    ['doi', work.doi],
    ['url', work.officialUrl],
    ['language', work.language],
  ];

  const body = fields
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `  ${key} = {${bibEscape(value)}},`)
    .join('\n');

  return `@${bibType(work.type)}{${citationKey(work)},\n${body}\n}\n`;
}

export function toRIS(work: AcademicWork): string {
  const lines = [`TY  - ${risType(work.type)}`, `TI  - ${work.title}`];

  for (const author of work.authors) lines.push(`AU  - ${author.name}`);
  if (work.year) lines.push(`PY  - ${work.year}`);
  if (work.venue) lines.push(`JO  - ${work.venue}`);
  if (work.publisher) lines.push(`PB  - ${work.publisher}`);
  if (work.doi) lines.push(`DO  - ${work.doi}`);
  if (work.officialUrl) lines.push(`UR  - ${work.officialUrl}`);
  if (work.language) lines.push(`LA  - ${work.language}`);
  lines.push('ER  - ');

  return `${lines.join('\n')}\n`;
}

export function toCSLJSON(work: AcademicWork): string {
  const item: Record<string, unknown> = {
    id: work.doi ?? work.id,
    type: cslType(work.type),
    title: work.title,
    author: work.authors.map((author) => ({ literal: author.name })),
  };

  if (work.year) item.issued = { 'date-parts': [[work.year]] };
  if (work.venue) item['container-title'] = work.venue;
  if (work.publisher) item.publisher = work.publisher;
  if (work.doi) item.DOI = work.doi;
  if (work.officialUrl) item.URL = work.officialUrl;
  if (work.language) item.language = work.language;

  return `${JSON.stringify(item, null, 2)}\n`;
}

export function serializeBibliography(work: AcademicWork, format: BibliographyFormat): string {
  if (format === 'bibtex') return toBibTeX(work);
  if (format === 'ris') return toRIS(work);
  return toCSLJSON(work);
}

export function bibliographyFilename(work: AcademicWork, format: BibliographyFormat): string {
  const base = slug(work.title) || 'readplus-reference';
  const extension = format === 'bibtex' ? 'bib' : format === 'ris' ? 'ris' : 'json';
  return `${base}.${extension}`;
}

export function downloadBibliography(work: AcademicWork, format: BibliographyFormat): void {
  const content = serializeBibliography(work, format);
  const type = format === 'csl-json' ? 'application/json' : 'text/plain;charset=utf-8';
  const blob = new Blob([content], { type });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = bibliographyFilename(work, format);
  anchor.click();
  URL.revokeObjectURL(href);
}
