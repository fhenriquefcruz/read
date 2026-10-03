import {
  validateGroundedGatewayResponse,
  type IntelligenceGatewayRequest,
  type IntelligenceGatewayResponse,
} from '../src/lib/intelligence-gateway';
import {
  corsHeaders,
  gatewayRuntimeConfig,
  isAllowedOrigin,
  jsonResponse,
  type GatewayRuntimeConfig,
} from './_shared';

const MAX_BODY_CHARS = 120_000;
const MAX_EVIDENCE = 30;
const MAX_RELATIONS = 30;
const MAX_CLAIMS = 12;
const ALLOWED_TASKS = new Set(['synthesize', 'compare', 'identify-gaps']);
const ALLOWED_KINDS = new Set([
  'finding',
  'method',
  'limitation',
  'definition',
  'quote',
]);
const ALLOWED_RELATIONS = new Set([
  'converges',
  'diverges',
  'qualifies',
  'context',
]);

interface GatewayOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

function nonEmptyString(
  value: unknown,
  maxLength: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function optionalString(value: unknown, maxLength: number): boolean {
  return value === undefined || value === null || (
    typeof value === 'string' && value.length <= maxLength
  );
}

export function validateGatewayRequest(
  value: unknown,
): IntelligenceGatewayRequest {
  if (!value || typeof value !== 'object') {
    throw new Error('Payload inválido.');
  }

  const request = value as Partial<IntelligenceGatewayRequest>;
  if (
    request.version !== '2' ||
    !nonEmptyString(request.workspaceId, 160) ||
    typeof request.question !== 'string' ||
    request.question.length > 4_000 ||
    request.consent?.externalProcessing !== true ||
    !Array.isArray(request.evidence) ||
    request.evidence.length < 1 ||
    request.evidence.length > MAX_EVIDENCE ||
    !Array.isArray(request.relations) ||
    request.relations.length > MAX_RELATIONS ||
    !Array.isArray(request.requestedTasks) ||
    request.requestedTasks.length < 1 ||
    request.requestedTasks.length > ALLOWED_TASKS.size
  ) {
    throw new Error('Contrato do gateway inválido.');
  }

  const evidenceIds = new Set<string>();
  for (const item of request.evidence) {
    if (
      !item ||
      typeof item !== 'object' ||
      !nonEmptyString(item.id, 160) ||
      evidenceIds.has(item.id) ||
      !nonEmptyString(item.workId, 300) ||
      !nonEmptyString(item.sourceTitle, 1_000) ||
      !optionalString(item.sourceDoi, 300) ||
      !ALLOWED_KINDS.has(item.kind) ||
      !nonEmptyString(item.excerpt, 5_000) ||
      !optionalString(item.interpretation, 3_000)
    ) {
      throw new Error('Evidência inválida no payload.');
    }
    evidenceIds.add(item.id);
  }

  const relationIds = new Set<string>();
  for (const relation of request.relations) {
    if (
      !relation ||
      typeof relation !== 'object' ||
      !nonEmptyString(relation.id, 160) ||
      relationIds.has(relation.id) ||
      !ALLOWED_RELATIONS.has(relation.type) ||
      !Array.isArray(relation.evidenceIds) ||
      relation.evidenceIds.length !== 2 ||
      relation.evidenceIds[0] === relation.evidenceIds[1] ||
      relation.evidenceIds.some((id) => !evidenceIds.has(id)) ||
      !optionalString(relation.note, 2_000)
    ) {
      throw new Error('Relação analítica inválida no payload.');
    }
    relationIds.add(relation.id);
  }

  if (
    request.requestedTasks.some(
      (task) => !ALLOWED_TASKS.has(task),
    )
  ) {
    throw new Error('Tarefa de inteligência não suportada.');
  }

  return request as IntelligenceGatewayRequest;
}

function structuredOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      version: { type: 'string', const: '2' },
      claims: {
        type: 'array',
        maxItems: MAX_CLAIMS,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', minLength: 1, maxLength: 160 },
            text: { type: 'string', minLength: 1, maxLength: 2_500 },
            layer: {
              type: 'string',
              enum: ['synthesis', 'inference'],
            },
            evidenceIds: {
              type: 'array',
              minItems: 1,
              maxItems: MAX_EVIDENCE,
              uniqueItems: true,
              items: { type: 'string' },
            },
            relationIds: {
              type: 'array',
              maxItems: MAX_RELATIONS,
              uniqueItems: true,
              items: { type: 'string' },
            },
          },
          required: [
            'id',
            'text',
            'layer',
            'evidenceIds',
            'relationIds',
          ],
        },
      },
    },
    required: ['version', 'claims'],
  };
}

function promptFor(request: IntelligenceGatewayRequest): string {
  return [
    'You are the grounded synthesis engine for READ+.',
    'Use ONLY the evidence and researcher-confirmed relations supplied below.',
    'Do not introduce external facts, citations, papers, statistics, or background knowledge.',
    'Every claim MUST cite one or more evidenceIds that directly support it.',
    'relationIds may only reference researcher-confirmed relations supplied in the context.',
    'Use layer="synthesis" when reorganizing what evidence explicitly supports.',
    'Use layer="inference" only when an inference is directly grounded in cited evidence and label it conservatively.',
    'If evidence is insufficient for a requested task, omit the claim rather than guessing.',
    'Do not treat a researcher interpretation as a source fact.',
    'Return only the requested JSON schema.',
    '',
    JSON.stringify(request),
  ].join('\n');
}

function extractOutputText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const root = value as Record<string, unknown>;
  if (typeof root.output_text === 'string') return root.output_text;

  if (!Array.isArray(root.output)) return undefined;
  for (const output of root.output) {
    if (!output || typeof output !== 'object') continue;
    const content = (output as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      const text = (item as Record<string, unknown>).text;
      if (typeof text === 'string') return text;
    }
  }
  return undefined;
}

async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_CHARS) {
    throw new Error('Payload excede o limite permitido.');
  }

  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) {
    throw new Error('Payload excede o limite permitido.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('JSON inválido.');
  }
}

function gatewayErrorStatus(status: number): number {
  if (status === 402) return 503;
  if (status === 429) return 429;
  if (status >= 500) return 503;
  return 502;
}

export async function handleIntelligenceRequest(
  request: Request,
  options: GatewayOptions = {},
): Promise<Response> {
  const config = gatewayRuntimeConfig(options.env);
  const fetchImpl = options.fetchImpl ?? fetch;

  if (request.method === 'OPTIONS') {
    if (!isAllowedOrigin(request, config)) {
      return jsonResponse(request, config, { error: 'origin_not_allowed' }, 403);
    }
    return new Response(null, { status: 204, headers: corsHeaders(request, config) });
  }

  if (request.method !== 'POST') {
    return jsonResponse(request, config, { error: 'method_not_allowed' }, 405);
  }

  if (!isAllowedOrigin(request, config)) {
    return jsonResponse(request, config, { error: 'origin_not_allowed' }, 403);
  }

  if (!config.enabled) {
    return jsonResponse(request, config, { error: 'gateway_disabled' }, 503);
  }
  if (!config.token || !config.model || !config.clientToken) {
    return jsonResponse(request, config, { error: 'gateway_not_configured' }, 503);
  }

  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${config.clientToken}`) {
    return jsonResponse(request, config, { error: 'unauthorized' }, 401);
  }

  let body: IntelligenceGatewayRequest;
  try {
    body = validateGatewayRequest(await readJsonBody(request));
  } catch (error) {
    return jsonResponse(
      request,
      config,
      {
        error: 'invalid_request',
        message: error instanceof Error ? error.message : 'Payload inválido.',
      },
      400,
    );
  }

  const requestId =
    request.headers.get('x-readplus-request') ?? crypto.randomUUID();

  let upstream: Response;
  try {
    upstream = await fetchImpl('https://ai-gateway.vercel.sh/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'X-Readplus-Request': requestId,
      },
      body: JSON.stringify({
        model: config.model,
        input: promptFor(body),
        max_output_tokens: 2_400,
        text: {
          format: {
            type: 'json_schema',
            name: 'readplus_grounded_intelligence',
            strict: true,
            schema: structuredOutputSchema(),
          },
        },
      }),
    });
  } catch {
    return jsonResponse(
      request,
      config,
      { error: 'gateway_unavailable', requestId },
      503,
    );
  }

  if (!upstream.ok) {
    return jsonResponse(
      request,
      config,
      {
        error: 'gateway_rejected',
        requestId,
        retryAfter: upstream.headers.get('retry-after') ?? undefined,
      },
      gatewayErrorStatus(upstream.status),
    );
  }

  let raw: unknown;
  try {
    raw = await upstream.json();
  } catch {
    return jsonResponse(
      request,
      config,
      { error: 'invalid_gateway_response', requestId },
      502,
    );
  }

  const outputText = extractOutputText(raw);
  if (!outputText) {
    return jsonResponse(
      request,
      config,
      { error: 'missing_gateway_output', requestId },
      502,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText) as unknown;
  } catch {
    return jsonResponse(
      request,
      config,
      { error: 'invalid_structured_output', requestId },
      502,
    );
  }

  let grounded: IntelligenceGatewayResponse;
  try {
    grounded = validateGroundedGatewayResponse(
      parsed,
      body.evidence.map((item) => item.id),
      body.relations.map((relation) => relation.id),
    );
  } catch {
    return jsonResponse(
      request,
      config,
      { error: 'ungrounded_gateway_output', requestId },
      502,
    );
  }

  if (grounded.claims.length > MAX_CLAIMS) {
    return jsonResponse(
      request,
      config,
      { error: 'too_many_claims', requestId },
      502,
    );
  }

  return jsonResponse(request, config, {
    ...grounded,
    requestId,
    model: config.model,
  });
}

export default {
  fetch(request: Request) {
    return handleIntelligenceRequest(request);
  },
};
