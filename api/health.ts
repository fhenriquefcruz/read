import {
  gatewayRuntimeConfig,
  isAllowedOrigin,
  jsonResponse,
} from './_shared';

export default {
  fetch(request: Request) {
    const config = gatewayRuntimeConfig();

    if (request.method !== 'GET') {
      return jsonResponse(request, config, { error: 'method_not_allowed' }, 405);
    }
    if (!isAllowedOrigin(request, config)) {
      return jsonResponse(request, config, { error: 'origin_not_allowed' }, 403);
    }

    return jsonResponse(request, config, {
      service: 'readplus-intelligence-gateway',
      version: '8',
      enabled: config.enabled,
      configured: Boolean(config.token && config.model && config.clientToken),
      authenticationConfigured: Boolean(config.clientToken),
      externalProcessingAvailable:
        config.enabled &&
        Boolean(config.token && config.model && config.clientToken),
    });
  },
};
