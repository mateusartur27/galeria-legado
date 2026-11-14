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
