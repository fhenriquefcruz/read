# READ+ — Research Intelligence v6

## Objetivo

Transformar evidências já curadas pelo pesquisador em uma visão comparável e reutilizável sem permitir que o sistema invente uma conclusão científica.

## O que a v6 faz

### 1. Seleção explícita
O usuário decide quais itens do Evidence Board entram no recorte.

### 2. Evidence Matrix
Organiza cobertura por fonte e função da evidência:
- achado;
- método;
- limitação;
- definição;
- trecho.

A matriz não declara concordância, causalidade ou qualidade metodológica.

### 3. Grounded Brief
Gera um documento estrutural em que:
- o conteúdo da fonte é reproduzido a partir da evidência registrada;
- a interpretação do pesquisador aparece em camada separada;
- as fontes recebem índices rastreáveis;
- nenhuma inferência nova é criada.

### 4. Exportação
O Grounded Brief pode ser exportado como Markdown mantendo as referências.

## IA generativa

A IA generativa permanece desativada na v6.

O frontend contém apenas um contrato futuro de gateway. Ele exige:
- consentimento explícito;
- processamento server-side;
- evidências selecionadas;
- resposta estruturada;
- cada claim com IDs de evidência válidos.

Uma resposta que não consiga apontar quais evidências a sustentam deve ser recusada.

## Privacidade

Na v6:
- biblioteca, workspaces e evidências permanecem no IndexedDB;
- Grounded Brief é produzido no navegador;
- nenhum conteúdo privado é enviado para modelo externo;
- nenhuma API key de IA é necessária.

## Próxima evolução

Antes de ativar um modelo:
1. gateway autenticado;
2. rate limiting;
3. logs sem conteúdo sensível por padrão;
4. consentimento visível por execução;
5. política de retenção;
6. structured output;
7. validação de grounding;
8. testes de citações falsas, IDs ausentes e respostas parcialmente unsupported.
