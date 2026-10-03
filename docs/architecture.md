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
Item salvo com estado de leitura, tags, coleção, notas e timestamps.

#### Bibliographic interoperability
A biblioteca aceita três caminhos de entrada:
1. salvar um resultado normalizado da descoberta;
2. resolver um DOI nas fontes acadêmicas;
3. importar BibTeX, RIS ou CSL-JSON localmente.

Regras:
- DOI normalizado é a identidade preferencial para deduplicação;
- referências sem DOI recebem uma identidade local derivada do título;
- importação local recebe proveniência `Imported` e não simula métricas ausentes;
- resolução DOI tenta combinar OpenAlex e Crossref;
- falha de uma fonte não invalida metadata legítima obtida da outra;
- exportação individual ou em lote não inventa campos ausentes.

### Research workspace
Objeto persistente com pergunta/tema, consultas, filtros, trabalhos selecionados, notas e evidências.

#### Query provenance
Cada busca concluída em Discovery gera um `SearchHistoryEntry` local com:
- consulta bruta;
- filtros estruturados;
- quantidade de resultados daquele recorte;
- timestamp.

O workspace pode incorporar essa consulta como `WorkspaceQuery`, preservando o recorte que ajudou a formar o corpus. Workspaces legados com `queries: string[]` são normalizados em leitura sem apagar o banco.

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


## Interoperabilidade bibliográfica — v5

Formatos de entrada suportados:
- DOI;
- BibTeX;
- RIS;
- CSL-JSON.

Formatos de saída suportados:
- BibTeX;
- RIS;
- CSL-JSON.

Os parsers ficam no cliente porque operam apenas sobre arquivos/texto fornecidos pelo usuário e não exigem segredo. Resolução remota de DOI utiliza somente endpoints acadêmicos públicos já adotados pelo produto.

Coleções e tags continuam dados privados locais em IndexedDB nesta fase.


## Research Intelligence grounded — v6

A primeira camada de Research Intelligence é deliberadamente local e determinística.

### Evidence Matrix
A matriz é derivada exclusivamente de `WorkspaceEvidence` e cruza:
- fonte;
- achados;
- métodos;
- limitações;
- definições;
- trechos.

Ela mede **cobertura**, não concordância semântica. A existência de duas evidências em fontes diferentes não é apresentada como convergência científica.

### Grounded Brief
O brief preserva três fronteiras:
1. **Fonte** — conteúdo registrado pelo usuário como evidência;
2. **Interpretação** — leitura do pesquisador, mantida separada;
3. **Inferência** — não produzida automaticamente pela camada local.

Toda entrada do brief mantém o `evidenceId` e um índice de fonte recuperável. A exportação Markdown conserva essas referências.

### Contrato generativo futuro
`src/lib/intelligence-gateway.ts` define a fronteira que qualquer backend de IA deverá respeitar.

Regras bloqueantes:
- nenhum segredo no frontend;
- consentimento explícito antes de montar payload para processamento externo;
- o gateway recebe apenas as evidências selecionadas;
- cada claim de síntese ou inferência deve conter ao menos um `evidenceId`;
- IDs citados precisam pertencer ao contexto efetivamente enviado;
- respostas sem grounding são rejeitadas antes de chegar à UI.

A v6 **não instala provedor de modelo nem envia dados para terceiros**. Um backend futuro poderá usar streaming/structured output, mas somente depois de autenticação, rate limiting, observabilidade e política de privacidade estarem implementados.
