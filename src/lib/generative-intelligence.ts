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

export type IntelligenceGatewayHealthState =
  | 'unconfigured'
  | 'checking'
  | 'ready'
  | 'disabled'
  | 'incomplete'
  | 'unreachable';

export interface IntelligenceGatewayHealth {
  state: IntelligenceGatewayHealthState;
  version?: string;
  enabled?: boolean;
  configured?: boolean;
  authenticationConfigured?: boolean;
  externalProcessingAvailable?: boolean;
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

export async function checkIntelligenceGatewayHealth(options: {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<IntelligenceGatewayHealth> {
  const baseUrl = normalizeGatewayBaseUrl(options.baseUrl);
  if (!baseUrl) return { state: 'unconfigured' };

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${baseUrl}/api/health`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error('O health-check do gateway retornou resposta inválida.');
  }

  if (!response.ok || !value || typeof value !== 'object') {
    throw new Error('Não foi possível verificar a disponibilidade do gateway.');
  }

  const health = value as Record<string, unknown>;
  if (health.service !== 'readplus-intelligence-gateway') {
    throw new Error('O endpoint configurado não é um gateway READ+ válido.');
  }

  const enabled = health.enabled === true;
  const configured = health.configured === true;
  const authenticationConfigured = health.authenticationConfigured === true;
  const externalProcessingAvailable =
    health.externalProcessingAvailable === true;

  const state: IntelligenceGatewayHealthState = externalProcessingAvailable
    ? 'ready'
    : !enabled
      ? 'disabled'
      : !configured || !authenticationConfigured
        ? 'incomplete'
        : 'unreachable';

  return {
    state,
    version:
      typeof health.version === 'string' ? health.version : undefined,
    enabled,
    configured,
    authenticationConfigured,
    externalProcessingAvailable,
  };
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
