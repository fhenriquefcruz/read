import { useEffect, useMemo, useState } from 'react';
import { noteStore } from '../lib/storage';
import type { KnowledgeNote, LibraryEntry } from '../types';
import { Icon } from '../components/Icons';

interface KnowledgeViewProps {
  library: LibraryEntry[];
}

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `note-${Date.now()}`;
}

function linksFrom(content: string): string[] {
  return [...content.matchAll(/\[\[([^\]]+)\]\]/g)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

export function KnowledgeView({ library }: KnowledgeViewProps) {
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [workId, setWorkId] = useState('');

  useEffect(() => {
    void noteStore.list().then((items) => {
      const ordered = items.sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
      setNotes(ordered);
      setActiveId(ordered[0]?.id);
    });
  }, []);

  const active = notes.find((note) => note.id === activeId);

  const backlinks = useMemo(() => {
    if (!active) return [];
    return notes.filter((note) =>
      linksFrom(note.content).some(
        (link) => link.toLowerCase() === active.title.toLowerCase(),
      ),
    );
  }, [active, notes]);

  const graph = useMemo(() => {
    const titleMap = new Map(
      notes.map((note) => [note.title.toLowerCase(), note]),
    );
    const nodes = notes.map((note, index) => {
      const angle = notes.length ? (index / notes.length) * Math.PI * 2 : 0;
      return {
        ...note,
        x: 160 + Math.cos(angle) * 112,
        y: 150 + Math.sin(angle) * 112,
      };
    });
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const edges: Array<{ from: string; to: string }> = [];

    for (const note of notes) {
      for (const link of linksFrom(note.content)) {
        const target = titleMap.get(link.toLowerCase());
        if (target && target.id !== note.id && nodeMap.has(note.id)) {
          edges.push({ from: note.id, to: target.id });
        }
      }
    }

    return { nodes, edges, nodeMap };
  }, [notes]);

  async function createNote(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) return;
    const now = new Date().toISOString();
    const note: KnowledgeNote = {
      id: createId(),
      title: title.trim(),
      content: content.trim(),
      workIds: workId ? [workId] : [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    await noteStore.save(note);
    setNotes((current) => [note, ...current]);
    setActiveId(note.id);
    setTitle('');
    setContent('');
    setWorkId('');
  }

  return (
    <main className="section-page">
      <header className="section-header">
        <div>
          <span className="eyebrow">Knowledge system</span>
          <h1>Ideias que se conectam.</h1>
          <p>
            Notas atômicas com links internos e backlinks derivados do conteúdo
            — o grafo nasce das relações reais.
          </p>
        </div>
        <div className="section-count">{notes.length} notas</div>
      </header>

      <div className="knowledge-layout">
        <section className="knowledge-editor">
          <form onSubmit={createNote}>
            <label>
              Título da nota
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Governança algorítmica exige accountability"
              />
            </label>
            <label>
              Conteúdo
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={8}
                placeholder="Registre uma ideia por nota. Use [[Título de outra nota]] para criar uma conexão."
              />
            </label>
            <label>
              Trabalho de origem
              <select
                value={workId}
                onChange={(event) => setWorkId(event.target.value)}
              >
                <option value="">Sem vínculo direto</option>
                {library.map((entry) => (
                  <option value={entry.id} key={entry.id}>
                    {entry.work.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button" type="submit">
              <Icon name="plus" /> Criar nota atômica
            </button>
          </form>

          <div className="note-list">
            {notes.map((note) => (
              <button
                type="button"
                key={note.id}
                className={
                  activeId === note.id
                    ? 'note-item note-item--active'
                    : 'note-item'
                }
                onClick={() => setActiveId(note.id)}
              >
                <strong>{note.title}</strong>
                <span>
                  {linksFrom(note.content).length} links · {note.workIds.length}{' '}
                  fontes
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="knowledge-main">
          <div className="graph-card">
            <div className="workspace-section__head">
              <h2>Knowledge graph</h2>
              <span>{graph.edges.length} conexões</span>
            </div>
            {notes.length === 0 ? (
              <div className="empty-panel empty-panel--compact">
                <Icon name="network" />
                <p>
                  Crie notas e conecte-as com <code>[[links internos]]</code>.
                </p>
              </div>
            ) : (
              <svg
                className="knowledge-graph"
                viewBox="0 0 320 300"
                role="img"
                aria-label="Grafo das conexões entre notas"
              >
                {graph.edges.map((edge) => {
                  const from = graph.nodeMap.get(edge.from);
                  const to = graph.nodeMap.get(edge.to);
                  if (!from || !to) return null;
                  return (
                    <line
                      key={`${edge.from}-${edge.to}`}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                    />
                  );
                })}
                {graph.nodes.map((node) => (
                  <g
                    key={node.id}
                    onClick={() => setActiveId(node.id)}
                    className={
                      node.id === activeId
                        ? 'graph-node graph-node--active'
                        : 'graph-node'
                    }
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.id === activeId ? 9 : 7}
                    />
                    <text x={node.x} y={node.y + 18} textAnchor="middle">
                      {node.title.slice(0, 24)}
                    </text>
                  </g>
                ))}
              </svg>
            )}
          </div>

          <div className="note-detail">
            {!active ? (
              <div className="empty-panel empty-panel--compact">
                <h2>Selecione uma nota.</h2>
                <p>
                  Aqui aparecem seu conteúdo, links de saída, backlinks e fontes
                  relacionadas.
                </p>
              </div>
            ) : (
              <>
                <span className="eyebrow">Nota ativa</span>
                <h2>{active.title}</h2>
                <p className="note-content">{active.content}</p>

                <div className="note-relations">
                  <div>
                    <span className="lens-label">Links de saída</span>
                    <div className="chip-row">
                      {linksFrom(active.content).length ? (
                        linksFrom(active.content).map((link) => (
                          <span className="chip" key={link}>
                            {link}
                          </span>
                        ))
                      ) : (
                        <span className="muted">Nenhum link interno.</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="lens-label">Backlinks</span>
                    <div className="chip-row">
                      {backlinks.length ? (
                        backlinks.map((note) => (
                          <button
                            className="chip chip--button"
                            type="button"
                            key={note.id}
                            onClick={() => setActiveId(note.id)}
                          >
                            {note.title}
                          </button>
                        ))
                      ) : (
                        <span className="muted">
                          Ainda não há notas apontando para esta.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
