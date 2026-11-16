# Estúdio de rigs dos personagens

Abra `http://localhost:5186/?rig=aleijadinho`, ou use **Rigs** na galeria. O seletor contém os dez modelos da pasta NEGROS. As cópias em `public/models/rig-studio/` têm aproximadamente 65 mil polígonos e texturas de até 1024 px. Só um preview fica carregado; ao trocar são descartados geometria, materiais, texturas e recursos de skinning do anterior. Os arquivos Blender originais não foram alterados.

## Ajustar

- Escolha o personagem, o grupo (corpo, dedos esquerdos, dedos direitos ou todos os ossos) e a articulação.
- Arraste o ponto, ou digite **X, Y e Z em centímetros**, no espaço do preview, a partir do chão. A seleção de pontos sobrepostos pode ser feita pelo menu.
- Frente/costas ajustam largura e altura; vistas laterais ajustam profundidade. **Aproximar ponto** enquadra a mão/articulação; **Ver corpo** recupera a visão geral.
- Ao focar um ponto, as setas movem 5 mm; Shift + seta move 2 cm.
- O seletor mantém os ajustes pendentes durante a sessão. **Salvar rig** grava somente o personagem selecionado; salve cada personagem antes de encerrar/recarregar a página.

Existem esqueletos de deformação no Aleijadinho (22 ossos), Machado de Assis (61) e André Rebouças (52). Machado e André têm 30 articulações de dedos cada. O Aleijadinho atual não tem ossos individuais nos dedos.

Nos sete modelos restantes, os pontos são **guias de marcação**, explicitamente identificados na interface. Essas guias permitem indicar as articulações para a montagem definitiva no Blender. Durante o teste, recebem pesos automáticos provisórios para visualizar a deformação; ao parar, a malha original volta a aparecer. Não são criados dedos artificiais nos modelos sem dedos rigados.

Este trabalho é calibração/marcação de rig. Criar um rig completo também inclui hierarquia, orientações/eixos, pesos de deformação, controles e testes de animação. Os pesos existentes são preservados; nos modelos sem rig, os pesos provisórios servem apenas à prévia e não são gravados no modelo. Nos rigs existentes, atualiza as inversas de skinning para preservar a geometria em repouso. O teste universal está disponível para os dez modelos, independentemente de clipes externos.

## Salvamento para revisão pelo agente

Cada personagem usa sua própria pasta:

```
asset-source/<id>/rig-references/latest.json
asset-source/<id>/rig-references/rig-<data>.json
```

IDs: `aleijadinho`, `machado`, `reboucas`, `adhemar`, `pele`, `gloria`, `luiz-gama`, `milton`, `nilo`, `pixinguinha`.

Schema `character-rig/v2`: `characterId`, caminho do modelo e do `.blend` de origem, transformações originais/ajustadas por osso, `sourceName` (nome original do Blender), cabeças dos ossos no espaço do preview e layout disponível. `mode` diferencia `rest-joint-calibration` de `joint-layout`. Referências antigas `aleijadinho-rig/v1` continuam legíveis quando os ossos coincidem.

`modelHead` usa o espaço local do holder normalizado; `metersPerUnit` converte esse espaço em metros. Para converter a cabeça marcada ao espaço original GLTF: `sourcePoint = modelHead * normalization.sourceHeight + normalization.sourceCenter`. O espaço original GLTF é +Y para cima; ao mapear ao Blender +Z para cima, respeite a transformação de eixos do exportador. As posições locais de ossos existentes preservam as unidades e os eixos originais dos nós e podem ser associadas por `sourceName`.

O Vite aceita GET/POST em `/__reference/<id>-rig`, permite escrita apenas de origem localhost na mesma porta e grava numa pasta fixa por ID permitido. Mantém histórico e uma cópia em localStorage; recupera a mais recente entre navegador e projeto. Sem o servidor de salvamento, baixa um JSON para compartilhar. Não publica nem modifica os GLBs usados nos sets.

## Código e validação

- `src/gallery/RigStudio.js`: catálogo, carregamento sob demanda, previews e sessões por personagem.
- `src/gallery/AleijadinhoRigEditor.js`: editor compartilhado, arraste, campos XYZ, filtros e serialização.
- `tools/RigReferenceStorage.mjs`: armazenamento local por personagem.
- `test-rig-studio.mjs`: dez modelos, campos XYZ, dedos, preservação da malha, isolamento das referências, troca sem perder ajustes, salvamento no projeto, recarga sem preferências locais e botão Salvar no celular. O teste preserva referências anteriores e remove apenas os próprios arquivos de teste.
- `test-rig-editor.mjs`: atalho compatível para os testes ampliados.

`window.__game.rigEditor` é o gerenciador; o editor selecionado está em `window.__game.rigEditor.editor`.

## Aplicação no set do Aleijadinho

O set carrega automaticamente o último rig salvo do Aleijadinho. `SavedRigCalibration.js` valida o esqueleto de origem, recalibra as inversas de skinning e aplica os deslocamentos antes da animação das ferramentas. Os eixos do IK são atualizados e a pose de base é restaurada a cada quadro para evitar acúmulo. Novos salvamentos também atualizam a instância do set já carregada.

O servidor mantém `public/rigs/aleijadinho.json`, incluído no build, como alternativa ao endpoint de desenvolvimento. O arquivo de referência original e seu histórico são preservados. `test-saved-rig.mjs` verifica a aplicação das 22 posições, a integridade da malha em repouso, ausência de deriva, recarga sem o endpoint e integridade do arquivo salvo pelo usuário.

## Teste de animação após editar pontos

`RigPoseSampler.js` reconstrói posições, rotações e escalas dos ossos a partir dos interpoladores originais do clipe, antes da calibração. Isso evita que o cache do AnimationMixer preserve um valor alterado pelo editor em uma trilha constante e que o deslocamento salvo seja somado duas vezes. O mesmo caminho é usado pelo estúdio e pelo Aleijadinho no set.

`test-rig-preview.mjs` reproduz a edição seguida de teste, repete dez ciclos de iniciar/parar, verifica comprimentos dos segmentos e rotações constantes, testa o set e confere os hashes dos arquivos salvos do usuário. Não grava referências.

## Testes universais e rotação

O painel oferece **Sequência completa** (15 segundos), **Andar**, **Pular**, **Mexer braços**, **Flexionar cotovelos** e **Mãos e dedos** (3 segundos por ciclo). Use Testar animação, Pausar/Continuar e Parar teste. Os controles ficam fixos acima de Salvar. O teste respeita os comprimentos e escalas do rig ajustado, parte do repouso a cada quadro e não altera os arquivos salvos. Dedos só dobram nos modelos com ossos de dedos; nos demais o painel informa a limitação.

`UniversalRigTest.js` gera poses por articulação, carrega raízes de dedos exportadas fora da hierarquia da mão e desloca o grupo inteiro no salto, incluindo cadeias de deformação independentes do Rigify. Para os sete modelos sem rig definitivo, cria uma SkinnedMesh temporária com quatro influências normalizadas por vértice. Esses recursos são descartados ao trocar de personagem.

`RigOrbitControls.js` permite arrastar o fundo com mouse ou um dedo para girar horizontal e verticalmente. Roda do mouse ou pinça ajustam a aproximação. O controle Girar modelo e as vistas prontas também funcionam durante os testes. A órbita move a câmera, preservando as coordenadas do rig.

`test-universal-rig.mjs` verifica os dez modelos, caminhada, salto do grupo inteiro, braços, dedos disponíveis, comprimentos e escalas, normalização dos pesos provisórios, retorno ao repouso, pausar, rotação sem alterar pontos, interface móvel e hashes dos salvamentos originais.

## Reconstruir os previews leves

`tools/export-rig-studio.py` lê os arquivos Blender originais sem salvá-los, redimensiona texturas para até 1024 px e exporta aproximadamente 65 mil polígonos por personagem. É necessário aplicar Weld antes de Decimate: vários modelos de origem têm triângulos com vértices desconectados; simplificá-los diretamente removia partes da superfície. O script aceita IDs após `--` para atualizar somente modelos escolhidos e preserva as outras entradas do catálogo. As malhas originais, referências de rig e pesos definitivos não são sobrescritos.

## Tórax e flexão dos joelhos

`TorsoSkinWeights.js` remove a influência dos braços na região central das costelas do Aleijadinho e redistribui esse peso entre os ossos da coluna. A transição na axila permanece gradual. A correção é feita no carregamento, tanto no preview quanto no set, preservando os pontos e arquivos de rig salvos.

O salto universal tem preparação, impulsão, fase aérea e aterrissagem. Coxas avançam e canelas recuam na flexão; a altura do grupo é corrigida em ambos os sentidos para manter os pés apoiados durante a preparação e a aterrissagem.

`test-ribs-and-knees.mjs` verifica a estabilidade de pontos do tórax ao mover os braços, normalização dos pesos, sentido anterior dos joelhos nos dez modelos e contato dos pés. `test-saved-rig.mjs` também verifica a limpeza de pesos no personagem completo do set e preserva os arquivos do usuário.

O teste de cotovelos mantém os braços superiores estáveis e flexiona os antebraços até aproximadamente 110 graus, retornando à extensão. Ele também faz parte da sequência completa. O set usa o último rig salvo automaticamente; o teste de integração confere o timestamp mais recente, as 22 posições, repouso sem deformação e animação sem deriva.

## Punho e marreta durante o golpe

Na animação original, a mão direita mantém a rotação local neutra da bind pose, rígida em relação ao antebraço; a trajetória do punho continua a do clipe. Mão, tiras e marreta acompanham o braço como uma peça. No golpe por IK, o contato é resolvido movendo ombro/cotovelo, sem compensação de rotação no punho; os antigos ângulos/giro por chave e a busca automática de rotação não giram mais a ferramenta de forma independente. Os controles inativos foram retirados do painel, preservando a leitura dos JSONs antigos. O teste test-mallet-lock.mjs verifica 120 quadros de cada modo, ausência de rotação relativa ao antebraço/deriva, trajetória original do punho, comprimentos do clipe, giro do personagem e integridade do rig salvo.

Correção de alinhamento: a referência do clipe de impacto tinha cerca de 35 graus de dobra no punho. A trava usa agora a orientação neutra original da mão. test-mallet-lock.mjs verifica tanto a constância da rotação quanto o alinhamento cabo/antebraço (menos de 2 graus nos 120 quadros de cada modo), para evitar congelar uma dobra incorreta.

## Itens presos aos braços

Abra `?set=aleijadinho&itens` ou o botão **Itens**. O painel seleciona marreta, ponteiro e cada uma das dez tiras/cordas. Posição X/Y/Z é medida em centímetros reais nos eixos do osso que prende a peça; rotação é em graus. Há sliders e campos numéricos, restauração individual, close no item, visão do corpo, outro lado e órbita com mouse/toque. O rodapé fixo permite escolher o instante do golpe, testar/pausar a animação, exportar JSON e salvar.

A edição pausa a pose sem modificar os ossos ou os pesos do personagem. As peças continuam filhas dos mesmos ossos e acompanham a animação com os deslocamentos escolhidos. Ao alterar as ferramentas, os referenciais do IK e o cálculo do instante de impacto são invalidados/atualizados. O rig neutro do punho é preservado.

`AleijadinhoToolEditor.js` lê o último ajuste válido do projeto, navegador ou `public/attachments/aleijadinho.json`. O botão Salvar itens grava localStorage (`legado.aleijadinho.tools.v1`) e POST `/__reference/aleijadinho-tools`. `ToolAttachmentStorage.mjs` valida IDs/ossos fixos, limites numéricos e origem local; escreve `asset-source/aleijadinho/tool-attachments/latest.json`, histórico `itens-<data>.json` e a cópia pública incluída no build. Schema `aleijadinho-tools/v1`: `positionCm`, `rotationDeg`, `bone`, `id` por item, com espaço local do osso explícito. Não altera os arquivos de rig ou Blender.

`test-tool-attachments.mjs` usa o armazenamento real numa pasta temporária isolada e intercepta apenas as rotas de teste no navegador. Verifica os 12 itens, 5 cm reais de deslocamento, nenhuma mudança nos ossos, transformações estáveis durante a animação, salvamento/recarga, fallback público sem preferências locais, reset, órbita, rodapé no celular, histórico e preservação dos arquivos originais.
As peças left-forearm-2 e left-forearm-3 usam agora LeftHand como âncora por ficarem junto ao punho. O leitor aceita o vínculo antigo e converte a transformação pela pose de referência t=0, preservando a posição carregada; novos salvamentos registram LeftHand. Cabeça e pescoço usam rotações locais neutras durante o trabalho e acompanham o tronco sem animação independente. Validação: 120 quadros, erro de migração <1e-14, nenhuma deriva das amarras e rotação independente nula da cabeça/pescoço; arquivo salvo preservado.
