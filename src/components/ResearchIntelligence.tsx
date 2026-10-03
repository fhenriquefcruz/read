import { useEffect, useMemo, useState } from 'react';
import {
  EVIDENCE_KIND_LABELS,
  EVIDENCE_RELATION_LABELS,
  buildGroundedBrief,
  comparisonCandidates,
  downloadGroundedBrief,
  downloadResearchDiagnostics,
  evidenceMatrix,
  researchCoverageDiagnostics,
  type GroundedBrief,
} from '../lib/intelligence';
import {
  createGatewayRequest,
  type IntelligenceGatewayClaim,
} from '../lib/intelligence-gateway';
import {
  configuredIntelligenceGatewayUrl,
  runGenerativeIntelligence,
} from '../lib/generative-intelligence';
import type {
  AcademicWork,
  EvidenceKind,
  EvidenceRelationType,
  LibraryEntry,
  Workspace,
  WorkspaceEvidence,
  WorkspaceEvidenceRelation,
} from '../types';
import { Icon } from './Icons';

interface ResearchIntelligenceProps {
  workspace: Workspace;
  evidence: WorkspaceEvidence[];
  relations: WorkspaceEvidenceRelation[];
  library: LibraryEntry[];
  onSelect: (work: AcademicWork) => void;
  onAddRelation: (input: {
    leftEvidenceId: string;
    rightEvidenceId: string;
    type: EvidenceRelationType;
    note: string;
  }) => Promise<void>;
  onRemoveRelation: (id: string) => Promise<void>;
}

const matrixKinds: EvidenceKind[] = [
  'finding',
  'method',
  'limitation',
  'definition',
  'quote',
];

const relationTypes: EvidenceRelationType[] = [
  'converges',
  'diverges',
  'qualifies',
  'context',
];

const gapPriorityLabels = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
} as const;

export function ResearchIntelligence({
  workspace,
  evidence,
  relations,
  library,
  onSelect,
  onAddRelation,
  onRemoveRelation,
}: ResearchIntelligenceProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(evidence.map((item) => item.id)),
  );
  const [brief, setBrief] = useState<GroundedBrief | null>(null);
  const [candidateId, setCandidateId] = useState('');
  const [relationType, setRelationType] =
    useState<EvidenceRelationType>('converges');
  const [relationNote, setRelationNote] = useState('');
  const gatewayUrl = configuredIntelligenceGatewayUrl();
  const [gatewayAccessToken, setGatewayAccessToken] = useState('');
  const [externalConsent, setExternalConsent] = useState(false);
  const [gatewayState, setGatewayState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [gatewayError, setGatewayError] = useState('');
  const [generatedClaims, setGeneratedClaims] = useState<
    IntelligenceGatewayClaim[]
  >([]);

  useEffect(() => {
    setSelectedIds(new Set(evidence.map((item) => item.id)));
    setBrief(null);
    setGeneratedClaims([]);
    setGatewayState('idle');
    setGatewayError('');
    setExternalConsent(false);
  }, [evidence]);

  const selectedCount = evidence.filter((item) => selectedIds.has(item.id)).length;
  const matrix = useMemo(() => (brief ? evidenceMatrix(brief) : []), [brief]);
  const candidates = useMemo(
    () => comparisonCandidates(evidence, relations),
    [evidence, relations],
  );
  const diagnostics = useMemo(
    () => researchCoverageDiagnostics(evidence, relations),
    [evidence, relations],
  );
  const evidenceById = useMemo(
    () => new Map(evidence.map((item) => [item.id, item])),
    [evidence],
  );

  useEffect(() => {
    if (!candidates.length) {
      setCandidateId('');
      return;
    }
    if (!candidates.some((candidate) => candidate.id === candidateId)) {
      setCandidateId(candidates[0]?.id ?? '');
    }
  }, [candidateId, candidates]);

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

  async function runExternalIntelligence() {
    if (!gatewayUrl || !externalConsent || !gatewayAccessToken.trim()) return;

    const selectedEvidence = evidence.filter((item) => selectedIds.has(item.id));
    const selectedEvidenceIds = new Set(selectedEvidence.map((item) => item.id));
    const selectedRelations = relations.filter(
      (relation) =>
        selectedEvidenceIds.has(relation.leftEvidenceId) &&
        selectedEvidenceIds.has(relation.rightEvidenceId),
    );

    setGatewayState('loading');
    setGatewayError('');
    setGeneratedClaims([]);

    try {
      const request = createGatewayRequest(
        workspace.id,
        workspace.question,
        selectedEvidence,
        true,
        selectedRelations,
      );
      const response = await runGenerativeIntelligence(request, {
        baseUrl: gatewayUrl,
        accessToken: gatewayAccessToken,
      });
      setGeneratedClaims(response.claims);
      setGatewayState('success');
      setExternalConsent(false);
    } catch (error) {
      setGatewayState('error');
      setGatewayError(
        error instanceof Error ? error.message : 'Falha no gateway de inteligência.',
      );
    }
  }

  async function registerRelation(event: React.FormEvent) {
    event.preventDefault();
    const candidate = candidates.find((item) => item.id === candidateId);
    if (!candidate) return;

    await onAddRelation({
      leftEvidenceId: candidate.leftEvidenceId,
      rightEvidenceId: candidate.rightEvidenceId,
      type: relationType,
      note: relationNote,
    });
    setRelationNote('');
  }

  return (
    <section className="workspace-section intelligence-panel">
      <div className="workspace-section__head">
        <div>
          <h3>Research Intelligence</h3>
          <p>
            Síntese, comparação e diagnóstico de cobertura construídos somente
            com evidências rastreáveis. Relações científicas não são inferidas
            automaticamente.
          </p>
        </div>
        <span className="intelligence-mode">Local · grounded</span>
      </div>

      {evidence.length === 0 ? (
        <div className="intelligence-empty">
          <p className="muted">
            Registre evidências no Evidence Board para habilitar a inteligência
            de pesquisa.
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
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  downloadResearchDiagnostics(
                    workspace.question,
                    evidence,
                    relations,
                  )
                }
              >
                <Icon name="file" /> Exportar diagnóstico
              </button>
            </div>
          </div>

          <section className="intelligence-subsection comparison-board">
            <div className="intelligence-subsection__head">
              <div>
                <span className="eyebrow">Comparison board</span>
                <h4>Relações confirmadas pelo pesquisador</h4>
              </div>
              <small>
                O READ+ só sugere pares comparáveis. Você classifica a relação.
              </small>
            </div>

            {candidates.length > 0 && (
              <form className="comparison-form" onSubmit={registerRelation}>
                <label>
                  Par comparável
                  <select
                    value={candidateId}
                    onChange={(event) => setCandidateId(event.target.value)}
                  >
                    {candidates.map((candidate) => {
                      const left = evidenceById.get(candidate.leftEvidenceId);
                      const right = evidenceById.get(candidate.rightEvidenceId);
                      return (
                        <option value={candidate.id} key={candidate.id}>
                          {left?.sourceTitle ?? 'Fonte'} ↔ {right?.sourceTitle ?? 'Fonte'} ·{' '}
                          {EVIDENCE_KIND_LABELS[candidate.kind]}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <label>
                  Relação
                  <select
                    value={relationType}
                    onChange={(event) =>
                      setRelationType(event.target.value as EvidenceRelationType)
                    }
                  >
                    {relationTypes.map((type) => (
                      <option value={type} key={type}>
                        {EVIDENCE_RELATION_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="comparison-form__note">
                  Nota analítica
                  <textarea
                    rows={2}
                    value={relationNote}
                    onChange={(event) => setRelationNote(event.target.value)}
                    placeholder="Explique por que você considera essas evidências convergentes, divergentes ou qualificadoras."
                  />
                </label>

                <button className="primary-button" type="submit">
                  Registrar relação
                </button>
              </form>
            )}

            {relations.length === 0 ? (
              <p className="muted">
                Nenhuma relação foi confirmada ainda. Relações só aparecem aqui
                após classificação explícita do pesquisador.
              </p>
            ) : (
              <div className="confirmed-relations">
                {relations.map((relation) => {
                  const left = evidenceById.get(relation.leftEvidenceId);
                  const right = evidenceById.get(relation.rightEvidenceId);
                  if (!left || !right) return null;
                  return (
                    <article className="confirmed-relation" key={relation.id}>
                      <div className="confirmed-relation__head">
                        <span className="chip">
                          {EVIDENCE_RELATION_LABELS[relation.type]}
                        </span>
                        <button
                          className="text-button text-button--danger"
                          type="button"
                          onClick={() => void onRemoveRelation(relation.id)}
                        >
                          Remover
                        </button>
                      </div>
                      <div className="relation-evidence-pair">
                        <blockquote>
                          {left.excerpt}
                          <small>{left.sourceTitle}</small>
                        </blockquote>
                        <span aria-hidden="true">↔</span>
                        <blockquote>
                          {right.excerpt}
                          <small>{right.sourceTitle}</small>
                        </blockquote>
                      </div>
                      {relation.note && <p>{relation.note}</p>}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="intelligence-subsection coverage-diagnostics">
            <div className="intelligence-subsection__head">
              <div>
                <span className="eyebrow">Coverage diagnostics</span>
                <h4>Lacunas estruturais da investigação</h4>
              </div>
              <small>
                Diagnóstico por cobertura; não é nota de qualidade científica.
              </small>
            </div>

            <div className="coverage-metrics">
              <div>
                <strong>{diagnostics.sourceCount}</strong>
                <span>fontes</span>
              </div>
              <div>
                <strong>{diagnostics.kindCount}/5</strong>
                <span>tipos de evidência</span>
              </div>
              <div>
                <strong>{diagnostics.relationCount}</strong>
                <span>relações confirmadas</span>
              </div>
              <div>
                <strong>
                  {Math.round(diagnostics.interpretationCoverage * 100)}%
                </strong>
                <span>com interpretação</span>
              </div>
            </div>

            {diagnostics.gaps.length === 0 ? (
              <div className="coverage-clear">
                <Icon name="check" />
                <p>
                  Nenhuma lacuna estrutural foi detectada pelas regras locais.
                  Isso não equivale a uma avaliação de qualidade metodológica.
                </p>
              </div>
            ) : (
              <div className="coverage-gap-list">
                {diagnostics.gaps.map((gap) => (
                  <article className="coverage-gap" key={gap.code}>
                    <span className={`gap-priority gap-priority--${gap.priority}`}>
                      {gapPriorityLabels[gap.priority]}
                    </span>
                    <div>
                      <strong>{gap.title}</strong>
                      <p>{gap.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

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
                  <small>
                    Fonte, síntese estrutural e interpretação permanecem separadas.
                  </small>
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
                    mas não cria conclusões científicas novas.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!gatewayUrl ? (
        <div className="generative-gateway-note">
          <div>
            <span className="lens-label">IA generativa</span>
            <strong>Gateway seguro ainda obrigatório</strong>
            <p>
              O código server-side está preparado, mas a publicação está
              desativada até existir um endpoint Vercel configurado e protegido.
            </p>
          </div>
          <span className="chip chip--quiet">Não conectado</span>
        </div>
      ) : (
        <section className="generative-panel" aria-labelledby="generative-title">
          <div className="intelligence-subsection__head">
            <div>
              <span className="eyebrow">IA grounded opt-in</span>
              <h4 id="generative-title">Síntese generativa protegida</h4>
            </div>
            <small>
              A chave fica apenas na memória desta página e não é persistida.
            </small>
          </div>

          <label className="gateway-access-field">
            <span>Chave de acesso do gateway</span>
            <input
              type="password"
              value={gatewayAccessToken}
              autoComplete="off"
              onChange={(event) => setGatewayAccessToken(event.target.value)}
              placeholder="Chave da sessão"
            />
          </label>

          <label className="gateway-consent">
            <input
              type="checkbox"
              checked={externalConsent}
              onChange={(event) => setExternalConsent(event.target.checked)}
            />
            <span>
              Autorizo, somente nesta execução, o envio das evidências
              selecionadas e relações confirmadas ao gateway externo para
              síntese grounded.
            </span>
          </label>

          <button
            className="primary-button"
            type="button"
            disabled={
              gatewayState === 'loading' ||
              selectedCount === 0 ||
              !externalConsent ||
              !gatewayAccessToken.trim()
            }
            onClick={() => void runExternalIntelligence()}
          >
            <Icon name="network" />
            {gatewayState === 'loading'
              ? 'Gerando…'
              : 'Gerar síntese grounded'}
          </button>

          {gatewayState === 'error' && (
            <p className="gateway-error" role="status">
              {gatewayError}
            </p>
          )}

          {generatedClaims.length > 0 && (
            <div className="gateway-claims" aria-live="polite">
              {generatedClaims.map((claim) => (
                <article className="gateway-claim" key={claim.id}>
                  <div className="gateway-claim__head">
                    <span className="chip chip--quiet">
                      {claim.layer === 'synthesis' ? 'Síntese' : 'Inferência'}
                    </span>
                    <small>
                      {claim.evidenceIds.length} evidência(s) citada(s)
                    </small>
                  </div>
                  <p>{claim.text}</p>
                  <div className="gateway-claim__sources">
                    {claim.evidenceIds.map((id) => {
                      const source = evidenceById.get(id);
                      if (!source) return null;
                      return (
                        <button
                          className="text-button"
                          type="button"
                          key={id}
                          onClick={() => openCitation(source.workId)}
                        >
                          {source.sourceTitle}
                        </button>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
