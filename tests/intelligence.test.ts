import { describe, expect, it } from 'vitest';
import {
  buildGroundedBrief,
  evidenceMatrix,
  groundedBriefToMarkdown,
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
