# READ+ — Auditoria Fases 0 e 1

Data: 2026-10-03

## Fonte da verdade analisada

Repositório público `fhenriquefcruz/read`, branch `main`, commit base `0f4eeb831879f02edafe44a4d0b4b9db0ff9ebc6`.

Arquivos existentes na raiz: `README.md`, `index.html`, `app.js`, `data.js`, `style.css`, `manifest.json`, `service-worker.js`, `js/main.js` e `js/background.js`.

A página publicada é servida por GitHub Pages. O `index.html` atual é autocontido e não referencia `app.js`, `data.js`, `style.css`, `manifest.json`, `service-worker.js` ou `js/main.js`. Portanto, boa parte do repositório é legado ou código morto em relação à produção atual.

## Divergências entre documentação, código e produção

### CRÍTICO

1. O README declara uma aplicação React 19 + TypeScript + Zustand + Zod + Vitest, mas o produto publicado é um arquivo HTML monolítico com CSS e JavaScript inline.
2. `js/main.js` contém uma chave de API do Google Books embutida no frontend.
3. `js/main.js` contém fallback para Sci-Hub.
4. `js/main.js` fabrica artigos e livros quando APIs falham, inclusive títulos, autores, datas e URLs sintéticas. Isso torna impossível distinguir evidência real de conteúdo artificial.
5. O service worker existe no repositório, mas não é registrado pelo `index.html`. O manifesto também não é referenciado. Portanto as afirmações de PWA/offline do README não correspondem à produção.
6. O service worker faz cache de arquivos que o produto atual não usa e possui fallback de navegação indiscriminado para `index.html`.

### ALTO

1. Há três implementações concorrentes de busca:
   - `index.html`: CORE como fonte principal e Crossref como fallback;
   - `js/main.js`: OpenAlex + CORE + Google Books + fallbacks artificiais;
   - `app.js` + `data.js`: busca apenas sobre dados estáticos de demonstração.
2. A API CORE v3 é chamada pelo browser sem autenticação. Essa integração não é adequada como dependência principal sem validação de política, CORS, autenticação e limites.
3. A produção usa estratégia de fallback sequencial por fonte, em vez de agregação/normalização/deduplicação.
4. O ranking é essencialmente o ranking retornado pelo provedor, com ordenações simples por data/citações no cliente.
5. PDFs são inferidos de campos frágeis. No legado, DOI e páginas de landing chegaram a ser tratados como se fossem PDF.
6. Citações ABNT/APA são geradas por concatenação simples de strings e podem produzir referências bibliograficamente incorretas.
7. Não há testes automatizados, typecheck, pipeline de CI ou quality gates reais.
8. Persistência descrita no README não corresponde à produção. A IndexedDB existe apenas no código legado não carregado.
9. A produção não possui biblioteca pessoal, workspace persistente, Zettelkasten funcional, detail view ou knowledge graph.

### MÉDIO

1. `index.html` concentra layout, design system parcial, rede, parsing, estado, filtros e renderização em mais de mil linhas.
2. Uso extensivo de `innerHTML`, `alert`, `confirm` e manipulação manual do DOM reduz testabilidade e acessibilidade.
3. Interface depende de emojis como ícones primários.
4. Dark/light theme é aplicado por mutação de variáveis inline, não por tokens consistentes.
5. Filtros de ano são estáticos.
6. Sugestões de pesquisa são um dicionário estático local.
7. Não há URL state, deep links, histórico reproduzível de pesquisa ou detalhes compartilháveis.
8. Não há política explícita para 429, Retry-After, circuit breaker por fonte ou telemetria de disponibilidade.

### BAIXO

1. Metadados do repositório estão incompletos (descrição, licença e tópicos).
2. README contém contatos e links fictícios/de exemplo.
3. Há nomes e slogans diferentes entre manifesto, README e interface.

## Segurança

- Chave do Google Books exposta no bundle legado: deve ser revogada/rotacionada no projeto Google correspondente e removida do histórico quando operacionalmente conveniente.
- Uso de `window.open` é parcialmente protegido por `noopener,noreferrer` na produção, mas sanitização de URL deve aceitar somente protocolos seguros e destinos válidos.
- Nenhum segredo deve ser incorporado em bundle frontend.
- APIs que exigem chave privada ou identidade da aplicação devem migrar para gateway server-side.
- CSP, Permissions-Policy e headers de segurança não podem ser plenamente impostos por HTML estático em GitHub Pages; serão tratados por arquitetura de hospedagem/gateway quando aplicável.

## APIs e estratégia

### OpenAlex
Escolhido como fonte acadêmica primária da primeira arquitetura porque oferece grafo de trabalhos, autores, fontes, instituições, tópicos, citações e localização Open Access. Uso sem chave é aceitável para desenvolvimento/baixo volume; escala real pede chave e controle de orçamento, portanto a arquitetura prevê gateway.

### Crossref
Escolhido como fonte de metadados e enriquecimento/deduplicação por DOI. Deve respeitar limites, caching e backoff. O modo público não exige segredo; o polite pool exige identificação.

### Semantic Scholar
Candidato para fase posterior, especialmente relações/citações e descoberta. Não será integrado no primeiro corte apenas para aumentar quantidade de fontes.

### Unpaywall
A busca foi aposentada em 18/09/2026 e o próprio serviço direciona pesquisa para OpenAlex. Consulta por DOI continua útil, mas não é necessária no primeiro corte porque OpenAlex já fornece OA/best_oa_location.

### Open Library
Útil para lookup de livros de baixo volume, mas a própria documentação não recomenda uso como backend de alto tráfego/comercial. Não será a fundação da biblioteca de livros.

### Google Books
Pode ser reintroduzido apenas por integração segura. A chave antiga não será reutilizada no frontend.

## Decisão de reconstrução

Migrar de HTML monolítico para React + TypeScript + Vite é justificável neste caso por testabilidade, componentização, tipagem de contratos externos, crescimento para workspace/biblioteca/detail view e necessidade de quality gates. Não serão usados Server Components nesta fase, pois o produto continua essencialmente client-side e o GitHub Pages permanece como frontend estático durante a transição.

## Limitação da auditoria neste ambiente

O código, histórico e configuração do repositório foram lidos via integração GitHub. O ambiente de execução desta sessão não possui resolução de rede para clonar o GitHub nem um navegador genérico conectado ao GitHub Pages, então console/network do site publicado não puderam ser capturados localmente. A validação executável será deslocada para CI/Playwright no próprio GitHub, com APIs mockadas para testes determinísticos e smoke de produção quando a nova aplicação estiver publicada.
