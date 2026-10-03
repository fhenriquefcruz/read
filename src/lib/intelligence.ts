import type {
  EvidenceKind,
  WorkspaceEvidence,
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
