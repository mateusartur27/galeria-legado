# Instruções para agentes (Claude Code / Codex) — game-starter

Projeto three.js **r186** com `WebGPURenderer` + **TSL** (cai para WebGL2 sozinho), Rapier, Vite.
Base de conhecimento: `D:\threejs-lab\knowledge\` · análises de referência: `D:\threejs-lab\analysis\` · skill: `threejs-game-dev`.

## Mapa rápido dos sistemas de mundo (tudo ligado por `world` no preset; ver `messenger` em `src/config.js`)
`relief`/`size` (ilha) · `sierra` (serra alta) + `river` (rio da nascente ao mar, `world/River.js`) · `field` (campo de flores) ·
`biomes` (pedaços com outra cor/árvores) · `village` (casinha `cottage` ou rua `town`) · `ancient` (cidade `zhou` com fosso/campos) ·
`nature` (árvores/pedras CC0, copa em cartões) · `tufts` · `water` (mar). Para outro mundo, mude números/posições — não reescreva.

### Rocha e água no desenho do Messenger (cores medidas nos prints do jogo)
- `render/RockLook.js` `messengerRock()`: creme quase chapado, traços curtos e quebrados (curvas de nível de ruído com a
  vertical esticada, cortadas em pedaços), rachaduras verticais raras, escorridos verticais escuros e macios nas faces
  íngremes, grama recortada com pintinhas no que olha para cima. Usado na rocha do terreno (`world.rockLook: 'messenger'`,
  sem as estrias contínuas: `rockStrata: 'none'`) e nas pedras CC0 (`nature.rockLook`). 9 leituras de textura (a 1ª
  versão fazia 18). Rejeitados: estrias contínuas por ID (faixas de "rabisco"), traços a 5 níveis/0,9 m (fervilhava).
- Rio (`world/River.js`): petróleo `#206468`, manchas `#307878` e claras `#68c0c0` ESTICADAS na corrente (redondas
  pareciam pintas de onça), risquinhos brancos perto da margem; cachoeira = listras verticais `#086868`/`#50b0b0` descendo
  (`v × 0.012`) com bordas brancas; espuma rendada na base (atributo `foam` = queda nos últimos ~10 m). Mar com a mesma
  família (`palette.waterLight`). `world.bank`: faixa de terra molhada `palette.bank` + traço em volta da água (rio: altura
  da lâmina em `terrain.riverTexture`; mar: nível 0).
- Água polida (2ª passada):
  - Nascente: `river.pool` (raio, padrão 4; 0 desliga) = lagoa de cratera no topo, com bacia e borda +0,3 m em `heightAt`.
    O leito fica plano até a borda, para a queda nascer ali e não abrir um rombo nela. Na saída da poça, o barranco do
    canal estreita para 0,5 m. Disco com anéis tracejados saindo do olho d'água e um borbulho branco; corta onde o chão
    está mais de 1 m abaixo (`opacityNode` + `alphaTest`), senão fica no ar sobre a encosta.
  - Espuma de margem: pela profundidade real (lâmina menos `heightTexture`), recortada por ruído. Não usar faixa fixa em
    `uv.x` (virava linha reta). Há também um degrau mais claro no raso.
  - Cachoeira: a fita descola até 0,7 m do leito (`drop × 0.25`), senão a malha de 1 m do terreno fura a água com pontas
    de pedra. Na base de cada queda (`river.falls`), 14 bolhas toon facetadas incham e murcham (instâncias animadas na CPU).
  - Foz: a fita nunca afunda no mar (fica 3 cm acima) e abre em leque (largura × 2,4 em 16 m). Ela se desfaz em pedaços
    (`opacityNode` por ruído + `alphaTest`), em vez de cortar o mar numa emenda reta.
  - Mar `bands`: manchas claras esticadas na direção das ondas (`xz × (0.012, 0.05)`) e mais raras no fundo.
  - `Terrain.waterAt(x, z)` → `{ y, flow, kind }` para mar, rio ou poça. Só há água se o chão estiver abaixo de `y`.
  - Interação (`world/WaterFx.js`, 2 draws, ~0,01 ms de CPU):
    - anéis tracejados no passo, parado, nadando e onde a gota cai, levados pela correnteza;
    - gotas balísticas ao entrar caindo, pular de dentro ou correr no raso.
  - Player:
    - `waterAt`: água segura o passo (até −45%);
    - acima de 1,05 m de água nada: boia com os ombros de fora e reaproveita o `Walk_Loop` lento, pois não há clipe de nado;
    - a correnteza empurra;
    - `bounds` limita o nado ao horizonte.
  - `Sfx`:
    - `splash`, `wade`, `blip`;
    - `water(fall, river, sea)` = 3 loops de ruído filtrado, com volume pela distância;
    - o áudio só nasce depois do 1º gesto.
  - Custo: 6,3–6,6 ms em 720p (rio e poça na tela).
- Água, 3ª passada (2026-11-02). O usuário achou ruins os sons, a cachoeira e os encontros de água. Estudamos a TÉCNICA da
  cachoeira do Messenger: lâmina curva própria, listras finas, brilho, pé escuro, borda branca recortada e furada, coroa
  de espuma com anéis no impacto e espuma na entrada. Reescrevemos com o nosso código; nenhum shader ou malha deles.
  - Traçado em Catmull-Rom centrípeta (3 subdivisões): a água faz curva na borda de cada queda.
  - `fallV` (1 no topo, 0 no pé; 0,5 fora das quedas):
    - listras = curvas do ruído em 0,5 esticadas em v;
    - brilho em manchas compridas, não faixas fixas, que viravam grade;
    - pé escuro;
    - borda recortada + furos (`opacityNode`);
    - a lâmina abre 25% descendo.
  - `lip`: espuma nos 5 m antes de cada queda.
  - Coroa no pé: elipse (estreita no través, comprida rio abaixo), 1 draw. Ruído amostrado na direção, não no ângulo
    (sem costura), empurrado para fora, mais anéis `sin(r × 22 − t × 4,5)^14`. As bolhas toon ficaram poucas e pequenas.
  - Foz: a fita passa a pintar `seaBands()` (exportada do `Water.js`), com a mesma profundidade e o mesmo ruído do mar.
    Termina sem emenda; o recorte por ruído saiu.
  - Sons (`Sfx`), todos no barramento de água com compressor:
    - bolhas de Minnaert (seno que sobe 10–50% e some em 20–90 ms);
    - ruído marrom e rosa em buffers de 4 s com início aleatório. Ruído branco puro soava chiado e o loop de 0,6 s se
      percebia;
    - riacho = leito grave + chuva de bolhas (Poisson, até 45/s);
    - cachoeira = rosa + tremor grave, com flutuação aleatória, sem LFO, que soava "wah";
    - mar = ciclo de onda de 8 s (cresce, quebra, recua chiando);
    - respingo = corpo marrom com passa-baixa que fecha + borrifo agudo + nuvem de bolhas.
  - Para checar o som sem ouvir: renderizar com `OfflineAudioContext` (+ `suspend(t)` para simular quadros) e medir
    pico e RMS.
  - Custo: 6,4 ms em 720p olhando a cachoeira.
- Som de água, 4ª passada. O usuário disse "a intenção é diversão, não realismo" e reclamou que o som tocava o tempo
  todo, mesmo longe.
  - Alcance curto com queda quadrática: cachoeira 24 m, rio 9 m da margem, mar 16 m. A distância ao mar é sondada em
    anéis de 3/6/10/15 m (8 direções, a cada 0,3 s).
  - O erro anterior: o mar contava pela ALTURA do chão (< 6 m), o que valia na ilha inteira.
  - Medido: spawn, vila, cidade antiga e campo ficam em silêncio.
  - Assinatura divertida: `Sfx.plop`, um seno com o tom CAINDO, o contrário da bolha real.
    - respingo = BLOOP (mais grave quanto maior o mergulho) + "blub blub" de bolhas cada vez mais agudas;
    - passos = plip/plop alternados (pé esquerdo/direito);
    - nado = blub grave;
    - o ruído de "chuá" ficou de fundo.
- Cachoeira, 5ª passada. O usuário gostou do encontro rio–mar. Pediu a queda como a do print do Messenger: cortina
  vertical, borda arredondada, chamas claras, bordas brancas e espuma lisa no pé.
  - Degraus: `river.step` (padrão 8 m; 0 desliga), em `Terrain.buildRiver`. Cada trecho íngreme vira k penhascos +
    poços planos. O poço fica na altura do FIM do seu trecho, então o leito só desce e é cavado na encosta (garganta).
  - Penhasco: `riverNear` usa `ss(0, 0.4, t)` no leito do trecho íngreme. A pedra cai logo na borda e recua para trás
    da cortina; sem isso, pontas de pedra furavam a água.
  - Cortina (`fall` = 1 por TRECHO, sem suavizar):
    - barriga para cima e para a frente (0 na borda e no pé);
    - borda arredondada: a lâmina já desce no trecho antes do penhasco;
    - abre 20% descendo;
    - pintura: corpo claro em cima escurecendo até o pé, chamas claras compridas que afinam embaixo, fio fino raro,
      bordas brancas CONTÍNUAS (sem furos: davam "escadinha" vista de cima), luz fina na borda de cima, espuma no pé.
  - Coroa de espuma em cada pé. As bolhas toon esféricas saíram (pareciam bolas soltas).
  - Fita no ar: corta onde o chão está mais de 1,5 m abaixo, exceto na cortina e na foz (era a "tira de água pra fora").
  - Anéis do personagem: cerca de 40% menores e cortados onde o chão passa da lâmina (não sobem na margem).
- Cachoeira, 6ª passada (o usuário viu bugs: cortinas empilhadas, laje de pedra no pé, "bloco de vidro"). Substitui
  barriga, borda arredondada e Catmull 3D da 5ª passada.
  - Degraus com poço de verdade: cada grupo tem ≥ 3 trechos (~6 m). Encosta curta e alta vira UMA queda alta, não uma
    escadinha com poço de 2 m entre cortinas.
  - Penhasco/cortina só com queda ≥ 2,5 m (`River.cliff` e `riverNear`). Degrau menor é CORREDEIRA: rampa com espuma
    rendada 0,6. Uma cortina de 1,3 m parecia barril/caixa.
  - Traçado: Catmull-Rom só em xz; a altura é desenhada à parte. Spline 3D com 17 m de queda em 2 m de chão passava do
    ponto: torcia de lado (zigue-zague visto de cima) e afundava abaixo do poço (lente de pedra no pé).
  - Cortina = arco de jato: xz anda reto no trecho, `y = top − H·s^1.5` (14 subdivisões). Sai na horizontal, curva e
    cai, sempre na frente da pedra, porque o carve `ss(0,0.4)` desce antes. Com s² a curva era larga: barril de perto.
  - `fall` em rampa nos 20% de cima. Recortar a borda com ruído custou +0,7 ms (o fallM vai no opacityNode também) e
    quase não aparecia: removido. Rio no total: ~6,1 ms/quadro a 720p, dpr 1.
  - Custo: 6,6 ms em 720p.
- Ponto pesado: olhando a serra da base (−40, −30), ~7,3–7,5 ms com p95 ~8,4 — o terreno ocupa a tela e o shader dele
  tem todas as camadas (biomas, flores, folhas, margem, rocha). Próximo ganho: pular camadas por região.

## Preset `bruno` (Bruno Simon 2025 fiel; skill `bruno-style`) — 2026-11-09
- `shadowModel: 'mult'` (ToonMaterial): sombra = cor × `shadowTint` crua; luz = min(smoothstep(−0,25, 1, N·L), sombra
  projetada). `shadeNode` (createToonMaterial) = sombra extra 0..1 que entra NA LUZ: a grama usa 1 − ponta → base roxa.
- `fog.mode 'radial'` + `sky.style 'radial'`: névoa smoothstep(near, far) cuja cor é o degradê de tela fog.color → colorB
  (centro `fog.center`, 0,0 = canto de cima à esquerda); o céu pinta o mesmo degradê.
- `world/Foliage.js` (`trees: 'foliage'`, `world.bushes`): bolas de 60 cartões BILLBOARD (positionNode com os eixos de
  `cameraWorldMatrix` → no passe de sombra viram para o sol), normal esférica, alfa por textura gerada que gira com o vento.
  Tentado e descartado: cartões fixos DoubleSide (o lado de trás saía preto: normal invertida; × faceDirection não resolveu)
  e cartão 0,8 (com a câmera girando virava "plástico bolha"; 0,58 × 60 cartões fica fofo).
- `render/DayCycle.js` (`style.dayCycle`, `?time=day|dusk|night|dawn`, `?cycle=s`) escreve sol/sombra/névoa nos uniforms do
  look e gira o sol; `night` acende `world/Lamps.js` (cabeça HDR × 5 → bloom + poça aditiva; 4 postes fixos perto do spawn).
- Custo (720p, dpr 1, sem vsync): dia 5,6 ms (p95 6,5) · noite 6,1 ms (p95 7,9).

## Rodar e verificar (sempre verifique visualmente antes de dizer que terminou)
- `npm run dev` → http://localhost:5173/?style=meadow|messenger|ink|toy|painterly|real|synthwave|kit|matcap|faceted&quality=low|medium|high
  (cada estilo = um site de referência: Messenger, Bruno 2025, Summer Afternoon, Firewood, Horizon Drive, Kenney, Bruno 2019, Interland;
  `meadow` = Messenger em mundo pequeno: relevo de morrotes, casinha/cerca/caixa de correio em `world/Village.js`)
  - O que deu "atmosfera Messenger" (comparado com screenshot real do jogo): câmera BAIXA atrás do personagem (`camera.pitch 0.1`,
    `height`, céu = metade da tela) · céu `painted` (turquesa + pinceladas de nuvem 2 tons) · verde SATURADO e chapado, sem névoa/dessaturar/vinheta ·
    sombra chapada verde-azulada SEM hachura · chão liso + `Tufts` (tufos desenhados, contorno faz o traço) + pedrinhas (`flecks`) ·
    `crispRock`: manchas de terra/rocha com borda dura + contorno por ID · árvore `tall` (tronco fino, copa com pintas) · pedra `slab` com rachaduras.
    Tentativa anterior (pastel, câmera alta, grama alta densa, hachura) ficou "passando longe" — não volte para ela.
  - Evite a porta 5173 no navegador do usuário: um service worker antigo de outro projeto já quebrou páginas lá (use `--port 5180+`).
- Screenshot + FPS + erros de console pela linha de comando (funciona sem navegador aberto):
  `node D:/threejs-lab/tools/snap.mjs "http://localhost:5173/?dpr=1" --out shot.png --measure 3000`
  - `--unlimited` mede custo real (sem vsync) · `--keys "KeyW:1500,Space,ShiftLeft+KeyD:800" --shots 3` testa gameplay
  - `--eval "JSON.stringify(window.__game.player.renderPosition)"` inspeciona estado; `--pre-eval "window.__game.player.teleport(x, y, z)"` prepara a cena antes da captura
- Debug visual por URL: `?view=shadow|light|shadowcol|litcol` · `?debug` (Inspector do three) · `?dpr=1` trava resolução · `?webgl` força WebGL2
- `window.__game` expõe `{ THREE, TSL, scene, camera, renderer, player, terrain, grass, props, water, sky, sun, look, pipeline, engine, firewood, gobo, blobs, rig, physics, style, car, track, gi }`
- Testar o carro: `--pre-eval "const g=__game, c=g.car.renderPosition; g.player.teleport(c.x+1.5, g.terrain.sampleHeight(c.x+1.5,c.z), c.z)" --keys "KeyF,KeyW:2500"`
- Testar a lenha: `--pre-eval "const g=__game; g.player.teleport(1, g.terrain.sampleHeight(1,-2), -2)" --keys "KeyE,KeyQ:1700,KeyE,KeyQ:1500"`

## Arquitetura
- `src/config.js` — 9 presets de estilo (direção de arte) + DEFAULTS (`world` — inclui `size`, `segments`, `relief: island|meadow`, `treeCount`,
  `rockCount`, `village` —, `camera`, `shadows`, `gobo`, `leafShadows`, `hemi`, `matcap`, `firewood`)
  e níveis de qualidade. Comece mudando AQUI: um estilo novo = um objeto novo nesse arquivo.
- `src/render/ToonMaterial.js` — `createLook()` (uniforms globais: sol, sombra, névoa, ambiente) + `createToonMaterial()`
  (LightingModel próprio: 2 tons / suave / rampa / matcap / PBR, sombra colorida, rim, luz rebatida, máscara de contorno, dither "ver através")
  + `bumpNormal(altura, força, base)` (relevo procedural; aplicado só em PBR).
  `shadowModel: 'hsv'` (meadow, Messenger): sombra = própria cor com matiz − `shadowHueShift` e × `shadowValue` (0.5) — parede/personagem
  escurecem na própria cor em vez de ganhar o ciano do `'tint'`. Material com `shadowTint` próprio fica no modo tint.
  Comparar sem editar: `?shadow=tint&shadowValue=0.74` (antigo) · `?shadow=hsv&shadowValue=0.5`.
- `src/render/Pipeline.js` — `RenderPipeline`: MRT (cor + normal/tinta [+ id]) → contorno → bloom → tone mapping → tilt-shift → LUT → vinheta/grão → FXAA/SMAA.
  Traço de nanquim do `meadow` (Messenger), tudo ligado por config do preset:
  - `pen` — pressão da caneta (ruído preso ao MUNDO no alfa do MRT): falha onde é baixa, traço grosso (raio × `thick`, 8 direções) onde é alta.
    Ruído vem de `look.noise3()` (textura, 2 leituras) — Perlin por pixel (`mx_noise_float`) custou ~4 ms na iGPU.
  - `outline.ids` — ID de superfície (MRT `id`, half float): linha onde o ID muda na mesma superfície (porta×parede, fiadas do telhado).
    Material passa `id: nó float > 0` em `createToonMaterial` (Village usa a célula da paleta). Só lido no traço fino.
    Lido no texel EXATO (`texel(uv)`): com filtro bilinear, lâmina (ID 0) × chão vira um ID intermediário e cada lâmina ganha contorno.
    Vizinho sem tinta (alfa do MRT ≈ 0) não gera linha de ID.
  - Tufos (`world/Tufts.js`): `world.tuftStyle: 'card'` (meadow) = cartão com silhueta desenhada (atlas de 8 formas gerado em canvas),
    virado para a câmera e preso ao `up` do chão, posição montada no shader (atributos base/up; `frustumCulled = false`);
    `tuftIds: true` = ID por tufo (contorno fechado), base sem tinta, tinta some de 5 a 10 m (senão o tufo pequeno vira borrão preto).
    `'blades'` (leque de 7 lâminas) continua disponível; com ID ele escurece (cada lâmina ganha contorno). Comparar: `?tuftStyle=blades&tuftIds=0`.
  - `outline.mode: 'central'` (meadow) — diferença CENTRAL em cruz (esq − dir, baixo − cima) para profundidade (relativa ÷ d0),
    normal e ID, cada uma com fit duplo `outline.central = { depth|normal|id: [faixa a, faixa b, limiar] }`; profundidade com limiar
    `+ 1 − |normal.z|` (chão rasante). Silhueta contínua (copas, troncos, samambaias) e ~0,7 ms MAIS barata que o "máximo dos vizinhos"
    (4 leituras por buffer em vez de 4 + 8 da caneta). Dobra só entre vizinhos da mesma superfície com tinta. Normal precisa de limiar alto
    (`[1.0, 1.4, 0.3]`): com 0.5 o personagem ganha riscos no peito/cabelo (a diferença central cobre 2 px de curvatura). `?outline=max` = antigo.
  - Céu com ID (`sky.outline`, só `painted`): grava 3 IDs (fundo/sombra/nuvem) + tinta + `id.b = 1` (o traço de ID não some com a
    distância — `inkMRT(..., noFade)`). DESLIGADO no meadow: nossas nuvens são pinceladas finas → contorno vira "fios" no céu. `?skyInk=1`.
  - Estrias da rocha (`world.rockStrata: 'id'`): a faixa clara das estrias soma 0.05 ao ID do terreno → o contorno desenha as estrias.
  - Personagem (`character.inkNoise`, `character.shadowCut: [0.1, 0.15]`): traço com falhas por soma de senos na `positionLocal`
    (depois do skinning; anda com o corpo) com `pen: false` no material, e sombra com corte duro `smoothstep(a, b, N·L × sombra)`.
    `?kidInk=0&kidCut=0` = antigo. Sem brilho especular no personagem.
  - `specular: { amount, shininess }` (brilho chapado do Messenger: recorte do Phong, só faces com `normal.y < 0.95`): implementado e
    DESLIGADO (`?spec=0.075`): no terreno inclinado lava o verde e no personagem mancha a calça preta (ambos com `specular: false`);
    em casa/pedras de faces planas quase nunca aparece. Grama/tufos/copas também com `specular: false`.
  - `fog.mode: 'exp2'` (meadow): `f = 1 − exp(−(densidade·dist)²)`, cor `fog.color` (perto) → `fog.farColor` por `smoothstep(0, 0.8, f)`,
    sem fade por altura. 0.009 = planos distantes clareiam um pouco; 0.015 lava demais. `?fog=linear` · `?fogDensity=`.
  - Mar `world.water: 'bands'` (meadow): degraus chapados pela profundidade (distância da margem já assada na textura de altura)
    + listras brancas andando para a praia entre 0,25 e 1,1 m + espuma; bordas por `fwidth` (aastep). `?water=smooth` = degradê antigo.
  - Preset `messenger` (= `meadow` + overrides no fim de `STYLES`): o MESMO mundo com o visual fiel ao jogo, sem a nossa mistura.
    Céu `sky.style: 'blobs'` (fundo `#65c1bc` + massas `#a0e5d6` de 1 tom com borda rasgada, mapeadas no DOMO por ângulo × altura —
    projeção em plano estica em colunas no horizonte e esvazia o céu da câmera baixa; escalas inteiras do ruído = sem costura no atan),
    traço `#373f42` grosso (2.0) com falhas curtas e constantes (`pen.thick: 1` = sem 2º passe), sombra 0,2–0,4, brilho 0,075 em
    casa/pedras, sem LUT nem tone mapping, sem grama alta, névoa exp² 0.006 (0.011 do planeta deles lava nosso mundo pequeno).
    Cores medidas em prints do jogo (a cópia de estudo foi apagada; nenhum arquivo dela entrou no projeto). Armadilha: `PI` do TSL é nó — `PI * 2` em JS vira NaN no WGSL.
    `world.village.kind: 'town'` (só no messenger) troca a casinha por uma rua de cidadezinha feita em código (`Village.buildTown`):
    - `road`: segmentos LOCAIS da vila — `road[0]` = principal ao longo de x (54 m, de praia a praia), `road[1…]` = ramais retos
      em z saindo do lado +z (o do preset passa pelo spawn e desce até a praia). `Terrain.roadHeight` aplaina o chão sob elas
      (média do chão ±4 m ao longo da rua → sobe/desce o morro sem calombo; vale para malha e física); `Terrain.roadDistance`
      alimenta o `avoid` (árvores/pedras/plantas < 9 m, tufos < 3,2 m; `avoid` aceita `{ test(x, z) }` em Props/Nature/Tufts).
    - `building({ x, W, D, floors, F, front, roof, wall })`: frente em +z no fundo da calçada, base no chão da calçada com 2 m
      enterrados; `front` = shop (persiana + toldo + placa) · house (porta, marquise, varanda no último andar) · garage (persiana
      larga + máquina de venda) · shed (chapa ondulada); `roof` = flat (platibanda) · gable (`roof(..., ox, oz, cores)`).
    - Calçada de placas com meio-fio, muro de arrimo nos vãos (mais alto onde o chão de trás sobe, capa, dreno, `ivy` = trepadeira
      de folhas de 5 lados achatadas — discos redondos pareciam bolinhas), guard-rail em W que abre nos ramais, 6 postes com
      travessa/isoladores/degraus/transformadores e fios caídos, `weed` (mato de 3–5 lâminas de cone) no pé do muro, na fresta do
      meio-fio, nas juntas e na beira do guard-rail, frade, cone, espelho redondo (16 lados; com 8 parecia placa de PARE).
    Helpers: `beam(a, b, w, h, cor)` (caixa ao longo de um segmento 3D), `cyl(..., segments)`. Cores `town*` na paleta do preset.
    - Mapa do messenger: `size: 150` (2× o meadow), rua principal de 116 m e ramal de 62 m (pontas medidas onde o chão ainda está
      ~1 m acima do mar). `world.field = { x, z, r }`: campo grande — o `meadowHeight` troca morrote/crista por ondulação longa e
      mansa (borda irregular), o `avoid` tira árvores de 75% do raio e o shader do terreno pinta flores (`palette.flowers`, 3 cores,
      1 ponto por célula de 0,55 m, em manchas de ruído, somem de longe por `fwidth`) — sem geometria.
    - Pedra `nature.rockGrass` (messenger): o que olha para cima vira grama com borda por ruído GRANDE (o fino picotava e enchia de
      manchas pretas de contorno) + ID próprio; rocha `#c9c2a5` (o `#9b9886` medido no print é o lado na sombra) com sombra HSV.
    - Ilha de 400 m (`size: 400, segments: 400`): rua principal de 224 m até o portão da cidade antiga, ramal de 154 m pelo campo
      até a praia; densidade medida (30k tufos/150 árvores/400 arbustos = 6,6 ms p95 7,8 → 18k/120/260 = ~5,6–6 ms p95 6,7).
      Na primeira medição de um mapa novo o frame sai ~19 ms (compilação de shader): meça de novo antes de concluir.
    - `world.ancient` = 2º `Village` com platô próprio (`Terrain.pads` = vila + ancient). `kind: 'zhou'` (`buildZhou`): cidade murada da
      China antiga, período das Primaveras e Outonos (~770–476 a.C.), 64 m de lado, portão virado para a rua (rotation 2.21):
      muralha de TAIPA em lances de 1,2 m que afinam para cima, com furos de andaime escuros (camada por camada de 0,45 m com
      linha em cada uma parecia "parede de tábuas"), bastiões e pavilhão de madeira sobre o portão (colunas laqueadas, viga preta,
      folhas abertas), torres de vigia de palha nos cantos, salão sobre plataforma de terra em 3 degraus com escadaria, colunas
      vermelhas, paredes rebocadas e telhado de 4 águas RETO de telha cinza (`hipRoof`: faixas = fiadas, cumeeira e espigões; o
      beiral curvo é de dinastias posteriores), alas de palha (`roof(..., rotY)`), 12 casas de taipa e palha, 4 celeiros redondos,
      caldeirão ding de bronze, estandartes vermelho/preto e uma biga (`chariot`: rodas `TorusGeometry` + raios por `beam`).
      Cores `zhou*` na paleta. Tufos só fora do pátio central; árvores/pedras fora da cidade.
      Em volta: `moat: { inner, width }` = fosso quadrado escavado 0,9 m abaixo do mar pelo `Terrain.baseHeight` (a água do mapa
      aparece nele; `moatAt` deixa a margem de grama em vez de rocha), ponte de pranchas no portão (`zhouBridge`: estacas,
      longarinas, guarda-corpo, colisores), campos de painço em faixas (`zhouFields`: 11 canteiros com dique, verde / maduro com
      cachos / terra lavrada em sulcos). `pad.fall` = rampa do platô (largo para caber fosso e campos) e o platô some perto da costa
      (senão vira península). `treeSpots` do pátio entram no layout das árvores (`main.js` → mesmos modelos/cartões).
      Custo: touceiras de 0,3 m custavam ~2,5 ms (0,5–0,9 m e fileiras a 1,3 m); campos em malha filha SEM sombra projetada (−0,3 ms);
      cidade sem `fade` (o dither com discard desliga o early-z da malha toda: −0,5 ms).
      Silhueta de sombra: a malha detalhada da cidade NÃO projeta sombra; um filho com `colorWrite/depthWrite: false` (caixas dos
      colisores sem as da muralha + lances reais da muralha, que afinam + telhados + bojo do ding) projeta no lugar (−0,35 ms, igual).
    - Árvores em BLOCOS (`nature.chunk`, padrão mapa/3; `?chunk=` testa): um InstancedMesh do mapa inteiro nunca é recortado — tronco e
      cartões da copa iam inteiros para a tela e para a sombra. Cartões ganham `boundingSphere` manual (posição vem do shader) e ID
      de árvore global (não repete entre blocos). −0,3 ms; 1,8 M → 1,25 M triângulos no pátio.
    - Pátio: 7,3 → 5,8 ms (p95 8,5 → 6,8). Perfilar num carregamento só (toggles no mesmo page): entre sessões a GPU varia ±0,5 ms.
      Medido e descartado: PCF radius 1 (0), tufos sem receber sombra (0), terreno sem projetar (−0,2, mas morros perdem autossombra);
      sombra a cada 2 frames dá −0,8 ms mas a sombra do personagem correndo atrasaria — fica como alavanca se precisar.
    - Traço em telas HiDPI: a diferença central desenha uma faixa de 2 × deslocamento, e o padrão escala o deslocamento com a altura
      (× 1,33 em 1440p) → ~5 px num notebook com DPR 2, contra ~2–2,5 px do Messenger (medido em DPR 1 e 2: ele fica quase constante
      em pixels). `outline.resScale: 'fixed'` + `thickness: 1.15` no messenger. Compare sempre em DPR 2 também (`?dpr=2` + captura
      com deviceScaleFactor 2) — em 720p as duas espessuras pareciam iguais. Mais detalhe de longe: dobras mais sensíveis
      (`central.normal [0.6, 1.0, 0.3]`), fade do traço 60→220 m, tinta dos tufos até 14–26 m (`world.tuftInkFar`), rachaduras finas
      na rocha do terreno (`world.rockCracks`) e nas pedras com grama. Testado e descartado: risquinhos de mato pintados no chão
      (viram "setas" de decalque, todas iguais; o mato do jogo é sprite em pé).
    - Pedras do messenger = `nature.rockStyle: 'slabs'` (`world/Rocks.js`, `?rocks=model` volta ao modelo CC0): PILHAS DE LAJES geradas
      em código, como nos prints do jogo — caixas arredondadas (raio 0,24 × menor lado; 0,42 virava "bolinha de massa") com borda
      irregular por ruído e topo abaulado, 1–4 camadas baixas (13–22% da largura) que encolhem pouco e recuam sempre para o mesmo
      lado (afloramento em degraus, não "boneco de neve"), às vezes um bloco caído ao lado. ID por laje (linha fina em cada borda),
      creme `rockSlab #d9cfad` com ±7% de valor por laje e manchas grandes, sombra suave (`shadowValue 0.74`), escorridos
      verticais escuros nas faces íngremes, poucas rachaduras, musgo pequeno só no que olha para cima (cor do bioma). Geometria
      única por pilha, juntada por bloco espacial. Custo igual ao do modelo.
    - `Palette.sample()` não lê mais a textura: as 4 linhas viram constantes escolhidas por `step` (o terreno fazia ~15 leituras
      da paleta por pixel). Mesmas cores. Pedrinhas do chão sem `atan`/`sin` (elipse girada por hash).
    - Medição: entre carregamentos a GPU oscila ±0,7 ms (o mesmo caso deu 5,9 e 7,4) — decidir só com toggles na MESMA sessão.
      O messenger é limitado pela CPU, não pela GPU: o loop gasta ~5,7 de ~6 ms (WebGPU do three ~25 µs por desenho + passes
      do pós). Meça a CPU do loop (`engine.track` recebe o tempo de CPU) antes de mexer em shader. Troncos (copa em cartões)
      agora são ASSADOS e juntados por bloco (1 malha/bloco em vez de 1 por modelo × bloco: 89 → 65 desenhos). Ponto pesado
      (66.8, 21.6): 7,2 ms p95 8,9 → 6,05 ms p95 6,7. Alavanca guardada: FXAA no lugar do SMAA (−0,6 ms de CPU, linhas um
      pouco mais macias) — sobretudo em DPR alto, onde o AA quase não aparece.
    - Messenger "vivo" (`VIVID` no config, aplicado por cima do preset; `?vivid=0` = pastel medido dos prints): paleta mais
      saturada e funda (grama, folhas, outono, estepe, pinheiral, cidade antiga, placas), céu `#3aaec4` com nuvens `#c8f1ea`,
      névoa mais clara e rala, e LUT `grade` (saturação 1.16, contraste 1.08, sombra fria/luz quente). A 1ª tentativa (saturação
      1.28, grama `#34a356`, nuvem quase branca) ficou verde-limão neon com nuvens estouradas.
    - Rocha grande do terreno (messenger): `world.rockSlabLook` pinta a rocha com `rockSlab` (faixas claras + manchas
      dessaturadas; escorridos ali viravam hachura diagonal, ficaram só nas lajes) e `nature.cliffSlabs = { cell, density }`
      põe pilhas de lajes saindo da encosta onde há rocha (`terrain.rockAt`): base no ponto mais baixo da célula, camadas
      recuando morro acima (`rk.back`). `dirt` do messenger = verde escuro: nos prints a grama vai até a pedra.
    - População (`world.folk`, `world/Folk.js`; tirada do messenger a pedido, o módulo continua): moradores e animais da cidade antiga, modelados em código —
      morador (túnica longa cruzada com faixa, mangas largas, coque com prendedor, olhos e sobrancelhas em traço), guarda (+ colete
      de lamelas e alabarda ge), lavrador (túnica curta, calça, chapéu cônico de palha, enxada), cavalo pequeno de estepe e galinha.
      1 InstancedMesh por tipo (5 draws); instance matrix identidade — pos.xyz + yaw e (anda, fase, ação, id) são atributos por
      instância que a CPU reescreve; o `positionNode` monta a pose: braços balançam e corpo quica ao andar, galinha bica, cavalo
      pasta (pivô no pescoço) e abana a cauda. Partes por atributo `part`; `robe` = máscara da cor por instância (túnica/pelagem).
      Normal = `normalGeometry` girada pelo yaw (para a luz). ID por indivíduo (contorno separa um do outro), sombra com corte duro.
      Comportamento: trilhas ida-e-volta com pausas (`walkers`), parados virados para algo (`idle`: guardas, conversa, oferenda),
      galinhas passeando perto de casa, cavalos na biga e pastando. Coordenadas LOCAIS da cidade. Custo: GPU ~0; a CPU (conta +
      upload) custava ~0,35 ms → local→mundo sem alocar e, com o jogador longe (> 1,7 × raio), 1 atualização a cada 8 frames.
      Sem colisão (o jogador atravessa).
    - Biomas (`world.biomes = [{ kind, x, z, r, trees? }]`, `?biomes=0` desliga): até 3 tipos por preset, cada um um canal (r, g, b)
      da `terrain.biomeTexture` (mesma grade da dataTexture; peso com borda ondulada por ruído grande em `Terrain.biomeAt`).
      Chão: a grama vira `<kind>Grass/<kind>Dry` com borda recortada (smoothstep estreito + ruído); `<kind>Litter[3]` pinta folhas
      caídas (elipse girada por célula de 0,45 m, em manchas, somem de longe). Tufos: `<kind>Tuft` (`terrain.biomeKindAt`).
      Árvores/arbustos: `<kind>Trees[ ]` (`Nature.leafColsAt`); pedra `rockGrass` pega a grama do bioma. `trees: n` planta um
      bosque a mais dentro do círculo (`Props.placeTrees(..., area)`) — a área da cidade antiga não tem árvore, então o outono
      precisa de bosques fora dela. Messenger: outono chinês (capim dourado, bordo vermelho/laranja, ginkgo amarelo, folhas
      no chão) em volta da cidade antiga + 2 bosques, estepe seca no fim da rua (SE), pinheiral frio (SO). Custo: ~0 no chão;
      os bosques densos pesam (overdraw dos cartões) → `treeCount` 120 → 95 para compensar; ~5,4–6,4 ms, p95 ≤ 6,9.
  - `seeThrough: false` (meadow e messenger): sem o círculo de dither em volta do jogador; no lugar, a câmera encosta em TUDO que
    é sólido (`CameraRig` `collideAll`, filtra o colisor do jogador — o foco da câmera fica dentro da cápsula). `?seeThrough=1` volta.
    O dither perto da câmera (< ~3 m) continua.
  - Céu `blobs`: perto do horizonte o limiar das nuvens sobe (rareiam até sumir) — cortar em `dir.y` fixo deixava uma linha reta.
    Tudo em 1 malha / 1 draw call; o preset messenger roda em ~4,3–4,8 ms.
  - `hatch` — hachura no modelo de luz (bands/soft): diagonal na sombra, cruzada na sombra profunda, triplanar, falha por ruído,
    some de longe por `fwidth`. `hatch: false` no material para grama/personagem/peças pequenas.
- `src/render/Palette.js` — paleta em textura (`paletteTexture: true`): cada cor do preset = coluna, 4 linhas (base/clara-quente/escura-fria/dessaturada).
  `palette.uv(nome, linha)` para geometria, `palette.sample(nome, linhaNó)` em TSL (terreno: manchas = troca de linha). `palette.toPNG()` exporta para pintar à mão.
- `src/render/Sun.js` — sol direcional que segue o jogador com *texel snapping* (`shadows.type: 'blob'` desliga o shadow map).
  `Sky.js` — domo (`gradient` / `synthwave` / `flat` / `painted`). `Gobo.js` — sombras de folhagem em vídeo (só shadow pass).
- `src/world/` — Terrain (altura → malha, física, texturas; degraus/facetas/grade neon/relevo; `pads` aplainam áreas de construção),
  Grass (1 draw call, `clearing`; o jogador INCLINA a lâmina com comprimento constante — não esticar/deitar, vira "cata-vento";
  RASTRO de 14 pisadas em `uniformArray` que levanta em 4 s, deitando no sentido do passo com ângulo/força por lâmina;
  `world.lawn` = gramado: máscara no alfa de `terrain.dataTexture` → grama rala e curta + "tiques" de pincel pintados no chão;
  `world.grassField: { x, z, r, density, shadowTint, shadowValue }` = grama alta SÓ num campo de borda irregular (meadow), com o visual do ink:
  o quadrado fica PARADO no campo (todas as lâminas nele, `density` por metro), cores `palette.fieldGrass/fieldDry`, sombra própria
  por material (`shadowTint/shadowValue` em `createToonMaterial`) e o Terrain pinta o chão do campo na cor da raiz),
  Props (instanced; `round|palm|cone|lowpoly`; furos de folhagem na sombra), Village (casa+cerca+props em 1 malha com cor por vértice), Water, BlobShadows.
- Personagem riggado (`style.character`): `public/models/kid.glb` + `kid_anims.glb`, gerados por `tools/character/build_kid.py` (Blender headless)
  a partir de CC0 da Quaternius (Universal Base Characters + Universal Animation Library, FBX "Unreal" = mesmo esqueleto, sem retarget).
  Roupa = cor por vértice pelo osso dominante + "inflar" pela normal; cabelo cortado (`--bob`); mochila rígida no `spine_03`.
  Player troca animação pela velocidade (Idle/Walk/Jog/Sprint com timeScale) e encadeia Jump_Start/Loop/Land; cabeça maior via escala do osso.
- Natureza CC0 (`world.nature`): `public/models/nature.glb` (Quaternius Stylized Nature MegaKit via `tools/nature/build_nature.py` +
  `optimize-glb --keep-nodes`). `world/Nature.js` instancia por (modelo × material) usando a distribuição do Props (`build: false`).
  `nature.canopy: 'cards'` (meadow, Messenger): folhas do asset saem; a copa vira cartões NOSSOS (atlas de 8 formas gerado em canvas:
  4 "bolos" de lóbulos + 4 leques de folha de detalhe) em pontos da copa do asset (vértices das folhas reduzidos por voxel).
  Todos gravam a profundidade do CENTRO da árvore para o contorno (`outlineDepth` → MRT `id`.g, lido pelo Pipeline no lugar da real)
  e normal constante (`outlineNormal`) → traço só na silhueta; detalhes 0,25 m à frente + ID próprio → poucos traços internos.
  `penFloor: 0.6` = silhueta sem falhas da caneta. Cartões olham para a câmera do JOGADOR também no passe de sombra
  (`uniform(camera.position)`), senão a copa se sombreia com cortes retos. Mais leve que as folhas do asset (~1,5 ms a menos).
  `?canopy=model` = folhas do asset (antigo):
  Folha = recorte alfa da textura + cor da paleta + pintas + normal "fofa" (centro da copa); casca/pedra sem textura; pedra com rachaduras
  e `shadowTint` próprio (bege). Armadilhas: (1) meshopt/quantização → converter atributos para Float32 ANTES de `applyMatrix4`;
  (2) o corpo de `Fn()` roda na compilação — passe atributos de instância como variável local, nunca `this.*` (pega o do último modelo).
  Custo ~3 ms numa iGPU (folhagem alfa = overdraw): TwistedTree fora, 17 árvores, plantas sem sombra.
- `src/game/` — Player (Rapier KinematicCharacterController + juice, `teleport()`), CameraRig (órbita/isométrica fixa, raio Rapier contra o terreno,
  `shake()`), Firewood (lenha que racha), Car (carro arcade, F entra/sai), Sfx (sons e motor sintetizados).
- `src/world/Track.js` — pista por spline (aplaina o terreno antes de gerar a malha). `src/render/ProbeGI.js` — LightProbeGrid assado em fatias.
- `src/core/` — Engine (renderer, DPR adaptativo, Timer), Physics (passo fixo 60 Hz + interpolação), Input (E/clique = ação), Assets.

## Regras que evitam bugs já encontrados (r186)
1. Use `packNormalToRGB` / `unpackRGBToNormal` (os antigos `directionToColor/colorToDirection` foram renomeados).
2. **Não** use `shadow(light)` dentro de material nem leia sombra em `outputNode`: faça um `LightingModel` (o `lightColor` já vem × sombra).
3. Material com `mrtNode` não pode ser reutilizado fora do pass com MRT (ex.: PMREM) → clone e `mrtNode = null`.
4. `smoothstep(a, b, x)` exige `a < b` (WGSL/GLSL indefinido ao contrário). Para inverter: `float(1).sub(smoothstep(a, b, x))`.
5. `PCFSoftShadowMap` foi removido na r186 → `PCFShadowMap` + `shadow.radius`. `THREE.Clock` está obsoleto → `THREE.Timer`.
6. Com instancing, `positionLocal` no `positionNode` já inclui a matriz da instância; para peso por altura use `positionGeometry`.
7. Bloom é vec4: some `bloomPass.rgb` a cores vec3.
8. Cores TSL de `color('#hex')`/`uniform(new Color('#hex'))` já viram linear; texturas de cor precisam `colorSpace = SRGBColorSpace`.
9. Toon: a `DirectionalLight` do sol é branca/1 (o lightColor vira fator de sombra); a cor do sol fica em `look.sunColor`.
10. `material.maskShadowNode` recorta SÓ a sombra (gobo, folhagem). Sem ele, o shadow pass usa `maskNode` (o dither de câmera).
11. `bumpMap()` do three exige textura; para relevo procedural use `bumpNormal()` — e nada de degrau abrupto/`fract` cru na altura
    (derivadas de tela viram "pontilhado"): use onda triangular `1 - abs(fract(x)*2 - 1)`.
12. `VideoTexture` no WebGPU precisa `colorSpace = SRGBColorSpace`. Para trocar textura sem recompilar: `texture(placeholder, uv)` e depois `.value = nova`.
13. `.toVar()` só dentro de `Fn()`. Fora dele, encadeie nós normalmente.
14. LightProbeGrid: registre o nó (`renderer.library.addLight(LightProbeGridNode, LightProbeGrid)`) ANTES de compilar; o bake renderiza fora do MRT → materiais sem `mrtNode`; `far` > raio do céu. Some `HemisphereLight` mais fraca (senão lava a cena).

## Orçamento (GPU integrada AMD Vega, 1280×720, sem vsync): ink 5.3 ms · toy 6.7 · painterly 5.6 · real 7.0 · synthwave 4.5 · kit 4.2 · matcap 2.0 · faceted 3.0 (ink 5.3 · toy 6.6 · painterly 6.4 · real 7.8).
Mantenha < 8 ms em 720p numa iGPU. Draw calls < 100. Use InstancedMesh/BatchedMesh, uma paleta, texturas KTX2/WebP.
