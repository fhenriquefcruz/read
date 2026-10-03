import { describe, expect, it } from 'vitest';
import {
  createGatewayRequest,
  validateGroundedGatewayResponse,
} from '../src/lib/intelligence-gateway';
import type {
  WorkspaceEvidence,
  WorkspaceEvidenceRelation,
} from '../src/types';

const evidence: WorkspaceEvidence[] = [
  {
    id: 'e1',
    workId: 'w1',
    sourceTitle: 'Study One',
    kind: 'finding',
    excerpt: 'Observed result.',
    interpretation: '',
    createdAt: '2026-10-03T00:00:00.000Z',
  },
  {
    id: 'e2',
    workId: 'w2',
    sourceTitle: 'Study Two',
    kind: 'finding',
    excerpt: 'Contrasting result.',
    interpretation: '',
    createdAt: '2026-10-03T00:00:00.000Z',
  },
];

const relations: WorkspaceEvidenceRelation[] = [
  {
    id: 'r1',
    leftEvidenceId: 'e1',
    rightEvidenceId: 'e2',
    type: 'diverges',
    note: 'Classificação confirmada pelo pesquisador.',
    createdAt: '2026-10-03T00:00:00.000Z',
  },
];

describe('research intelligence gateway contract v2', () => {
  it('envia evidências, relações confirmadas e consentimento explícito', () => {
    const request = createGatewayRequest(
      'workspace-1',
      'Question?',
      evidence,
      true,
      relations,
    );

    expect(request.version).toBe('2');
    expect(request.consent.externalProcessing).toBe(true);
    expect(request.evidence).toHaveLength(2);
    expect(request.relations).toEqual([
      {
        id: 'r1',
        type: 'diverges',
        evidenceIds: ['e1', 'e2'],
        note: 'Classificação confirmada pelo pesquisador.',
      },
    ]);
    expect(request.requestedTasks).toEqual([
      'synthesize',
      'compare',
      'identify-gaps',
    ]);
  });

  it('recusa montar payload externo sem consentimento explícito', () => {
    expect(() =>
      createGatewayRequest(
        'workspace-1',
        'Question?',
        evidence,
        false,
        relations,
      ),
    ).toThrow('Consentimento explícito');
  });

  it('descarta relação que referencia evidência fora do contexto enviado', () => {
    const request = createGatewayRequest(
      'workspace-1',
      'Question?',
      [evidence[0]!],
      true,
      relations,
    );

    expect(request.relations).toEqual([]);
  });

  it('aceita claim grounded em evidência e relação conhecidas', () => {
    const response = validateGroundedGatewayResponse(
      {
        version: '2',
        claims: [
          {
            id: 'c1',
            text: 'Structured comparison.',
            layer: 'synthesis',
            evidenceIds: ['e1', 'e2'],
            relationIds: ['r1'],
          },
        ],
      },
      ['e1', 'e2'],
      ['r1'],
    );

    expect(response.claims[0]?.evidenceIds).toEqual(['e1', 'e2']);
    expect(response.claims[0]?.relationIds).toEqual(['r1']);
  });

  it('rejeita claim sem grounding', () => {
    expect(() =>
      validateGroundedGatewayResponse(
        {
          version: '2',
          claims: [
            {
              id: 'c1',
              text: 'Unsupported statement.',
              layer: 'inference',
              evidenceIds: [],
            },
          ],
        },
        ['e1', 'e2'],
        ['r1'],
      ),
    ).toThrow('grounded');
  });

  it('rejeita evidência inexistente no contexto enviado', () => {
    expect(() =>
      validateGroundedGatewayResponse(
        {
          version: '2',
          claims: [
            {
              id: 'c1',
              text: 'Unknown source.',
              layer: 'synthesis',
              evidenceIds: ['other'],
            },
          ],
        },
        ['e1', 'e2'],
        ['r1'],
      ),
    ).toThrow('evidência inexistente');
  });

  it('rejeita relação analítica inexistente no contexto enviado', () => {
    expect(() =>
      validateGroundedGatewayResponse(
        {
          version: '2',
          claims: [
            {
              id: 'c1',
              text: 'Unsupported relation.',
              layer: 'synthesis',
              evidenceIds: ['e1', 'e2'],
              relationIds: ['other'],
            },
          ],
        },
        ['e1', 'e2'],
        ['r1'],
      ),
    ).toThrow('relação analítica inexistente');
  });
});
