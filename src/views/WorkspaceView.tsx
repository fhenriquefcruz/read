import { useEffect, useMemo, useRef, useState } from 'react';
import { validateEvidenceRelations } from '../lib/intelligence';
import { searchHistoryStore, workspaceStore } from '../lib/storage';
import type {
  AcademicWork,
  EvidenceKind,
  LibraryEntry,
  SearchHistoryEntry,
  SearchFilters,
  Workspace,
  WorkspaceEvidence,
  WorkspaceEvidenceRelation,
  EvidenceRelationType,
  WorkspaceQuery,
} from '../types';
import { Icon } from '../components/Icons';
import { ResearchIntelligence } from '../components/ResearchIntelligence';

interface WorkspaceViewProps {
  library: LibraryEntry[];
  onSelect: (work: AcademicWork) => void;
}

const evidenceKinds: Array<{ value: EvidenceKind; label: string }> = [
  { value: 'finding', label: 'Achado' },
  { value: 'method', label: 'Método' },
  { value: 'limitation', label: 'Limitação' },
  { value: 'definition', label: 'Definição' },
  { value: 'quote', label: 'Citação/trecho' },
];

function createId(prefix = 'workspace') {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function evidenceLabel(kind: EvidenceKind): string {
  return evidenceKinds.find((item) => item.value === kind)?.label ?? kind;
}

function normalizeWorkspaceQueries(
  workspaceId: string,
  value: unknown,
): WorkspaceQuery[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    if (typeof item === 'string') {
      return [
        {
          id: `legacy-${workspaceId}-${index}`,
          raw: item,
          filters: { sort: 'relevance' as const },
          createdAt: new Date(0).toISOString(),
        },
      ];
    }

    if (!item || typeof item !== 'object') return [];
    const query = item as Partial<WorkspaceQuery>;
    if (!query.id || !query.raw || !query.filters || !query.createdAt) return [];
    return [query as WorkspaceQuery];
  });
}

function filterSummary(filters: SearchFilters): string {
  const parts: string[] = [];
  if (filters.yearFrom || filters.yearTo) {
    parts.push(`ano ${filters.yearFrom ?? '…'}–${filters.yearTo ?? '…'}`);
  }
  if (filters.type) parts.push(`tipo ${filters.type}`);
  if (filters.openAccess !== undefined) {
    parts.push(filters.openAccess ? 'Open Access' : 'acesso fechado');
  }
  if (filters.language) parts.push(`idioma ${filters.language}`);
  if (filters.author) parts.push(`autor ${filters.author}`);
  if (filters.sort !== 'relevance') parts.push(`ordem ${filters.sort}`);
  return parts.join(' · ') || 'sem filtros adicionais';
}

export function WorkspaceView({ library, onSelect }: WorkspaceViewProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const workspacesRef = useRef<Workspace[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [evidenceWorkId, setEvidenceWorkId] = useState('');
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>('finding');
  const [evidenceExcerpt, setEvidenceExcerpt] = useState('');
  const [evidenceInterpretation, setEvidenceInterpretation] = useState('');

  useEffect(() => {
    void Promise.all([workspaceStore.list(), searchHistoryStore.list()]).then(
      ([items, history]) => {
        const normalized = items
          .map((workspace) => {
            const evidence = workspace.evidence ?? [];
            return {
              ...workspace,
              evidence,
              evidenceRelations: validateEvidenceRelations(
                evidence,
                workspace.evidenceRelations ?? [],
              ),
              queries: normalizeWorkspaceQueries(workspace.id, workspace.queries),
              workIds: workspace.workIds ?? [],
            };
          })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        workspacesRef.current = normalized;
        setWorkspaces(normalized);
        setActiveId(normalized[0]?.id);
        setSearchHistory(
          history
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 20),
        );
      },
    );
  }, []);

  const active = workspaces.find((workspace) => workspace.id === activeId);
  const evidence = active?.evidence ?? [];
  const selectedWorks = useMemo(
    () =>
      active
        ? library.filter((entry) => active.workIds.includes(entry.id))
        : [],
    [active, library],
  );

  useEffect(() => {
    if (!selectedWorks.length) {
      setEvidenceWorkId('');
      return;
    }
    if (!selectedWorks.some((entry) => entry.id === evidenceWorkId)) {
      setEvidenceWorkId(selectedWorks[0]?.id ?? '');
    }
  }, [evidenceWorkId, selectedWorks]);

  async function persist(workspace: Workspace) {
    const nextWorkspaces = [
      workspace,
      ...workspacesRef.current.filter((item) => item.id !== workspace.id),
    ];
    workspacesRef.current = nextWorkspaces;
    setWorkspaces(nextWorkspaces);
    setActiveId(workspace.id);

    try {
      await workspaceStore.save(workspace);
    } catch (error) {
      const stored = await workspaceStore.list();
      const normalized = stored
        .map((item) => {
          const evidence = item.evidence ?? [];
          return {
            ...item,
            evidence,
            evidenceRelations: validateEvidenceRelations(
              evidence,
              item.evidenceRelations ?? [],
            ),
            queries: normalizeWorkspaceQueries(item.id, item.queries),
            workIds: item.workIds ?? [],
          };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      workspacesRef.current = normalized;
      setWorkspaces(normalized);
      setActiveId(normalized[0]?.id);
      throw error;
    }
  }

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const now = new Date().toISOString();
    const workspace: Workspace = {
      id: createId(),
      title: title.trim(),
      question: question.trim(),
      workIds: [],
      queries: [],
      evidence: [],
      evidenceRelations: [],
      createdAt: now,
      updatedAt: now,
    };
    await persist(workspace);
    setTitle('');
    setQuestion('');
  }


  async function addQuery(history: SearchHistoryEntry) {
    if (!active) return;
    const queries = active.queries ?? [];
    const exists = queries.some(
      (item) =>
        item.raw === history.raw &&
        JSON.stringify(item.filters) === JSON.stringify(history.filters),
    );
    if (exists) return;

    const query: WorkspaceQuery = {
      id: history.id,
      raw: history.raw,
      filters: { ...history.filters },
      resultCount: history.resultCount,
      createdAt: history.createdAt,
    };

    await persist({
      ...active,
      queries: [query, ...queries],
      updatedAt: new Date().toISOString(),
    });
  }

  async function removeQuery(id: string) {
    if (!active) return;
    await persist({
      ...active,
      queries: (active.queries ?? []).filter((item) => item.id !== id),
      updatedAt: new Date().toISOString(),
    });
  }

  async function toggleWork(workId: string) {
    const currentActive = workspacesRef.current.find(
      (workspace) => workspace.id === activeId,
    );
    if (!currentActive) return;

    const currentEvidence = currentActive.evidence ?? [];
    const hasEvidence = currentEvidence.some((item) => item.workId === workId);
    if (currentActive.workIds.includes(workId) && hasEvidence) return;

    const workIds = currentActive.workIds.includes(workId)
      ? currentActive.workIds.filter((id) => id !== workId)
      : [...currentActive.workIds, workId];

    await persist({
      ...currentActive,
      workIds,
      updatedAt: new Date().toISOString(),
    });
  }

  async function addEvidence(event: React.FormEvent) {
    event.preventDefault();
    if (!active || !evidenceWorkId || !evidenceExcerpt.trim()) return;

    const entry = library.find((item) => item.id === evidenceWorkId);
    if (!entry) return;

    const item: WorkspaceEvidence = {
      id: createId('evidence'),
      workId: entry.id,
      sourceTitle: entry.work.title,
      sourceDoi: entry.work.doi,
      kind: evidenceKind,
      excerpt: evidenceExcerpt.trim(),
      interpretation: evidenceInterpretation.trim(),
      createdAt: new Date().toISOString(),
    };

    await persist({
      ...active,
      evidence: [...evidence, item],
      updatedAt: new Date().toISOString(),
    });
    setEvidenceExcerpt('');
    setEvidenceInterpretation('');
  }

  async function removeEvidence(id: string) {
    if (!active) return;
    await persist({
      ...active,
      evidence: evidence.filter((item) => item.id !== id),
      evidenceRelations: (active.evidenceRelations ?? []).filter(
        (relation) =>
          relation.leftEvidenceId !== id && relation.rightEvidenceId !== id,
      ),
      updatedAt: new Date().toISOString(),
    });
  }


  async function addEvidenceRelation(input: {
    leftEvidenceId: string;
    rightEvidenceId: string;
    type: EvidenceRelationType;
    note: string;
  }) {
    if (!active) return;
    if (
      input.leftEvidenceId === input.rightEvidenceId ||
      !evidence.some((item) => item.id === input.leftEvidenceId) ||
      !evidence.some((item) => item.id === input.rightEvidenceId)
    ) {
      return;
    }

    const pairKey = [input.leftEvidenceId, input.rightEvidenceId]
      .sort()
      .join('::');
    const alreadyExists = (active.evidenceRelations ?? []).some(
      (relation) =>
        [relation.leftEvidenceId, relation.rightEvidenceId]
          .sort()
          .join('::') === pairKey,
    );
    if (alreadyExists) return;

    const relation: WorkspaceEvidenceRelation = {
      id: createId('relation'),
      leftEvidenceId: input.leftEvidenceId,
      rightEvidenceId: input.rightEvidenceId,
      type: input.type,
      note: input.note.trim(),
      createdAt: new Date().toISOString(),
    };
    await persist({
      ...active,
      evidenceRelations: [...(active.evidenceRelations ?? []), relation],
      updatedAt: new Date().toISOString(),
    });
  }

  async function removeEvidenceRelation(id: string) {
    if (!active) return;
    await persist({
      ...active,
      evidenceRelations: (active.evidenceRelations ?? []).filter(
        (relation) => relation.id !== id,
      ),
      updatedAt: new Date().toISOString(),
    });
  }

  function sourceFor(item: WorkspaceEvidence): LibraryEntry | undefined {
    return library.find((entry) => entry.id === item.workId);
  }

  return (
    <main className="section-page">
      <header className="section-header">
        <div>
          <span className="eyebrow">Research workspace</span>
          <h1>Pesquisas que preservam raciocínio.</h1>
          <p>
            Cada investigação reúne pergunta, corpus e evidências rastreáveis
            para você retomar o trabalho sem perder o contexto.
          </p>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="workspace-list">
          <form className="workspace-create" onSubmit={createWorkspace}>
            <label>
              Nome da pesquisa
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="IA na administração pública"
              />
            </label>
            <label>
              Pergunta central
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={3}
                placeholder="O que quero compreender ou demonstrar?"
              />
            </label>
            <button className="primary-button" type="submit">
              <Icon name="plus" /> Nova pesquisa
            </button>
          </form>

          <div className="workspace-items">
            {workspaces.map((workspace) => (
              <button
                className={
                  workspace.id === activeId
                    ? 'workspace-item workspace-item--active'
                    : 'workspace-item'
                }
                type="button"
                key={workspace.id}
                onClick={() => setActiveId(workspace.id)}
              >
                <strong>{workspace.title}</strong>
                <span>
                  {workspace.workIds.length} trabalhos ·{' '}
                  {(workspace.evidence ?? []).length} evidências
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="workspace-canvas">
          {!active ? (
            <div className="empty-panel">
              <Icon name="workspace" />
              <h2>Crie sua primeira investigação.</h2>
              <p>
                Depois, conecte trabalhos salvos e extraia evidências com
                origem explícita.
              </p>
            </div>
          ) : (
            <>
              <div className="workspace-heading">
                <span className="eyebrow">Pesquisa ativa</span>
                <h2>{active.title}</h2>
                <p>{active.question || 'Sem pergunta central definida.'}</p>
              </div>


              <section className="workspace-section">
                <div className="workspace-section__head">
                  <div>
                    <h3>Consultas da pesquisa</h3>
                    <p>
                      Preserve a pergunta operacional e os filtros usados para
                      formar este corpus.
                    </p>
                  </div>
                  <span>{(active.queries ?? []).length} consultas</span>
                </div>

                {(active.queries ?? []).length > 0 && (
                  <div className="workspace-query-list">
                    {(active.queries ?? []).map((item) => (
                      <article className="workspace-query" key={item.id}>
                        <div>
                          <strong>{item.raw}</strong>
                          <span>{filterSummary(item.filters)}</span>
                          {item.resultCount !== undefined && (
                            <small>{item.resultCount} resultados naquele recorte</small>
                          )}
                        </div>
                        <button
                          className="text-button text-button--danger"
                          type="button"
                          onClick={() => void removeQuery(item.id)}
                        >
                          Remover
                        </button>
                      </article>
                    ))}
                  </div>
                )}

                <div className="recent-query-picker">
                  <span className="lens-label">Histórico recente</span>
                  {searchHistory.length === 0 ? (
                    <p className="muted">
                      Execute uma busca em Descobrir para registrar consultas.
                    </p>
                  ) : (
                    <div className="recent-query-list">
                      {searchHistory.slice(0, 8).map((history) => {
                        const alreadyAdded = (active.queries ?? []).some(
                          (item) =>
                            item.raw === history.raw &&
                            JSON.stringify(item.filters) ===
                              JSON.stringify(history.filters),
                        );
                        return (
                          <button
                            type="button"
                            key={history.id}
                            disabled={alreadyAdded}
                            onClick={() => void addQuery(history)}
                          >
                            <span>
                              <strong>{history.raw}</strong>
                              <small>{filterSummary(history.filters)}</small>
                            </span>
                            <em>{alreadyAdded ? 'Adicionada' : 'Adicionar'}</em>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>


              <section className="workspace-section">
                <div className="workspace-section__head">
                  <h3>Corpus selecionado</h3>
                  <span>{selectedWorks.length} trabalhos</span>
                </div>
                {selectedWorks.length === 0 ? (
                  <p className="muted">
                    Selecione itens da biblioteca abaixo para começar a formar
                    seu corpus.
                  </p>
                ) : (
                  <div className="compact-list">
                    {selectedWorks.map((entry) => (
                      <button
                        type="button"
                        key={entry.id}
                        onClick={() => onSelect(entry.work)}
                      >
                        <span>{entry.work.title}</span>
                        <small>
                          {entry.work.year ?? 's.d.'} ·{' '}
                          {entry.work.citationCount} citações
                        </small>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="workspace-section evidence-workspace">
                <div className="workspace-section__head">
                  <div>
                    <h3>Evidence board</h3>
                    <p>
                      Separe o que a fonte afirma da sua interpretação. Essa
                      rastreabilidade será a base da síntese futura.
                    </p>
                  </div>
                  <span>{evidence.length} evidências</span>
                </div>

                {selectedWorks.length > 0 && (
                  <form className="evidence-form" onSubmit={addEvidence}>
                    <label>
                      Fonte
                      <select
                        aria-label="Fonte da evidência"
                        value={evidenceWorkId}
                        onChange={(event) => setEvidenceWorkId(event.target.value)}
                      >
                        {selectedWorks.map((entry) => (
                          <option value={entry.id} key={entry.id}>
                            {entry.work.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Tipo
                      <select
                        value={evidenceKind}
                        onChange={(event) =>
                          setEvidenceKind(event.target.value as EvidenceKind)
                        }
                      >
                        {evidenceKinds.map((kind) => (
                          <option value={kind.value} key={kind.value}>
                            {kind.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="evidence-field--wide">
                      Evidência da fonte
                      <textarea
                        rows={3}
                        value={evidenceExcerpt}
                        onChange={(event) => setEvidenceExcerpt(event.target.value)}
                        placeholder="Trecho, achado, resultado ou definição extraído da fonte."
                        required
                      />
                    </label>
                    <label className="evidence-field--wide">
                      Sua interpretação
                      <textarea
                        rows={2}
                        value={evidenceInterpretation}
                        onChange={(event) =>
                          setEvidenceInterpretation(event.target.value)
                        }
                        placeholder="Por que isso importa para a pergunta da pesquisa?"
                      />
                    </label>
                    <button className="primary-button" type="submit">
                      <Icon name="plus" /> Registrar evidência
                    </button>
                  </form>
                )}

                {evidence.length === 0 ? (
                  <p className="muted evidence-empty">
                    Adicione um trabalho ao corpus e registre o primeiro achado
                    rastreável.
                  </p>
                ) : (
                  <div className="evidence-list">
                    {evidence.map((item) => {
                      const source = sourceFor(item);
                      return (
                        <article className="evidence-card" key={item.id}>
                          <div className="evidence-card__top">
                            <span className="chip chip--quiet">
                              {evidenceLabel(item.kind)}
                            </span>
                            <button
                              className="text-button text-button--danger"
                              type="button"
                              onClick={() => void removeEvidence(item.id)}
                            >
                              Remover
                            </button>
                          </div>

                          <blockquote>{item.excerpt}</blockquote>

                          {item.interpretation && (
                            <div className="evidence-interpretation">
                              <span className="lens-label">
                                Sua interpretação
                              </span>
                              <p>{item.interpretation}</p>
                            </div>
                          )}

                          <footer>
                            <div>
                              <span className="lens-label">Fonte</span>
                              <strong>{item.sourceTitle}</strong>
                              {item.sourceDoi && <small>DOI {item.sourceDoi}</small>}
                            </div>
                            {source && (
                              <button
                                className="text-button"
                                type="button"
                                onClick={() => onSelect(source.work)}
                              >
                                Abrir trabalho <Icon name="arrow" />
                              </button>
                            )}
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <ResearchIntelligence
                workspace={active}
                evidence={evidence}
                relations={active.evidenceRelations ?? []}
                library={library}
                onSelect={onSelect}
                onAddRelation={addEvidenceRelation}
                onRemoveRelation={removeEvidenceRelation}
              />

              <section className="workspace-section">
                <div className="workspace-section__head">
                  <h3>Adicionar da biblioteca</h3>
                  <span>{library.length} disponíveis</span>
                </div>
                <div className="workspace-picker">
                  {library.map((entry) => {
                    const lockedByEvidence =
                      active.workIds.includes(entry.id) &&
                      evidence.some((item) => item.workId === entry.id);

                    return (
                      <label key={entry.id}>
                        <input
                          type="checkbox"
                          checked={active.workIds.includes(entry.id)}
                          disabled={lockedByEvidence}
                          onChange={() => void toggleWork(entry.id)}
                        />
                        <span>
                          <strong>{entry.work.title}</strong>
                          <small>
                            {lockedByEvidence
                              ? 'Fonte usada em evidências — remova as evidências antes de retirar do corpus.'
                              : (entry.work.authors[0]?.name ??
                                'Autoria não informada')}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
