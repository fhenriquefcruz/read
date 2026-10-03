import { describe, expect, it } from 'vitest';
import {
  checkIntelligenceGatewayHealth,
  configuredIntelligenceGatewayUrl,
  runGenerativeIntelligence,
} from '../src/lib/generative-intelligence';
import type { IntelligenceGatewayRequest } from '../src/lib/intelligence-gateway';

const request: IntelligenceGatewayRequest = {
  version: '2',
  workspaceId: 'workspace-1',
  question: 'Question?',
  evidence: [
    {
      id: 'e1',
      workId: 'w1',
      sourceTitle: 'Study',
      kind: 'finding',
      excerpt: 'Observed result.',
    },
  ],
  relations: [],
  requestedTasks: ['synthesize'],
  consent: { externalProcessing: true },
};

describe('generative intelligence client', () => {
  it('aceita HTTPS e localhost, mas rejeita HTTP remoto e credenciais na URL', () => {
    expect(
      configuredIntelligenceGatewayUrl('https://gateway.example'),
    ).toBe('https://gateway.example');
    expect(
      configuredIntelligenceGatewayUrl('http://localhost:3000/'),
    ).toBe('http://localhost:3000');
    expect(
      configuredIntelligenceGatewayUrl('http://gateway.example'),
    ).toBeUndefined();
    expect(
      configuredIntelligenceGatewayUrl('https://user:pass@gateway.example'),
    ).toBeUndefined();
  });

  it('não executa sem chave de acesso informada na sessão', async () => {
    await expect(
      runGenerativeIntelligence(request, {
        baseUrl: 'https://gateway.example',
        accessToken: '',
      }),
    ).rejects.toThrow('chave de acesso');
  });

  it('valida grounding novamente no navegador antes de exibir claims', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          version: '2',
          requestId: 'r1',
          model: 'openai/test',
          claims: [
            {
              id: 'c1',
              text: 'Grounded synthesis.',
              layer: 'synthesis',
              evidenceIds: ['e1'],
              relationIds: [],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const response = await runGenerativeIntelligence(request, {
      baseUrl: 'https://gateway.example',
      accessToken: 'session-token',
      fetchImpl,
    });

    expect(response.claims[0]?.evidenceIds).toEqual(['e1']);
    expect(response.requestId).toBe('r1');
  });

  it('rejeita claim do servidor que referencia evidência ausente', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          version: '2',
          claims: [
            {
              id: 'c1',
              text: 'Hallucinated.',
              layer: 'synthesis',
              evidenceIds: ['missing'],
              relationIds: [],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    await expect(
      runGenerativeIntelligence(request, {
        baseUrl: 'https://gateway.example',
        accessToken: 'session-token',
        fetchImpl,
      }),
    ).rejects.toThrow('evidência inexistente');
  });
});


describe('intelligence gateway health-check', () => {
  it('não chama a rede quando a URL pública não está configurada', async () => {
    const fetchImpl = vi.fn();

    const health = await checkIntelligenceGatewayHealth({
      baseUrl: undefined,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(health.state).toBe('unconfigured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('distingue gateway publicado porém desativado', async () => {
    const health = await checkIntelligenceGatewayHealth({
      baseUrl: 'https://gateway.example',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            service: 'readplus-intelligence-gateway',
            version: '8',
            enabled: false,
            configured: true,
            authenticationConfigured: true,
            externalProcessingAvailable: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    expect(health.state).toBe('disabled');
    expect(health.version).toBe('8');
  });

  it('só marca ready quando processamento externo está disponível', async () => {
    const health = await checkIntelligenceGatewayHealth({
      baseUrl: 'https://gateway.example',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            service: 'readplus-intelligence-gateway',
            version: '8',
            enabled: true,
            configured: true,
            authenticationConfigured: true,
            externalProcessingAvailable: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    expect(health.state).toBe('ready');
    expect(health.externalProcessingAvailable).toBe(true);
  });

  it('rejeita endpoint que não se identifica como gateway READ+', async () => {
    await expect(
      checkIntelligenceGatewayHealth({
        baseUrl: 'https://gateway.example',
        fetchImpl: async () =>
          new Response(JSON.stringify({ service: 'other' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      }),
    ).rejects.toThrow('gateway READ+ válido');
  });
});
