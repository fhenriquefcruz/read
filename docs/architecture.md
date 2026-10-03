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

O detalhe também funciona como ponto de exploração do grafo OpenAlex:
- `referenced_works` → literatura citada pelo trabalho;
- filtro `cites:<OpenAlex ID>` → trabalhos que citam o estudo;
- `related_works` → literatura relacionada;
- navegação entre nós sem fabricar relações;
- falha do grafo é tratada separadamente da validade dos metadados do trabalho.

Exportações locais suportadas:
- BibTeX;
- RIS;
- CSL-JSON.

A serialização não inventa volume, número, páginas ou decomposição de nomes quando esses campos não existem no modelo canônico.

### Library
Item salvo com estado de leitura, tags, coleções, notas e timestamps.

### Research workspace
Objeto persistente com pergunta/tema, consultas, filtros, trabalhos selecionados, notas e evidências.

#### Evidence model
Cada `WorkspaceEvidence` mantém:
- identificador próprio;
- vínculo com o trabalho da biblioteca;
- snapshot de título e DOI para preservar a origem;
- tipo da evidência;
- trecho/achado atribuído à fonte;
- interpretação separada do usuário;
- timestamp.

Essa separação é uma invariável arquitetural: **conteúdo da fonte não pode ser confundido com interpretação ou síntese**.

Uma fonte que sustenta evidências não pode ser retirada silenciosamente do corpus. O vínculo deve ser removido somente depois que as evidências dependentes forem tratadas.

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


## Research Intelligence — pré-condições

A camada de IA continua deliberadamente fora do frontend atual.

Quando for implementada, deverá:
1. consumir evidências e metadados com IDs de origem;
2. produzir cada afirmação com referências recuperáveis;
3. diferenciar extração, síntese e inferência;
4. nunca converter ausência de metadado em dado inventado;
5. não enviar biblioteca/notas privadas para serviço externo sem consentimento e arquitetura server-side;
6. permitir reconstruir quais fontes sustentaram cada resposta.

O Evidence Board da v4 existe justamente para criar essa fundação antes da IA.
