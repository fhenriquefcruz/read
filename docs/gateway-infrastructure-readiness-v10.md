# READ+ — Gateway Infrastructure Readiness v10

## Separação de projeto

O gateway do READ+ deve usar um projeto Vercel dedicado ao READ+.

Nenhuma equipe, projeto, segredo ou domínio pertencente a outro produto deve ser
reutilizado. O workflow exige um nome de projeto esperado e valida a identidade
do projeto via API antes de build ou deploy.

## Princípio de ativação

Publicar o gateway e ativar processamento externo são duas operações diferentes.

A v10 permite publicar o backend em modo **fail-closed** com
`READPLUS_AI_ENABLED=false`.

Mesmo quando `READPLUS_AI_ENABLED=true`, o endpoint de inteligência permanece
bloqueado até três guardas operacionais também estarem explícitos:

- `READPLUS_WAF_READY=true`;
- `READPLUS_BUDGET_READY=true`;
- `READPLUS_OBSERVABILITY_READY=true`.

Essas flags são uma trava de aplicação. Elas só devem ser marcadas após os
respectivos controles existirem realmente na infraestrutura Vercel.

## Credenciais de CI

O workflow manual `Deploy READ+ Intelligence Gateway` usa nomes exclusivos:

- `READPLUS_VERCEL_TOKEN`;
- `READPLUS_VERCEL_ORG_ID`;
- `READPLUS_VERCEL_PROJECT_ID`;
- opcionalmente `READPLUS_VERCEL_AUTOMATION_BYPASS_SECRET`.

Eles não devem apontar para projeto de outro produto.

## Variáveis de runtime do gateway

### Sempre

- `READPLUS_ALLOWED_ORIGINS=https://fhenriquefcruz.github.io`;
- `READPLUS_AI_ENABLED=false` durante provisionamento inicial.

### Antes de ativar IA

- `READPLUS_AI_MODEL`;
- `AI_GATEWAY_API_KEY` ou `VERCEL_OIDC_TOKEN`;
- `READPLUS_CLIENT_TOKEN`;
- `READPLUS_WAF_READY=true`;
- `READPLUS_BUDGET_READY=true`;
- `READPLUS_OBSERVABILITY_READY=true`.

## Sequência operacional

1. Criar um projeto Vercel dedicado, recomendado:
   `readplus-intelligence-gateway`.
2. Configurar as credenciais READ+ no environment GitHub
   `readplus-gateway`.
3. Configurar allowlist de origem.
4. Manter `READPLUS_AI_ENABLED=false`.
5. Executar o workflow para `preview`.
6. Validar `/api/health`.
7. Configurar WAF/rate limiting na rota `/api/intelligence`.
8. Configurar budget do AI Gateway.
9. Configurar observabilidade sem registrar prompt/completion por padrão.
10. Marcar as três flags operacionais como `true`.
11. Executar o workflow novamente com processamento externo autorizado.
12. Só então configurar a URL pública no build do GitHub Pages.

## Smoke

`npm run gateway:smoke` valida identidade e estado do endpoint.

Em modo `disabled`, ele falha se processamento externo estiver ativo.
Em modo `ready`, ele falha se os controles operacionais não estiverem todos
confirmados.

## Limitação atual da automação

O repositório contém a automação reproduzível, mas ela não cria credenciais
Vercel nem escolhe silenciosamente uma equipe/projeto. Isso é intencional:
a identidade da infraestrutura é uma fronteira de segurança e precisa ser
exclusiva do READ+.
