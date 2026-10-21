# Nosso Guia de Sabores — Design System & Regras de Produto
Versão 2.0 • Outubro de 2026

## Identidade visual
- Personalidade: diário gastronômico contemporâneo, editorial, acolhedor e sofisticado.
- Hierarquia: Playfair Display para títulos; DM Sans para interface e dados; números tabulares nas pontuações.
- Tema claro: fundo mineral #f5f6f1, papel #fffefd, tinta #202820, verde principal #38553f, acentos terracota #bb7157 e dourado #b58c51.
- Tema escuro: fundo floresta #18221b, cartões #242e26, texto #f1f4ee e verde-sálvia #adc5a5.
- Cartões: raio 12–24 px, borda de 1 px, sombra discreta, espaçamento modular, hierarquia editorial.
- Navegação: barra lateral desktop e seis destinos mobile. Interações reais e não decorativas.
- Acessibilidade: foco visível, rótulos associados, notificações ARIA para localização, redução de movimento, contraste e navegação por teclado.
- Nunca representar experiências, notas ou fotos fictícias como dados do casal.

## Regras matemáticas
Seis critérios: sabor 30%; atendimento 20%; ambiente 15%; custo-benefício 15%; apresentação 10%; experiência do casal 10%. Os pesos são configuráveis, inteiros, de 0 a 100, e somam sempre 100%.

- Nota de critério de 0 a 10 em intervalos de 0,5.
- Nota individual = soma das notas por critério multiplicadas por seus pesos.
- Nota oficial da visita = média das duas avaliações individuais completas.
- Nota do estabelecimento = média simples de suas visitas completas.
- Visitas rápidas ou avaliações incompletas ficam pendentes e não alteram o ranking oficial.
- Desempate: sabor, custo-benefício e visita completa mais recente.
- Nomes padrão: Fábio e Tássia delícia gostosa do Fábio. Preservar nomes personalizados já existentes.

## Faixas de classificação
| Faixa | Classificação | Cor conceitual |
|---|---|---|
| 9,00–10,00 | Imperdível | verde intenso |
| 8,00–8,99 | Excelente | verde |
| 7,00–7,99 | Muito bom | verde-azulado |
| 6,00–6,99 | Bom | ocre |
| 0,00–5,99 | A melhorar | terracota |
| Sem média completa | Pendente | neutro |

Não arredondar a média antes de determinar a faixa. As classificações comunicam a média, sem gerar pontuação adicional.

## Mapa e georreferenciamento
1. O usuário digita o endereço; a busca acontece após sair do campo ou ao salvar, não em cada tecla.
2. Latitude válida de -90 a 90; longitude de -180 a 180. Coordenadas manuais não podem ser substituídas sem ação explícita.
3. O resultado do geocodificador é apenas uma sugestão: permitir conferir no Google Maps antes de salvar.
4. Com chave do Google configurada, priorizar Geocoding API e oferecer Places Autocomplete New. Na ausência da chave, manter pesquisas pontuais OpenStreetMap/Nominatim.
5. Exibir mapa do Google se disponível; em erros da API, usar Leaflet/OpenStreetMap.
6. Cor mais intensa significa maior nota; locais sem média aparecem neutros. Exibir legenda textual.
7. Não implementar autocomplete sobre o Nominatim público; respeitar limites e atribuição do OpenStreetMap.
8. Sem backend, dados permanecem no dispositivo. Backup e importação JSON substituem a sincronização nesta versão.

## Integração oficial do Google Maps
A chave não fica no repositório, não é gerada pelo aplicativo e não é um segredo privado. O Google Cloud exige configuração pelo responsável:

1. Criar projeto Google Cloud e ativar faturamento.
2. Habilitar Maps JavaScript API, Geocoding API e Places API (New).
3. Criar chave para navegador, com restrições de referenciador HTTP ao domínio https://fhenriquefcruz.github.io/* e restrições às APIs utilizadas.
4. Configurar orçamentos e alertas de cobrança.
5. Inserir a chave restrita na tela de integração do aplicativo. Armazenar somente em sessionStorage, fora dos backups.
6. Manter modo OpenStreetMap para uso sem a chave.

Referências oficiais:
- https://developers.google.com/maps/documentation/javascript/geocoding
- https://developers.google.com/maps/documentation/javascript/place-autocomplete-new
- https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys
- https://operations.osmfoundation.org/policies/nominatim/

## Governança de qualidade
- Regras puras e testáveis em core.js. Sem divergência entre classificação e fórmula.
- Validar desktop, mobile, tema claro/escuro, exportação, importação, navegação e georreferenciamento.
- Não introduzir registros demonstrativos nos dados do usuário.
- Deleções e substituições exigem confirmação.
- Usar a API paga do Google apenas após configuração consciente, chave restrita e informação de custos.
