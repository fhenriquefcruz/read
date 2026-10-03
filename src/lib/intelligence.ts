import type {
  EvidenceKind,
  EvidenceRelationType,
  WorkspaceEvidence,
  WorkspaceEvidenceRelation,
} from '../types';

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  finding: 'Achados',
  method: 'Métodos',
  limitation: 'Limitações',
  definition: 'Definições',
  quote: 'Trechos',
};

const EVIDENCE_KIND_ORDER: EvidenceKind[] = [
  'finding',
  'method',
  'limitation',
  'definition',
  'quote',
];

export interface GroundedCitation {
  index: number;
  workId: string;
  sourceTitle: string;
  sourceDoi?: string;
  evidenceIds: string[];
}

export interface GroundedBriefItem {
  evidenceId: string;
  excerpt: string;
  interpretation?: string;
  sourceIndex: number;
}

export interface GroundedBriefSection {
  kind: EvidenceKind;
  label: string;
  summary: string;
  evidenceIds: string[];
  items: GroundedBriefItem[];
}

export interface GroundedBrief {
  question: string;
  evidenceCount: number;
  sourceCount: number;
  kindsCovered: EvidenceKind[];
  interpretationCount: number;
  hasCrossSourceCoverage: boolean;
  inferenceCount: 0;
  citations: GroundedCitation[];
  sections: GroundedBriefSection[];
}

function selectedEvidence(
  evidence: WorkspaceEvidence[],
  selectedEvidenceIds?: Iterable<string>,
): WorkspaceEvidence[] {
  if (!selectedEvidenceIds) return evidence;
  const selected = new Set(selectedEvidenceIds);
  return evidence.filter((item) => selected.has(item.id));
}

function citationKey(item: WorkspaceEvidence): string {
  return item.workId || item.sourceDoi || item.sourceTitle;
}

export function buildGroundedBrief(
  question: string,
  evidence: WorkspaceEvidence[],
  selectedEvidenceIds?: Iterable<string>,
): GroundedBrief {
  const included = selectedEvidence(evidence, selectedEvidenceIds);
  const citations: GroundedCitation[] = [];
  const citationBySource = new Map<string, GroundedCitation>();

  for (const item of included) {
    const key = citationKey(item);
    const current = citationBySource.get(key);
    if (current) {
      current.evidenceIds.push(item.id);
      continue;
    }

    const citation: GroundedCitation = {
      index: citations.length + 1,
      workId: item.workId,
      sourceTitle: item.sourceTitle,
      sourceDoi: item.sourceDoi,
      evidenceIds: [item.id],
    };
    citations.push(citation);
    citationBySource.set(key, citation);
  }

  const sections = EVIDENCE_KIND_ORDER.flatMap((kind) => {
    const rows = included.filter((item) => item.kind === kind);
    if (!rows.length) return [];

    const sourceCount = new Set(rows.map(citationKey)).size;
    const label = EVIDENCE_KIND_LABELS[kind];
    const evidenceWord = rows.length === 1 ? 'evidência' : 'evidências';
    const sourceWord = sourceCount === 1 ? 'fonte' : 'fontes';

    const section: GroundedBriefSection = {
      kind,
      label,
      summary: `${rows.length} ${evidenceWord} de ${label.toLowerCase()} em ${sourceCount} ${sourceWord}.`,
      evidenceIds: rows.map((item) => item.id),
      items: rows.map((item) => ({
        evidenceId: item.id,
        excerpt: item.excerpt,
        interpretation: item.interpretation || undefined,
        sourceIndex: citationBySource.get(citationKey(item))?.index ?? 0,
      })),
    };

    return [section];
  });

  return {
    question: question.trim(),
    evidenceCount: included.length,
    sourceCount: citations.length,
    kindsCovered: sections.map((section) => section.kind),
    interpretationCount: included.filter((item) => item.interpretation.trim()).length,
    hasCrossSourceCoverage: citations.length >= 2,
    inferenceCount: 0,
    citations,
    sections,
  };
}

export function evidenceMatrix(
  brief: GroundedBrief,
): Array<{
  citation: GroundedCitation;
  counts: Record<EvidenceKind, number>;
}> {
  return brief.citations.map((citation) => {
    const counts: Record<EvidenceKind, number> = {
      finding: 0,
      method: 0,
      limitation: 0,
      definition: 0,
      quote: 0,
    };

    for (const section of brief.sections) {
      counts[section.kind] = section.items.filter((item) =>
        citation.evidenceIds.includes(item.evidenceId),
      ).length;
    }

    return { citation, counts };
  });
}

export function groundedBriefToMarkdown(
  brief: GroundedBrief,
  title = 'READ+ · Grounded Brief',
): string {
  const lines = [
    `# ${title}`,
    '',
    `**Pergunta:** ${brief.question || 'Não informada'}`,
    '',
    `**Cobertura:** ${brief.evidenceCount} evidências · ${brief.sourceCount} fontes · ${brief.kindsCovered.length} tipos de evidência`,
    '',
    '> Síntese estrutural local. Nenhuma inferência automática foi gerada.',
    '',
  ];

  for (const section of brief.sections) {
    lines.push(`## ${section.label}`, '', section.summary, '');

    for (const item of section.items) {
      lines.push(`- ${item.excerpt} [${item.sourceIndex}]`);
      if (item.interpretation) {
        lines.push(`  - **Interpretação do pesquisador:** ${item.interpretation}`);
      }
    }
    lines.push('');
  }

  if (brief.citations.length) {
    lines.push('## Fontes', '');
    for (const citation of brief.citations) {
      const doi = citation.sourceDoi ? ` · DOI ${citation.sourceDoi}` : '';
      lines.push(`[${citation.index}] ${citation.sourceTitle}${doi}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

export function downloadGroundedBrief(
  brief: GroundedBrief,
  title: string,
): void {
  const content = groundedBriefToMarkdown(brief, title);
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = 'readplus-grounded-brief.md';
  anchor.click();
  URL.revokeObjectURL(href);
}


export const EVIDENCE_RELATION_LABELS: Record<EvidenceRelationType, string> = {
  converges: 'Convergência',
  diverges: 'Divergência',
  qualifies: 'Qualificação',
  context: 'Contexto',
};

export interface ComparisonCandidate {
  id: string;
  leftEvidenceId: string;
  rightEvidenceId: string;
  kind: EvidenceKind;
  sharedTerms: string[];
}

export interface CoverageGap {
  code:
    | 'single-source'
    | 'missing-method'
    | 'missing-limitation'
    | 'findings-single-source'
    | 'low-interpretation'
    | 'uncompared-evidence';
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

export interface ResearchCoverageDiagnostics {
  evidenceCount: number;
  sourceCount: number;
  kindCount: number;
  relationCount: number;
  relationCounts: Record<EvidenceRelationType, number>;
  interpretationCoverage: number;
  gaps: CoverageGap[];
}

const COMPARISON_STOPWORDS = new Set([
  'about','after','again','against','also','among','because','been','before',
  'being','between','could','from','have','into','more','most','other','over',
  'same','such','than','that','their','there','these','they','this','those',
  'through','under','very','were','what','when','where','which','while','with',
  'would','ainda','assim','como','com','contra','da','das','de','delas','dele',
  'deles','do','dos','em','entre','essa','esse','esta','este','isso','mais',
  'menos','muito','na','nas','no','nos','para','pela','pelas','pelo','pelos',
  'por','qual','que','sem','sobre','sua','suas','seu','seus','uma','umas',
]);

function comparisonTerms(value: string): Set<string> {
  return new Set(
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .match(/[a-z0-9]{4,}/g)
      ?.filter((token) => !COMPARISON_STOPWORDS.has(token)) ?? [],
  );
}

function relationPairKey(leftEvidenceId: string, rightEvidenceId: string): string {
  return [leftEvidenceId, rightEvidenceId].sort().join('::');
}

export function comparisonCandidates(
  evidence: WorkspaceEvidence[],
  relations: WorkspaceEvidenceRelation[] = [],
  limit = 12,
): ComparisonCandidate[] {
  const relatedPairs = new Set(
    relations.map((relation) =>
      relationPairKey(relation.leftEvidenceId, relation.rightEvidenceId),
    ),
  );
  const candidates: Array<ComparisonCandidate & { overlap: number }> = [];

  for (let leftIndex = 0; leftIndex < evidence.length; leftIndex += 1) {
    const left = evidence[leftIndex];
    if (!left) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < evidence.length; rightIndex += 1) {
      const right = evidence[rightIndex];
      if (!right) continue;
      if (left.workId === right.workId || left.kind !== right.kind) continue;

      const pairKey = relationPairKey(left.id, right.id);
      if (relatedPairs.has(pairKey)) continue;

      const leftTerms = comparisonTerms(
        `${left.excerpt} ${left.interpretation}`,
      );
      const rightTerms = comparisonTerms(
        `${right.excerpt} ${right.interpretation}`,
      );
      const sharedTerms = [...leftTerms]
        .filter((term) => rightTerms.has(term))
        .sort();

      candidates.push({
        id: pairKey,
        leftEvidenceId: left.id,
        rightEvidenceId: right.id,
        kind: left.kind,
        sharedTerms,
        overlap: sharedTerms.length,
      });
    }
  }

  return candidates
    .sort((a, b) => b.overlap - a.overlap || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ overlap: _overlap, ...candidate }) => candidate);
}

export function researchCoverageDiagnostics(
  evidence: WorkspaceEvidence[],
  relations: WorkspaceEvidenceRelation[] = [],
): ResearchCoverageDiagnostics {
  const sourceCount = new Set(evidence.map((item) => citationKey(item))).size;
  const kinds = new Set(evidence.map((item) => item.kind));
  const findingSources = new Set(
    evidence.filter((item) => item.kind === 'finding').map(citationKey),
  ).size;
  const interpretationCount = evidence.filter((item) =>
    item.interpretation.trim(),
  ).length;
  const interpretationCoverage =
    evidence.length === 0 ? 0 : interpretationCount / evidence.length;

  const relationCounts: Record<EvidenceRelationType, number> = {
    converges: 0,
    diverges: 0,
    qualifies: 0,
    context: 0,
  };
  for (const relation of relations) relationCounts[relation.type] += 1;

  const gaps: CoverageGap[] = [];

  if (evidence.length > 0 && sourceCount < 2) {
    gaps.push({
      code: 'single-source',
      priority: 'high',
      title: 'Cobertura concentrada em uma única fonte',
      detail:
        'Inclua evidências de outra fonte antes de tratar o corpus como comparação de literatura.',
    });
  }
  if (!evidence.some((item) => item.kind === 'method')) {
    gaps.push({
      code: 'missing-method',
      priority: 'medium',
      title: 'Métodos ainda não documentados',
      detail:
        'Registre como os estudos produziram seus resultados para comparar evidências com contexto metodológico.',
    });
  }
  if (!evidence.some((item) => item.kind === 'limitation')) {
    gaps.push({
      code: 'missing-limitation',
      priority: 'medium',
      title: 'Limitações ainda não documentadas',
      detail:
        'Adicione limitações das fontes para evitar uma síntese que mostre apenas resultados positivos ou conclusivos.',
    });
  }
  if (
    evidence.some((item) => item.kind === 'finding') &&
    findingSources < 2
  ) {
    gaps.push({
      code: 'findings-single-source',
      priority: 'medium',
      title: 'Achados não têm cobertura entre fontes',
      detail:
        'Os achados registrados ainda vêm de uma única fonte; adicione resultados de outro trabalho para comparação.',
    });
  }
  if (evidence.length >= 2 && interpretationCoverage < 0.5) {
    gaps.push({
      code: 'low-interpretation',
      priority: 'low',
      title: 'Poucas evidências têm interpretação registrada',
      detail:
        'Explique por que as evidências importam para a pergunta central sem misturar essa leitura com o conteúdo da fonte.',
    });
  }
  if (sourceCount >= 2 && relations.length === 0) {
    gaps.push({
      code: 'uncompared-evidence',
      priority: 'medium',
      title: 'Evidências de fontes diferentes ainda não foram comparadas',
      detail:
        'Classifique relações comparáveis como convergência, divergência, qualificação ou contexto.',
    });
  }

  return {
    evidenceCount: evidence.length,
    sourceCount,
    kindCount: kinds.size,
    relationCount: relations.length,
    relationCounts,
    interpretationCoverage,
    gaps,
  };
}

export function researchDiagnosticsToMarkdown(
  question: string,
  evidence: WorkspaceEvidence[],
  relations: WorkspaceEvidenceRelation[],
): string {
  const diagnostics = researchCoverageDiagnostics(evidence, relations);
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const lines = [
    '# READ+ · Research Diagnostics',
    '',
    `**Pergunta:** ${question.trim() || 'Não informada'}`,
    '',
    `**Cobertura:** ${diagnostics.evidenceCount} evidências · ${diagnostics.sourceCount} fontes · ${diagnostics.kindCount} tipos · ${diagnostics.relationCount} relações confirmadas`,
    '',
    '> Relações de convergência/divergência são classificadas pelo pesquisador. O sistema não as infere automaticamente.',
    '',
    '## Relações confirmadas',
    '',
  ];

  if (!relations.length) {
    lines.push('Nenhuma relação confirmada.', '');
  } else {
    for (const relation of relations) {
      const left = evidenceById.get(relation.leftEvidenceId);
      const right = evidenceById.get(relation.rightEvidenceId);
      if (!left || !right) continue;
      lines.push(
        `- **${EVIDENCE_RELATION_LABELS[relation.type]}** — "${left.excerpt}" ↔ "${right.excerpt}"`,
      );
      lines.push(
        `  - Fontes: ${left.sourceTitle} ↔ ${right.sourceTitle}`,
      );
      if (relation.note.trim()) {
        lines.push(`  - Nota analítica: ${relation.note.trim()}`);
      }
    }
    lines.push('');
  }

  lines.push('## Lacunas de cobertura', '');
  if (!diagnostics.gaps.length) {
    lines.push('Nenhuma lacuna estrutural detectada pelas regras locais.', '');
  } else {
    for (const gap of diagnostics.gaps) {
      lines.push(`- **${gap.title}** (${gap.priority}) — ${gap.detail}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

export function downloadResearchDiagnostics(
  question: string,
  evidence: WorkspaceEvidence[],
  relations: WorkspaceEvidenceRelation[],
): void {
  const content = researchDiagnosticsToMarkdown(question, evidence, relations);
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = 'readplus-research-diagnostics.md';
  anchor.click();
  URL.revokeObjectURL(href);
}


export function validateEvidenceRelations(
  evidence: WorkspaceEvidence[],
  relations: WorkspaceEvidenceRelation[],
): WorkspaceEvidenceRelation[] {
  const knownIds = new Set(evidence.map((item) => item.id));

  return relations.filter(
    (relation) =>
      relation.leftEvidenceId !== relation.rightEvidenceId &&
      knownIds.has(relation.leftEvidenceId) &&
      knownIds.has(relation.rightEvidenceId),
  );
}
