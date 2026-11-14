# Assets e licenças

## Cena noturna atual

**Potted Plant 02 — Poly Haven, CC0 1.0.**

- Fonte: https://polyhaven.com/a/potted_plant_02
- Licença oficial: https://polyhaven.com/license
- Original em `asset-source/models/potted_plant_02/`.
- Versão atual: `public/models/gallery-plant-stylized.glb` (62.180 bytes).
- Alterações: simplificação, compressão Meshopt, retirada dos mapas fotográficos e aplicação de materiais estilizados próprios.

Arquitetura, padrões ornamentais, tapete, mármore ilustrado, céu estrelado, vegetação suspensa, lustres, luminárias, poltronas, pedestais, esculturas de esfera armilar, vasos com ramos e cordões foram criados para este projeto. A imagem do usuário é referência de composição; não é carregada pelo aplicativo.

## Materiais da versão diurna, arquivados

Também CC0 / Poly Haven; originais e derivados preservados fora da publicação noturna:

- https://polyhaven.com/a/terracotta_floor_tiles
- https://polyhaven.com/a/dark_wood
- https://polyhaven.com/a/white_plaster_02

## Código

three.js e addons: MIT. Template base local: `D:\threejs-lab\templates\game-starter`. As dependências mantêm suas licenças nos respectivos pacotes.

## Decoração curada e lustre importado

Poly Haven / CC0, fontes originais:
- Bronze Ray Statue (Tina): https://polyhaven.com/a/bronze_ray_statue
- Bronze Whale Statue (Tina): https://polyhaven.com/a/bronze_whale_statue
- Antique Ceramic Vase 01 (James Ray Cock): https://polyhaven.com/a/antique_ceramic_vase_01
- Chandelier 02 (Kirill Sannikov): https://polyhaven.com/a/Chandelier_02

Originais em asset-source/curated. Modelos simplificados, texturas WebP de 512 px, geometria Meshopt; arquivos finais em public/models/curated. Total aproximado: 500 KB. São peças decorativas, sem vegetação. Uso por instâncias, sem duplicar texturas por cópia.

## Asset de madeira da cobertura

Modular Wooden Pier — Rico Cilliers / Poly Haven / CC0. Fonte: https://polyhaven.com/a/modular_wooden_pier . Foi extraída uma das peças estruturais de madeira do kit (Plane.062, componente longo de aproximadamente 7 m), preservando UVs e material PBR. A peça foi reduzida de 732 para 130 triângulos, comprimida com Meshopt e mapas WebP 1K. Asset final: public/models/curated/rustic-timber.glb, aproximadamente 535 KB. O arquivo contém uma única viga reutilizada por instâncias. Os originais estão em asset-source/timber; a extração é reproduzível com extract-timber.mjs.

## Forro de painéis de madeira

Dark Paneled Wood — Dimitrios Savva / Poly Haven / CC0. Fonte: https://polyhaven.com/a/dark_paneled_wood . Albedo e normal convertidos para WebP (1K e 512 px) em public/textures/ceiling. O acabamento foi adaptado para ser fosco, com repetição controlada dos painéis, preservando a iluminação superior em 40%. Originais em asset-source/ceiling.


## Plantas pendentes nas pilastras
Hanging Vine — Grab3D / CC0 1.0. Fonte: https://grab3d.com/models/nature/hanging-vine/ . Licença: https://grab3d.com/dl/hanging-vine/LICENSE.txt . Original, manifesto e licença em asset-source/hanging-vine. Modelo autorado proceduralmente em Blender, com folhas volumétricas sem transparência; otimizado com Meshopt, simplificação e texturas WebP de 512 px. Versão ativa public/models/curated/hanging-vine.glb (aproximadamente 140 KB), compartilhada por instâncias. Jardineiras cerâmicas próprias apoiadas na cornija, livres das vigas e sem vasos no piso.

## Set Machado de Assis — sala de época

Poly Haven / CC0 (https://polyhaven.com/license): ArmChair_01, small_wooden_table_01, dining_chair_02, ClassicConsole_01, ornate_mirror_01, fancy_picture_frame_01, fancy_picture_frame_02, marble_bust_01, mantel_clock_01, vintage_grandfather_clock_01, vintage_oil_lamp, brass_candleholders, Chandelier_03, vintage_suitcase, book_encyclopedia_set_01; texturas diagonal_parquet, dark_paneled_wood, dark_wood, beige_wall_001. Originais em `asset-source/polyhaven/`; versões otimizadas (Meshopt + WebP) em `public/models/set/` e `public/textures/set/`.
Papel de parede adamascado, tapete persa e lombadas dos livros: pintados em canvas para este projeto (`src/gallery/PeriodRoom.js`).
O personagem Machado de Assis vem do modelo do usuário (`Machado de Assis.blend`): soldado, reduzido para ~45 mil triângulos e com os braços baixados para sair da T-pose (`asset-source/machado/`).

Foto da janela: "Vista da enseada de Botafogo, a partir do topo do Corcovado" — Marc Ferrez / Instituto Moreira Salles (IMS), domínio público, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Vista_da_enseada_de_Botafogo,_a_partir_do_topo_do_Corcovado.jpg). Recortada e tingida em sépia para `public/textures/set/rio.webp`; original em `asset-source/botafogo_IMS_3000.jpg`.

Poly Haven / CC0 também: potted_plant_02. Cor da foto da janela: colorização procedural (céu, baía, morros) sobre a foto em preto e branco.

Quadros do set (domínio público, Instituto Moreira Salles via Wikimedia Commons): "Visita de estudantes ao Cristo Redentor" (1931) e "Largo do Paço". As janelas: ver acima.

Imagens fornecidas pelo usuário (uso no projeto): duas pinturas de paisagens do Rio de Janeiro nos quadros (`public/textures/set/frame1.webp`, `frame2.webp`) e o pôr do sol de Botafogo/Pão de Açúcar na janela (`rio.webp`, com céu estendido por degradê). Originais em `asset-source/user-images/`.

Janela: pôr do sol de Botafogo/Pão de Açúcar fornecido pelo usuário (7.webp em asset-source/user-images/).

## Set do Aleijadinho (Poly Haven, CC0)
Texturas: white_plaster_02, monastery_stone_floor, old_planks_02. Modelos: gothic_statue, stone_01, rock_07, tree_stump_01, wooden_stool_01, WoodenTable_03, wooden_hammer_01, cross_pein_hammer, handsaw_wood, wooden_ladder_02, wooden_crate_01, wooden_barrels_01, wooden_bucket_01, wicker_basket_01, wooden_candlestick, Lantern_01. Paisagem da janela, riscos e cinzéis: desenhados no projeto (provisórios).

- Profeta Isaías (public/models/set/isaias.glb): asset do usuário, gerado por IA; reduzido de 1 milhão para 60 mil triângulos, cor da textura passada para os vértices. Original em asset-source/user-models/isaias.glb.
- Aleijadinho agora é um canteiro ao ar livre (fundo azul, sem paredes); ateliê fechado e paisagem da janela foram removidos.

### Animação do Machado de Assis
Base de movimento: Adobe Mixamo, Writing (arquivo local Writing.fbx, ação mixamo.com, 5 s a 30 fps). Retarget, contatos, pausa e montagem do loop adaptados para o personagem e a cena. Modelo fornecido pelo usuário.



## Sets de personagens (Machado de Assis, Aleijadinho, André Rebouças)

**Poly Haven (CC0 1.0)** — https://polyhaven.com/license
- Modelos: wooden_stool_01, Lantern_01, wooden_crate_01, wooden_crate_02, wooden_barrels_01, treasure_chest, vintage_suitcase, seadogs_compass, vintage_binocular (simplificados e comprimidos com Meshopt).
- Texturas: monastery_stone_floor, dark_wood, old_planks_02, rust_coarse_01, entre outras do conjunto de ambientação.

**Fornecidos pelo autor do projeto** (criados ou gerados por ele; todos os direitos reservados ao autor, sem licença aberta): modelos dos personagens (Machado de Assis, Aleijadinho), profeta Isaías, imagens de céu/panorama, molduras e quadros. Não reutilize esses arquivos sem autorização.

**Animação do Aleijadinho:** clipe do Mixamo (Adobe), usado conforme os termos do Mixamo.

**Código próprio:** salas, materiais em TSL, rig e animações procedurais, painel de ajuste — licença MIT (ver LICENSE).
