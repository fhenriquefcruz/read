# READ+

**READ+** é uma plataforma para descoberta, organização, leitura e exploração de conhecimento científico e acadêmico.

A jornada de produto é:

**descobrir → filtrar → avaliar → ler → salvar → conectar → compreender → reutilizar**

## Estado do produto

A reconstrução v3 substituiu a aplicação monolítica antiga por uma base React + TypeScript com busca acadêmica real, persistência local, PWA e quality gates.

A rodada **Research Depth (v4)** aprofundou a base para que uma busca evolua para investigação.

A rodada **Library & Research Workflow (v5)** fecha o fluxo entre descoberta, biblioteca e pesquisa:

- importação por DOI com enriquecimento OpenAlex + Crossref;
- importação local de BibTeX, RIS e CSL-JSON;
- deduplicação por identidade bibliográfica;
- coleções e tags persistentes;
- exportação bibliográfica em lote;
- histórico de buscas com filtros;
- consultas anexadas a pesquisas com o recorte original preservado.

A rodada **Research Intelligence Grounded (v6)** inicia inteligência sobre o corpus sem depender de IA externa:

- seleção explícita das evidências que entram na análise;
- Evidence Matrix por fonte e tipo de evidência;
- Grounded Brief com fonte e interpretação visualmente separadas;
- exportação do brief em Markdown;
- zero inferências automáticas na camada local;
- contrato server-side futuro que rejeita claims sem citations por ID de evidência;
- processamento externo bloqueado sem consentimento explícito.

A rodada **Research Intelligence Comparative (v7)** aprofunda a análise sem terceirizar julgamento científico:

- pares comparáveis são sugeridos somente entre evidências do mesmo tipo e fontes diferentes;
- convergência, divergência, qualificação e contexto exigem classificação explícita do pesquisador;
- relações ficam persistidas com os dois `evidenceIds`;
- Coverage Diagnostics identifica lacunas estruturais sem produzir uma nota de qualidade científica;
- relatório de diagnóstico exportável em Markdown;
- gateway v2 transporta evidências e relações confirmadas e rejeita citations para IDs inexistentes.

A rodada **Secure Intelligence Gateway (v8)** cria a fronteira server-side real, mantendo a geração externa desligada por padrão:

- Vercel Functions em `/api/health` e `/api/intelligence`;
- integração com Vercel AI Gateway por structured output;
- nenhum segredo no bundle do GitHub Pages;
- allowlist de origem e autenticação por chave de sessão não persistida;
- consentimento explícito por execução;
- limites rígidos de payload, evidências, relações e claims;
- validação de grounding no servidor e novamente no navegador;
- fail-closed se gateway, modelo, autenticação ou ativação estiverem ausentes;
- CI passa a auditar também o código em `api/`.

Documentação:
- [Auditoria — Fases 0 e 1](docs/audit-phase-0-1.md)
- [Arquitetura](docs/architecture.md)

## Stack atual

- React 19.3
- TypeScript 7
- Vite 8
- IndexedDB
- Vitest
- Playwright
- Biome
- PWA com service worker próprio
- GitHub Actions com quality, E2E, acessibilidade, offline e Lighthouse gates

O frontend continua estático nesta etapa para preservar o GitHub Pages. Integrações que exijam segredo, quota privada, identidade da aplicação ou IA devem passar por uma camada server-side.

## Funcionalidades implementadas

### Academic Discovery Engine
- OpenAlex + Crossref;
- normalização em uma entidade acadêmica comum;
- deduplicação por DOI e chave bibliográfica;
- filtros visuais e sintaxe avançada;
- ranking composto e explicável;
- estado dos provedores explícito;
- nenhum artigo ou PDF artificial.

### Exploração acadêmica
- detalhe completo do trabalho;
- referências citadas pelo trabalho;
- trabalhos recentes que citam o estudo;
- literatura relacionada pelo grafo OpenAlex;
- navegação contínua entre trabalhos;
- autores, afiliações e ORCID quando disponíveis;
- fonte oficial e PDF Open Access legítimo quando disponível;
- exportação BibTeX, RIS e CSL-JSON.

### Biblioteca
- persistência em IndexedDB;
- status de leitura;
- notas;
- busca e filtros locais;
- importação por DOI;
- importação BibTeX, RIS e CSL-JSON;
- prevenção de duplicatas;
- coleções livres;
- tags editáveis;
- seleção múltipla;
- exportação em lote em BibTeX, RIS e CSL-JSON.

### Research workspace
- pesquisas persistentes;
- pergunta central;
- corpus formado a partir da biblioteca;
- histórico de consultas capturado na descoberta;
- consultas com filtros e contagem do recorte preservadas na pesquisa;
- compatibilidade com workspaces antigos que armazenavam consultas como strings;
- Evidence Board;
- evidências classificadas como achado, método, limitação, definição ou trecho;
- origem preservada por trabalho/título/DOI;
- separação entre evidência da fonte e interpretação do usuário;
- proteção para evitar remover do corpus uma fonte ainda usada por evidências.

### Research Intelligence
- Evidence Matrix derivada somente do Evidence Board;
- Grounded Brief local e determinístico;
- citations clicáveis para retornar ao trabalho de origem;
- interpretações do usuário preservadas como camada distinta;
- Comparison Board com classificação humana auditável;
- relações persistidas como convergência, divergência, qualificação ou contexto;
- Coverage Diagnostics para lacunas de fonte, método, limitações, comparação e interpretação;
- exportação Markdown do brief e do diagnóstico;
- nenhuma inferência científica automática;
- gateway v2 condicionado a server-side, consentimento e grounding obrigatório;
- cliente generativo opt-in preparado para endpoint Vercel;
- chave de acesso mantida apenas em memória durante a sessão;
- gateway externo desativado quando a URL pública não está configurada.

### Conhecimento conectado
- notas atômicas;
- `[[links internos]]`;
- backlinks;
- grafo derivado das relações entre notas.

### PWA / offline
- app shell cacheado;
- assets locais disponíveis offline após instalação/cache;
- chamadas acadêmicas permanecem network-only;
- nenhuma busca remota é simulada quando a rede está indisponível.

## Desenvolvimento

```bash
npm install
npm run dev
```

Validação:

```bash
npm run validate
npm run test:e2e
```

## GitHub Pages

O Vite usa `base: /read/`.

Produção:

https://fhenriquefcruz.github.io/read/

## Princípios de integridade

- nunca inventar artigos, autores, métricas, relações ou PDFs;
- nunca usar Sci-Hub ou equivalentes;
- deixar indisponibilidade de fonte explícita;
- nenhum segredo real no bundle;
- links externos limitados a protocolos seguros;
- exportação bibliográfica preserva o que os metadados realmente fornecem;
- Research Intelligence só poderá usar literatura com grounding e rastreabilidade;
- fonte, síntese e inferência devem ser representadas como camadas distintas.

## Fases

- ✅ Fase 0 — descoberta
- ✅ Fase 1 — auditoria
- ✅ Fase 2 — arquitetura de produto
- ✅ Fase 3 — arquitetura técnica
- ✅ Fase 4 — fundações / design system
- ✅ Fase 5 — motor de busca v1
- 🔄 Fase 6 — descoberta acadêmica
- ✅ Fase 7 — biblioteca interoperável v1
- ✅ Fase 8 — workspace de pesquisa v1
- 🔄 Fase 9 — Zettelkasten / knowledge graph
- 🔄 Fase 10 — Research Intelligence grounded/comparative v2
- ✅ Fase 11 — PWA / offline v1
- ✅ Fase 12 — segurança baseline
- ✅ Fase 13 — testes / quality gates
- ✅ Fase 14 — pipeline de produção

## Próximas prioridades

1. reexecução de consultas preservadas diretamente a partir do workspace;
2. criar/vincular o projeto Vercel do gateway e configurar WAF/rate limiting/budgets;
3. ativar a síntese generativa opt-in somente após os controles de abuso;
4. migrar do token compartilhado de piloto para autenticação individual quando houver contas;
5. comparação semântica assistida somente como sugestão, nunca como conclusão automática;
6. importação por ISBN e melhorias adicionais de matching bibliográfico.
