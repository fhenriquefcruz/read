import { useEffect, useMemo, useState } from 'react';
import { workspaceStore } from '../lib/storage';
import type {
  AcademicWork,
  EvidenceKind,
  LibraryEntry,
  Workspace,
  WorkspaceEvidence,
} from '../types';
import { Icon } from '../components/Icons';

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

export function WorkspaceView({ library, onSelect }: WorkspaceViewProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [evidenceWorkId, setEvidenceWorkId] = useState('');
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>('finding');
  const [evidenceExcerpt, setEvidenceExcerpt] = useState('');
  const [evidenceInterpretation, setEvidenceInterpretation] = useState('');

  useEffect(() => {
    void workspaceStore.list().then((items) => {
      const normalized = items
        .map((workspace) => ({
          ...workspace,
          evidence: workspace.evidence ?? [],
          queries: workspace.queries ?? [],
          workIds: workspace.workIds ?? [],
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setWorkspaces(normalized);
      setActiveId(normalized[0]?.id);
    });
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
    await workspaceStore.save(workspace);
    setWorkspaces((current) => {
      const next = current.filter((item) => item.id !== workspace.id);
      return [workspace, ...next];
    });
    setActiveId(workspace.id);
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
      createdAt: now,
      updatedAt: now,
    };
    await persist(workspace);
    setTitle('');
    setQuestion('');
  }

  async function toggleWork(workId: string) {
    if (!active) return;
    const hasEvidence = evidence.some((item) => item.workId === workId);
    if (active.workIds.includes(workId) && hasEvidence) return;

    const workIds = active.workIds.includes(workId)
      ? active.workIds.filter((id) => id !== workId)
      : [...active.workIds, workId];
    await persist({ ...active, workIds, updatedAt: new Date().toISOString() });
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
