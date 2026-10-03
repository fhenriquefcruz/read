import { describe, expect, it, vi } from 'vitest';
import {
  handleIntelligenceRequest,
  validateGatewayRequest,
} from '../api/intelligence';
import type { IntelligenceGatewayRequest } from '../src/lib/intelligence-gateway';

const payload: IntelligenceGatewayRequest = {
  version: '2',
  workspaceId: 'workspace-1',
  question: 'What does the evidence support?',
  evidence: [
    {
      id: 'e1',
      workId: 'w1',
      sourceTitle: 'Study One',
      kind: 'finding',
      excerpt: 'Observed result.',
    },
    {
      id: 'e2',
      workId: 'w2',
      sourceTitle: 'Study Two',
      kind: 'finding',
      excerpt: 'Contrasting result.',
    },
  ],
  relations: [
    {
      id: 'r1',
      type: 'diverges',
      evidenceIds: ['e1', 'e2'],
      note: 'Researcher-confirmed divergence.',
    },
  ],
  requestedTasks: ['synthesize', 'compare'],
  consent: { externalProcessing: true },
};

const env = {
  READPLUS_AI_ENABLED: 'true',
  READPLUS_AI_MODEL: 'openai/test-model',
  AI_GATEWAY_API_KEY: 'test-token-not-a-real-secret',
  READPLUS_ALLOWED_ORIGINS: 'https://fhenriquefcruz.github.io',
};

function request(body: unknown = payload, origin = 'https://fhenriquefcruz.github.io') {
  return new Request('https://gateway.example/api/intelligence', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'X-Readplus-Request': 'request-1',
    },
    body: JSON.stringify(body),
  });
}

describe('server-side intelligence gateway', () => {
  it('rejeita origem fora da allowlist', async () => {
    const response = await handleIntelligenceRequest(
      request(payload, 'https://evil.example'),
      { env, fetchImpl: vi.fn() as unknown as typeof fetch },
    );

    expect(response.status).toBe(403);
  });

  it('fica fail-closed quando geração externa está desabilitada', async () => {
    const response = await handleIntelligenceRequest(request(), {
      env: { ...env, READPLUS_AI_ENABLED: 'false' },
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'gateway_disabled' });
  });

  it('valida IDs, limites e consentimento antes de chamar o modelo', () => {
    expect(() =>
      validateGatewayRequest({
        ...payload,
        evidence: [{ ...payload.evidence[0], excerpt: '' }],
      }),
    ).toThrow('Evidência inválida');

    expect(() =>
      validateGatewayRequest({
        ...payload,
        consent: { externalProcessing: false },
      }),
    ).toThrow('Contrato do gateway inválido');
  });

  it('aceita structured output somente quando permanece grounded', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            version: '2',
            claims: [
              {
                id: 'c1',
                text: 'The two findings report different outcomes.',
                layer: 'synthesis',
                evidenceIds: ['e1', 'e2'],
                relationIds: ['r1'],
              },
            ],
          }),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const response = await handleIntelligenceRequest(request(), {
      env,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      version: '2',
      requestId: 'request-1',
      claims: [{ evidenceIds: ['e1', 'e2'], relationIds: ['r1'] }],
    });

    const upstreamBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(upstreamBody.model).toBe('openai/test-model');
    expect(upstreamBody).toHaveProperty('text');
  });

  it('rejeita output que cita evidência inexistente', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            version: '2',
            claims: [
              {
                id: 'c1',
                text: 'Unsupported.',
                layer: 'synthesis',
                evidenceIds: ['invented'],
                relationIds: [],
              },
            ],
          }),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const response = await handleIntelligenceRequest(request(), {
      env,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: 'ungrounded_gateway_output',
    });
  });

  it('mapeia rate limit upstream para 429 sem expor conteúdo', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('{}', {
        status: 429,
        headers: { 'retry-after': '30' },
      }),
    );

    const response = await handleIntelligenceRequest(request(), {
      env,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: 'gateway_rejected',
      retryAfter: '30',
    });
  });
});
