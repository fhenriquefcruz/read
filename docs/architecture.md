# READ+ — Arquitetura alvo

## Princípio de produto

A unidade central do READ+ deixa de ser o “resultado de busca” e passa a ser a **investigação**.

Fluxo principal:

`descobrir → filtrar → avaliar → ler → salvar → conectar → compreender → reutilizar`

## Arquitetura de produto

### Search / Discovery
- consulta simples e sintaxe avançada;
- filtros visuais equivalentes à sintaxe;
- agregação e normalização por provider;
- deduplicação por DOI/ID/título+autores+ano;
- ranking composto explicável;
- estados de disponibilidade por fonte;
- nenhum resultado artificial.

### Work detail
Entidade acadêmica canônica com título, autores, data, DOI, fonte, tipo, abstract, tópicos, citações, OA, links oficiais, PDF legítimo, licença e proveniência dos metadados.

### Library
Item salvo com estado de leitura, tags, coleções, notas e timestamps.

### Research workspace
Objeto persistente com pergunta/tema, consultas, filtros, trabalhos selecionados, notas e evidências.

### Knowledge
Notas atômicas com referências, `[[links internos]]`, backlinks e grafo derivado das relações reais.

## Arquitetura técnica

### Frontend
- React 19.3
- TypeScript 7
- Vite 8
- componentes funcionais e hooks
- design tokens CSS sem dependência obrigatória de framework visual
- IndexedDB para dados do usuário
- service worker próprio e pequeno para app shell + conteúdo local; buscas continuam explicitamente online

### Search domain
`SearchProvider` padroniza provedores externos para `AcademicWork`.

Primeiro corte:
1. OpenAlex: fonte primária.
2. Crossref: complementar/enriquecimento e resiliência.

Providers futuros entram somente quando agregarem informação não redundante.

### Gateway futuro
Quando uma integração exigir segredo, quota por aplicação, IA ou políticas de origem, o frontend chamará um gateway server-side. O gateway será responsável por:
- segredos;
- rate limiting;
- cache compartilhado;
- retries/backoff;
- observabilidade;
- proteção contra abuso;
- política de provedores.

Até essa fase, apenas endpoints que funcionem legitimamente sem segredo podem ser acessados pelo browser.

## Ranking v1

Score determinístico composto por:
- match lexical do título;
- match no abstract/tópicos;
- qualidade/completude de metadados;
- disponibilidade Open Access;
- citações normalizadas por idade;
- recência com peso moderado.

O score é usado apenas para reordenar o conjunto agregado e nunca inventa relevância sem dados.

## Persistência

Stores IndexedDB:
- `library`
- `workspaces`
- `notes`
- `settings`
- `search_history`
- `metadata_cache`

Migração será versionada e nunca apagará o banco automaticamente para resolver VersionError.

## PWA

- cache do app shell com versão;
- stale-while-revalidate somente para assets estáticos;
- network-only para buscas;
- metadados previamente acessados podem ser apresentados como cache explicitamente identificado;
- offline nunca simula sucesso de fonte remota.

## Quality gates

Pull requests devem validar:
1. lint;
2. typecheck;
3. unit;
4. integração;
5. build;
6. E2E;
7. acessibilidade automatizada;
8. smoke dos fluxos principais.

Performance e smoke de produção entram como gates bloqueantes antes do merge de release.
