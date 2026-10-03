import { useEffect, useMemo, useState } from 'react';
import { workspaceStore } from '../lib/storage';
import type { AcademicWork, LibraryEntry, Workspace } from '../types';
import { Icon } from '../components/Icons';

interface WorkspaceViewProps {
  library: LibraryEntry[];
  onSelect: (work: AcademicWork) => void;
}

function createId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `workspace-${Date.now()}`;
}

export function WorkspaceView({ library, onSelect }: WorkspaceViewProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');

  useEffect(() => {
    void workspaceStore.list().then((items) => {
      const ordered = items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setWorkspaces(ordered);
      setActiveId(ordered[0]?.id);
    });
  }, []);

  const active = workspaces.find((workspace) => workspace.id === activeId);
  const selectedWorks = useMemo(
    () => (active ? library.filter((entry) => active.workIds.includes(entry.id)) : []),
    [active, library],
  );

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
      createdAt: now,
      updatedAt: now,
    };
    await persist(workspace);
    setTitle('');
    setQuestion('');
  }

  async function toggleWork(workId: string) {
    if (!active) return;
    const workIds = active.workIds.includes(workId)
      ? active.workIds.filter((id) => id !== workId)
      : [...active.workIds, workId];
    await persist({ ...active, workIds, updatedAt: new Date().toISOString() });
  }

  return (
    <main className="section-page">
      <header className="section-header">
        <div>
          <span className="eyebrow">Research workspace</span>
          <h1>Pesquisas que preservam raciocínio.</h1>
          <p>Cada investigação reúne pergunta, corpus selecionado e contexto para você continuar depois.</p>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="workspace-list">
          <form className="workspace-create" onSubmit={createWorkspace}>
            <label>
              Nome da pesquisa
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="IA na administração pública" />
            </label>
            <label>
              Pergunta central
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} placeholder="O que quero compreender ou demonstrar?" />
            </label>
            <button className="primary-button" type="submit"><Icon name="plus" /> Nova pesquisa</button>
          </form>

          <div className="workspace-items">
            {workspaces.map((workspace) => (
              <button
                className={workspace.id === activeId ? 'workspace-item workspace-item--active' : 'workspace-item'}
                type="button"
                key={workspace.id}
                onClick={() => setActiveId(workspace.id)}
              >
                <strong>{workspace.title}</strong>
                <span>{workspace.workIds.length} trabalhos</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="workspace-canvas">
          {!active ? (
            <div className="empty-panel">
              <Icon name="workspace" />
              <h2>Crie sua primeira investigação.</h2>
              <p>Depois, conecte trabalhos salvos da biblioteca ao contexto da pesquisa.</p>
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
                  <p className="muted">Selecione itens da biblioteca abaixo para começar a formar seu corpus.</p>
                ) : (
                  <div className="compact-list">
                    {selectedWorks.map((entry) => (
                      <button type="button" key={entry.id} onClick={() => onSelect(entry.work)}>
                        <span>{entry.work.title}</span>
                        <small>{entry.work.year ?? 's.d.'} · {entry.work.citationCount} citações</small>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="workspace-section">
                <div className="workspace-section__head">
                  <h3>Adicionar da biblioteca</h3>
                  <span>{library.length} disponíveis</span>
                </div>
                <div className="workspace-picker">
                  {library.map((entry) => (
                    <label key={entry.id}>
                      <input
                        type="checkbox"
                        checked={active.workIds.includes(entry.id)}
                        onChange={() => void toggleWork(entry.id)}
                      />
                      <span>
                        <strong>{entry.work.title}</strong>
                        <small>{entry.work.authors[0]?.name ?? 'Autoria não informada'}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
