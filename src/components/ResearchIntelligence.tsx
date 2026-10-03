import { useEffect, useMemo, useState } from 'react';
import {
  EVIDENCE_KIND_LABELS,
  buildGroundedBrief,
  downloadGroundedBrief,
  evidenceMatrix,
  type GroundedBrief,
} from '../lib/intelligence';
import type {
  AcademicWork,
  EvidenceKind,
  LibraryEntry,
  Workspace,
  WorkspaceEvidence,
} from '../types';
import { Icon } from './Icons';

interface ResearchIntelligenceProps {
  workspace: Workspace;
  evidence: WorkspaceEvidence[];
  library: LibraryEntry[];
  onSelect: (work: AcademicWork) => void;
}

const matrixKinds: EvidenceKind[] = [
  'finding',
  'method',
  'limitation',
  'definition',
  'quote',
];

export function ResearchIntelligence({
  workspace,
  evidence,
  library,
  onSelect,
}: ResearchIntelligenceProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(evidence.map((item) => item.id)),
  );
  const [brief, setBrief] = useState<GroundedBrief | null>(null);

  useEffect(() => {
    setSelectedIds(new Set(evidence.map((item) => item.id)));
    setBrief(null);
  }, [evidence]);

  const selectedCount = evidence.filter((item) => selectedIds.has(item.id)).length;
  const matrix = useMemo(() => (brief ? evidenceMatrix(brief) : []), [brief]);

  function toggleEvidence(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBrief(null);
  }

  function buildBrief() {
    setBrief(buildGroundedBrief(workspace.question, evidence, selectedIds));
  }

  function openCitation(workId: string) {
    const source = library.find((entry) => entry.id === workId);
    if (source) onSelect(source.work);
  }

  return (
    <section className="workspace-section intelligence-panel">
      <div className="workspace-section__head">
        <div>
          <h3>Research Intelligence</h3>
          <p>
            Síntese local e rastreável construída somente com evidências que
            você selecionou. Nenhum documento é enviado a serviço externo.
          </p>
        </div>
        <span className="intelligence-mode">Local · grounded</span>
      </div>

      {evidence.length === 0 ? (
        <div className="intelligence-empty">
          <p className="muted">
            Registre evidências no Evidence Board para habilitar a síntese
            rastreável.
          </p>
        </div>
      ) : (
        <>
          <div className="intelligence-selector">
            <div className="intelligence-selector__head">
              <span className="lens-label">Evidências incluídas</span>
              <strong>
                {selectedCount}/{evidence.length}
              </strong>
            </div>
            <div className="intelligence-evidence-list">
              {evidence.map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleEvidence(item.id)}
                  />
                  <span>
                    <strong>{item.excerpt}</strong>
                    <small>
                      {EVIDENCE_KIND_LABELS[item.kind]} · {item.sourceTitle}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <div className="intelligence-actions">
              <button
                className="primary-button"
                type="button"
                disabled={selectedCount === 0}
                onClick={buildBrief}
              >
                <Icon name="network" /> Construir síntese rastreável
              </button>
              {brief && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    downloadGroundedBrief(
                      brief,
                      `READ+ · ${workspace.title} · Grounded Brief`,
                    )
                  }
                >
                  <Icon name="file" /> Exportar Markdown
                </button>
              )}
            </div>
          </div>

          {brief && (
            <div className="grounded-brief" aria-live="polite">
              <div className="intelligence-metrics">
                <div>
                  <strong>{brief.evidenceCount}</strong>
                  <span>evidências</span>
                </div>
                <div>
                  <strong>{brief.sourceCount}</strong>
                  <span>fontes</span>
                </div>
                <div>
                  <strong>{brief.kindsCovered.length}</strong>
                  <span>tipos cobertos</span>
                </div>
                <div>
                  <strong>{brief.inferenceCount}</strong>
                  <span>inferências automáticas</span>
                </div>
              </div>

              <section className="intelligence-subsection">
                <div className="intelligence-subsection__head">
                  <div>
                    <span className="eyebrow">Evidence matrix</span>
                    <h4>Cobertura por fonte</h4>
                  </div>
                  <small>
                    {brief.hasCrossSourceCoverage
                      ? 'Há evidências provenientes de múltiplas fontes.'
                      : 'Cobertura concentrada em uma única fonte.'}
                  </small>
                </div>

                <div className="evidence-matrix-wrap">
                  <table className="evidence-matrix">
                    <thead>
                      <tr>
                        <th scope="col">Fonte</th>
                        {matrixKinds.map((kind) => (
                          <th scope="col" key={kind}>
                            {EVIDENCE_KIND_LABELS[kind]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.map(({ citation, counts }) => (
                        <tr key={citation.workId}>
                          <th scope="row">
                            <button
                              type="button"
                              onClick={() => openCitation(citation.workId)}
                            >
                              [{citation.index}] {citation.sourceTitle}
                            </button>
                          </th>
                          {matrixKinds.map((kind) => (
                            <td key={kind}>{counts[kind]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="intelligence-subsection">
                <div className="intelligence-subsection__head">
                  <div>
                    <span className="eyebrow">Grounded brief</span>
                    <h4>Evidência organizada por função</h4>
                  </div>
                  <small>Fonte, síntese estrutural e interpretação permanecem separadas.</small>
                </div>

                <div className="grounded-sections">
                  {brief.sections.map((section) => (
                    <article className="grounded-section" key={section.kind}>
                      <header>
                        <h5>{section.label}</h5>
                        <p>{section.summary}</p>
                      </header>

                      {section.items.map((item) => (
                        <div className="grounded-item" key={item.evidenceId}>
                          <div className="grounded-layer">
                            <span className="layer-badge layer-badge--source">
                              Fonte
                            </span>
                            <blockquote>{item.excerpt}</blockquote>
                            <button
                              className="citation-button"
                              type="button"
                              onClick={() => {
                                const citation = brief.citations.find(
                                  (entry) => entry.index === item.sourceIndex,
                                );
                                if (citation) openCitation(citation.workId);
                              }}
                            >
                              [{item.sourceIndex}]
                            </button>
                          </div>

                          {item.interpretation && (
                            <div className="grounded-layer">
                              <span className="layer-badge layer-badge--interpretation">
                                Interpretação
                              </span>
                              <p>{item.interpretation}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </article>
                  ))}
                </div>
              </section>

              <div className="inference-guard">
                <Icon name="check" />
                <div>
                  <strong>Inferências automáticas: 0</strong>
                  <p>
                    Esta versão organiza e sintetiza a estrutura das evidências,
                    mas não cria conclusões científicas novas. Isso evita
                    transformar ausência de evidência em afirmação.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="generative-gateway-note">
        <div>
          <span className="lens-label">IA generativa</span>
          <strong>Gateway seguro necessário</strong>
          <p>
            A próxima camada só será ativada com processamento server-side,
            consentimento explícito e validação obrigatória de citations por ID
            de evidência.
          </p>
        </div>
        <span className="chip chip--quiet">Desativada nesta versão</span>
      </div>
    </section>
  );
}
