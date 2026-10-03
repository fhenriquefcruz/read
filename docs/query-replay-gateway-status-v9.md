# READ+ — Query Replay & Gateway Status v9

## Objetivo

Fechar o ciclo entre pesquisa e descoberta e tornar o estado do gateway
compreensível sem enfraquecer o modelo fail-closed da v8.

## Query replay

Uma consulta anexada ao Research Workspace agora pode ser reexecutada.

O replay restaura:
- consulta bruta;
- ano inicial/final;
- tipo;
- Open Access;
- idioma;
- autor;
- ordenação.

A execução consulta novamente OpenAlex/Crossref. Resultados antigos não são
tratados como se fossem atuais.

O replay não grava outra cópia no histórico, porque o workspace já preserva a
proveniência daquele recorte.

## Gateway status

Quando existe uma URL pública configurada, o navegador faz apenas:

`GET <gateway>/api/health`

Nenhuma chave de sessão, evidência ou conteúdo de pesquisa é enviado.

O formulário de síntese externa só aparece quando o health-check retorna
`externalProcessingAvailable=true`.

Isso cria uma segunda barreira fail-closed além das validações server-side.

## Situação operacional

O código do gateway está pronto desde a v8, mas a conta Vercel conectada não
apresentou projeto READ+ provisionado durante esta rodada.

A geração deve continuar desativada até existirem:
1. projeto Vercel;
2. domínio/endpoint definido;
3. WAF/rate limiting para `/api/intelligence`;
4. budget/limites no AI Gateway;
5. variáveis server-side;
6. observabilidade de erros e custo;
7. smoke de `/api/health`;
8. teste controlado de grounding antes de ativação pública.
