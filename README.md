# Legado — galeria de histórias

Um museu 3D no navegador (three.js r186, WebGPU com fallback WebGL2) onde cada personagem da história do Brasil ganha seu próprio nicho. O site publicado abre direto no escritório de **Machado de Assis**.

- Celular: arraste para olhar, pinça com dois dedos para avançar.
- Computador: arraste para olhar, W A S D ou roda do mouse para andar.
- `?tour` mostra o corredor inteiro; `?set=aleijadinho` ou `?set=reboucas` abre os outros sets (em construção); `?editar` liga o painel de posições dos objetos.
- Licenças: código MIT (`LICENSE`); assets em `CREDITS.md`.

---
# Legado — galeria noturna

Galeria infinita em three.js com acabamento cartoon suave: mármore claro, veludo vinho, cerâmica azul-petróleo, ouro acetinado e luz noturna. Os nichos permanecem livres para futuros personagens e seus sets.

## Executar

```powershell
cd D:\ProjectGames\galeria-legado
npm run dev
```

Abra http://localhost:5186. Para celular na mesma rede, use o endereço IPv4 do computador e a porta 5186. WebGL2 é o fallback para navegadores sem WebGPU. `npm run build` gera os arquivos estáticos em `dist/`.

## Versão noturna

- Centros dos módulos separados por **12 metros**, antes 8 metros: 50% mais distância, mantendo o tamanho dos nichos.
- **11 módulos residentes**, cobrindo um percurso maior com menos instâncias.
- Tapete vermelho vinho contínuo, com bordados e bordas douradas, sobre mármore claro.
- Sombreamento toon suave nos arcos, madeira, folhagem e estofados; materiais polidos em metal e cerâmica.
- Noite azulada nas claraboias e no horizonte, lustres de globos e luz indireta quente.
- Novos assets próprios: poltronas, lustres de dois aros, luminárias de piso, vasos com ramos, esculturas de esfera armilar em pedestais e cordões de veludo.
- Planta CC0 reinterpretada com materiais estilizados: **62.180 bytes**, sem mapas fotográficos e compartilhada por instâncias.
- Luz rebatida periódica no shader, duas luzes pontuais próximas e uma direcional com sombras. Não é criada uma luz real para cada módulo.

## Controles

- **Percorrer a galeria**: recolher a apresentação e passear.
- **Arrastar**: olhar ao redor com mouse ou toque.
- **Espaço / pausa**: parar ou continuar.
- **Velocidade**: 1×, 1,6× e 0,6×.
- **H**: ocultar/mostrar interface. **Esc**: restaurar interface e centralizar a visão.
- **Setas**: ajustar a direção da câmera.
- `?clean`: entrar com interface recolhida.
- `?quality=low`: modo leve sem bloom; `?webgl`: forçar WebGL2; `?dpr=1`: fixar resolução para medir.

## Código e assets

- `src/gallery/main.js`: luz, câmera, carregamento progressivo e controles.
- `src/gallery/Gallery.js`: arquitetura, materiais, novos assets e reciclagem dos módulos.
- `src/gallery/style.css`: interface responsiva.
- `src/core/Engine.js` e `src/render/Pipeline.js`: sistemas do laboratório.
- `public/models/gallery-plant-stylized.glb`: única malha externa carregada, Poly Haven / CC0.
- `stylize-asset.mjs`: remoção dos materiais fotográficos e compressão Meshopt da planta.
- `CREDITS.md`: licenças e origem.
- `versions/day-v1`: código e assets empacotados da versão diurna, preservados fora da publicação.

Todos os demais assets são geometria e texturas próprias geradas localmente. A versão noturna não carrega mapas PBR fotográficos nem depende de CDN. Para reexecutar `stylize-asset.mjs`, a entrada original otimizada está em `versions/day-v1/public/models/gallery-plant.glb`.

## Reciclagem e futuros personagens

A câmera permanece perto da origem. Somente **11 módulos de 12 m** ficam residentes; os trechos são reutilizados conforme o passeio avança. A distância não aumenta o número de geometrias, texturas ou objetos residentes. A planta é carregada depois da arquitetura.

`gallery.slots` contém os índices lógicos visíveis. Os futuros personagens podem ser associados ao índice lógico e lado, usando um catálogo cíclico e cache limitado. Centros dos nichos: x = ±6,4 m, y = 0,18 m, z = posição do módulo. O carregador dos personagens ainda não faz parte desta etapa.

## Validação

`validate.mjs` verifica controles, continuidade da transição entre módulos de 12 m, avanço simulado de 10 km, estabilidade dos contadores de recursos, WebGL2 e viewport móvel. Resultado: `validation-night.json`. Capturas feitas pelo `snap.mjs` do laboratório e abertas para inspeção visual.

O modo móvel limita a resolução e desliga bloom. A emulação de viewport não substitui teste em celular físico.

## Arquitetura reforçada

Claraboias removidas. Paredes contínuas de 1,10 m de espessura com vãos arqueados, portais profundos, pilastras com bases e capitéis, lambris e painéis em relevo. Tesouras e vigas de madeira engrossadas, textura própria de veios e nós, ferragens nos encontros. Vasos recentrados pela caixa do modelo e reposicionados com folga para as paredes. Validação geométrica de 44 plantas antes e depois de 10 km: check-clearance.mjs / validation-architecture.json. A versão anterior foi preservada em versions/night-v2/Gallery.js.

## Sets alternados e iluminação de exposição

Sofás, mesas/pedestais e esculturas sobre eles removidos. A ala direita é deslocada em 6 metros, metade do módulo, em relação à esquerda, incluindo paredes, vasos e luminárias. Os painéis foram substituídos por azulejaria própria em azul, branco e ocre, com motivos botânicos. A luz geral e os lustres foram reduzidos; spots próximos da altura dos olhos e preenchimento quente nos nichos concentram a luz na exposição. Relatório de folga dos vasos atualizado em validation-alternating.json.

## Controles de iluminação

O botão de sol na barra inferior abre o painel Iluminação. Luminosidade: 20% a 150%. Altura das luzes: 1 a 7 metros, com ajuste ao vivo. Salvar ajustes guarda os valores no localStorage deste navegador; eles voltam ao recarregar. Restaurar padrão retorna a 100% e 5,35 m; clique em salvar para guardar esse retorno. Os lustres foram baixados 45 cm, com hastes alongadas. Teste de persistência, aplicação às luzes e layout móvel: test-lighting.mjs.

## Cena sem vegetação e iluminação por altura

Removidas todas as plantas, vasos decorativos e luminárias de piso. O aplicativo não carrega mais modelos externos. Lâmpadas emissivas ficam em 100%, independentemente do ajuste de luminosidade do ambiente. Nas superfícies, a luz recebida acima da linha das vigas (aprox. 5,45 m) é reduzida para 40%; abaixo permanece em 100%. A escala é aplicada à iluminação calculada antes da névoa e do tone mapping. O painel informa essa distribuição e continua salvando luminosidade do ambiente e altura das luzes. A nova configuração inicia o ambiente em 100%, preservando a altura salva na configuração anterior.

## Assets curados e câmera livre

Esculturas de bronze de arraia e baleia, cerâmica antiga azul/branca e lustre clássico de seis braços: modelos CC0 da Poly Haven (fontes em CREDITS.md). Originais em asset-source/curated, versões otimizadas em public/models/curated (aprox. 500 KB ao todo, WebP 512 px + Meshopt). CuratedAssets.js carrega progressivamente e desenha cópias por instâncias. As peças decorativas alternam por índice lógico entre os sets, com limites de largura para liberar o tapete e as paredes. O lustre importado termina a cerca de 3,85 m do chão, com suspensão alongada.

Câmera sem limite horizontal: arraste ou use as setas. Botão ↶ / tecla B gira 180 graus. Esc centraliza novamente. Para manter a galeria contínua em ambas as direções, o anel agora mantém 19 módulos residentes, com 9 atrás da câmera. Testes: test-curated.mjs / validation-curated.json (folgas, olhar para trás, arrasto, 10 km, WebGL2 e viewport móvel).

## Madeira rústica importada

As peças lisas da cobertura foram substituídas por um asset real de madeira, adaptado do kit Modular Wooden Pier (Poly Haven / CC0). São 37 vigas por módulo, 703 instâncias compartilhando uma geometria de 130 triângulos e seus mapas PBR. TimberRoof.js organiza as peças conforme as tesouras, caibros e terças existentes. A cobertura simples permanece disponível como fallback durante o carregamento. A regra de 40% de luz recebida no alto continua aplicada. O novo asset adiciona cerca de 535 KB de download.

## Acabamento fosco e forro detalhado

Vigas: rugosidade constante 1, sem mapa de rugosidade que provocava reflexos fortes, intensidade especular de 0,08, sem verniz e com menos emissão artificial. Forro: madeira escura com painéis em relevo, material CC0 Dark Paneled Wood, albedo WebP 1K e normal 512 px. A divisão 40% no alto / 100% embaixo continua ativa. Compatibilidade WebGPU e WebGL2 conferida visualmente.

## Alinhamento da cobertura ao topo das paredes

Tesouras, caibros e terças foram reposicionados para apoiar no coroamento da alvenaria. Menor cota das vigas: 6,77 m, acima da parede de 6,76 m. Cobertura principal inclinada sobre o corredor e forros laterais fechados sobre os nichos, com testeiras cobrindo os encontros. Lustres preservados na altura anterior; somente as hastes foram alongadas até a nova cobertura. Iluminação superior elevada de 50% para 65%, com parte inferior e lâmpadas em 100%.

## Telhado legível e término das pilastras

Luz recebida no alto restaurada a 100%. Preenchimento indireto suave nos materiais do forro e das vigas revela os painéis e veios sem aumentar o brilho especular nem clarear o piso. Pilastras prolongadas até capitéis de pedra moldurados, com ábaco unido à cornija contínua. Sem vegetação adicional. Geometria incorporada aos lotes instanciados existentes, sem novas luzes ou draw calls por módulo.

## Coroamento contínuo das colunas

Capitéis individuais removidos. As pilastras agora terminam sob uma única cornija corrida de pedra com chanfro inferior e filete de latão contínuo, eliminando os blocos salientes no topo. Preenchimento indireto do forro e das vigas reduzido moderadamente; iluminação dos sets preservada.


### Brilho do telhado e acabamento das pilastras
Controle independente de 20–300% para o brilho do forro e das vigas, padrão 160%, salvo junto da iluminação neste navegador. Migra as preferências existentes preservando altura e luz ambiente. Capitéis de pedra com perfil côncavo, gola de latão e ábaco ligados à cornija; caneluras terminam abaixo da gola. Sem novas luzes ou assets de folhagem.


### Pilastras restauradas, vegetação pendente e luz contínua
Removidos os capitéis adicionados na revisão anterior; pilastras esguias restauradas. Asset CC0 Hanging Vine colocado em jardineiras cerâmicas no alto de cada pilastra, com folhagem caindo pela frente. Uma geometria/material por componente, instâncias recicladas, sem luz por planta. O brilho salvo do telhado agora cresce com smoothstep de 4,8 m a 7,15 m por toda a alvenaria superior, vigas e forro, antes do fog e tone mapping. Mantida a chave e os valores salvos de iluminação, sem reset de preferências.


### Tapete contínuo, pausa estável e folhagem ampliada
Suavizada a mudança de fase da iluminação dos sets através do corredor: o step em x=0 produzia o risco longitudinal no tapete. Substituídas as linhas transversais da trama por microgrãos, com repetição vertical da textura. O balanço da câmera usa um relógio próprio que congela ao pausar e retoma sem reposicionamento. Plantas alongadas de 1,6 m a 2,15 m, com copa mais larga e segunda camada próxima (até 32 m); geometria e mapas compartilhados, sem novas luzes. Preferências de iluminação preservadas.


### Padrão compartilhado de 70% e plantas ampliadas
Telhado em 70% no padrão do projeto, válido em navegadores novos e migrado uma vez para preferências antigas. Outros ajustes existentes são preservados. Novos ajustes pessoais ainda podem ser salvos normalmente; roofPresetVersion identifica a migração. O gradiente termina na cornija a 6,76 m, de modo que todas as vigas e ambos os forros recebem o mesmo fator de 70%. Plantas ampliadas a 2,85 m, com copa mais larga, profundidade controlada para evitar atravessar as pilastras e até três camadas próximas, com geometria/texturas compartilhadas.

