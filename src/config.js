// Presets de estilo (direção de arte) e níveis de qualidade.
// Trocar de estilo: ?style=ink | toy | painterly | real | synthwave | kit | matcap | faceted
// qualidade: ?quality=low | medium | high   ·   Debug: ?debug (Inspector do three)   ·   forçar WebGL2: ?webgl
//
// Cada preset = um site de referência analisado em D:\threejs-lab\analysis (nome do estilo entre parênteses).
// Chaves que não aparecem num preset vêm de DEFAULTS (fim do arquivo).

const params = new URLSearchParams( location.search )

export const STYLES = {

	// Campinho do mensageiro (Messenger / abeto, cores amostradas de screenshot do jogo):
	// câmera baixa atrás do personagem (céu = metade da tela), céu turquesa com nuvens pintadas em pinceladas,
	// chão verde SATURADO e liso com tufos desenhados a traço + pedrinhas creme, sombra chapada verde-azulada (sem hachura),
	// pedras creme com rachaduras, árvores altas de tronco fino e copa com pintas. Névoa exp² leve, sem dessaturar.
	meadow: {
		label: 'Ink Meadow',
		shading: 'bands', bandEdge: 0.02, bandSoft: 0.03,
		// sem o círculo de "ver através" (dither em volta do jogador): a câmera encosta em prédio/pedra/tronco. ?seeThrough=1 volta
		seeThrough: false,
		// sombra do Messenger: a própria cor com matiz − 0,02 e valor × 0,5 (linear). '?shadow=tint&shadowValue=0.74' = turquesa antigo
		shadowModel: 'hsv', shadowHueShift: 0.02, shadowValue: 0.5,
		shadowTint: '#4f9aa8', shadowHue: 0.0, shadowSat: 1.08,
		ambient: 0.06, rim: 0.0, bounce: 0.08,
		// brilho chapado do Messenger (recorte do Phong × 0.075, só faces não horizontais): DESLIGADO — no terreno inclinado vira
		// mancha pálida e na calça preta do personagem mancha cinza (esses dois ficam sem); em casa/pedras (faces planas) quase nunca
		// aparece. ?spec=0.075 liga para testar
		specular: null,
		sun: { color: '#fffaf0', intensity: 1.0, elevation: 52, azimuth: 120 },
		// outline: nuvens contornadas por ID (céu grava 3 IDs + tinta; ?skyInk=1 liga). DESLIGADO: nossas nuvens são pinceladas
		// finas e compridas → em várias câmeras o contorno vira "fios" paralelos no céu. Pede nuvens em bolo (como as do Messenger)
		sky: { style: 'painted', zenith: '#4db2ad', horizon: '#86d6cb', cloud: '#a9eadf', cloudShade: '#7fd0c6', sunGlow: '#ffffff', outline: false },
		// névoa exp² do Messenger (cor perto → longe); ?fog=linear volta à linear (near/far) · ?fogDensity=0.012
		fog: { mode: 'exp2', color: '#86d6cb', farColor: '#a6ddd6', density: 0.009, near: 90, far: 260 },
		// mode 'central' (Messenger): diferença central em cruz + fit duplo (?outline=max volta ao máximo dos vizinhos).
		// central = [faixa a, faixa b, limiar] de cada variação; profundidade relativa com limiar + 1 − |normal.z|
		outline: {
			enabled: true, color: '#22302c', thickness: 1.25, depth: 0.012, normal: 0.4, fadeStart: 40, fadeEnd: 140, ids: true,
			mode: 'central', central: { depth: [ 0, 0.05, 0.25 ], normal: [ 1.0, 1.4, 0.3 ], id: [ 0.001, 0.002, 0.1 ] }
		},
		// caneta: pressão (ruído preso ao mundo) abre falhas no traço e engrossa onde aperta (thick = raio do traço grosso ÷ fino)
		pen: { scale: 0.09, gaps: 0.12, thick: 1.7 }, // gaps ≈ fração do traço que falha
		hatch: null, // o Messenger não hachura: sombra é mancha chapada
		bloom: null,
		tilt: null,
		world: {
			size: 76, segments: 152, relief: 'meadow', lawn: 'wide', lawnKeep: 0, tufts: 2400, flecks: true, grass: true, crispRock: true,
			// estrias da rocha como ID (o contorno desenha as faixas) · ?strata=color = só cor
			rockStrata: 'id',
			// mar do Messenger: degraus de cor pela distância da margem + listras de onda andando (?water=smooth = degradê antigo)
			water: 'bands',
			// um pedaço de grama alta do estilo ink (balança, pisada deixa rastro), com a sombra azul-violeta e funda do ink
			grassField: { x: 10, z: - 2, r: 8, shadowTint: '#6d7fc4', shadowValue: 0.44 },
			// tufos do Messenger: cartão com silhueta desenhada (atlas gerado por código), virado para a câmera e preso ao up do chão,
			// ID por tufo (contorno fechado), base sem tinta, tinta some de 5 a 10 m (longe = mancha de cor).
			// '?tuftStyle=blades&tuftIds=0' = leque de lâminas antigo (com ID ele escurecia: cada lâmina ganhava contorno)
			tuftStyle: 'card', tuftIds: true,
			treeCount: 17, rockCount: 16, trees: 'tall', rocks: 'slab', treeScale: [ 1.1, 1.7 ], rockScale: [ 0.5, 3.4 ],
			// natureza CC0 (Quaternius Stylized Nature MegaKit → tools/nature/build_nature.py); cor/traço vêm do estilo
			nature: {
				canopy: 'cards', // 'model' = folhas do asset · 'cards' = copa do Messenger (cartões, contorno só na silhueta). ?canopy=model
				model: './models/nature.glb',
				// TwistedTree fica de fora: ~9,5k tris e copa enorme em cartões alfa (overdraw) — ~1 ms a mais numa iGPU
				trees: [ 'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5' ],
				treeHeight: [ 6, 9.5 ],
				rocks: [ 'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3' ], rockWidth: 2.4,
				plants: [ 'Bush_Common', 'Bush_Common', 'Fern_1', 'Plant_1_Big', 'Plant_7_Big' ], bushes: 55
			},
			village: { x: - 7, z: - 9.5, r: 5.5, rotation: 0.64 }
		},
		camera: { fov: 42, pitch: 0.1, distance: 6.2, height: 1.55, lead: 0.12 },
		grade: { saturation: 1.06, contrast: 1.04, shadows: '#1f4a4a', highlights: '#fffbf0', split: 0.05 },
		vignette: 0, // ilustração chapada: sem escurecer os cantos
		// personagem riggado CC0 (Quaternius UBC + UAL) estilizado por tools/character/build_kid.py
		// inkNoise: traço com falhas presas ao corpo (ruído na posição local) · shadowCut: sombra com corte duro (Messenger 0.1–0.15)
		// ?kidInk=0 / ?kidCut=0 voltam ao traço da caneta do mundo / às faixas
		character: { model: './models/kid.glb', anims: './models/kid_anims.glb', height: 1.38, headScale: 1.28, inkNoise: true, shadowCut: [ 0.1, 0.15 ] },
		toneMapping: 'neutral', exposure: 1.0,
		palette: {
			grass: '#4fa060', grassDry: '#5aa865', sand: '#e6dcb6', rock: '#e2d8b2', dirt: '#cdbf92',
			trunk: '#9a948c', leaves: [ '#3e8e5a', '#4a9c61', '#337e52' ], water: '#4fb6b8', waterDeep: '#2a7f8e',
			// campo de grama alta = as cores e a sombra do estilo ink
			fieldGrass: '#7fae62', fieldDry: '#b9b86a',
			tuft: '#2f7d4c', fleck: '#e3d9b2', ink: '#22302c', rockShadow: '#a8987e',
			player: '#e8743b', playerSkin: '#f2c9a0', hat: '#f1e3b8',
			wall: '#f0e6d0', roof: '#c96c55', wood: '#8a6a52', window: '#86bcc6', mailbox: '#e8743b', metal: '#5a6466',
			chimney: '#b8a58e', gable: '#e6dac0', lamp: '#fff1c8', crate: '#a68466', paper: '#f6efe0'
		},
		paletteTexture: true // paleta vira textura (4 variações por cor); terreno e casa leem dela
	},

	// Messenger / Abeto (ink-diorama): traço de nanquim, 2 tons, sombra com matiz deslocado, paleta dessaturada.
	ink: {
		label: 'Ink Diorama',
		shading: 'bands', bandEdge: 0.05, bandSoft: 0.04,
		shadowTint: '#6d7fc4', shadowHue: 0.06, shadowSat: 1.05, shadowValue: 0.44,
		ambient: 0.16, rim: 0.0, bounce: 0.15,
		sun: { color: '#fff3e0', intensity: 1.0, elevation: 46, azimuth: 160 },
		sky: { zenith: '#5fb8b3', horizon: '#cfe8d8', sunGlow: '#fff6dc' },
		fog: { color: '#cfe8d8', near: 45, far: 150 },
		outline: { enabled: true, color: '#2c363b', thickness: 1.25, depth: 0.012, normal: 0.45, fadeStart: 35, fadeEnd: 110 },
		bloom: null,
		tilt: null,
		grade: { saturation: 0.92, contrast: 1.04, shadows: '#1f3e4a', highlights: '#fff1d6', split: 0.12 },
		toneMapping: 'neutral', exposure: 1.0,
		palette: {
			grass: '#7fae62', grassDry: '#b9b86a', sand: '#e6d2a2', rock: '#8d8f8a', dirt: '#a98a64',
			trunk: '#6e5546', leaves: [ '#5d9a5b', '#77ad5f', '#4f8a63' ], water: '#3f9db0', waterDeep: '#1f5f7a',
			player: '#e8743b', playerSkin: '#f2c9a0', hat: '#f1e3b8'
		}
	},

	// Bruno Simon 2025 (toy-diorama): Lambert TSL, sombra colorida, luz rebatida, bloom leve + tilt-shift.
	toy: {
		label: 'Toy Diorama',
		shading: 'soft', bandEdge: - 0.1, bandSoft: 0.55,
		shadowTint: '#6a74f0', shadowHue: 0.28, shadowSat: 1.15, shadowValue: 0.5,
		ambient: 0.14, rim: 0.25, bounce: 0.35,
		sun: { color: '#ffffff', intensity: 1.0, elevation: 50, azimuth: 150 },
		sky: { zenith: '#4d7de0', horizon: '#ffcfa8', sunGlow: '#fff2c4' },
		fog: { color: '#f2c6b4', near: 55, far: 170 },
		outline: null,
		bloom: { strength: 0.25, radius: 0.4, threshold: 1.0 },
		tilt: { start: 0.18, end: 0.5, amount: 0.004 },
		grade: { saturation: 1.08, contrast: 1.02, shadows: '#3a2a6b', highlights: '#fff0d8', split: 0.1 },
		toneMapping: 'neutral', exposure: 1.0,
		palette: {
			grass: '#a9c24a', grassDry: '#d6c75a', sand: '#f3d79c', rock: '#9e9aa8', dirt: '#c49a6c',
			trunk: '#7a4f3a', leaves: [ '#6bb04f', '#8cc152', '#4f9a55' ], water: '#3fb0c9', waterDeep: '#235ea8',
			player: '#ff5a5f', playerSkin: '#ffd2a8', hat: '#ffe066'
		}
	},

	// Bruno Simon 2025 FIEL (folio-2025, MIT; estudo em analysis/03 — só números e técnica, código nosso):
	// luz = cor × luz do momento; sombra = cor × cor da sombra (roxa de dia) com borda larguíssima (smoothstep(−0,25, 1, N·L));
	// sem céu: fundo e névoa são o MESMO degradê de tela (ciano → lilás); folhagem fofa em cartões (world/Foliage.js);
	// ciclo dia/entardecer/noite/amanhecer de 4 min (render/DayCycle.js) com lanternas que acendem (world/Lamps.js);
	// bloom leve + tilt-shift; carrinho (F). Números do jogo: luz #ffd2c2 × 1,2, sombra #6d3fff, névoa #00ffff → #9b89ff,
	// grama #b8b62e, terra #ffa94e, água #5bc2b9 → #13375f, arbustos #b4b536 / #d8cf3b
	bruno: {
		label: 'Bruno Simon',
		shading: 'soft', bandEdge: 0.375, bandSoft: 0.625, // = smoothstep(−0,25, 1, N·L)
		shadowModel: 'mult', shadowTint: '#6d3fff',
		ambient: 0, rim: 0, bounce: 0.3,
		sun: { color: '#ffd2c2', intensity: 1.2, elevation: 54, azimuth: 49 },
		sky: { style: 'radial', zenith: '#00ffff', horizon: '#9b89ff', sunGlow: '#ffffff' },
		// degradê de tela do canto de cima à esquerda (ciano) para o resto (lilás); near/far = metros da câmera (o ciclo muda)
		fog: { mode: 'radial', color: '#00ffff', colorB: '#9b89ff', center: [ 0, 0 ], start: 0, end: 1.25, near: 22, far: 75 },
		outline: null,
		bloom: { strength: 0.25, radius: 0.4, threshold: 1.0 },
		tilt: { start: 0.2, end: 0.5, amount: 0.003 },
		grade: null,
		vignette: 0,
		toneMapping: 'none', exposure: 1.0,
		shadows: { type: 'map', radius: 3 },
		dayCycle: {
			duration: 240, start: 0.05, sunSwing: [ 18, 70 ],
			// momentos (cores do jogo; near/far em metros, ajustados para a nossa câmera em 3ª pessoa)
			presets: {
				day: { sunColor: '#ffd2c2', intensity: 1.2, shadow: '#6d3fff', fogA: '#00ffff', fogB: '#9b89ff', near: 22, far: 75, night: 0 },
				dusk: { sunColor: '#ff8181', intensity: 1.2, shadow: '#4e009c', fogA: '#3e53ff', fogB: '#ff4ce4', near: 14, far: 70, night: 0.5 },
				night: { sunColor: '#3240ff', intensity: 3.8, shadow: '#2f00db', fogA: '#10266f', fogB: '#490a42', near: 4, far: 55, night: 1 },
				dawn: { sunColor: '#ffa882', intensity: 1.2, shadow: '#db004f', fogA: '#f885ff', fogB: '#ff7d24', near: 20, far: 75, night: 0.3 }
			},
			keys: [ [ 0, 'day' ], [ 0.15, 'day' ], [ 0.25, 'dusk' ], [ 0.35, 'night' ], [ 0.6, 'night' ], [ 0.8, 'dawn' ], [ 0.9, 'day' ], [ 1, 'day' ] ]
		},
		world: {
			trees: 'foliage', treeScale: [ 0.9, 1.35 ], treeCount: 140, bushes: 160, lamps: 26,
			rocks: 'round', rockCount: 50, grass: true
		},
		vehicle: { track: null }, // carrinho solto no mundo: F entra/sai
		// câmera alta e longe (o jogo dele é visto de cima; a grama vira textura) — arrastar/roda continuam livres
		camera: { fov: 30, pitch: 0.72, distance: 18, height: 0.9, lead: 0.18 },
		palette: {
			grass: '#b8b62e', grassDry: '#c7bd3c', sand: '#ffa94e', dirt: '#e8944a', rock: '#b8a49a',
			trunk: '#8c5a4a', leaves: [ '#b4b536', '#d8cf3b' ], foliage: [ '#b4b536', '#d8cf3b' ],
			water: '#5bc2b9', waterDeep: '#13375f',
			player: '#ff5a5f', playerSkin: '#ffd2a8', hat: '#ffe066',
			lamp: '#ffb347', metal: '#4a3f5c', car: '#e23b4e', carGlass: '#3a2f5a'
		}
	},

	// Summer Afternoon (painterly-ramp): rampas pintadas por material + névoa em HSV (perspectiva atmosférica).
	painterly: {
		label: 'Painterly Ramp',
		shading: 'ramp', bandEdge: 0.0, bandSoft: 0.3,
		shadowTint: '#5f78d0', shadowHue: 0.12, shadowSat: 1.1, shadowValue: 0.42,
		ambient: 0.16, rim: 0.12, bounce: 0.25,
		sun: { color: '#ffe8c7', intensity: 1.0, elevation: 26, azimuth: 172 },
		sky: { zenith: '#2f8fd6', horizon: '#d6efff', sunGlow: '#ffe4bd' },
		fog: { color: '#cfe6f7', near: 55, far: 230, hsv: true },
		outline: { enabled: true, color: '#4a4e6a', thickness: 0.9, depth: 0.03, normal: 0.9, fadeStart: 20, fadeEnd: 70 },
		bloom: { strength: 0.12, radius: 0.5, threshold: 1.1 },
		tilt: null,
		leafShadows: true,
		grade: { saturation: 1.12, contrast: 1.08, shadows: '#2b3f7a', highlights: '#ffe9c8', split: 0.14 },
		toneMapping: 'agx', exposure: 1.05,
		palette: {
			grass: '#8fbf5a', grassDry: '#c9c46a', sand: '#efdcae', rock: '#a7a49c', dirt: '#b99572',
			trunk: '#6b5040', leaves: [ '#5f9e4e', '#7db55a', '#4c8a52' ], water: '#4fb3d1', waterDeep: '#2a6fa8',
			player: '#f4f1e6', playerSkin: '#f0c9a2', hat: '#e9d38a'
		}
	},

	// Firewood / screen.toys (photoreal-tactile): PBR, sol baixo e forte, sombras longas,
	// GOBO (vídeo de folhas projetando sombra animada), copas com furos na sombra, relevo exagerado (bump) e lenha que racha.
	// Realismo de verdade ainda pede assets escaneados (fotogrametria) — ver analysis/02.
	real: {
		label: 'Photoreal Tactile',
		shading: 'pbr',
		sun: { color: '#fff0d6', intensity: 3.4, elevation: 34, azimuth: 205 },
		sky: { zenith: '#5c8fd1', horizon: '#dfe9f2', sunGlow: '#fff4e0' },
		fog: { color: '#dfe9f2', near: 60, far: 220 },
		ambient: 0.55,
		outline: null,
		bloom: { strength: 0.08, radius: 0.3, threshold: 1.2 },
		tilt: null,
		shadows: { type: 'map', radius: 4 },
		gobo: { video: './gobo/leaves.webm', scale: 13, coverage: 0.36, threshold: 0.5, distance: 5 },
		leafShadows: true,
		world: { bump: 1 },
		grade: { saturation: 1.02, contrast: 1.05, shadows: '#20262e', highlights: '#fff3e2', split: 0.06 },
		toneMapping: 'neutral', exposure: 1.0,
		palette: {
			grass: '#5f7f3a', grassDry: '#8f8a4a', sand: '#cdbb92', rock: '#7c7a74', dirt: '#7a6048',
			trunk: '#5a4334', leaves: [ '#4f7a35', '#5f8a3a', '#3f6a30' ], water: '#4a8f9c', waterDeep: '#22566a',
			player: '#c8553d', playerSkin: '#e0b48f', hat: '#d9c9a0'
		}
	},

	// Shopify Horizon Drive (synthwave-neon): pôr do sol roxo/rosa, sol listrado, estrelas, silhuetas facetadas,
	// grade neon emissiva com bloom, névoa colorida forte, palmeiras.
	synthwave: {
		label: 'Synthwave Neon',
		shading: 'soft', bandEdge: 0.0, bandSoft: 0.35,
		shadowTint: '#3a2a9a', shadowHue: 0.0, shadowSat: 1.1, shadowValue: 0.5,
		ambient: 0.16, rim: 0.6, bounce: 0.15,
		sun: { color: '#ff7ab8', intensity: 1.15, elevation: 9, azimuth: 225 }, // sol ROSA: laranja × roxo = marrom
		sky: {
			style: 'synthwave', zenith: '#120a2e', mid: '#5a1e7a', horizon: '#ff7a59', sunGlow: '#ff6fa8',
			sunTop: '#ffe46b', sunBottom: '#ff3d8b', sunSize: 0.13, stars: true
		},
		fog: { color: '#a8407e', near: 25, far: 150 },
		outline: null,
		bloom: { strength: 0.6, radius: 0.55, threshold: 0.95 },
		tilt: null,
		world: { grass: false, trees: 'palm', facets: 1, grid: { color: '#ff3fb4', spacing: 3, width: 1.1, intensity: 3.2 } },
		vehicle: { track: 'neon' }, // carro arcade + pista em laço com bordas neon (F entra/sai)
		firewood: false,
		camera: { fov: 46, pitch: 0.2, distance: 11 }, // baixa: horizonte + sol no quadro (silhuetas contra o pôr do sol)
		grade: { saturation: 1.15, contrast: 1.06, shadows: '#2a0f5a', highlights: '#ffc27a', split: 0.18 },
		toneMapping: 'neutral', exposure: 1.0,
		palette: {
			grass: '#2a1450', grassDry: '#341a5c', sand: '#4a2366', rock: '#22123f', dirt: '#2e1650',
			trunk: '#26123f', leaves: [ '#1f6f86', '#24557e', '#2a3f7a' ], water: '#2a0f4f', waterDeep: '#12052a',
			player: '#1fe0ff', playerSkin: '#ffd2e6', hat: '#ff3fb4', playerGlow: '#1fe0ff', car: '#1b1033', carGlass: '#3a1f6e'
		}
	},

	// Starter Kit Racing / Kenney (clean-toy-kit): PBR simples, luz hemisférica + sol forte, sombras nítidas,
	// fundo = névoa cinza-azulada, terreno em degraus, pinheiros de cone, câmera isométrica fixa (FOV 40).
	kit: {
		label: 'Clean Toy Kit',
		shading: 'pbr',
		sun: { color: '#ffffff', intensity: 2.6, elevation: 55, azimuth: 135 },
		sky: { style: 'flat', zenith: '#adb2ba', horizon: '#adb2ba', sunGlow: '#ffffff' },
		fog: { color: '#adb2ba', near: 45, far: 120 },
		hemi: { sky: '#c8d8e8', ground: '#7a8a5a', intensity: 0.8 }, // metade: a GI assada completa a luz indireta
		ambient: 0,
		outline: null,
		bloom: { strength: 0.02, radius: 0.3, threshold: 1.0 },
		tilt: null,
		shadows: { type: 'map', radius: 1 },
		world: { grass: false, trees: 'cone', terrace: 1.6, facets: 0.35 },
		vehicle: { track: 'kit' }, // pista cinza com zebra vermelho/branco
		gi: { size: [ 110, 16, 110 ], probes: [ 14, 3, 14 ], perFrame: 24, intensity: 0.7 }, // LightProbeGrid assado (GI)
		firewood: false,
		camera: { fov: 40, yaw: Math.PI * 0.25, pitch: 0.62, distance: 19, fixed: true, lead: 0.35 },
		grade: { saturation: 1.05, contrast: 1.02, shadows: '#30343a', highlights: '#fffaf0', split: 0.04 },
		toneMapping: 'aces', exposure: 0.95,
		palette: {
			grass: '#77c35a', grassDry: '#9ccf5e', sand: '#efd9a0', rock: '#a3a9b3', dirt: '#c69a6a',
			trunk: '#8a5a3c', leaves: [ '#3fae6a', '#56c06f', '#2f9a5f' ], water: '#4fb7e8', waterDeep: '#2a78c4',
			player: '#ff6b4a', playerSkin: '#ffd2a8', hat: '#3d8bff', car: '#e8453c', carGlass: '#3b4a5e'
		}
	},

	// Bruno Simon 2019 (matcap-toy): sem luz real — matcap (esfera pintada) × cor, luz indireta laranja do chão,
	// sombras falsas (blob) em vez de shadow map, mundo laranja, câmera isométrica fixa.
	matcap: {
		label: 'Matcap Toy',
		shading: 'matcap',
		shadowTint: '#a8401f', shadowHue: 0.0, shadowSat: 1.1, shadowValue: 0.55,
		ambient: 0.0, rim: 0.0, bounce: 0.55,
		sun: { color: '#ffffff', intensity: 1.0, elevation: 60, azimuth: 135 },
		sky: { style: 'flat', zenith: '#f4a565', horizon: '#f4a565', sunGlow: '#ffffff' },
		fog: { color: '#f4a565', near: 40, far: 115 },
		matcap: { key: '#fff4e6', fill: '#ff9a5c', rim: '#ffe2c4', spec: 0.55, ambient: 0.32 },
		outline: null,
		bloom: null,
		tilt: null,
		shadows: { type: 'blob' },
		world: { grass: false, trees: 'lowpoly', facets: 0 }, // chão liso (o "piso infinito" do Bruno 2019)
		camera: { fov: 38, yaw: Math.PI * 0.25, pitch: 0.75, distance: 18, fixed: true, lead: 0.3 },
		grade: { saturation: 1.06, contrast: 1.03, shadows: '#6b2a1a', highlights: '#fff3e0', split: 0.08 },
		toneMapping: 'none', exposure: 1.0,
		palette: {
			grass: '#f0a463', grassDry: '#f2ab6a', sand: '#f7c58c', rock: '#f6efe6', dirt: '#ee9f60',
			trunk: '#8a4b2e', leaves: [ '#ff5f5a', '#ffd166', '#7bd389', '#ffffff' ], water: '#3cc6c9', waterDeep: '#1f8fa8',
			player: '#e8323c', playerSkin: '#ffd8b8', hat: '#ffffff'
		}
	},

	// Interland / Google (flat-faceted): tudo facetado (normal por face), cores saturadas e poucas, Lambert + sombra
	// colorida, árvores low-poly, céu azul claro liso, névoa linear = céu, leve variação de cor por triângulo (papercraft).
	faceted: {
		label: 'Flat Faceted',
		shading: 'soft', bandEdge: 0.0, bandSoft: 0.22,
		shadowTint: '#8796c4', shadowHue: 0.03, shadowSat: 1.05, shadowValue: 0.58,
		ambient: 0.28, rim: 0.0, bounce: 0.2,
		sun: { color: '#ffffff', intensity: 1.0, elevation: 48, azimuth: 140 },
		sky: { zenith: '#6cc4ff', horizon: '#d4f0ff', sunGlow: '#ffffff' },
		fog: { color: '#c6e9ff', near: 40, far: 150 },
		outline: null,
		bloom: null,
		tilt: null,
		world: { grass: false, trees: 'lowpoly', facets: 1, facetJitter: 0.07, floating: true }, // ilha flutuante + ilhotas
		grade: { saturation: 1.0, contrast: 1.03, shadows: '#25407a', highlights: '#ffffff', split: 0.06 },
		toneMapping: 'neutral', exposure: 1.02,
		palette: {
			grass: '#62bf4a', grassDry: '#8cc957', sand: '#f2dc8a', rock: '#8aa0b8', dirt: '#c9a36b',
			trunk: '#8a5a3c', leaves: [ '#3fb34f', '#5cc843', '#2e9e57' ], water: '#3cc2f0', waterDeep: '#1f7fd0',
			player: '#ff4d6d', playerSkin: '#ffd2a8', hat: '#ffc94d'
		}
	}

}

// Messenger fiel (abeto): o mesmo mundo do meadow, mas com o visual do jogo e nada da nossa mistura (sem campo de grama alta,
// sem pinceladas no céu, sem LUT/tone mapping). Números = receitas estudadas (skill messenger-style) + cores medidas em prints do
// jogo rodando localmente (D:\threejs-lab\screens\messenger). Só números e técnica: nenhum arquivo do jogo entra aqui.
const M = STYLES.meadow
STYLES.messenger = {
	...M,
	label: 'Messenger',
	// sombra: smoothstep(0.2, 0.4, N·L × sombra) entre a cor e a cor HSV (valor × 0,5, matiz − 0,02)
	shading: 'bands', bandEdge: 0.3, bandSoft: 0.1,
	shadowModel: 'hsv', shadowHueShift: 0.02, shadowValue: 0.5,
	ambient: 0.04, bounce: 0.04,
	specular: { amount: 0.075, shininess: 30 }, // casa/pedras (terreno, grama, copas e personagem ficam sem)
	sun: { color: '#ffffff', intensity: 1.0, elevation: 55, azimuth: 135 },
	// céu dos prints: fundo #65c1bc chapado + massas de nuvem #a0e5d6, borda rasgada, sem traço
	sky: { style: 'blobs', zenith: '#65c1bc', horizon: '#8fd6cc', cloud: '#a0e5d6', coverage: 0.44, sunGlow: '#ffffff', outline: false },
	// 0.011 (planeta deles) lava as árvores do nosso mundo pequeno; 0.006 = fundo só um pouco mais claro
	fog: { mode: 'exp2', color: '#7fcbc4', farColor: '#95d8cf', density: 0.006, near: 90, far: 260 },
	// traço dos prints em DPR 1 e 2: ~2–2,5 px físicos nas duas resoluções → deslocamento fixo de 1,15 px (faixa central ≈ 2,3 px);
	// antes (2.0 × altura/1080) dava ~5 px numa tela HiDPI. Dobras mais sensíveis (o jogo tem muitas linhas internas finas) e
	// fade mais longe (de longe ainda há tinta)
	outline: {
		...M.outline, color: '#373f42', thickness: 1.15, resScale: 'fixed', fadeStart: 60, fadeEnd: 220,
		central: { ...M.outline.central, normal: [ 0.6, 1.0, 0.3 ] }
	},
	// traço de espessura constante com falhas curtas e frequentes (paredes dos prints): caneta sem o traço grosso
	pen: { scale: 0.22, gaps: 0.12, thick: 1 },
	world: {
		...M.world,
		grass: false, grassField: null, // grama alta é do nosso estilo; o Messenger só tem tufos-cartão
		tuftInkFar: [ 14, 26 ], // tinta dos tufos some de 14 a 26 m (com traço fino o tufo pequeno não vira borrão; meadow: 5–10)
		// ilha 2× maior (150 m) com um CAMPO grande e manso cortado pelo ramal da rua (flores pintadas no chão, árvores só na borda)
		// 400 m (≈7× a área de 150 m). Densidade medida contra o orçamento: 30k tufos / 150 árvores / 400 arbustos = 6,6 ms (p95 7,8)
		// treeCount = árvores espalhadas; os bosques dos biomas somam ~60 (de dentro de um bosque denso o frame passava de 8 ms)
		size: 400, segments: 400, tufts: 14000, treeCount: 95, rockCount: 90,
		field: { x: 55, z: 70, r: 45 },
		// biomas em pedaços do mapa (borda recortada; cores <kind>* na paleta): outono chinês em volta da cidade antiga (bordo
		// vermelho/laranja e ginkgo amarelo, capim dourado, folhas no chão), estepe seca no fim da rua a sudeste, pinheiral frio a
		// sudoeste. trees = árvores a mais dentro do bioma (bosque; a cidade antiga não tem árvore no platô). ?biomes=0 desliga
		biomes: [
			{ kind: 'autumn', x: - 92, z: 48, r: 85 },
			{ kind: 'autumn', x: - 118, z: - 32, r: 44, trees: 20 }, // bosque de bordos e ginkgos ao sul da cidade
			{ kind: 'autumn', x: - 22, z: 112, r: 38, trees: 16 }, // e outro ao norte, na saída do campo de flores
			{ kind: 'steppe', x: 92, z: - 92, r: 62 },
			{ kind: 'pine', x: - 70, z: - 105, r: 60, trees: 18 }
		],
		// cidade murada da China antiga (Primaveras e Outonos, ~770–476 a.C.) no fim da rua principal, portão virado para ela
		// (Village kind 'zhou', 64 m de muralha). r/fall = platô aplainado (largo: cabe o fosso e os campos de painço);
		// moat = fosso quadrado escavado abaixo do mar (a água do mapa aparece nele), ponte no portão
		ancient: { kind: 'zhou', x: - 80.4, z: 51.1, r: 72, fall: 14, rotation: 2.21, size: 64, moat: { inner: 37, width: 6 } },
		// moradores e animais (world/Folk.js, world.folk = { walkers, idle, horses, chickens }) foram tirados a pedido — o módulo continua
		// pedras = pilhas de lajes geradas em código (world/Rocks.js: creme, camadas, escorridos, pouco musgo) · ?rocks=model volta ao
		// modelo CC0 com grama no topo (rockGrass)
		// pedras = modelo CC0 com grama no topo (as pilhas de lajes de world/Rocks.js ficaram de fora a pedido: rockStyle 'slabs',
		// cliffSlabs { cell, density } as ligam) · rockSlabLook: a rocha do terreno em creme com faixas
		nature: { ...M.world.nature, rockGrass: true, rockLook: 'messenger', bushes: 260 },
		rockSlabLook: true,
		// rocha no desenho dos prints (render/RockLook.js) na serra e nas pedras; sem as estrias contínuas por ID. ?rockLook=old
		rockLook: 'messenger', rockStrata: 'none',
		bank: { height: 0.32 }, // faixa de terra molhada em volta do rio e do mar
		// SERRA a sudoeste (crista de ~40 m com picos e rochedos, pinheiral nas encostas) e RIO que nasce perto do topo, desce
		// a serra (corredeiras brancas onde cai rápido) e deságua no mar ao sul. ?sierra=0 desliga os dois
		sierra: { path: [ [ - 135, - 28 ], [ - 112, - 50 ], [ - 88, - 72 ], [ - 62, - 92 ] ], height: 42, width: 40 },
		river: { spring: [ - 95, - 62 ], mouth: [ 40, - 165 ], width: [ 1.1, 4.5 ], depth: 0.8, pull: 1.1 }, // pull baixo (0.35) = desce direto pela costa mais próxima (rio de 90 m)
		rockCracks: false, rockFacets: false, // na serra, rachaduras + facetas viravam rabisco
		strataScale: 0.32, // estrias da rocha mais espaçadas (a 0.85, a serra de 40 m virava rabisco)
		rockHeight: [ 60, 70 ], // serra verde: só a encosta íngreme vira rocha (padrão 11–14 m pintaria a serra toda de pedra)
		// rua de cidadezinha no lugar da casinha (Village kind 'town'): 4 prédios, muro de arrimo, guard-rail, postes com fios, mato.
		// road = segmentos LOCAIS da vila: principal de praia a praia (116 m) + ramal que passa pelo spawn, atravessa o campo e
		// desce até a praia; o Terrain aplaina o chão sob elas
		village: { ...M.world.village, kind: 'town', r: 7, tuftClear: 7.5, road: [ [ - 46, 4.8, 145, 4.8 ], [ 0, 4.8, 0, 158 ] ], roadWidth: 3.4 }
	},
	camera: { fov: 50, pitch: 0.14, distance: 6.6, height: 1.45, lead: 0.12 }, // prints: céu ocupa ~metade da tela
	grade: null, // sem LUT própria (a deles é asset); cor vem direto da paleta
	toneMapping: 'none', exposure: 1.0,
	palette: {
		...M.palette,
		// medidas nos prints (gramado, folhas, rocha, parede) + receitas (folhas #649c75 / #4e8c6d, traço #373f42)
		// rocha das falésias dos prints: #9b9886 é o lado na SOMBRA; o lado no sol é bege (#c9c2a5 × sombra HSV ≈ #9b9886).
		// Sombra da pedra = HSV como o resto (sem a tinta bege do meadow)
		grass: '#4c9966', grassDry: '#57a06d', sand: '#c8bf9c', rock: '#d3c8a5', rockShadow: null,
		dirt: '#468f5f', // encosta íngreme = grama mais escura até a pedra (nos prints não há faixa de terra em volta da rocha)
		rockSlab: '#d9cfad', // pilhas de lajes (creme claro dos prints)
		trunk: '#8b8a80', leaves: [ '#589e72', '#4e8c6d', '#649c75' ],
		// água medida nos prints do rio/lago do jogo: petróleo escuro, médio e manchas claras; espuma creme
		water: '#307878', waterDeep: '#206468', waterLight: '#68c0c0',
		riverColors: { deep: '#206468', mid: '#307878', light: '#68c0c0', fallDark: '#086868', fallMid: '#50b0b0', foam: '#f0f8e8' },
		bank: '#8f8068', // terra molhada em volta da água
		tuft: '#3f8a5c', fleck: '#c8c2a8', ink: '#373f42',
		wall: '#c3c4b2', roof: '#86706c', wood: '#6e6258', window: '#4a5354', mailbox: '#a8423f', metal: '#6b7a78',
		chimney: '#a39d8c', gable: '#b5b5a3', lamp: '#efe6c8', crate: '#8f7a64', paper: '#ece8da',
		// esquina (Village 'town'), medidas nos prints: parede de concreto, caixilho escuro, painel bege da janela, guard-rail,
		// poste, fio, asfalto verde-acinzentado, faixa, persiana, placa vermelha, frade laranja, cone
		townWall: '#b4b6a6', townFrame: '#5b5352', townPane: '#aaa78f', townRail: '#c9cabd', townPole: '#8f9690',
		townWire: '#3a4245', townRoad: '#6f8a89', townLine: '#e6e6da', townShutter: '#a3a596', townSign: '#9a3a3e',
		townBollard: '#d39a3a', townCone: '#e0703a',
		townWall2: '#c9bfa8', townTin: '#94a39a', townRoof: '#6d7778', townVend: '#4f86a8', townWeed: '#4f8f5e',
		// cidade antiga: taipa ocre, chão batido, madeira escura, laca vermelha/preta, reboco, telha cinza, palha, bronze, tecidos
		zhouEarth: '#cdb07a', zhouGround: '#9f8a68', zhouTimber: '#5e4636', zhouLacquer: '#8e3a2c', zhouBlack: '#3a3634',
		zhouPlaster: '#ddd2b4', zhouTile: '#727878', zhouThatch: '#b59d66', zhouBronze: '#8a8152', zhouCloth: '#a1412f', zhouCloth2: '#2f3536',
		zhouMillet: '#7f9e4c', zhouRipe: '#c9a44e', zhouSoil: '#8c7455', // painço verde / maduro, terra lavrada
		flowers: [ '#f3efe3', '#f2d36b', '#e9a3b8' ], // campo: branca, amarela, rosa
		// biomas: outono chinês (capim dourado, bordo vermelho/laranja, ginkgo amarelo), estepe (capim seco), pinheiral (verde frio)
		autumnGrass: '#a99a52', autumnDry: '#bd9d4f', autumnTuft: '#8c7a3a',
		autumnTrees: [ '#c4452f', '#d9772f', '#e2ae38', '#b33a2c' ], autumnLitter: [ '#c84a30', '#e08b36', '#e9bd45' ],
		steppeGrass: '#9fa456', steppeDry: '#b8ac62', steppeTuft: '#878a45', steppeTrees: [ '#7d9a4f', '#8fa65a', '#6e8c49' ],
		pineGrass: '#3f8263', pineDry: '#4a8a69', pineTuft: '#2c6650', pineTrees: [ '#2f6650', '#3a7458', '#285c4a' ]
	}
}

// messenger "vivo" (pedido do usuário: sem o pastel). Paleta mais saturada e funda + grade com saturação/contraste; céu azul-
// turquesa intenso com nuvens brancas; névoa mais clara e menos leitosa. ?vivid=0 volta ao pastel medido dos prints
const VIVID = {
	// 1ª versão (sat 1.28, grama #34a356, nuvem #e8fbf6) = verde-limão neon e nuvens estouradas → recuado
	sky: { ...STYLES.messenger.sky, zenith: '#3aaec4', horizon: '#86d6dc', cloud: '#c8f1ea' },
	fog: { ...STYLES.messenger.fog, color: '#8fd3da', farColor: '#a6dfe4', density: 0.0045 },
	grade: { saturation: 1.16, contrast: 1.08, shadows: '#123a5a', highlights: '#fff6e0', split: 0.06 },
	palette: {
		grass: '#2f9a58', grassDry: '#44a456', leaves: [ '#2c9354', '#227a4a', '#3da35c' ], tuft: '#22744a', dirt: '#2c8550',
		water: '#1fb6c4', waterDeep: '#0f7f9e', rockSlab: '#e6d7a8', rock: '#dccd9c', trunk: '#7d6f62',
		townWall: '#bcc0ab', townSign: '#c4302f', townBollard: '#f0a020', townCone: '#ff6a2a', townVend: '#2f7fc4', townRoof: '#4f6a72',
		autumnGrass: '#b39a40', autumnDry: '#c49c3c', autumnTuft: '#8f7426',
		autumnTrees: [ '#e0381f', '#f07a1c', '#f5bb22', '#c42a1e' ], autumnLitter: [ '#e63c22', '#f58a20', '#f6c534' ],
		steppeGrass: '#a9b23f', steppeDry: '#c9b848', steppeTuft: '#8c9330', steppeTrees: [ '#6fa83a', '#86b844', '#5c9a36' ],
		pineGrass: '#22855a', pineDry: '#2e9160', pineTuft: '#165f40', pineTrees: [ '#1c6a4a', '#257a52', '#155c40' ],
		flowers: [ '#ffffff', '#ffd23a', '#ff7fa8' ],
		zhouEarth: '#d8b26c', zhouLacquer: '#b8301f', zhouCloth: '#c8321e', zhouThatch: '#c8a24c', zhouMillet: '#6fae3a', zhouRipe: '#e2b234'
	}
}
// desligado a pedido (voltou ao pastel dos prints); ?vivid=1 liga
if ( params.get( 'vivid' ) === '1' ) {

	const m = STYLES.messenger
	Object.assign( m, { sky: VIVID.sky, fog: VIVID.fog, grade: VIVID.grade, palette: { ...m.palette, ...VIVID.palette } } )

}

// Valores padrão de cada preset (mesclados por chave)
const DEFAULTS = {
	world: {
		grass: true, grassShape: 'tri', trees: 'round', facets: 0, terrace: 0, facetJitter: 0, grid: null, bump: 0, floating: false,
		size: 180, segments: 160, relief: 'island', lawn: false, lawnKeep: 0.22, grassField: null, tufts: 0, flecks: false,
		rocks: 'round', treeScale: [ 0.75, 1.45 ], rockScale: null, treeCount: null, nature: null, rockCount: null, village: null,
		rockStrata: 'color', water: 'smooth'
	},
	vehicle: null, // { track: 'neon' | 'kit' | null } → carro arcade (+ pista)
	gi: null, // LightProbeGrid assado (só PBR)
	camera: { fov: null, yaw: Math.PI * 0.25, pitch: 0.38, distance: 12, height: 1.3, fixed: false, lead: 0.18 },
	shadows: { type: 'map', radius: 2 },
	gobo: null,
	pen: null,
	hatch: null,
	character: null, // { model, anims, height, headScale } → personagem riggado no lugar do boneco procedural
	paletteTexture: false,
	leafShadows: false,
	firewood: true,
	hemi: null,
	matcap: null
}

export const QUALITY = {
	low: { maxDpr: 1, shadowMap: 1024, grass: 150, trees: 110, rocks: 50, aa: 'fxaa', bloomMips: 2 },
	medium: { maxDpr: 1.5, shadowMap: 2048, grass: 220, trees: 180, rocks: 80, aa: 'fxaa', bloomMips: 3 },
	high: { maxDpr: 2, shadowMap: 2048, grass: 300, trees: 260, rocks: 110, aa: 'smaa', bloomMips: 5 }
}

const isMobile = /Mobi|Android|iPhone|iPad/i.test( navigator.userAgent )

export const settings = {
	styleName: STYLES[ params.get( 'style' ) ] ? params.get( 'style' ) : 'real',
	qualityName: QUALITY[ params.get( 'quality' ) ] ? params.get( 'quality' ) : ( isMobile ? 'medium' : 'high' ),
	debug: params.has( 'debug' ),
	forceWebGL: params.has( 'webgl' ),
	seed: Number( params.get( 'seed' ) ?? 7 ),
	fixedDpr: params.has( 'dpr' ) ? Number( params.get( 'dpr' ) ) : null, // trava resolução (benchmark)
	view: params.get( 'view' ), // debug visual: shadow | light | shadowcol | litcol
	isMobile
}

function resolveStyle( s ) {

	const out = { ...DEFAULTS, ...s }
	for ( const key of [ 'world', 'camera', 'shadows' ] ) out[ key ] = { ...DEFAULTS[ key ], ...s[ key ] }
	out.camera.fov ??= s.shading === 'pbr' ? 50 : 38
	out.sky = { style: 'gradient', ...s.sky }
	return out

}

settings.style = resolveStyle( STYLES[ settings.styleName ] )
// comparar sem editar o preset: ?shadow=hsv|tint · ?shadowValue=0.5 · ?tuftIds=0|1 · ?tuftStyle=blades|card
if ( params.has( 'shadow' ) ) settings.style.shadowModel = params.get( 'shadow' )
if ( params.has( 'shadowValue' ) ) settings.style.shadowValue = Number( params.get( 'shadowValue' ) )
if ( params.has( 'tuftIds' ) ) settings.style.world.tuftIds = params.get( 'tuftIds' ) !== '0'
if ( params.has( 'tuftStyle' ) ) settings.style.world.tuftStyle = params.get( 'tuftStyle' ) // blades | card
if ( params.get( 'rockLook' ) === 'old' ) { settings.style.world.rockLook = null; settings.style.world.rockStrata = 'id'; if ( settings.style.world.nature ) settings.style.world.nature = { ...settings.style.world.nature, rockLook: null } }
if ( params.get( 'sierra' ) === '0' ) { settings.style.world.sierra = null; settings.style.world.river = null }
if ( params.get( 'flowers' ) === '0' ) settings.style.world.field = null
if ( params.get( 'flecks' ) === '0' ) settings.style.world.flecks = false
if ( params.get( 'cracks' ) === '0' ) settings.style.world.rockCracks = false
if ( params.get( 'rocks' ) === 'model' && settings.style.world.nature ) settings.style.world.nature = { ...settings.style.world.nature, rockStyle: 'model' }
if ( params.get( 'folk' ) === '0' ) settings.style.world.folk = null
if ( params.get( 'biomes' ) === '0' ) settings.style.world.biomes = null
if ( params.has( 'chunk' )&& settings.style.world.nature ) settings.style.world.nature = { ...settings.style.world.nature, chunk: Number( params.get( 'chunk' ) ) } // m por bloco de árvores
if ( params.has( 'seeThrough' ) ) settings.style.seeThrough = params.get( 'seeThrough' ) !== '0'
if ( params.has( 'kidInk' )&& settings.style.character ) settings.style.character = { ...settings.style.character, inkNoise: params.get( 'kidInk' ) !== '0' }
if ( params.has( 'kidCut' ) && settings.style.character ) settings.style.character = { ...settings.style.character, shadowCut: params.get( 'kidCut' ) === '0' ? null : [ 0.1, 0.15 ] }
if ( params.has( 'fog' ) ) settings.style.fog = { ...settings.style.fog, mode: params.get( 'fog' ) } // exp2 | linear
if ( params.has( 'fogDensity' ) ) settings.style.fog = { ...settings.style.fog, density: Number( params.get( 'fogDensity' ) ) }
if ( params.has( 'spec' ) ) settings.style.specular = Number( params.get( 'spec' ) ) > 0 ? { shininess: 30, ...settings.style.specular, amount: Number( params.get( 'spec' ) ) } : null
if ( params.has( 'water' ) ) settings.style.world.water = params.get( 'water' ) // bands | smooth
if ( params.has( 'strata' ) ) settings.style.world.rockStrata = params.get( 'strata' ) // id | color
if ( params.has( 'skyInk' ) ) settings.style.sky.outline = params.get( 'skyInk' ) !== '0'
if ( params.has( 'outline' ) && settings.style.outline ) settings.style.outline = { ...settings.style.outline, mode: params.get( 'outline' ) } // central | max
if ( params.has( 'canopy' ) && settings.style.world.nature ) settings.style.world.nature = { ...settings.style.world.nature, canopy: params.get( 'canopy' ) } // model | cards
settings.quality = QUALITY[ settings.qualityName ]
