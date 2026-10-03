function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = arg('--base-url');
const expected = arg('--expect', 'disabled');
const origin = arg('--origin', 'https://fhenriquefcruz.github.io');

if (!baseUrl) {
  console.error('ERROR: informe --base-url.');
  process.exit(1);
}

const url = new URL(baseUrl);
if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
  console.error('ERROR: o smoke exige HTTPS fora de localhost.');
  process.exit(1);
}

const headers = {
  Accept: 'application/json',
  Origin: origin,
};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  headers['x-vercel-protection-bypass'] =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
}

const healthResponse = await fetch(
  `${url.toString().replace(/\/$/, '')}/api/health`,
  { headers },
);

if (!healthResponse.ok) {
  console.error(`ERROR: /api/health respondeu ${healthResponse.status}.`);
  process.exit(1);
}

const health = await healthResponse.json();
if (health.service !== 'readplus-intelligence-gateway') {
  console.error('ERROR: endpoint não se identifica como gateway READ+.');
  process.exit(1);
}

if (expected === 'ready') {
  if (
    health.externalProcessingAvailable !== true ||
    health.operationalControlsReady !== true
  ) {
    console.error('ERROR: gateway não está operacionalmente pronto.');
    process.exit(1);
  }
} else if (expected === 'disabled') {
  if (health.externalProcessingAvailable === true) {
    console.error(
      'ERROR: processamento externo está ativo em um smoke que esperava fail-closed.',
    );
    process.exit(1);
  }
} else {
  console.error('ERROR: --expect deve ser ready ou disabled.');
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      service: health.service,
      version: health.version,
      enabled: health.enabled,
      operationalControlsReady: health.operationalControlsReady,
      externalProcessingAvailable: health.externalProcessingAvailable,
    },
    null,
    2,
  ),
);
