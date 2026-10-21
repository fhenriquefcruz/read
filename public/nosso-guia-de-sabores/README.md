# Nosso Guia de Sabores

**Dois paladares, uma coleção de experiências.**

Aplicativo independente, sem backend e com dados reais inicialmente vazios, servido por GitHub Pages.

## Acesso

- Caminho principal: `https://fhenriquefcruz.github.io/read/nosso-guia-de-sabores/`
- Caminho alternativo (publicação padrão do GitHub Pages): `https://fhenriquefcruz.github.io/read/public/nosso-guia-de-sabores/`

A configuração original do READ+ utiliza Vite para enviar os conteúdos da pasta `public/` diretamente à raiz do artefato de publicação. Se o Pages estiver publicando a raiz do repositório por Jekyll, o caminho principal redireciona para `/public/nosso-guia-de-sabores/`. Isso não altera a aplicação READ+.

## O que funciona

- Cadastro de dois participantes e pesos configuráveis (soma de 100%).
- Cadastro de estabelecimentos, visitas, notas individuais (seis critérios, de 0,5 em 0,5).
- Registro rápido sem inclusão indevida no ranking.
- Ranking oficial por notas ponderadas completas; várias visitas do mesmo estabelecimento.
- Histórico editável, comparação individual, filtros, favoritos e desejos.
- Fotos comprimidas e armazenadas localmente.
- Persistência por IndexedDB (com alternativa localStorage), exportação/importação JSON validada.
- Interface responsiva com tema claro e escuro.
- Mapa georreferenciado colorido conforme a nota: pontos mais escuros indicam avaliação melhor; locais pendentes ficam em cinza.
- Geocodificação automática ao preencher o endereço e sair do campo: latitude e longitude aparecem sem precisar clicar em um botão. O resultado é uma sugestão e pode ser conferido no Google Maps ou ajustado manualmente. Para reduzir requisições, a busca só ocorre após concluir o campo, não a cada tecla.
- Nomes padrão dos participantes: **Fábio** e **Tássia delícia gostosa do Fábio**. Registros anteriores com nomes personalizados são preservados.

## Design e regras v2

O sistema visual ganhou identidade editorial com temas mineral/floresta, tipografia hierarquizada, cartões refinados, navegação responsiva e indicadores por faixas de notas. A metodologia de pontuação agora apresenta: **Imperdível (9–10)**, **Excelente (8–8,99)**, **Muito bom (7–7,99)**, **Bom (6–6,99)** e **A melhorar (0–5,99)**; sem duas avaliações completas fica **Pendente**. As faixas não alteram a fórmula do ranking. Confira [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

## Google Maps

Os links dos estabelecimentos abrem no Google Maps diretamente, sem necessidade de chave. O mapa padrão usa **OpenStreetMap/Leaflet**, sem custo de API Google.

Uma chave **restrita para navegador** habilita recursos da plataforma oficial:

- **Google Maps JavaScript API:** mapa Google integrado ao painel.
- **Geocoding API:** transformação do endereço informado em latitude e longitude.
- **Places API (New):** busca de restaurantes, cafés e estabelecimentos com sugestões do Google, preenchendo endereço, localização e nome quando selecionado.

**Para ativar:** no [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/credentials), crie projeto com faturamento, habilite as três APIs, crie uma chave com restrição de **sites** permitindo apenas `https://fhenriquefcruz.github.io/*`, limite as APIs e configure alertas de orçamento. Em **Mapa → Integrar Google Maps API** (ou no formulário de experiência), informe a chave. Uma nova abertura da página ativa a integração. A chave é retida **somente em sessionStorage**, não no repositório nem no backup. Chaves de navegador são visíveis na rede e por isso devem ser **restritas**, não tratadas como segredo. O Google Maps pode gerar cobrança.

Se uma chave não estiver configurada ou o serviço Google falhar, a experiência básica continua funcionando pelo OpenStreetMap. A busca do Nominatim ocorre só após o usuário concluir a digitação, não oferece autocomplete em tempo real e está sujeita à [política pública](https://operations.osmfoundation.org/policies/nominatim/).

## Integridade e privacidade

Não são geradas notas fictícias. Somente visitas avaliadas pelos dois entram no ranking. O geocodificador retorna sugestões, não posições garantidas: confirme a localização. O armazenamento local **não sincroniza** os dois telefones. Para usar os registros no outro aparelho, exporte e importe o JSON; ao importar, os registros locais existentes são substituídos após confirmação. Backups contêm avaliações, textos, localizações e fotos, portanto guarde-os com cuidado.

## Fórmula

`nota_individual = Σ(nota_criterio × peso_percentual / 100)`

`nota_visita = (nota_individual_A + nota_individual_B) / 2`

`nota_estabelecimento = média(notas_das_visitas_completas)`

Desempates: sabor, custo-benefício e visita completa mais recente. A concordância exibida é uma métrica descritiva `(1 - abs(nota_A - nota_B)/10) × 100%`, não uma inferência estatística.

## Arquivos

- `index.html` — marcação semântica e navegação.
- `styles.css` — tema premium, mapas e layout mobile.
- `core.js` — regras puras e validação.
- `app.js` — componentes, formulários, persistência e visualização cartográfica.

## Próximas melhorias

Sync opcional via Supabase/Firebase e autenticação, geocodificação com provedor escalável e consentimento, testes automatizados ampliados e métricas de evolução por período.

**Atenção:** o projeto está inserido como subaplicação independente no repositório `read` por limitação das ações GitHub disponíveis. Ele pode ser migrado integralmente para um repositório próprio sem alterar seu armazenamento local, mas o backup JSON deve ser transferido caso a origem/domínio mude.
