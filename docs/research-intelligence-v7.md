# READ+ — Research Intelligence v7

## Objetivo

Adicionar comparação auditável e diagnóstico de cobertura sem permitir que uma heurística local ou um modelo futuro decida sozinho que duas evidências convergem ou divergem.

## Comparison Board

O READ+ sugere pares comparáveis quando:
- pertencem ao mesmo tipo de evidência;
- vêm de trabalhos diferentes.

A sugestão significa apenas **vale a pena comparar**.

O pesquisador classifica explicitamente:
- Convergência;
- Divergência;
- Qualificação;
- Contexto.

A relação persiste com os dois IDs das evidências e uma nota analítica opcional.

## Coverage Diagnostics

O diagnóstico observa cobertura estrutural, não qualidade científica.

Pode sinalizar:
- corpus apoiado em uma única fonte;
- métodos ausentes;
- limitações ausentes;
- achados sem cobertura entre fontes;
- pouca interpretação registrada;
- fontes múltiplas ainda sem comparação.

Nenhum desses sinais é transformado em nota ou ranking de qualidade.

## Gateway v2

O contrato preparado para backend server-side passa a transportar relações confirmadas.

Regras:
1. consentimento externo continua obrigatório;
2. relações inválidas são descartadas ao montar o payload;
3. claims precisam citar `evidenceIds`;
4. `relationIds`, quando usados, também precisam existir no contexto enviado;
5. uma relação humana confirmada não autoriza o backend a criar evidência nova;
6. nenhuma API de IA é chamada pelo frontend nesta versão.

## Próximo passo seguro

O gateway executável só deve ser ativado depois de:
- autenticação;
- autorização por usuário/workspace;
- rate limiting;
- limites de tamanho do contexto;
- observabilidade sem registrar conteúdo sensível por padrão;
- timeout/cancelamento;
- política de retenção;
- structured output;
- validação de grounding no servidor e novamente no cliente.
