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

## Google Maps

Os links dos locais sempre abrem no Google Maps usando latitude e longitude. A visualização interativa padrão do painel usa OpenStreetMap/Leaflet, sem chave de API. Para substituir o painel cartográfico pelo **Google Maps JavaScript API**, abra **Mapa dos sabores → Usar Google Maps neste mapa** e forneça uma chave pública **restrita ao domínio de publicação**; configure antes faturamento e a API no Google Cloud. A chave fica só na sessão do navegador, não no código ou no backup. Nenhuma chave privada deve ser inserida.

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
