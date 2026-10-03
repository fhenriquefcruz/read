# READ+

**READ+** é uma plataforma para descoberta, organização e exploração de conhecimento científico e acadêmico.

A jornada de produto é:

**descobrir → filtrar → avaliar → ler → salvar → conectar → compreender → reutilizar**

## Reconstrução v3

A reconstrução está sendo desenvolvida em `rebuild/readplus-platform-v3`.

A auditoria encontrou divergências entre documentação e produção, código legado duplicado, uma chave de Google Books exposta no frontend antigo, fallbacks artificiais e referência a Sci-Hub. Esses mecanismos não fazem parte da nova base.

- [Auditoria — Fases 0 e 1](docs/audit-phase-0-1.md)
- [Arquitetura alvo](docs/architecture.md)

## Stack atual

- React 19.3
- TypeScript 7
- Vite 8
- IndexedDB
- Vitest
- Playwright
- Biome
- PWA com service worker próprio

O frontend continua estático nesta etapa para preservar o GitHub Pages. Integrações que exijam segredo, quota de aplicação ou IA devem passar por uma camada server-side.

## Já implementado

### Academic Discovery Engine
- OpenAlex + Crossref;
- normalização em uma entidade acadêmica comum;
- deduplicação por DOI e chave bibliográfica;
- filtros visuais e sintaxe avançada;
- ranking composto;
- estado dos provedores explícito;
- nenhum artigo/PDF artificial.

### Biblioteca
- persistência em IndexedDB;
- status de leitura;
- notas;
- busca e filtros locais.

### Research workspace
- pesquisas persistentes;
- pergunta central;
- corpus formado a partir da biblioteca.

### Conhecimento conectado
- notas atômicas;
- `[[links internos]]`;
- backlinks;
- grafo derivado das relações entre notas.

### PWA
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

Produção atual:

https://fhenriquefcruz.github.io/read/

## Princípios de integridade

- nunca inventar artigos, autores, métricas ou PDFs;
- nunca usar Sci-Hub ou equivalentes;
- deixar indisponibilidade de fonte explícita;
- nenhum segredo real no bundle;
- links externos limitados a protocolos seguros;
- Research Intelligence, quando implementada, deve separar fonte, síntese e inferência e manter rastreabilidade.

## Fases

- ✅ Fase 0 — descoberta
- ✅ Fase 1 — auditoria
- ✅ Fase 2 — arquitetura de produto
- ✅ Fase 3 — arquitetura técnica
- 🔄 Fase 4 — fundações / design system
- 🔄 Fase 5 — motor de busca
- 🔄 Fase 6 — descoberta acadêmica
- 🔄 Fase 7 — biblioteca
- 🔄 Fase 8 — workspace
- 🔄 Fase 9 — Zettelkasten / knowledge graph
- ⏳ Fase 10 — Research Intelligence
- 🔄 Fase 11 — PWA / offline
- 🔄 Fase 12 — segurança
- 🔄 Fase 13 — testes / qualidade
- ⏳ Fase 14 — produção
