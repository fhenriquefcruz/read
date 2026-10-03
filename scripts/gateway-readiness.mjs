import fs from 'node:fs';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function parseDotEnv(filePath) {
  if (!filePath) return {};
  const text = fs.readFileSync(filePath, 'utf8');
  const result = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value.replace(/\\n/g, '\n');
  }

  return result;
}

const mode = arg('--mode', 'disabled');
const envFile = arg('--env-file');
const fileEnv = parseDotEnv(envFile);
const env = { ...process.env, ...fileEnv };

const allowedOrigins = (env.READPLUS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const checks = {
  explicitAllowedOrigins:
    allowedOrigins.length > 0 &&
    allowedOrigins.includes('https://fhenriquefcruz.github.io') &&
    !allowedOrigins.includes('*'),
  enabled: env.READPLUS_AI_ENABLED === 'true',
  model: Boolean(env.READPLUS_AI_MODEL?.trim()),
  providerCredential: Boolean(
    env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim(),
  ),
  clientAuthentication: Boolean(env.READPLUS_CLIENT_TOKEN?.trim()),
  waf: env.READPLUS_WAF_READY === 'true',
  budget: env.READPLUS_BUDGET_READY === 'true',
  observability: env.READPLUS_OBSERVABILITY_READY === 'true',
};

const errors = [];

if (!checks.explicitAllowedOrigins) {
  errors.push(
    'READPLUS_ALLOWED_ORIGINS deve declarar explicitamente https://fhenriquefcruz.github.io e não pode usar wildcard.',
  );
}

if (mode === 'disabled') {
  if (checks.enabled) {
    errors.push(
      'READPLUS_AI_ENABLED está true, mas o deploy foi solicitado em modo fail-closed.',
    );
  }
} else if (mode === 'enable') {
  for (const [key, ready] of Object.entries(checks)) {
    if (!ready) errors.push(`Controle obrigatório ausente: ${key}.`);
  }
} else {
  errors.push('Modo inválido. Use --mode disabled ou --mode enable.');
}

const summary = {
  mode,
  ready: errors.length === 0,
  checks,
  secretValuesPrinted: false,
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
