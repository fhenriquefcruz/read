import { useEffect, useMemo, useState } from 'react';
import { resolveDoi } from '../lib/api';
import {
  type BibliographyFormat,
  downloadBibliographySet,
} from '../lib/bibliography';
import { parseBibliography } from '../lib/import';
import type { AcademicWork, LibraryEntry, LibraryStatus } from '../types';
import { Icon } from '../components/Icons';

interface LibraryViewProps {
  entries: LibraryEntry[];
  onUpdate: (entry: LibraryEntry) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSelect: (work: AcademicWork) => void;
  onImportWorks: (
    works: AcademicWork[],
  ) => Promise<{ added: number; skipped: number }>;
}

const statuses: Array<{ value: LibraryStatus; label: string }> = [
  { value: 'saved', label: 'Salvo' },
  { value: 'to-read', label: 'Quero ler' },
  { value: 'reading', label: 'Lendo' },
  { value: 'read', label: 'Lido' },
  { value: 'important', label: 'Referência importante' },
  { value: 'archived', label: 'Arquivado' },
];

function normalizeTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

function TagEditor({
  entry,
  onUpdate,
}: {
  entry: LibraryEntry;
  onUpdate: (entry: LibraryEntry) => Promise<void>;
}) {
  const [draft, setDraft] = useState(entry.tags.join(', '));

  useEffect(() => {
    setDraft(entry.tags.join(', '));
  }, [entry.tags]);

  async function commit() {
    const tags = normalizeTags(draft);
    setDraft(tags.join(', '));
    if (tags.join('|') === entry.tags.join('|')) return;
    await onUpdate({
      ...entry,
      tags,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <label className="library-field">
      <span>Tags</span>
      <input
        aria-label={`Tags de ${entry.work.title}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        placeholder="governança, IA, método"
      />
    </label>
  );
}

export function LibraryView({
  entries,
  onUpdate,
  onRemove,
  onSelect,
  onImportWorks,
}: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<LibraryStatus | 'all'>('all');
  const [collection, setCollection] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] =
    useState<BibliographyFormat>('bibtex');
  const [doi, setDoi] = useState('');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');

  const collections = useMemo(
    () =>
      [...new Set(entries.map((entry) => entry.collection).filter(Boolean))]
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [entries],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return entries
      .filter((entry) => status === 'all' || entry.status === status)
      .filter(
        (entry) =>
          collection === 'all' || (entry.collection ?? '') === collection,
      )
      .filter((entry) => {
        if (!normalized) return true;
        return [
          entry.work.title,
          entry.work.authors.map((author) => author.name).join(' '),
          entry.tags.join(' '),
          entry.collection ?? '',
          entry.note,
          entry.work.doi ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalized);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [entries, query, status, collection]);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedIds.has(entry.id)),
    [entries, selectedIds],
  );

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleFiltered() {
    const filteredIds = filtered.map((entry) => entry.id);
    const allSelected =
      filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of filteredIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function importResolvedDoi(event: React.FormEvent) {
    event.preventDefault();
    if (!doi.trim()) return;
    setImporting(true);
    setImportMessage('Consultando DOI nas fontes acadêmicas…');
    try {
      const work = await resolveDoi(doi);
      const result = await onImportWorks([work]);
      setImportMessage(
        result.added
          ? 'Referência importada e enriquecida com sucesso.'
          : 'Esta referência já existe na biblioteca.',
      );
      if (result.added) setDoi('');
    } catch (error) {
      setImportMessage(
        error instanceof Error ? error.message : 'Não foi possível importar o DOI.',
      );
    } finally {
      setImporting(false);
    }
  }

  async function importContent(content = importText) {
    if (!content.trim()) return;
    setImporting(true);
    try {
      const works = parseBibliography(content);
      const result = await onImportWorks(works);
      setImportMessage(
        `${result.added} importada(s) · ${result.skipped} duplicada(s) ignorada(s).`,
      );
      if (result.added) setImportText('');
    } catch (error) {
      setImportMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível interpretar as referências.',
      );
    } finally {
      setImporting(false);
    }
  }

  async function readImportFile(file?: File) {
    if (!file) return;
    const text = await file.text();
    setImportText(text);
    await importContent(text);
  }

  return (
    <main className="section-page">
      <header className="section-header">
        <div>
          <span className="eyebrow">Biblioteca pessoal</span>
          <h1>Seu corpus de trabalho.</h1>
          <p>
            Importe, organize e reutilize referências sem transformar a
            biblioteca em uma lista de favoritos soltos.
          </p>
        </div>
        <div className="section-count">{entries.length} itens</div>
      </header>

      <details className="library-import">
        <summary>
          <span>
            <Icon name="plus" />
            <strong>Importar referências</strong>
          </span>
          <small>DOI · BibTeX · RIS · CSL-JSON</small>
        </summary>

        <div className="library-import__body">
          <form className="doi-import" onSubmit={importResolvedDoi}>
            <label>
              DOI
              <input
                value={doi}
                onChange={(event) => setDoi(event.target.value)}
                placeholder="10.1000/exemplo"
              />
            </label>
            <button className="primary-button" type="submit" disabled={importing}>
              Resolver DOI
            </button>
          </form>

          <div className="import-divider">
            <span>ou importe arquivo/conteúdo bibliográfico</span>
          </div>

          <label className="file-import">
            <span>Arquivo BibTeX, RIS ou CSL-JSON</span>
            <input
              type="file"
              accept=".bib,.ris,.json,application/json,text/plain"
              onChange={(event) =>
                void readImportFile(event.target.files?.[0])
              }
            />
          </label>

          <label className="import-text">
            <span>Conteúdo bibliográfico</span>
            <textarea
              rows={7}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="@article{...} ou TY  - JOUR ou CSL-JSON"
            />
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={importing || !importText.trim()}
            onClick={() => void importContent()}
          >
            Importar conteúdo
          </button>

          <p className="import-status" role="status" aria-live="polite">
            {importMessage}
          </p>
        </div>
      </details>

      <section className="library-toolbar" aria-label="Filtros da biblioteca">
        <label className="library-search">
          <Icon name="search" />
          <span className="sr-only">Buscar na biblioteca</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar título, autor, DOI, coleção, tag ou nota"
          />
        </label>
        <label>
          <span className="sr-only">Filtrar por status</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as LibraryStatus | 'all')
            }
          >
            <option value="all">Todos os status</option>
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Filtrar por coleção</span>
          <select
            value={collection}
            onChange={(event) => setCollection(event.target.value)}
          >
            <option value="all">Todas as coleções</option>
            {collections.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </section>

      {filtered.length > 0 && (
        <div className="library-bulkbar">
          <label>
            <input
              type="checkbox"
              checked={
                filtered.length > 0 &&
                filtered.every((entry) => selectedIds.has(entry.id))
              }
              onChange={toggleFiltered}
            />
            Selecionar recorte
          </label>
          <span>{selectedEntries.length} selecionado(s)</span>
          <select
            aria-label="Formato da exportação em lote"
            value={exportFormat}
            onChange={(event) =>
              setExportFormat(event.target.value as BibliographyFormat)
            }
          >
            <option value="bibtex">BibTeX</option>
            <option value="ris">RIS</option>
            <option value="csl-json">CSL-JSON</option>
          </select>
          <button
            className="secondary-button"
            type="button"
            disabled={!selectedEntries.length}
            onClick={() =>
              downloadBibliographySet(
                selectedEntries.map((entry) => entry.work),
                exportFormat,
              )
            }
          >
            Exportar seleção
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-panel">
          <Icon name="library" />
          <h2>Nenhum item neste recorte.</h2>
          <p>
            Importe uma referência, salve trabalhos na descoberta ou ajuste os
            filtros da biblioteca.
          </p>
        </div>
      ) : (
        <ul className="library-table">
          {filtered.map((entry) => (
            <li className="library-row" key={entry.id}>
              <div className="library-select">
                <input
                  type="checkbox"
                  aria-label={`Selecionar ${entry.work.title}`}
                  checked={selectedIds.has(entry.id)}
                  onChange={() => toggleSelected(entry.id)}
                />
              </div>

              <div className="library-row__content">
                <button
                  className="work-title work-title--compact"
                  type="button"
                  onClick={() => onSelect(entry.work)}
                >
                  {entry.work.title}
                </button>
                <p className="work-authors">
                  {entry.work.authors
                    .slice(0, 3)
                    .map((author) => author.name)
                    .join(', ') || 'Autoria não informada'}
                </p>
                <div className="work-meta">
                  <span>{entry.work.year ?? 's.d.'}</span>
                  {entry.work.venue && <span>{entry.work.venue}</span>}
                  {entry.work.doi && <span>DOI {entry.work.doi}</span>}
                </div>

                {entry.tags.length > 0 && (
                  <div className="chip-row library-tags">
                    {entry.tags.map((tag) => (
                      <span className="chip chip--quiet" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <label className="inline-note">
                  <span>Nota</span>
                  <textarea
                    value={entry.note}
                    rows={2}
                    placeholder="Por que este trabalho importa para você?"
                    onChange={(event) =>
                      void onUpdate({
                        ...entry,
                        note: event.target.value,
                        updatedAt: new Date().toISOString(),
                      })
                    }
                  />
                </label>
              </div>

              <div className="library-row__actions">
                <label className="library-field">
                  <span>Status</span>
                  <select
                    value={entry.status}
                    onChange={(event) =>
                      void onUpdate({
                        ...entry,
                        status: event.target.value as LibraryStatus,
                        updatedAt: new Date().toISOString(),
                      })
                    }
                  >
                    {statuses.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="library-field">
                  <span>Coleção</span>
                  <input
                    aria-label={`Coleção de ${entry.work.title}`}
                    value={entry.collection ?? ''}
                    list="readplus-collections"
                    placeholder="Ex.: Referencial teórico"
                    onChange={(event) =>
                      void onUpdate({
                        ...entry,
                        collection: event.target.value.trim() || undefined,
                        updatedAt: new Date().toISOString(),
                      })
                    }
                  />
                </label>

                <TagEditor entry={entry} onUpdate={onUpdate} />

                <button
                  className="text-button text-button--danger"
                  type="button"
                  onClick={() => void onRemove(entry.id)}
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <datalist id="readplus-collections">
        {collections.map((item) => (
          <option value={item} key={item} />
        ))}
      </datalist>
    </main>
  );
}
