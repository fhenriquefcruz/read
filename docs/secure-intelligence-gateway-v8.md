# READ+ — Secure Intelligence Gateway v8

## Estado

O código do gateway está pronto no repositório, mas a geração externa deve permanecer desativada até um projeto Vercel ser criado/vinculado e os controles abaixo serem configurados.

O frontend do READ+ continua publicado no GitHub Pages.

## Endpoints

### `GET /api/health`

Expõe apenas estado operacional:
- versão;
- habilitado/desabilitado;
- configuração completa/incompleta;
- autenticação configurada.

Não retorna segredo, token ou modelo.

### `POST /api/intelligence`

Recebe somente o contrato `IntelligenceGatewayRequest v2`.

Proteções:
- origin allowlist;
- chave Bearer do piloto;
- consentimento explícito;
- limite de tamanho total;
- máximo de evidências e relações;
- IDs únicos;
- relações restritas às evidências enviadas;
- tarefas permitidas fechadas;
- structured output;
- máximo de claims;
- grounding server-side;
- nenhuma reprodução do prompt em mensagens de erro.

## Variáveis server-side

Configurar no projeto Vercel:

```text
READPLUS_AI_ENABLED=false
READPLUS_AI_MODEL=<modelo escolhido da lista atual do AI Gateway>
READPLUS_ALLOWED_ORIGINS=https://fhenriquefcruz.github.io
READPLUS_CLIENT_TOKEN=<segredo aleatório de alta entropia>
```

Autenticação do Vercel AI Gateway:
- preferencial: OIDC gerenciado pelo Vercel;
- alternativa: `AI_GATEWAY_API_KEY`.

Não colocar nenhuma dessas credenciais em variáveis `VITE_*`.

## Variável pública do frontend

Depois do deployment do gateway, configurar no GitHub Actions/Repository Variables:

```text
VITE_INTELLIGENCE_GATEWAY_URL=https://<projeto>.vercel.app
```

Essa URL não é segredo. A chave `READPLUS_CLIENT_TOKEN` nunca deve ser configurada como variável do build do frontend.

## Ordem segura de ativação

1. Criar o projeto Vercel a partir deste repositório.
2. Habilitar AI Gateway no projeto.
3. Escolher `READPLUS_AI_MODEL` a partir da lista atual de modelos disponíveis.
4. Configurar OIDC ou AI Gateway key.
5. Gerar `READPLUS_CLIENT_TOKEN`.
6. Configurar allowlist de origem.
7. Configurar WAF/rate limiting da rota `/api/intelligence`.
8. Configurar budget/alertas do AI Gateway.
9. Fazer deploy com `READPLUS_AI_ENABLED=false`.
10. Validar `/api/health`.
11. Mudar `READPLUS_AI_ENABLED=true`.
12. Testar uma requisição com evidências de teste.
13. Somente então configurar `VITE_INTELLIGENCE_GATEWAY_URL` no GitHub.
14. Publicar novamente o GitHub Pages.

## Privacidade

O cliente envia apenas:
- pergunta central;
- evidências explicitamente selecionadas;
- interpretações associadas a essas evidências;
- relações confirmadas pelo pesquisador;
- tarefas solicitadas.

A biblioteca completa, notas não selecionadas e demais workspaces não são enviados.

## Rate limiting

O endpoint não deve depender de memória local da Function para limitar requisições, porque instâncias serverless são distribuídas.

O controle deve ser feito por infraestrutura durável:
- Vercel WAF/rate limiting;
- AI Gateway budgets/limits;
- futuramente identidade individual por usuário.

## Modelo

O código não fixa um slug de modelo. `READPLUS_AI_MODEL` é obrigatório justamente porque a disponibilidade do AI Gateway muda e deve ser escolhida da lista atual no momento do deploy.

## Rollback

Para desligar geração imediatamente sem alterar o frontend:

```text
READPLUS_AI_ENABLED=false
```

O frontend continuará oferecendo toda a Research Intelligence local das versões v6/v7.
