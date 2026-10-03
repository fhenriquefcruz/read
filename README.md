# READ+

**READ+** é uma plataforma para descoberta, organização, leitura e exploração de conhecimento científico e acadêmico.

A jornada de produto é:

**descobrir → filtrar → avaliar → ler → salvar → conectar → compreender → reutilizar**

## Estado do produto

A reconstrução v3 substituiu a aplicação monolítica antiga por uma base React + TypeScript com busca acadêmica real, persistência local, PWA e quality gates.

A rodada **Research Depth (v4)** aprofunda essa base para que uma busca evolua para investigação:

- literatura relacionada navegável;
- referências e trabalhos citantes;
- exportação bibliográfica interoperável;
- workspace com evidências vinculadas às fontes;
- separação explícita entre conteúdo da fonte e interpretação do pesquisador.

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
- busca e filtros locais.

### Research workspace
- pesquisas persistentes;
- pergunta central;
- corpus formado a partir da biblioteca;
- Evidence Board;
- evidências classificadas como achado, método, limitação, definição ou trecho;
- origem preservada por trabalho/título/DOI;
- separação entre evidência da fonte e interpretação do usuário;
- proteção para evitar remover do corpus uma fonte ainda usada por evidências.

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
- 🔄 Fase 7 — biblioteca
- 🔄 Fase 8 — workspace de pesquisa
- 🔄 Fase 9 — Zettelkasten / knowledge graph
- ⏳ Fase 10 — Research Intelligence
- ✅ Fase 11 — PWA / offline v1
- ✅ Fase 12 — segurança baseline
- ✅ Fase 13 — testes / quality gates
- ✅ Fase 14 — pipeline de produção

## Próximas prioridades

1. importação de referências por DOI/ISBN e formatos bibliográficos;
2. coleções e tags mais fortes na biblioteca;
3. consultas e filtros persistidos por pesquisa;
4. síntese de evidências baseada exclusivamente no Evidence Board e nas fontes vinculadas;
5. gateway server-side antes de qualquer integração que exija segredo ou IA.
