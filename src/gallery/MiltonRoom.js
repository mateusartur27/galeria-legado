import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texture, vec3, vec4, float, mix, smoothstep, positionLocal } from 'three/tsl';
import { ROOM, TAU, canvasTex, withColor, xf, tube, arcPts, wallPanel, box, loadModel, texLoader, texCache, polyTex } from './PeriodRoom.js';

// ---------------------------------------------------------------------------------------------
// Milton Santos (1926 · 2001) — Gabinete de Geografia e Sala de Seminários, USP, c. 1994.
// Professor Emérito da USP, doutor pela Universidade de Estrasburgo, professor na Sorbonne (Paris I),
// Columbia e Toronto, único latino-americano laureado com o Prêmio Vautrin Lud ("Nobel da Geografia").
//
// Composição do espaço acadêmico:
//   - Parede do Fundo: Lousa verde-ardósia acadêmica completa, sem fundos brancos, com giz e diagramas.
//   - Parede Esquerda: Grande mapa mural do Sul Global (América do Sul e África no centro, com redes e fluxos),
//     rebaixado verticalmente para ficar livremente abaixo das vigas/haste do teto.
//   - Parede Direita: Grande estante universitária envidraçada repleta de obras e compêndios.
//   - Teto: Arcos estruturais de nogueira com filetes dourados e pendente clássico com globo de vidro opalino (estilo USP/Sorbonne).
//   - Piso: Parquet nobre e tapete geométrico territorial.
// ---------------------------------------------------------------------------------------------

// Tapete modernista com geometria inspirada em malhas urbanas e coordenadas cartográficas
function modernRugTexture() {
	return canvasTex( 1024, 640, ( c, w, h ) => {
		c.fillStyle = '#1c2430'; c.fillRect( 0, 0, w, h )
		// Borda externa terracota e dourada
		c.strokeStyle = '#c45a3c'; c.lineWidth = 14; c.strokeRect( 16, 16, w - 32, h - 32 )
		c.strokeStyle = '#d4af62'; c.lineWidth = 3; c.strokeRect( 28, 28, w - 56, h - 56 )
		// Campo central com blocos geométricos e retículas
		c.fillStyle = '#223042'; c.fillRect( 40, 40, w - 80, h - 80 )
		const g = c.createLinearGradient( 40, 40, w - 40, h - 40 )
		g.addColorStop( 0, '#8d3b2b' ); g.addColorStop( .4, '#24374d' ); g.addColorStop( 1, '#1e2c3d' )
		c.fillStyle = g; c.fillRect( 48, 48, w - 96, h - 96 )

		// Malha de linhas ortogonais e diagonais (fluxos e território)
		c.strokeStyle = 'rgba(212,175,98,.28)'; c.lineWidth = 1.5
		for ( let x = 70; x < w - 60; x += 44 ) { c.beginPath(); c.moveTo( x, 56 ); c.lineTo( x, h - 56 ); c.stroke() }
		for ( let y = 70; y < h - 60; y += 44 ) { c.beginPath(); c.moveTo( 56, y ); c.lineTo( w - 56, y ); c.stroke() }

		// Grandes faixas diagonais modernistas
		c.fillStyle = 'rgba(196,90,60,.32)'; c.beginPath(); c.moveTo( 100, 56 ); c.lineTo( 340, 56 ); c.lineTo( 56, 340 ); c.lineTo( 56, 100 ); c.closePath(); c.fill()
		c.fillStyle = 'rgba(45,85,120,.45)'; c.beginPath(); c.moveTo( w - 100, h - 56 ); c.lineTo( w - 340, h - 56 ); c.lineTo( w - 56, h - 340 ); c.lineTo( w - 56, h - 100 ); c.closePath(); c.fill()

		// Textura de fibra e desgaste sutil
		c.globalAlpha = .06; for ( let i = 0; i < 4000; i ++ ) { c.fillStyle = Math.random() < .5 ? '#fff' : '#000'; c.fillRect( Math.random() * w, Math.random() * h, 2, 2 ) }
		c.globalAlpha = 1
	} )
}

// Grande Mapa Mural do Sul Global (Parede Esquerda) com continentes de alta fidelidade
function globalSouthMapTexture() {
	return canvasTex( 1024, 512, ( c, w, h ) => {
		// Fundo pergaminho acadêmico com pátina quente
		c.fillStyle = '#ebe1c7'; c.fillRect( 0, 0, w, h )
		const g = c.createRadialGradient( w / 2, h / 2, 60, w / 2, h / 2, w * .65 )
		g.addColorStop( 0, 'rgba(255,250,235,.45)' ); g.addColorStop( 1, 'rgba(145,120,80,.32)' )
		c.fillStyle = g; c.fillRect( 0, 0, w, h )

		// Moldura técnica cartográfica
		c.strokeStyle = '#283648'; c.lineWidth = 3.5; c.strokeRect( 16, 16, w - 32, h - 32 )
		c.lineWidth = 1.2; c.strokeRect( 22, 22, w - 44, h - 44 )

		// Grelha de coordenadas: paralelos e meridianos
		c.strokeStyle = 'rgba(70,90,115,.2)'; c.lineWidth = 1
		for ( let x = 44; x <= w - 44; x += 52 ) { c.beginPath(); c.moveTo( x, 24 ); c.lineTo( x, h - 24 ); c.stroke() }
		for ( let y = 44; y <= h - 44; y += 44 ) { c.beginPath(); c.moveTo( 24, y ); c.lineTo( w - 24, y ); c.stroke() }

		// Linha do Equador e Trópicos em destaque
		c.strokeStyle = '#c45a3c'; c.lineWidth = 2
		c.beginPath(); c.moveTo( 24, h * .5 ); c.lineTo( w - 24, h * .5 ); c.stroke()
		c.font = 'italic 11px Georgia'; c.fillStyle = '#c45a3c'; c.fillText( 'Equador 0°', 32, h * .5 - 5 )

		// Trópico de Capricórnio (cruza São Paulo)
		c.strokeStyle = 'rgba(196,90,60,.75)'; c.setLineDash( [ 5, 4 ] )
		c.beginPath(); c.moveTo( 24, h * .63 ); c.lineTo( w - 24, h * .63 ); c.stroke()
		c.fillText( 'Trópico de Capricórnio 23°27\' S (São Paulo)', 32, h * .63 - 5 )
		// Trópico de Câncer
		c.beginPath(); c.moveTo( 24, h * .37 ); c.lineTo( w - 24, h * .37 ); c.stroke()
		c.setLineDash( [] )

		// --- DESENHO DETALHADO DOS CONTINENTES (Projeção Gall-Peters: destaque ao Sul Global) ---

		// 1. AMÉRICA DO SUL (Verde floresta com relevo cartográfico)
		c.fillStyle = '#4a7258'; c.strokeStyle = '#2b4a35'; c.lineWidth = 2
		c.beginPath()
		// Istmo do Panamá / Colômbia
		c.moveTo( 268, 195 )
		c.bezierCurveTo( 285, 185, 310, 190, 325, 205 ) // Venezuela e Guianas
		c.bezierCurveTo( 355, 220, 375, 250, 365, 280 ) // Litoral Norte do Brasil
		c.bezierCurveTo( 368, 300, 378, 315, 372, 335 ) // Saliente do Nordeste (Natal / Recife / Salvador)
		c.bezierCurveTo( 360, 365, 345, 395, 330, 420 ) // Litoral Sudeste (Rio / Santos)
		c.bezierCurveTo( 315, 440, 305, 465, 292, 485 ) // Sul e Rio da Prata
		c.bezierCurveTo( 282, 500, 275, 508, 272, 500 ) // Terra do Fogo / Estreito de Magalhães
		c.bezierCurveTo( 268, 480, 266, 440, 268, 395 ) // Costa Chilena do Pacífico
		c.bezierCurveTo( 260, 350, 252, 310, 250, 275 ) // Peru e Equador
		c.bezierCurveTo( 248, 240, 255, 215, 268, 195 ) // Fechamento Colômbia
		c.closePath(); c.fill(); c.stroke()

		// Rios da Amazônia e Bacia do Prata em azul suave
		c.strokeStyle = 'rgba(70,120,170,.6)'; c.lineWidth = 1.2
		c.beginPath(); c.moveTo( 350, 265 ); c.bezierCurveTo( 310, 270, 285, 260, 265, 270 ); c.stroke()
		c.beginPath(); c.moveTo( 305, 445 ); c.bezierCurveTo( 300, 400, 310, 370, 315, 340 ); c.stroke()

		// 2. AMÉRICA DO NORTE E CENTRAL
		c.fillStyle = '#657e6c'; c.strokeStyle = '#3e5244'; c.lineWidth = 1.6
		c.beginPath()
		c.moveTo( 145, 60 ); c.lineTo( 280, 60 ); c.bezierCurveTo( 295, 90, 285, 125, 265, 145 ) // Costa Leste EUA
		c.bezierCurveTo( 260, 160, 245, 175, 235, 185 ) // México / Golfo
		c.bezierCurveTo( 225, 195, 245, 205, 268, 195 ) // América Central até o Panamá
		c.bezierCurveTo( 240, 220, 215, 190, 200, 180 ) // Pacífico
		c.bezierCurveTo( 175, 160, 155, 120, 145, 60 ) // Califórnia e Costa Oeste
		c.closePath(); c.fill(); c.stroke()
		// Flórida
		c.beginPath(); c.ellipse( 255, 140, 8, 16, .2, 0, TAU ); c.fill(); c.stroke()
		// Ilhas do Caribe / Antilhas
		c.beginPath(); c.arc( 290, 190, 3.5, 0, TAU ); c.fill()
		c.beginPath(); c.arc( 310, 195, 3, 0, TAU ); c.fill()

		// 3. ÁFRICA (Grande, central e imponente — berço da humanidade)
		c.fillStyle = '#b68444'; c.strokeStyle = '#684820'; c.lineWidth = 2
		c.beginPath()
		c.moveTo( 490, 165 ) // Estreito de Gibraltar
		c.bezierCurveTo( 530, 155, 590, 165, 620, 180 ) // Costa do Magrebe / Golfo de Sidra
		c.bezierCurveTo( 645, 190, 665, 210, 670, 245 ) // Egito e Mar Vermelho
		c.bezierCurveTo( 700, 280, 715, 310, 695, 335 ) // Chifre da África (Somália)
		c.bezierCurveTo( 670, 360, 645, 410, 620, 445 ) // Costa Leste / Tanzânia / Moçambique
		c.bezierCurveTo( 595, 475, 575, 500, 555, 495 ) // Cabo da Boa Esperança (África do Sul)
		c.bezierCurveTo( 535, 470, 520, 420, 505, 380 ) // Costa da Namíbia / Angola
		c.bezierCurveTo( 490, 345, 470, 340, 450, 330 ) // Golfo da Guiné / Curvatura Oeste
		c.bezierCurveTo( 435, 305, 420, 275, 435, 240 ) // Senegal / Cabo Verde
		c.bezierCurveTo( 445, 205, 470, 180, 490, 165 ) // Costa Noroeste
		c.closePath(); c.fill(); c.stroke()

		// Ilha de Madagascar
		c.beginPath(); c.ellipse( 675, 420, 11, 28, -.3, 0, TAU ); c.fill(); c.stroke()

		// 4. EUROPA E ÁSIA (Norte e Leste)
		c.fillStyle = '#7a8a96'; c.strokeStyle = '#485862'; c.lineWidth = 1.6
		c.beginPath()
		c.moveTo( 480, 70 ); c.bezierCurveTo( 540, 65, 600, 75, 640, 90 ) // Europa Central
		c.bezierCurveTo( 720, 70, 830, 90, 890, 140 ) // Sibéria e Ásia Oriental
		c.bezierCurveTo( 910, 190, 890, 240, 850, 260 ) // Sudeste Asiático
		c.bezierCurveTo( 800, 270, 765, 240, 735, 220 ) // Subcontinente Indiano
		c.bezierCurveTo( 695, 225, 665, 205, 645, 185 ) // Península Arábica
		c.bezierCurveTo( 605, 175, 550, 160, 515, 155 ) // Mediterrâneo
		c.bezierCurveTo( 490, 150, 475, 110, 480, 70 ) // Península Ibérica
		c.closePath(); c.fill(); c.stroke()

		// 5. AUSTRÁLIA
		c.fillStyle = '#9b845a'; c.strokeStyle = '#5a4c32'; c.lineWidth = 1.6
		c.beginPath()
		c.ellipse( 835, 400, 38, 26, .1, 0, TAU ); c.fill(); c.stroke()

		// Redes de fluxos e solidariedade do Sul (vetores pontilhados em ouro conectando os nós)
		c.strokeStyle = '#d4af62'; c.lineWidth = 2; c.setLineDash( [ 5, 5 ] )
		// São Paulo ⇄ Luanda / África
		c.beginPath(); c.moveTo( 330, 410 ); c.quadraticCurveTo( 430, 380, 520, 370 ); c.stroke()
		// São Paulo ⇄ Dar es Salaam (Tanzânia)
		c.beginPath(); c.moveTo( 330, 410 ); c.quadraticCurveTo( 480, 430, 630, 365 ); c.stroke()
		// São Paulo ⇄ Paris (Sorbonne)
		c.beginPath(); c.moveTo( 330, 410 ); c.quadraticCurveTo( 380, 240, 505, 115 ); c.stroke()
		// África ⇄ Índia
		c.beginPath(); c.moveTo( 630, 365 ); c.quadraticCurveTo( 680, 310, 750, 240 ); c.stroke()
		c.setLineDash( [] )

		// Marcadores circulares com as cidades essenciais de Milton Santos
		const pin = ( px, py, label ) => {
			c.fillStyle = '#c43a2c'; c.beginPath(); c.arc( px, py, 5, 0, TAU ); c.fill()
			c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke()
			c.font = 'bold 12px Georgia'; c.fillStyle = '#1c2430'; c.fillText( label, px + 8, py + 4 )
		}
		pin( 330, 410, 'São Paulo (USP)' )
		pin( 350, 340, 'Salvador (UFBA)' )
		pin( 505, 115, 'Paris (Sorbonne)' )
		pin( 630, 365, 'Dar es Salaam' )

		// Título e identificação cartográfica
		c.fillStyle = '#1e2838'; c.font = 'bold 24px Georgia'; c.textAlign = 'left'
		c.fillText( 'O ESPAÇO GEOGRÁFICO: REDES E TERRITÓRIO NO SUL GLOBAL', 42, 54 )
		c.font = 'italic 14px Georgia'; c.fillStyle = '#5c4832'
		c.fillText( 'Por uma Outra Globalização: do pensamento único à consciência universal', 42, 75 )
		c.font = '600 12px Georgia'; c.fillStyle = '#2f3f54'
		c.fillText( 'Prof. Dr. Milton Santos · Prêmio Vautrin Lud 1994', 42, 94 )

		// Rosa dos ventos estilizada no canto inferior direito
		const rx = w - 85, ry = h - 65
		c.strokeStyle = '#2b3848'; c.lineWidth = 1.5
		for ( let k = 0; k < 8; k ++ ) {
			const a = k * Math.PI / 4, len = k % 2 === 0 ? 26 : 16
			c.beginPath(); c.moveTo( rx, ry ); c.lineTo( rx + Math.cos( a ) * len, ry + Math.sin( a ) * len ); c.stroke()
		}
		c.font = 'bold 12px Georgia'; c.fillStyle = '#c43a2c'; c.textAlign = 'center'; c.fillText( 'N', rx, ry - 30 )
	} )
}

// Lousa Acadêmica Verde (Parede do Fundo) SEM FUNDOS BRANCOS — traços puros de giz
function chalkboardTexture() {
	return canvasTex( 1536, 768, ( c, w, h ) => {
		// Fundo verde-ardósia acadêmico com apagamento e manchas sutis de giz
		c.fillStyle = '#1b3226'; c.fillRect( 0, 0, w, h )
		const g = c.createRadialGradient( w / 2, h / 2, 80, w / 2, h / 2, w * .65 )
		g.addColorStop( 0, 'rgba(45,82,62,.3)' ); g.addColorStop( 1, 'rgba(18,36,26,.45)' )
		c.fillStyle = g; c.fillRect( 0, 0, w, h )

		// (sem marcações de apagador — lousa limpa)

		// Moldura interna de giz duplo
		c.strokeStyle = 'rgba(255,252,232,.35)'; c.lineWidth = 2; c.strokeRect( 20, 20, w - 40, h - 40 )
		c.lineWidth = 1; c.strokeRect( 26, 26, w - 52, h - 52 )

		// CABEÇALHO DA AULA MAGNA
		c.fillStyle = '#fffce8'; c.font = 'bold 32px Georgia'; c.textAlign = 'center'
		c.fillText( 'UNIVERSIDADE DE SÃO PAULO · DEPARTAMENTO DE GEOGRAFIA', w / 2, 70 )
		c.font = 'italic 20px Georgia'; c.fillStyle = '#ffd97d'
		c.fillText( 'Prof. Dr. Milton Santos  ·  Aulas e Seminários de Geografia Humana', w / 2, 102 )

		// Linha divisória em giz amarelo
		c.strokeStyle = '#ffd97d'; c.lineWidth = 2.5; c.beginPath(); c.moveTo( 80, 120 ); c.lineTo( w - 80, 120 ); c.stroke()

		// COLUNA DA ESQUERDA: AS TRÊS GLOBALIZAÇÕES
		c.textAlign = 'left'
		c.font = 'bold 24px Georgia'; c.fillStyle = '#ffd97d'
		c.fillText( 'A GLOBALIZAÇÃO EM TRÊS DIMENSÕES:', 60, 175 )

		c.font = '21px Georgia'; c.fillStyle = '#fffce8'
		c.fillText( '1. O Mundo como Fábula — a ilusão da aldeia global e da fluidez total.', 80, 220 )
		c.fillText( '2. O Mundo como Perversidade — a tirania do dinheiro e da informação.', 80, 265 )
		c.fillText( '3. O Mundo como Possibilidade — uma outra globalização solidária do Sul.', 80, 310 )

		// DIAGRAMA DOS DOIS CIRCUITOS URBANOS (apenas linhas e traços de giz!)
		c.font = 'bold 24px Georgia'; c.fillStyle = '#ffd97d'
		c.fillText( 'OS DOIS CIRCUITOS DA ECONOMIA URBANA:', 60, 380 )

		// Traçado em giz do Circuito Superior (sem preenchimento branco!)
		c.strokeStyle = '#fffce8'; c.lineWidth = 2; c.strokeRect( 80, 410, 580, 75 )
		c.font = 'bold 20px Georgia'; c.fillStyle = '#fffce8'
		c.fillText( 'CIRCUITO SUPERIOR', 100, 442 )
		c.font = '17px Georgia'; c.fillText( 'Tecnologia de ponta · Finanças · Fluxos globais · Corporações', 100, 470 )

		// Setas duplas de tensão dialética
		c.fillStyle = '#ffd97d'; c.font = 'bold 24px Georgia'; c.textAlign = 'center'
		c.fillText( '⇅   (TENSÃO DIALÉTICA E ASSIMETRIA ESPACIAL)   ⇅', 370, 520 )

		// Traçado em giz do Circuito Inferior
		c.textAlign = 'left'
		c.strokeStyle = '#ffd97d'; c.lineWidth = 2; c.strokeRect( 80, 545, 580, 75 )
		c.font = 'bold 20px Georgia'; c.fillStyle = '#ffd97d'
		c.fillText( 'CIRCUITO INFERIOR', 100, 577 )
		c.font = '17px Georgia'; c.fillText( 'Trabalho vivo · Comércio popular · Periferia · Solidariedade', 100, 605 )

		// COLUNA DA DIREITA: TRÍADE E CITAS FUNDAMENTAIS
		// Linha vertical separadora em giz tracejado
		c.strokeStyle = 'rgba(255,252,232,.3)'; c.lineWidth = 1.5; c.setLineDash( [ 6, 6 ] )
		c.beginPath(); c.moveTo( 720, 150 ); c.lineTo( 720, 630 ); c.stroke()
		c.setLineDash( [] )

		c.font = 'bold 24px Georgia'; c.fillStyle = '#ffd97d'
		c.fillText( 'TRÍADE DO ESPAÇO GEOGRÁFICO:', 760, 175 )

		c.font = 'italic 26px Georgia'; c.fillStyle = '#fffce8'
		c.fillText( 'Técnica  ⇄  Tempo  ⇄  Espaço', 780, 225 )

		c.font = 'bold 22px Georgia'; c.fillStyle = '#ffd97d'
		c.fillText( 'CATEGORIAS DA GEOGRAFIA NOVA:', 760, 290 )

		c.font = '20px Georgia'; c.fillStyle = '#fffce8'
		c.fillText( '• Configuração Territorial e Meio Técnico-Científico', 780, 330 )
		c.fillText( '• O Espaço como Acumulação Desigual do Tempo', 780, 370 )
		c.fillText( '• O Território Usado: base da residência e da vida', 780, 410 )
		c.fillText( '• A Força dos Lugares contra a Alienação Global', 780, 450 )

		// CITAÇÕES CLÁSSICAS
		c.strokeStyle = '#ffd97d'; c.lineWidth = 1.5; c.strokeRect( 760, 495, 710, 125 )
		c.font = 'italic 21px Georgia'; c.fillStyle = '#fffce8'
		c.fillText( '«Não há verdadeira cidadania sem o pleno domínio', 780, 532 )
		c.fillText( 'do próprio território.»', 780, 562 )
		c.font = '16px Georgia'; c.fillStyle = '#ffd97d'
		c.fillText( '— Milton Santos, O Território e a Cidadania Mutilada', 780, 598 )

		// FRASE FINAL DE RODAPÉ
		c.textAlign = 'center'; c.font = 'italic 20px Georgia'; c.fillStyle = '#e8d7a8'
		c.fillText( '«O espaço não é apenas onde vivemos; é a substância do que vivemos.»', w / 2, 705 )
	} )
}

export async function buildMiltonRoom( group, { galleryBrightness } ) {
	// Pré-carga das texturas de base necessárias (usando Ktx/WebP)
	await Promise.all( [ 'diagonal_parquet', 'dark_wood', 'dark_paneled_wood', 'beige_wall_001' ].flatMap( n => [ 'diff', 'nor_gl' ].map( async k => {
		const key = `${n}-${k}`
		if ( ! texCache.has( key ) ) texCache.set( key, await texLoader.loadAsync( `/textures/set/${key}.webp` ) )
	} ) ) )

	const warm = vec3( 1, .85, .62 )
	const mat = ( opts, glow = .12 ) => {
		const m = new THREE.MeshStandardNodeMaterial( opts )
		m.emissiveNode = ( m.map ? texture( m.map ).rgb : vec3( new THREE.Color( m.color ) ) ).mul( warm ).mul( glow ).mul( galleryBrightness )
		return m
	}

	const { halfW: W, spring: SP, front: ZF, back: ZB } = ROOM, D = ZF - ZB
	const room = new THREE.Group(); room.name = 'room-milton'; group.add( room )
	const objects = new Map()
	const register = ( id, label, object ) => {
		if ( object ) { object.name = id; objects.set( id, { label, object } ) }
		return object
	}
	const combine = ( id, label, position, parts ) => {
		const holder = new THREE.Group()
		holder.position.set( ...position )
		room.add( holder )
		for ( const part of parts ) holder.attach( part )
		return register( id, label, holder )
	}
	const add = ( g, m, { cast = false, recv = true } = {} ) => {
		const mesh = new THREE.Mesh( g, m ); mesh.castShadow = cast; mesh.receiveShadow = recv; room.add( mesh ); return mesh
	}

	// Escurecimento suave nos cantos e junções (Ambiente Occlusion de geometria)
	const aoShell = m => {
		const p = positionLocal, edge = float( W ).sub( p.x.abs() ).min( p.z.sub( ZB ) )
		const ao = mix( float( .65 ), float( 1 ), smoothstep( 0, .85, edge ) ).mul( mix( float( .75 ), float( 1 ), smoothstep( 0, .5, p.y.add( .25 ) ) ) )
		const orig = m.setupOutput.bind( m )
		m.setupOutput = ( builder, lit ) => orig( builder, vec4( lit.rgb.mul( ao ), lit.a ) )
		return m
	}
	const shell = ( opts, glow ) => aoShell( mat( opts, glow ) )

	// --- 1. PISO: Parquet em espinha de peixe nobre com brilho suave
	const floorG = new THREE.PlaneGeometry( W * 2, D ); floorG.rotateX( - Math.PI / 2 ); floorG.translate( 0, .02, ( ZF + ZB ) / 2 )
	add( floorG, shell( { map: polyTex( 'diagonal_parquet', 'diff', 1.2, W * 2, D, true ), normalMap: polyTex( 'diagonal_parquet', 'nor_gl', 1.2, W * 2, D ), roughness: .44, metalness: .02, color: '#c29d82' }, .1 ) )

	// Tapete modernista geométrico no centro
	const rugGeo = new THREE.PlaneGeometry( 3.6, 2.3 ); rugGeo.rotateX( - Math.PI / 2 ); rugGeo.translate( 0, .026, .15 )
	const rug = add( rugGeo, mat( { map: modernRugTexture(), roughness: .95, color: '#ffffff' }, .1 ) )

	combine( 'tapete', 'Tapete', [ 0, .026, .15 ], [ rug ] )

	// --- 2. PAREDES LATERAIS E ABÓBADA: Lambris na base e reboco claro
	const wainM = shell( { map: polyTex( 'dark_paneled_wood', 'diff', 1.0, 1.0, 1.0, true ), normalMap: polyTex( 'dark_paneled_wood', 'nor_gl', 1.0, 1.0, 1.0 ), roughness: .52, color: '#a89482', side: THREE.DoubleSide }, .1 )
	add( tube( [ [ - W, 0 ], [ - W, 1.15 ] ], ZB, ZF, 1.0 ), wainM )
	add( tube( [ [ W, 0 ], [ W, 1.15 ] ], ZB, ZF, 1.0 ), wainM )

	const wallM = shell( { map: polyTex( 'beige_wall_001', 'diff', 1.8, 1.8, 1.8, true ), normalMap: polyTex( 'beige_wall_001', 'nor_gl', 1.8, 1.8, 1.8 ), roughness: .92, color: '#f2e8d5', side: THREE.DoubleSide }, .12 )
	add( tube( [ [ - W, 1.15 ], [ - W, SP ] ], ZB, ZF, 1.0 ), wallM )
	add( tube( [ [ W, 1.15 ], [ W, SP ] ], ZB, ZF, 1.0 ), wallM )

	// Abóbada de berço do teto
	add( tube( arcPts( 0, SP, W, Math.PI, 0, 40 ).reverse(), ZB, ZF, 2.0 ), wallM )

	// --- 3. PAREDE DO FUNDO CONTÍNUA (SÓLIDA, SEM JANELA)
	// Base com lambris
	add( wallPanel( [ [ - W, 0 ], [ W, 0 ], [ W, 1.15 ], [ - W, 1.15 ] ], ZB, 1.0 ), wainM )
	// Parte superior rebocada
	add( wallPanel( [ [ - W, 1.15 ], [ W, 1.15 ], [ W, SP ], [ - W, SP ] ], ZB, 1.0 ), wallM )
	// Arco superior
	const arc = arcPts( 0, SP, W, 0, Math.PI, 40 )
	add( wallPanel( [ [ W, SP ], ...arc, [ - W, SP ] ], ZB, 2.0 ), wallM )

	// --- 4. MARCENARIA, RODAPÉS E ARCOS ESTRUTURAIS DO TETO (DETALHE PARA O TETO NÃO FICAR VAZIO)
	const woodMat = shell( { map: polyTex( 'dark_wood', 'diff', 1.2, 1.2, 1.2, true ), normalMap: polyTex( 'dark_wood', 'nor_gl', 1.2, 1.2, 1.2 ), roughness: .5, vertexColors: true, side: THREE.DoubleSide }, .1 )
	const goldMat = mat( { color: '#d7b36a', roughness: .3, metalness: .85, vertexColors: true }, .15 )
	const woodParts = [], goldParts = []

	// Rodapés, moldura de meia-parede e cornijas
	for ( const sx of [ - 1, 1 ] ) {
		woodParts.push( box( .04, .2, D, [ sx * ( W - .02 ), .1, ( ZF + ZB ) / 2 ], '#543b2b' ) )
		woodParts.push( box( .06, .07, D, [ sx * ( W - .03 ), 1.16, ( ZF + ZB ) / 2 ], '#6a4c36' ) )
		woodParts.push( box( .08, .12, D, [ sx * ( W - .04 ), SP - .06, ( ZF + ZB ) / 2 ], '#543b2b' ) )
		goldParts.push( box( .018, .025, D, [ sx * ( W - .09 ), SP - .01, ( ZF + ZB ) / 2 ], '#d4af62' ) )
	}
	woodParts.push( box( W * 2, .2, .04, [ 0, .1, ZB + .02 ], '#543b2b' ) )
	woodParts.push( box( W * 2, .07, .06, [ 0, 1.16, ZB + .03 ], '#6a4c36' ) )
	goldParts.push( box( W * 2, .02, .03, [ 0, .05, ZF - .01 ], '#d4af62' ) ) // soleira da entrada

	// Arcos estruturais de nogueira com filetes dourados no teto (como no gabinete clássico)
	const ring = ( list, r, cy, th, dep, z, c, from = 0, to = Math.PI, n = 48 ) => {
		const pts = arcPts( 0, cy, r, from, to, n )
		for ( let i = 0; i < pts.length - 1; i ++ ) {
			const [ a, b ] = [ pts[ i ], pts[ i + 1 ] ], len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ), ang = Math.atan2( b[ 1 ] - a[ 1 ], b[ 0 ] - a[ 0 ] )
			list.push( withColor( xf( new THREE.BoxGeometry( len * 1.05, th, dep ), [ ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2, z ], [ 0, 0, ang ] ), c ) )
		}
	}
	for ( const z of [ - .65, .15, .95 ] ) {
		ring( woodParts, W - .04, SP, .06, .07, z, '#543b2b' )
		ring( goldParts, W - .1, SP, .018, .07, z, '#d4af62' )
	}

	if ( woodParts.length ) add( mergeGeometries( woodParts.map( g => g.index ? g.toNonIndexed() : g ), false ), woodMat, { cast: true } )
	if ( goldParts.length ) add( mergeGeometries( goldParts.map( g => g.index ? g.toNonIndexed() : g ), false ), goldMat )

	// --- 5. PAREDE DO FUNDO: GRANDE QUADRO DE ESCREVER (LOUSA ACADÊMICA SEM FUNDOS BRANCOS)
	const chalkTex = chalkboardTexture(); chalkTex.anisotropy = 8
	const chalkMat = mat( { map: chalkTex, roughness: .88 }, .18 )
	const frameMat = mat( { color: '#3d281a', roughness: .6, vertexColors: true }, .1 )

	// Quadro amplo ocupando o centro da parede do fundo
	const boardW = 3.6, boardH = 1.35, boardZ = ZB + .035, boardY = 1.85
	const boardMesh = new THREE.Mesh( new THREE.PlaneGeometry( boardW, boardH ), chalkMat )
	boardMesh.position.set( 0, boardY, boardZ )
	boardMesh.receiveShadow = true; room.add( boardMesh )

	// Moldura em madeira nobre e calha inferior de giz
	const boardFrame = [
		box( boardW + .16, .07, .06, [ 0, boardY + boardH / 2 + .035, boardZ ], '#4a3220' ),
		box( boardW + .16, .1, .09, [ 0, boardY - boardH / 2 - .04, boardZ + .015 ], '#4a3220' ), // calha mais saliente embaixo
		box( .07, boardH + .14, .06, [ - boardW / 2 - .035, boardY, boardZ ], '#4a3220' ),
		box( .07, boardH + .14, .06, [ boardW / 2 + .035, boardY, boardZ ], '#4a3220' )
	]
	const boardTrim = add( mergeGeometries( boardFrame.map( g => g.index ? g.toNonIndexed() : g ), false ), frameMat, { cast: true } )

	// Pedaços de giz e apagador na calha inferior
	const chalkProps = [
		box( .08, .016, .02, [ - .4, boardY - boardH / 2 - .01, boardZ + .03 ], '#ffffff' ),
		box( .06, .016, .02, [ - .28, boardY - boardH / 2 - .01, boardZ + .03 ], '#ffd97d' ),
		box( .12, .035, .045, [ .35, boardY - boardH / 2 + .005, boardZ + .035 ], '#362215' ), // base apagador
		box( .12, .015, .045, [ .35, boardY - boardH / 2 - .015, boardZ + .035 ], '#1c1c1c' )  // feltro apagador
	]
	const chalk = add( mergeGeometries( chalkProps.map( g => g.index ? g.toNonIndexed() : g ), false ), mat( { color: '#ffffff', vertexColors: true }, .14 ) )

	combine( 'lousa', 'Lousa', [ 0, boardY, boardZ ], [ boardMesh, boardTrim, chalk ] )

	// --- 6. PAREDE ESQUERDA: MAPA DO SUL GLOBAL (imagem fornecida pelo usuário)
	// Proporção correta: 1024×682 px → ratio 1.501:1
	const mapTex = await texLoader.loadAsync( '/textures/milton_map.jpg' )
	mapTex.anisotropy = 8; mapTex.colorSpace = THREE.SRGBColorSpace
	const mapMat = mat( { map: mapTex, roughness: 1.0, metalness: 0 }, .14 )

	// mapW=2.0m, mapH=2.0/1.501≈1.33m — topo em 1.82+0.665=2.485m < SP=2.57 ✓
	const mapW = 2.0, mapH = 1.33, mapZ = 0.1, mapY = 1.82
	const mapMesh = new THREE.Mesh( new THREE.PlaneGeometry( mapW, mapH ), mapMat )
	mapMesh.position.set( - W + .035, mapY, mapZ ); mapMesh.rotation.y = Math.PI / 2
	mapMesh.receiveShadow = true; room.add( mapMesh )

	const mapFrame = [
		box( .06, mapH + .12, .05, [ - W + .04, mapY, mapZ - mapW / 2 - .03 ], '#3d281a' ),
		box( .06, mapH + .12, .05, [ - W + .04, mapY, mapZ + mapW / 2 + .03 ], '#3d281a' ),
		box( .06, .06, mapW + .16, [ - W + .04, mapY + mapH / 2 + .03, mapZ ], '#3d281a' ),
		box( .06, .06, mapW + .16, [ - W + .04, mapY - mapH / 2 - .03, mapZ ], '#3d281a' )
	]
	const mapTrim = add( mergeGeometries( mapFrame.map( g => g.index ? g.toNonIndexed() : g ), false ), frameMat, { cast: true } )

	combine( 'mapa', 'Mapa do Sul Global', [ -W + .035, mapY, mapZ ], [ mapMesh, mapTrim ] )

	// --- 7. PAREDE DIREITA: ESTANTE DE LIVROS UNIVERSITÁRIA
	const matsCache = new Map()
	const fixMat = src => {
		if ( matsCache.has( src ) ) return matsCache.get( src )
		const m = new THREE.MeshStandardNodeMaterial( {
			color: src.color, map: src.map, normalMap: src.normalMap,
			roughness: src.roughness ?? .7, metalness: src.metalness ?? 0,
			side: src.side, transparent: src.transparent, opacity: src.opacity, alphaTest: src.alphaTest
		} )
		if ( m.map ) m.emissiveNode = texture( m.map ).rgb.mul( warm ).mul( .08 ).mul( galleryBrightness )
		matsCache.set( src, m ); return m
	}

	const lightWood = new Map()
	const furnitureMaterial = source => {
		if ( ! lightWood.has( source ) ) {
			const m = new THREE.MeshStandardNodeMaterial( {
				color: '#b98b4e', normalMap: source.normalMap,
				emissive: '#98703d', emissiveIntensity: .48,
				roughness: .74, metalness: 0,
			} )
			lightWood.set( source, m )
		}
		return lightWood.get( source )
	}

	const placeModel = ( source, height, position, rotation, { parent = room, material = fixMat } = {} ) => {
		if ( ! source ) return null
		const model = source.clone( true )
		model.traverse( node => {
			if ( ! node.isMesh ) return
			const materials = Array.isArray( node.material ) ? node.material : [ node.material ]
			node.castShadow = materials.some( material => ! material.transparent )
			node.receiveShadow = true
			node.material = Array.isArray( node.material ) ? materials.map( material ) : material( node.material )
		} )
		const bounds = new THREE.Box3().setFromObject( model )
		const center = bounds.getCenter( new THREE.Vector3() )
		const scale = height / ( bounds.max.y - bounds.min.y )
		model.position.set( -center.x * scale, -bounds.min.y * scale, -center.z * scale )
		model.scale.setScalar( scale )
		const holder = new THREE.Group()
		holder.add( model )
		holder.position.set( ...position )
		holder.rotation.y = rotation
		parent.add( holder )
		return holder
	}

	const [ cabinetModel, booksModel, tableModel, chairModel, globeModel ] = await Promise.all( [
		loadModel( 'vintage_cabinet_01' ), loadModel( 'hand_painted_old_books_geometry_nodes' ),
		loadModel( 'ClassicConsole_01' ), loadModel( 'dining_chair_02' ), loadModel( '/models/set/nilo/globe.glb' ),
	] )
	const cabinet = register( 'estante', 'Estante', placeModel( cabinetModel, 2.15, [ W - .42, .02, .1 ], -Math.PI / 2 ) )
	if ( cabinet && booksModel ) {
		const shelves = [ .882, 1.315, 1.54, 1.75 ]
		for ( const [ i, y ] of shelves.entries() ) {
			const row = placeModel( booksModel, .185, [ i % 2 ? -.08 : .08, y, i === 0 ? .02 : -.06 ], 0, { parent: cabinet } )
			register( `livros-${i + 1}`, `Livros antigos · prateleira ${i + 1}`, row )
		}
	}

	if ( cabinet ) {
		const globe = placeModel( globeModel, .285, [ .60, .882, .015 ], -.28, { parent: cabinet } )
		register( 'globo', 'Globo terrestre', globe )
	}

	const table = register( 'mesa', 'Mesa do professor', placeModel( tableModel, .92, [ -W + .58, .02, -.15 ], Math.PI / 2, { material: furnitureMaterial } ) )
	const chair = register( 'cadeira', 'Cadeira', placeModel( chairModel, .92, [ -W + 1.3, .02, -.15 ], Math.PI / 2, { material: furnitureMaterial } ) )
	if ( chair ) {
		const leather = new THREE.MeshStandardNodeMaterial( {
			color: '#935e42', emissive: '#784a34', emissiveIntensity: .46,
			roughness: .76,
		} )
		chair.traverse( mesh => {
			if ( ! mesh.isMesh ) return
			const geometry = mesh.geometry.clone()
			const { index, attributes: { position } } = geometry
			const frame = [], upholstery = []
			for ( let i = 0; i < index.count; i += 3 ) {
				const a = index.getX( i ), b = index.getX( i + 1 ), c = index.getX( i + 2 )
				// In this model's mesh coordinates, the padded seat starts just above the legs.
				const bottom = Math.min( position.getY( a ), position.getY( b ), position.getY( c ) )
				const faces = bottom > -.4 ? upholstery : frame
				faces.push( a, b, c )
			}
			leather.normalMap = mesh.material.normalMap
			geometry.setIndex( frame.concat( upholstery ) )
			geometry.clearGroups()
			geometry.addGroup( 0, frame.length, 0 )
			geometry.addGroup( frame.length, upholstery.length, 1 )
			mesh.geometry = geometry
			mesh.material = [ mesh.material, leather ]
		} )
	}
	if ( table ) {
		const paper = mat( { color: '#e6d6af', roughness: .93 }, .17 )
		const cover = mat( { color: '#6a3934', roughness: .75 }, .14 )
		const brass = mat( { color: '#b39861', metalness: .64, roughness: .39 }, .19 )
		const ink = mat( { color: '#243b3b', roughness: .34 }, .16 )
		const enamel = mat( { color: '#c9bd9a', roughness: .48, side: THREE.DoubleSide }, .16 )
		const coffee = mat( { color: '#402a20', roughness: .4 }, .10 )
		const piece = ( parent, geometry, material, position ) => {
			const mesh = new THREE.Mesh( geometry, material )
			mesh.position.set( ...position )
			mesh.castShadow = mesh.receiveShadow = true
			parent.add( mesh )
			return mesh
		}
		const prop = ( id, label, x, z, rotation = 0 ) => {
			const holder = new THREE.Group()
			holder.position.set( x, .92, z )
			holder.rotation.y = rotation
			table.add( holder )
			return register( id, label, holder )
		}
		const notebook = prop( 'caderno', 'Caderno de geografia', -.34, .01, -.14 )
		for ( const y of [ .003, .025 ] ) piece( notebook, new THREE.BoxGeometry( .20, .006, .257 ), cover, [ 0, y, 0 ] )
		piece( notebook, new THREE.BoxGeometry( .192, .018, .244 ), paper, [ 0, .014, 0 ] )
		piece( notebook, new THREE.BoxGeometry( .009, .027, .257 ), cover, [ -.098, .014, 0 ] )

		const notes = prop( 'anotacoes', 'Pilha de anotações', -.035, .025, .11 )
		for ( let i = 0; i < 4; i ++ ) {
			const page = piece( notes, new THREE.BoxGeometry( .19, .002, .24 ), paper, [ 0, i * .002 + .001, 0 ] )
			page.rotation.y = ( i - 2 ) * .033
		}
		const pen = prop( 'caneta', 'Caneta-tinteiro', .115, .03, -.28 )
		piece( pen, new THREE.CylinderGeometry( .006, .005, .124, 12 ), ink, [ 0, .006, 0 ] ).rotation.x = Math.PI / 2
		piece( pen, new THREE.CylinderGeometry( .0065, .0065, .012, 12 ), brass, [ 0, .006, .038 ] ).rotation.x = Math.PI / 2

		const inkwell = prop( 'tinteiro', 'Tinteiro', .19, -.10 )
		piece( inkwell, new THREE.CylinderGeometry( .026, .035, .038, 8 ), ink, [ 0, .019, 0 ] )
		piece( inkwell, new THREE.CylinderGeometry( .016, .018, .015, 12 ), brass, [ 0, .044, 0 ] )

		const cup = prop( 'xicara', 'Xícara com pires', .36, .052, .28 )
		piece( cup, new THREE.CylinderGeometry( .065, .055, .008, 24 ), enamel, [ 0, .004, 0 ] )
		piece( cup, new THREE.CylinderGeometry( .039, .029, .055, 24, 1, true ), enamel, [ 0, .036, 0 ] )
		piece( cup, new THREE.CylinderGeometry( .036, .032, .035, 24 ), coffee, [ 0, .028, 0 ] )
		piece( cup, new THREE.TorusGeometry( .018, .004, 8, 20 ), enamel, [ .043, .037, 0 ] )
	}

	// --- 8. LUMINÁRIA DE TETO COM GLOBO DE VIDRO LEITOSO (ESTILO MACHADO / SALA DE AULA USP)
	// Comum e universal nas universidades do século XX
	const PL = { x: 0, z: .4, top: SP + W - .02, globeY: 2.92 }
	const lampGold = []
	lampGold.push( withColor( xf( new THREE.CylinderGeometry( .08, .1, .03, 18 ), [ PL.x, PL.top, PL.z ] ), '#c9a35c' ) ) // canopla no teto
	lampGold.push( withColor( xf( new THREE.CylinderGeometry( .008, .008, PL.top - 3.22, 6 ), [ PL.x, ( PL.top + 3.22 ) / 2, PL.z ] ), '#b08a45' ) ) // haste metálica
	lampGold.push( withColor( xf( new THREE.CylinderGeometry( .02, .02, .18, 10 ), [ PL.x, 3.15, PL.z ] ), '#d4ad66' ) )
	lampGold.push( withColor( xf( new THREE.CylinderGeometry( .05, .18, .12, 24, 1, true ), [ PL.x, 3.05, PL.z ] ), '#c9a35c' ) ) // bocal
	lampGold.push( withColor( xf( new THREE.SphereGeometry( .035, 12, 10 ), [ PL.x, 3.13, PL.z ] ), '#d9b46c' ) )
	lampGold.push( withColor( xf( new THREE.CylinderGeometry( .08, .065, .035, 18 ), [ PL.x, 2.81, PL.z ] ), '#c9a35c' ) ) // anel de apoio
	const lampFittings = add( mergeGeometries( lampGold.map( g => g.index ? g.toNonIndexed() : g ), false ), goldMat )

	// Globo de vidro leitoso fosco iluminado
	const globeM = new THREE.MeshStandardNodeMaterial( { color: '#f5edd8', roughness: .3, transparent: true, opacity: .95 } )
	globeM.emissiveNode = vec3( 1, .86, .6 ).mul( .8 ).mul( galleryBrightness )
	const lampGlobe = new THREE.Mesh( new THREE.SphereGeometry( .145, 26, 18 ), globeM )
	lampGlobe.scale.set( 1, 1.1, 1 )
	lampGlobe.position.set( PL.x, PL.globeY, PL.z )
	room.add( lampGlobe )

	const ceilingLight = new THREE.PointLight( '#ffd29a', 12, 8, 2 )
	ceilingLight.position.set( PL.x, PL.globeY - .05, PL.z )
	room.add( ceilingLight )
	combine( 'pendente', 'Luminária de teto', [ PL.x, PL.globeY, PL.z ], [ lampFittings, lampGlobe, ceilingLight ] )

	// Sol quente sutil da galeria iluminando o professor e o quadro
	const sun = new THREE.SpotLight( '#ffcf94', 18, 9, .95, .85, 1.5 )
	sun.position.set( 0, 4.2, ZF + .8 )
	sun.target.position.set( 0, 1.6, ZB + 1.2 )
	room.add( sun, sun.target )

	return { room, sun, ceilingLight, desk: createLayout( room, objects ) }
}

function createLayout( room, objects ) {
	const key = 'legado.layout.milton.v1'
	let saved
	try { saved = JSON.parse( localStorage.getItem( key ) ) } catch {}

	const marker = new THREE.BoxHelper( room, '#ffd27a' )
	marker.material.depthTest = false
	marker.renderOrder = 20
	marker.matrixAutoUpdate = false
	marker.visible = false
	room.parent.add( marker )
	let selected
	const get = id => {
		const { object } = objects.get( id )
		const { x, y, z } = object.position
		return { x, y, z, rot: THREE.MathUtils.radToDeg( object.rotation.y ) }
	}
	const updateMarker = () => {
		if ( ! selected ) return
		const object = objects.get( selected ).object
		object.updateWorldMatrix( true, true )
		marker.setFromObject( object )
		// BoxHelper stores world-space vertices.
		marker.matrix.copy( marker.parent.matrixWorld ).invert()
		marker.matrixWorldNeedsUpdate = true
	}
	const set = ( id, prop, value ) => {
		const { object } = objects.get( id )
		const n = Number( value )
		if ( ! Number.isFinite( n ) ) return
		if ( prop === 'rot' ) object.rotation.y = THREE.MathUtils.degToRad( n )
		else object.position[ prop ] = n
	}
	for ( const [ id, item ] of objects ) {
		item.defaults = get( id )
		for ( const prop of Object.keys( item.defaults ) ) {
			if ( Number.isFinite( saved?.[ id ]?.[ prop ] ) ) set( id, prop, saved[ id ][ prop ] )
		}
	}
	const all = () => Object.fromEntries( Array.from( objects.keys(), id => [ id, get( id ) ] ) )
	return {
		meta: { title: 'Cenário · posições', spec: [
			[ 'x', 'Lateral (X)', -3, 3, .01, 'm' ],
			[ 'y', 'Altura (Y)', -.1, 5.4, .01, 'm' ],
			[ 'z', 'Profundidade (Z)', -2, 2, .01, 'm' ],
			[ 'rot', 'Giro', -180, 180, 1, '°' ],
		] },
		keys: () => objects.keys(),
		label: id => objects.get( id ).label,
		get, all,
		set( id, prop, value ) { set( id, prop, value ); updateMarker() },
		select( id ) { selected = id; updateMarker() },
		marker( visible ) { marker.visible = visible; if ( visible ) updateMarker() },
		save() {
			try { localStorage.setItem( key, JSON.stringify( all() ) ); return true } catch { return false }
		},
		reset( id ) {
			for ( const name of id ? [ id ] : objects.keys() ) {
				for ( const [ prop, value ] of Object.entries( objects.get( name ).defaults ) ) set( name, prop, value )
			}
			if ( ! id ) try { localStorage.removeItem( key ) } catch {}
			updateMarker()
		},
	}
}
