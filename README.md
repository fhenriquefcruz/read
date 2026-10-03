# READ+

**Pesquisa que vira conhecimento.**

READ+ está sendo reconstruído como uma plataforma de descoberta acadêmica, biblioteca científica, workspace de pesquisa e conhecimento conectado.

A proposta não é apenas encontrar artigos. A jornada de produto é:

**descobrir → filtrar → avaliar → ler → salvar → conectar → compreender → reutilizar**

## Estado atual

A reconstrução v3 substitui a antiga implementação monolítica em HTML/JavaScript por uma base tipada, testável e evolutiva.

Implementado nesta fase:

- busca acadêmica agregada com **OpenAlex + Crossref**;
- normalização para uma entidade acadêmica única;
- deduplicação priorizando DOI;
- sintaxe de busca avançada e filtros visuais;
- ranking composto e explicável;
- proveniência dos metadados;
- estado explícito de disponibilidade de cada fonte;
- visualização detalhada do trabalho;
- links oficiais e PDF somente quando a fonte realmente os fornece;
- biblioteca pessoal persistida em IndexedDB;
- estados de leitura e notas de biblioteca;
- workspaces de pesquisa;
- notas atômicas com `[[links internos]]`;
- backlinks e knowledge graph derivados das relações reais;
- light/dark mode;
- layout responsivo;
- PWA com app shell offline;
- testes unitários, E2E e acessibilidade automatizada;
- CI com quality gates.

## Integridade acadêmica

READ+ **não fabrica artigos, autores, datas, PDFs ou resultados de fallback**.

Quando uma fonte externa está indisponível, a interface informa a indisponibilidade. Uma falha de rede nunca é mascarada com conteúdo fictício.

O projeto não usa Sci-Hub ou mecanismo equivalente.

## Fontes acadêmicas

### OpenAlex

Fonte primária de descoberta, metadados acadêmicos, autores, instituições, tópicos, citações e localizações Open Access.

### Crossref

Fonte complementar para DOI, publicação, autores, editora, links e enriquecimento/deduplicação.

Outros provedores só serão incorporados quando agregarem cobertura ou dados que justifiquem a complexidade operacional e jurídica.

## Busca avançada

Exemplos:

```text
"machine learning" education
author:"Daniel Kahneman"
year:2020-2026
type:article
open_access:true
language:pt
```

Os mesmos critérios podem ser construídos pelos controles visuais.

## Arquitetura

- React 19
- TypeScript
- Vite
- IndexedDB
- Service Worker
- OpenAlex + Crossref
- Vitest
- Playwright
- Axe
- Biome
- GitHub Actions
- GitHub Pages no frontend atual

APIs que exijam segredo, quota por aplicação, IA ou controle centralizado não devem ser chamadas diretamente pelo browser. Para essas integrações, a arquitetura prevê um gateway server-side.

## Desenvolvimento

Requer Node.js 24+.

```bash
npm install
npm run dev
```

Validação:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Ou:

```bash
npm run validate
```

## PWA e offline

Offline cobre o **app shell e dados pessoais armazenados localmente**. Buscas acadêmicas continuam sendo operações online.

O READ+ nunca apresenta uma busca remota como bem-sucedida quando o dispositivo está offline.

## Privacidade

Biblioteca, workspaces e notas permanecem no IndexedDB do navegador nesta fase. Não há conta ou sincronização em nuvem ainda.

Nenhum documento privado é enviado para modelo de IA.

## Segurança

- nenhum segredo novo deve ficar no bundle frontend;
- integrações com credencial protegida devem passar por camada server-side;
- dependências passam por auditoria no CI;
- a antiga credencial de Google Books encontrada no legado foi removida da árvore ativa e deve ser rotacionada no provedor.

Veja [docs/audit-phase-0-1.md](docs/audit-phase-0-1.md) e [docs/architecture.md](docs/architecture.md).

## Status das fases

| Fase | Estado |
| --- | --- |
| 0 — descoberta | concluída |
| 1 — auditoria | concluída |
| 2 — arquitetura de produto | concluída |
| 3 — arquitetura técnica | concluída |
| 4 — fundações/design system | em validação |
| 5 — motor de busca | em validação |
| 6 — descoberta acadêmica | primeira entrega implementada |
| 7 — biblioteca | primeira entrega implementada |
| 8 — workspace de pesquisa | primeira entrega implementada |
| 9 — Zettelkasten/knowledge graph | primeira entrega implementada |
| 10 — IA contextual | não iniciada; só entrará com grounding e arquitetura server-side |
| 11 — PWA/offline | primeira entrega implementada |
| 12 — segurança | em andamento |
| 13 — testes/qualidade | em andamento |
| 14 — produção | pendente dos gates |

## Princípio de evolução

Funcionalidades não entram por quantidade. Cada nova capacidade precisa resolver um problema real da jornada de pesquisa e justificar custo de manutenção, privacidade, segurança e complexidade.
