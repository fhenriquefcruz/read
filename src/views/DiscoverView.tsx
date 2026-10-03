import { useRef, useState } from 'react';
import { searchAcademic } from '../lib/api';
import type { AcademicWork, ProviderStatus, SearchFilters } from '../types';
import { Icon } from '../components/Icons';
import { ExternalLink } from '../components/ExternalLink';

interface DiscoverViewProps {
  savedIds: Set<string>;
  onSelect: (work: AcademicWork) => void;
  onSave: (work: AcademicWork) => void;
}

const defaultFilters: SearchFilters = { sort: 'relevance' };

function providerLabel(status: ProviderStatus) {
  if (status.ok) return `${status.provider}: ${status.count} resultados`;
  return `${status.provider}: indisponível`;
}

export function DiscoverView({ savedIds, onSelect, onSave }: DiscoverViewProps) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);
  const [works, setWorks] = useState<AcademicWork[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Pesquise um tema, pergunta ou autor para iniciar uma investigação.');
  const [fromCache, setFromCache] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function executeSearch(event?: React.FormEvent) {
    event?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setMessage('Digite um tema ou uma consulta estruturada.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setMessage('Consultando fontes acadêmicas…');

    try {
      const response = await searchAcademic(trimmed, filters, controller.signal);
      setWorks(response.works);
      setProviders(response.providers);
      setFromCache(response.fromCache);
      setMessage(
        response.works.length
          ? `${response.works.length} trabalhos únicos encontrados e normalizados.`
          : 'Nenhum trabalho correspondeu aos critérios. Nenhum resultado artificial foi adicionado.',
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setWorks([]);
      setProviders([]);
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir a busca.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const oaCount = works.filter((work) => work.isOpenAccess).length;
  const recentCount = works.filter((work) => (work.year ?? 0) >= new Date().getFullYear() - 2).length;
  const cited = [...works].sort((a, b) => b.citationCount - a.citationCount)[0];

  return (
    <div className="discover-layout">
      <main className="discover-main">
        <header className="discover-hero">
          <span className="eyebrow">Academic Discovery Engine</span>
          <h1>Da pergunta à evidência.</h1>
          <p>
            Encontre literatura real, compare sinais de relevância e leve os trabalhos certos para sua biblioteca e pesquisa.
          </p>

          <form className="search-box" onSubmit={executeSearch}>
            <Icon name="search" className="search-box__icon" />
            <label className="sr-only" htmlFor="global-search">Pesquisar literatura acadêmica</label>
            <input
              id="global-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='Ex.: "machine learning" education year:2022-2026 open_access:true'
              autoComplete="off"
            />
            <button className="search-submit" type="submit" disabled={loading}>
              {loading ? 'Buscando…' : 'Pesquisar'}
            </button>
          </form>

          <div className="query-help">
            Sintaxe: <code>author:"Daniel Kahneman"</code> <code>year:2020-2026</code>{' '}
            <code>type:article</code> <code>open_access:true</code> <code>language:pt</code>
          </div>
        </header>

        <section className="filters" aria-label="Filtros da pesquisa">
          <div className="filter-title"><Icon name="filter" /> Refinar</div>
          <label>
            De
            <input
              inputMode="numeric"
              value={filters.yearFrom ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, yearFrom: Number(event.target.value) || undefined }))}
              placeholder="2018"
            />
          </label>
          <label>
            Até
            <input
              inputMode="numeric"
              value={filters.yearTo ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, yearTo: Number(event.target.value) || undefined }))}
              placeholder="2026"
            />
          </label>
          <label>
            Tipo
            <select value={filters.type ?? ''} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value || undefined }))}>
              <option value="">Todos</option>
              <option value="article">Artigo</option>
              <option value="book">Livro</option>
              <option value="book-chapter">Capítulo</option>
              <option value="dissertation">Dissertação/tese</option>
              <option value="preprint">Preprint</option>
            </select>
          </label>
          <label>
            Acesso
            <select
              value={filters.openAccess === undefined ? '' : String(filters.openAccess)}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  openAccess: event.target.value === '' ? undefined : event.target.value === 'true',
                }))
              }
            >
              <option value="">Qualquer</option>
              <option value="true">Open Access</option>
              <option value="false">Fechado</option>
            </select>
          </label>
          <label>
            Ordenar
            <select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as SearchFilters['sort'] }))}>
              <option value="relevance">Relevância</option>
              <option value="recent">Mais recentes</option>
              <option value="citations">Mais citados</option>
            </select>
          </label>
        </section>

        <div className="results-status" role="status" aria-live="polite">
          <span>{message}</span>
          {fromCache && <span className="status-pill">cache local recente</span>}
        </div>

        <div className="provider-strip" aria-label="Estado das fontes">
          {providers.map((provider) => (
            <span className={provider.ok ? 'provider provider--ok' : 'provider provider--error'} key={provider.provider}>
              <span className="provider-dot" />
              {providerLabel(provider)}
            </span>
          ))}
        </div>

        <section className="result-list" aria-label="Resultados acadêmicos">
          {works.map((work, index) => (
            <article className="work-row" key={work.id}>
              <div className="work-row__rank" aria-label={`posição ${index + 1}`}>{String(index + 1).padStart(2, '0')}</div>
              <div className="work-row__body">
                <div className="work-row__topline">
                  <div className="chip-row">
                    <span className="chip chip--quiet">{work.type}</span>
                    {work.isOpenAccess && <span className="chip chip--positive">Open Access</span>}
                    {work.sourceProviders.map((provider) => <span className="chip chip--quiet" key={provider}>{provider}</span>)}
                  </div>
                  <span className="rank-score" title={(work.rankReasons ?? []).join(' · ')}>
                    relevância {Math.round(work.rankScore ?? 0)}
                  </span>
                </div>

                <button className="work-title" type="button" onClick={() => onSelect(work)}>
                  {work.title}
                </button>

                <p className="work-authors">
                  {work.authors.slice(0, 4).map((author) => author.name).join(', ') || 'Autoria não informada'}
                  {work.authors.length > 4 ? ' et al.' : ''}
                </p>

                <div className="work-meta">
                  <span>{work.year ?? 's.d.'}</span>
                  {work.venue && <span>{work.venue}</span>}
                  <span>{work.citationCount.toLocaleString('pt-BR')} citações</span>
                  {work.doi && <span>DOI {work.doi}</span>}
                </div>

                {work.abstract && <p className="work-abstract">{work.abstract}</p>}

                <div className="work-actions">
                  <button className="text-button" type="button" onClick={() => onSelect(work)}>
                    Ver detalhes <Icon name="arrow" />
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => onSave(work)}
                    disabled={savedIds.has(work.id)}
                  >
                    <Icon name={savedIds.has(work.id) ? 'check' : 'bookmark'} />
                    {savedIds.has(work.id) ? 'Salvo' : 'Salvar'}
                  </button>
                  <ExternalLink className="text-button" href={work.officialUrl}>
                    Fonte <Icon name="external" />
                  </ExternalLink>
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>

      <aside className="research-lens" aria-label="Leitura rápida da pesquisa">
        <div className="lens-head">
          <span className="eyebrow">Research lens</span>
          <h2>Leitura do conjunto</h2>
        </div>
        <div className="lens-metric">
          <strong>{works.length}</strong>
          <span>trabalhos únicos</span>
        </div>
        <div className="lens-metric">
          <strong>{oaCount}</strong>
          <span>com acesso aberto</span>
        </div>
        <div className="lens-metric">
          <strong>{recentCount}</strong>
          <span>publicados nos últimos 2 anos</span>
        </div>
        <div className="lens-section">
          <span className="lens-label">Trabalho mais citado no recorte</span>
          <p>{cited ? cited.title : 'Faça uma busca para construir esta leitura.'}</p>
        </div>
        <div className="lens-section">
          <span className="lens-label">Como o ranking funciona</span>
          <p>Correspondência textual, abstract/conceitos, citações ajustadas pela idade, completude, recência e Open Access.</p>
        </div>
      </aside>
    </div>
  );
}
