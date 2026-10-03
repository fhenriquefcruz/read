import {
  validateGroundedGatewayResponse,
  type IntelligenceGatewayRequest,
  type IntelligenceGatewayResponse,
} from './intelligence-gateway';

export interface GenerativeIntelligenceResponse
  extends IntelligenceGatewayResponse {
  requestId?: string;
  model?: string;
}

interface GatewayClientOptions {
  baseUrl?: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function normalizeGatewayBaseUrl(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    const local =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
      return undefined;
    }
    if (url.username || url.password || url.search || url.hash) return undefined;
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

export function configuredIntelligenceGatewayUrl(
  value: string | undefined = import.meta.env.VITE_INTELLIGENCE_GATEWAY_URL,
): string | undefined {
  return normalizeGatewayBaseUrl(value);
}

export async function runGenerativeIntelligence(
  request: IntelligenceGatewayRequest,
  options: GatewayClientOptions,
): Promise<GenerativeIntelligenceResponse> {
  const baseUrl = normalizeGatewayBaseUrl(options.baseUrl);
  if (!baseUrl) {
    throw new Error('Gateway de inteligência não configurado.');
  }
  if (!options.accessToken.trim()) {
    throw new Error('Informe a chave de acesso do gateway.');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const requestId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `readplus-${Date.now()}`;

  const response = await fetchImpl(`${baseUrl}/api/intelligence`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.accessToken.trim()}`,
      'Content-Type': 'application/json',
      'X-Readplus-Request': requestId,
    },
    body: JSON.stringify(request),
    signal: options.signal,
  });

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error('O gateway retornou uma resposta inválida.');
  }

  if (!response.ok) {
    const error =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>).error
        : undefined;
    if (response.status === 401) {
      throw new Error('Chave de acesso do gateway rejeitada.');
    }
    if (response.status === 429) {
      throw new Error('Limite temporário do gateway atingido.');
    }
    if (response.status === 503) {
      throw new Error('Gateway de inteligência indisponível ou desativado.');
    }
    throw new Error(
      typeof error === 'string'
        ? `Gateway recusou a solicitação: ${error}.`
        : 'Gateway recusou a solicitação.',
    );
  }

  const grounded = validateGroundedGatewayResponse(
    value,
    request.evidence.map((item) => item.id),
    request.relations.map((relation) => relation.id),
  );

  const metadata =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  return {
    ...grounded,
    requestId:
      typeof metadata.requestId === 'string' ? metadata.requestId : undefined,
    model: typeof metadata.model === 'string' ? metadata.model : undefined,
  };
}
