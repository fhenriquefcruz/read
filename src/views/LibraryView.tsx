import { useMemo, useState } from 'react';
import type { AcademicWork, LibraryEntry, LibraryStatus } from '../types';
import { Icon } from '../components/Icons';

interface LibraryViewProps {
  entries: LibraryEntry[];
  onUpdate: (entry: LibraryEntry) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSelect: (work: AcademicWork) => void;
}

const statuses: Array<{ value: LibraryStatus; label: string }> = [
  { value: 'saved', label: 'Salvo' },
  { value: 'to-read', label: 'Quero ler' },
  { value: 'reading', label: 'Lendo' },
  { value: 'read', label: 'Lido' },
  { value: 'important', label: 'Referência importante' },
  { value: 'archived', label: 'Arquivado' },
];

export function LibraryView({
  entries,
  onUpdate,
  onRemove,
  onSelect,
}: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<LibraryStatus | 'all'>('all');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return entries
      .filter((entry) => status === 'all' || entry.status === status)
      .filter((entry) => {
        if (!normalized) return true;
        return [
          entry.work.title,
          entry.work.authors.map((author) => author.name).join(' '),
          entry.tags.join(' '),
          entry.note,
          entry.work.doi ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalized);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [entries, query, status]);

  return (
    <main className="section-page">
      <header className="section-header">
        <div>
          <span className="eyebrow">Biblioteca pessoal</span>
          <h1>Seu corpus de trabalho.</h1>
          <p>
            Organize o que merece continuar na sua investigação — não apenas
            favoritos soltos.
          </p>
        </div>
        <div className="section-count">{entries.length} itens</div>
      </header>

      <section className="library-toolbar" aria-label="Filtros da biblioteca">
        <label className="library-search">
          <Icon name="search" />
          <span className="sr-only">Buscar na biblioteca</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar título, autor, DOI, tag ou nota"
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
      </section>

      {filtered.length === 0 ? (
        <div className="empty-panel">
          <Icon name="library" />
          <h2>Nenhum item neste recorte.</h2>
          <p>
            Salve trabalhos na descoberta ou ajuste os filtros da biblioteca.
          </p>
        </div>
      ) : (
        <div className="library-table" role="list">
          {filtered.map((entry) => (
            <article className="library-row" key={entry.id} role="listitem">
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
                <label>
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
                <button
                  className="text-button text-button--danger"
                  type="button"
                  onClick={() => void onRemove(entry.id)}
                >
                  Remover
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
