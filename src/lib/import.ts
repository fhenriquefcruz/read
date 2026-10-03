import type { AcademicWork, WorkAuthor } from '../types';

export type ImportFormat = 'bibtex' | 'ris' | 'csl-json';

function clean(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeDoi(value: unknown): string | undefined {
  return clean(value)
    ?.replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .toLowerCase();
}

function importId(title: string, doi?: string): string {
  if (doi) return `doi:${doi}`;
  return `import:${title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

function importedWork(input: {
  title: string;
  authors?: WorkAuthor[];
  year?: number;
  doi?: string;
  type?: string;
  venue?: string;
  publisher?: string;
  language?: string;
  officialUrl?: string;
}): AcademicWork {
  const doi = normalizeDoi(input.doi);
  const officialUrl =
    clean(input.officialUrl) ?? (doi ? `https://doi.org/${doi}` : undefined);

  return {
    id: importId(input.title, doi),
    title: input.title,
    authors: input.authors ?? [],
    year: input.year,
    doi,
    type: input.type ?? 'article',
    venue: input.venue,
    publisher: input.publisher,
    language: input.language,
    citationCount: 0,
    concepts: [],
    isOpenAccess: null,
    officialUrl,
    providerIds: { Imported: doi ?? input.title },
    sourceProviders: ['Imported'],
  };
}

function cslAuthors(raw: unknown): WorkAuthor[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const author = entry as Record<string, unknown>;
    const literal = clean(author.literal);
    const name =
      literal ??
      [clean(author.given), clean(author.family)].filter(Boolean).join(' ');
    if (!name) return [];
    return [{ name, institutions: [] }];
  });
}

function cslYear(raw: unknown): number | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const parts = (raw as Record<string, unknown>)['date-parts'];
  if (!Array.isArray(parts) || !Array.isArray(parts[0])) return undefined;
  const year = parts[0][0];
  return typeof year === 'number' ? year : undefined;
}

function mapCslType(value?: string): string {
  if (value === 'article-journal') return 'article';
  if (value === 'chapter') return 'book-chapter';
  if (value === 'paper-conference') return 'proceedings-article';
  if (value === 'thesis') return 'thesis';
  return value ?? 'article';
}

function parseCslJson(text: string): AcademicWork[] {
  const parsed = JSON.parse(text) as unknown;
  const rows = Array.isArray(parsed) ? parsed : [parsed];

  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const title = clean(item.title);
    if (!title) return [];

    return [
      importedWork({
        title,
        authors: cslAuthors(item.author),
        year: cslYear(item.issued),
        doi: clean(item.DOI),
        type: mapCslType(clean(item.type)),
        venue: clean(item['container-title']),
        publisher: clean(item.publisher),
        language: clean(item.language),
        officialUrl: clean(item.URL),
      }),
    ];
  });
}

function parseRisRecord(record: string): AcademicWork | null {
  const fields = new Map<string, string[]>();
  for (const line of record.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9]{2})\s{0,2}-\s?(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2]?.trim();
    if (!key || !value) continue;
    const current = fields.get(key) ?? [];
    current.push(value);
    fields.set(key, current);
  }

  const title = fields.get('TI')?.[0] ?? fields.get('T1')?.[0];
  if (!title) return null;
  const yearText = fields.get('PY')?.[0] ?? fields.get('Y1')?.[0];
  const yearMatch = yearText?.match(/\d{4}/);
  const type = fields.get('TY')?.[0];

  return importedWork({
    title,
    authors: (fields.get('AU') ?? fields.get('A1') ?? []).map((name) => ({
      name,
      institutions: [],
    })),
    year: yearMatch ? Number(yearMatch[0]) : undefined,
    doi: fields.get('DO')?.[0],
    type:
      type === 'BOOK'
        ? 'book'
        : type === 'CHAP'
          ? 'book-chapter'
          : type === 'THES'
            ? 'thesis'
            : type === 'PREPRINT'
              ? 'preprint'
              : 'article',
    venue: fields.get('JO')?.[0] ?? fields.get('JF')?.[0] ?? fields.get('T2')?.[0],
    publisher: fields.get('PB')?.[0],
    language: fields.get('LA')?.[0],
    officialUrl: fields.get('UR')?.[0],
  });
}

function parseRis(text: string): AcademicWork[] {
  return text
    .split(/ER\s{0,2}-\s*(?:\r?\n|$)/)
    .map(parseRisRecord)
    .filter((work): work is AcademicWork => Boolean(work));
}

function unwrapBibValue(value: string): string {
  const trimmed = value.trim().replace(/,$/, '').trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseBibFields(body: string): Map<string, string> {
  const fields = new Map<string, string>();
  let cursor = 0;

  while (cursor < body.length) {
    while (/\s|,/.test(body[cursor] ?? '')) cursor += 1;
    const keyStart = cursor;
    while (/[A-Za-z0-9_-]/.test(body[cursor] ?? '')) cursor += 1;
    const key = body.slice(keyStart, cursor).toLowerCase();
    while (/\s/.test(body[cursor] ?? '')) cursor += 1;
    if (!key || body[cursor] !== '=') {
      cursor += 1;
      continue;
    }
    cursor += 1;
    while (/\s/.test(body[cursor] ?? '')) cursor += 1;

    const valueStart = cursor;
    const opener = body[cursor];
    if (opener === '{' || opener === '"') {
      const closer = opener === '{' ? '}' : '"';
      let depth = opener === '{' ? 1 : 0;
      cursor += 1;
      while (cursor < body.length) {
        const char = body[cursor];
        if (opener === '{') {
          if (char === '{') depth += 1;
          if (char === '}') {
            depth -= 1;
            if (depth === 0) {
              cursor += 1;
              break;
            }
          }
        } else if (char === closer && body[cursor - 1] !== '\\') {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
    } else {
      while (cursor < body.length && body[cursor] !== ',') cursor += 1;
    }

    fields.set(key, unwrapBibValue(body.slice(valueStart, cursor)));
    while (cursor < body.length && body[cursor] !== ',') cursor += 1;
    if (body[cursor] === ',') cursor += 1;
  }

  return fields;
}

function bibEntries(text: string): Array<{ type: string; body: string }> {
  const entries: Array<{ type: string; body: string }> = [];
  let cursor = 0;

  while (cursor < text.length) {
    const at = text.indexOf('@', cursor);
    if (at < 0) break;
    const typeMatch = text.slice(at + 1).match(/^([A-Za-z]+)\s*[{(]/);
    if (!typeMatch) {
      cursor = at + 1;
      continue;
    }

    const type = typeMatch[1]?.toLowerCase() ?? 'article';
    const openIndex = at + 1 + (typeMatch[0]?.lastIndexOf(typeMatch[0].at(-1) ?? '{') ?? 0);
    const opener = text[openIndex];
    const closer = opener === '(' ? ')' : '}';
    let depth = 1;
    let index = openIndex + 1;
    let quoted = false;

    while (index < text.length && depth > 0) {
      const char = text[index];
      if (char === '"' && text[index - 1] !== '\\') quoted = !quoted;
      if (!quoted) {
        if (char === opener) depth += 1;
        if (char === closer) depth -= 1;
      }
      index += 1;
    }

    if (depth === 0) {
      const raw = text.slice(openIndex + 1, index - 1);
      const comma = raw.indexOf(',');
      entries.push({ type, body: comma >= 0 ? raw.slice(comma + 1) : raw });
    }
    cursor = Math.max(index, at + 1);
  }

  return entries;
}

function parseBibTeX(text: string): AcademicWork[] {
  return bibEntries(text).flatMap(({ type, body }) => {
    const fields = parseBibFields(body);
    const title = fields.get('title');
    if (!title) return [];
    const authorField = fields.get('author') ?? '';
    const authors = authorField
      .split(/\s+and\s+/i)
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name, institutions: [] }));

    const yearText = fields.get('year');
    const year = yearText && /^\d{4}$/.test(yearText) ? Number(yearText) : undefined;
    return [
      importedWork({
        title,
        authors,
        year,
        doi: fields.get('doi'),
        type:
          type === 'book'
            ? 'book'
            : type === 'incollection'
              ? 'book-chapter'
              : type === 'phdthesis' || type === 'mastersthesis'
                ? 'thesis'
                : type === 'inproceedings'
                  ? 'proceedings-article'
                  : 'article',
        venue: fields.get('journal') ?? fields.get('booktitle'),
        publisher: fields.get('publisher'),
        language: fields.get('language'),
        officialUrl: fields.get('url'),
      }),
    ];
  });
}

export function detectImportFormat(text: string): ImportFormat {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('O conteúdo bibliográfico está vazio.');
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'csl-json';
  if (/^TY\s{0,2}-/m.test(trimmed)) return 'ris';
  if (/^\s*@[A-Za-z]+\s*[{(]/m.test(trimmed)) return 'bibtex';
  throw new Error('Formato não reconhecido. Use BibTeX, RIS ou CSL-JSON.');
}

export function parseBibliography(text: string, format = detectImportFormat(text)): AcademicWork[] {
  try {
    const works =
      format === 'csl-json'
        ? parseCslJson(text)
        : format === 'ris'
          ? parseRis(text)
          : parseBibTeX(text);

    if (!works.length) {
      throw new Error('Nenhuma referência bibliográfica válida foi encontrada.');
    }
    return works;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('CSL-JSON inválido ou incompleto.');
    }
    throw error;
  }
}
