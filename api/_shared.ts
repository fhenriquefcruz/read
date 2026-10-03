const DEFAULT_ALLOWED_ORIGIN = 'https://fhenriquefcruz.github.io';

export interface GatewayRuntimeConfig {
  enabled: boolean;
  token?: string;
  model?: string;
  clientToken?: string;
  allowedOrigins: Set<string>;
  controls: {
    waf: boolean;
    budget: boolean;
    observability: boolean;
  };
  operationalControlsReady: boolean;
}

export function gatewayRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): GatewayRuntimeConfig {
  const configuredOrigins = env.READPLUS_ALLOWED_ORIGINS
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const controls = {
    waf: env.READPLUS_WAF_READY === 'true',
    budget: env.READPLUS_BUDGET_READY === 'true',
    observability: env.READPLUS_OBSERVABILITY_READY === 'true',
  };

  return {
    enabled: env.READPLUS_AI_ENABLED === 'true',
    token: env.AI_GATEWAY_API_KEY ?? env.VERCEL_OIDC_TOKEN,
    model: env.READPLUS_AI_MODEL?.trim() || undefined,
    clientToken: env.READPLUS_CLIENT_TOKEN?.trim() || undefined,
    allowedOrigins: new Set(
      configuredOrigins?.length
        ? configuredOrigins
        : [DEFAULT_ALLOWED_ORIGIN],
    ),
    controls,
    operationalControlsReady:
      controls.waf && controls.budget && controls.observability,
  };
}

export function isAllowedOrigin(
  request: Request,
  config: GatewayRuntimeConfig,
): boolean {
  const origin = request.headers.get('origin');
  return Boolean(origin && config.allowedOrigins.has(origin));
}

export function corsHeaders(
  request: Request,
  config: GatewayRuntimeConfig,
): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  });
  const origin = request.headers.get('origin');
  if (origin && config.allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, X-Readplus-Request',
    );
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}

export function jsonResponse(
  request: Request,
  config: GatewayRuntimeConfig,
  value: unknown,
  status = 200,
): Response {
  const headers = corsHeaders(request, config);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(value), { status, headers });
}
