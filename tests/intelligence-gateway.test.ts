import { describe, expect, it } from 'vitest';
import {
  createGatewayRequest,
  validateGroundedGatewayResponse,
} from '../src/lib/intelligence-gateway';
import type { WorkspaceEvidence } from '../src/types';

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
];

describe('research intelligence gateway contract', () => {
  it('envia somente evidência explícita e consentimento para processamento externo', () => {
    const request = createGatewayRequest('workspace-1', 'Question?', evidence);

    expect(request.version).toBe('1');
    expect(request.consent.externalProcessing).toBe(true);
    expect(request.evidence).toHaveLength(1);
    expect(request.evidence[0]?.excerpt).toBe('Observed result.');
  });

  it('aceita claim grounded em evidência conhecida', () => {
    const response = validateGroundedGatewayResponse(
      {
        version: '1',
        claims: [
          {
            id: 'c1',
            text: 'Structured synthesis.',
            layer: 'synthesis',
            evidenceIds: ['e1'],
          },
        ],
      },
      ['e1'],
    );

    expect(response.claims[0]?.evidenceIds).toEqual(['e1']);
  });

  it('rejeita claim sem grounding', () => {
    expect(() =>
      validateGroundedGatewayResponse(
        {
          version: '1',
          claims: [
            {
              id: 'c1',
              text: 'Unsupported statement.',
              layer: 'inference',
              evidenceIds: [],
            },
          ],
        },
        ['e1'],
      ),
    ).toThrow('grounded');
  });

  it('rejeita citação a evidência que não estava no contexto enviado', () => {
    expect(() =>
      validateGroundedGatewayResponse(
        {
          version: '1',
          claims: [
            {
              id: 'c1',
              text: 'Unknown source.',
              layer: 'synthesis',
              evidenceIds: ['other'],
            },
          ],
        },
        ['e1'],
      ),
    ).toThrow('evidência inexistente');
  });
});
