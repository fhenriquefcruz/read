import { describe, expect, it } from 'vitest';
import {
  buildGroundedBrief,
  comparisonCandidates,
  evidenceMatrix,
  groundedBriefToMarkdown,
  researchCoverageDiagnostics,
  researchDiagnosticsToMarkdown,
  validateEvidenceRelations,
} from '../src/lib/intelligence';
import type { WorkspaceEvidence } from '../src/types';

const evidence: WorkspaceEvidence[] = [
  {
    id: 'e1',
    workId: 'w1',
    sourceTitle: 'Study One',
    sourceDoi: '10.1000/one',
    kind: 'finding',
    excerpt: 'The intervention improved access.',
    interpretation: 'Access improved under the observed conditions.',
    createdAt: '2026-10-03T00:00:00.000Z',
  },
  {
    id: 'e2',
    workId: 'w2',
    sourceTitle: 'Study Two',
    kind: 'limitation',
    excerpt: 'The sample was restricted to one region.',
    interpretation: '',
    createdAt: '2026-10-03T00:00:00.000Z',
  },
  {
    id: 'e3',
    workId: 'w1',
    sourceTitle: 'Study One',
    sourceDoi: '10.1000/one',
    kind: 'method',
    excerpt: 'A longitudinal design was used.',
    interpretation: '',
    createdAt: '2026-10-03T00:00:00.000Z',
  },
];

describe('grounded research intelligence', () => {
  it('mantém toda saída ligada a evidências e fontes existentes', () => {
    const brief = buildGroundedBrief('Does the intervention help?', evidence);

    expect(brief.evidenceCount).toBe(3);
    expect(brief.sourceCount).toBe(2);
    expect(brief.inferenceCount).toBe(0);
    expect(brief.hasCrossSourceCoverage).toBe(true);

    const knownEvidence = new Set(evidence.map((item) => item.id));
    for (const section of brief.sections) {
      expect(section.evidenceIds.length).toBeGreaterThan(0);
      for (const id of section.evidenceIds) {
        expect(knownEvidence.has(id)).toBe(true);
      }
      for (const item of section.items) {
        expect(knownEvidence.has(item.evidenceId)).toBe(true);
        expect(item.sourceIndex).toBeGreaterThan(0);
      }
    }
  });

  it('respeita a seleção explícita de evidências', () => {
    const brief = buildGroundedBrief('Question', evidence, ['e1']);

    expect(brief.evidenceCount).toBe(1);
    expect(brief.sourceCount).toBe(1);
    expect(brief.sections).toHaveLength(1);
    expect(brief.sections[0]?.evidenceIds).toEqual(['e1']);
  });

  it('gera matriz por fonte sem inferir convergência semântica', () => {
    const matrix = evidenceMatrix(buildGroundedBrief('Question', evidence));

    expect(matrix).toHaveLength(2);
    expect(matrix[0]?.counts.finding).toBe(1);
    expect(matrix[0]?.counts.method).toBe(1);
    expect(matrix[1]?.counts.limitation).toBe(1);
  });

  it('exporta markdown separando evidência de interpretação', () => {
    const markdown = groundedBriefToMarkdown(
      buildGroundedBrief('Question', evidence),
    );

    expect(markdown).toContain('Síntese estrutural local');
    expect(markdown).toContain('The intervention improved access. [1]');
    expect(markdown).toContain(
      '**Interpretação do pesquisador:** Access improved under the observed conditions.',
    );
    expect(markdown).toContain('[1] Study One · DOI 10.1000/one');
  });
});


describe('research intelligence v7 diagnostics', () => {
  it('sugere apenas pares comparáveis de fontes diferentes e mesmo tipo', () => {
    const candidates = comparisonCandidates(evidence);

    expect(candidates).toHaveLength(0);

    const expanded = [
      ...evidence,
      {
        id: 'e4',
        workId: 'w2',
        sourceTitle: 'Study Two',
        kind: 'finding' as const,
        excerpt: 'The intervention improved access for rural users.',
        interpretation: '',
        createdAt: '2026-10-03T00:00:00.000Z',
      },
    ];

    const comparable = comparisonCandidates(expanded);
    expect(comparable).toHaveLength(1);
    expect(comparable[0]?.leftEvidenceId).toBe('e1');
    expect(comparable[0]?.rightEvidenceId).toBe('e4');
    expect(comparable[0]?.kind).toBe('finding');
  });

  it('não chama pares de convergentes ou divergentes sem classificação humana', () => {
    const diagnostics = researchCoverageDiagnostics(evidence, []);

    expect(diagnostics.relationCount).toBe(0);
    expect(diagnostics.relationCounts.converges).toBe(0);
    expect(diagnostics.relationCounts.diverges).toBe(0);
    expect(diagnostics.gaps.some((gap) => gap.code === 'uncompared-evidence')).toBe(true);
  });

  it('contabiliza somente relações explicitamente confirmadas', () => {
    const diagnostics = researchCoverageDiagnostics(evidence, [
      {
        id: 'r1',
        leftEvidenceId: 'e1',
        rightEvidenceId: 'e2',
        type: 'qualifies',
        note: 'A limitação restringe a generalização do achado.',
        createdAt: '2026-10-03T00:00:00.000Z',
      },
    ]);

    expect(diagnostics.relationCount).toBe(1);
    expect(diagnostics.relationCounts.qualifies).toBe(1);
  });

  it('gera relatório de diagnóstico deixando autoria da relação explícita', () => {
    const markdown = researchDiagnosticsToMarkdown('Question', evidence, [
      {
        id: 'r1',
        leftEvidenceId: 'e1',
        rightEvidenceId: 'e2',
        type: 'diverges',
        note: 'Classificação confirmada pelo pesquisador.',
        createdAt: '2026-10-03T00:00:00.000Z',
      },
    ]);

    expect(markdown).toContain('Relações de convergência/divergência são classificadas pelo pesquisador');
    expect(markdown).toContain('**Divergência**');
    expect(markdown).toContain('Classificação confirmada pelo pesquisador.');
  });
});


describe('research intelligence relation integrity', () => {
  it('descarta relações órfãs ou autorreferentes', () => {
    const relations = validateEvidenceRelations(evidence, [
      {
        id: 'r1',
        leftEvidenceId: 'e1',
        rightEvidenceId: 'e2',
        type: 'diverges',
        note: 'Different contexts.',
        createdAt: '2026-10-03T00:00:00.000Z',
      },
      {
        id: 'r2',
        leftEvidenceId: 'e1',
        rightEvidenceId: 'missing',
        type: 'context',
        note: '',
        createdAt: '2026-10-03T00:00:00.000Z',
      },
      {
        id: 'r3',
        leftEvidenceId: 'e1',
        rightEvidenceId: 'e1',
        type: 'converges',
        note: '',
        createdAt: '2026-10-03T00:00:00.000Z',
      },
    ]);

    expect(relations.map((item) => item.id)).toEqual(['r1']);
  });
});
