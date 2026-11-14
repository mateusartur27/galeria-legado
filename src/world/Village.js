import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { texture, uv } from 'three/tsl'
import { createToonMaterial } from '../render/ToonMaterial.js'
import { Palette } from '../render/Palette.js'

// Casinha do mensageiro + cerca + caixa de correio + poste. Tudo numa malha (1 draw call) com UV apontando para
// células da PALETA EM TEXTURA (Messenger `tColors`): formas simples, cor chapada; o traço, a hachura e a luz fazem o resto.
// Cada peça escolhe coluna (cor) e linha (0 base · 1 clara · 2 escura · 3 dessaturada).
export class Village {

	// kind: 'cottage' (casinha + cerca, meadow) · 'town' (esquina do Messenger: prédio de concreto, rua, poste com fios, guard-rail)
	//       'zhou' (cidade murada da China antiga, Primaveras e Outonos; size = lado da muralha)
	// road (town): segmentos [ax, az, bx, bz] locais — o 1º é a rua principal ao longo de x, os outros ramais em z (ver buildTown)
	constructor( { look, terrain, palette, paletteTex = null, x, z, rotation = - 0.5, kind = 'cottage', road = [ [ - 10, 4.8, 10, 4.8 ] ], roadWidth = 3.4, size = 64, moat = null } ) {

		this.palette = paletteTex ?? new Palette( palette )
		this.parts = []
		this.colliders = [] // { x, y, z, hx, hy, hz, rot }
		this.ground = terrain.sampleHeight( x, z )
		this.origin = new THREE.Vector3( x, this.ground, z )
		this.rotation = rotation
		let seed = 1
		const rnd = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647

		if ( kind === 'town' ) this.buildTown( terrain, rnd, road, roadWidth )
		else if ( kind === 'zhou' ) this.buildZhou( terrain, rnd, size, moat )
		else this.buildCottage( terrain, rnd )

		const geometry = mergeGeometries( this.parts )
		// ID de superfície = célula da paleta (coluna e linha) → contorno entre peças coladas (porta × parede, fiadas do telhado)
		const id = uv().x.mul( 0.9 ).add( uv().y.mul( 0.02 ) ).add( 0.05 )
		// fade (dither com discard) desliga o early-z da malha inteira: na cidade antiga, que enche a tela, custava ~1 ms. Lá a câmera
		// não atravessa nada (encosta nos sólidos), então fica sem
		const material = createToonMaterial( look, { colorNode: texture( this.palette.texture, uv() ).rgb, flatShading: true, roughness: 0.9, fade: kind !== 'zhou', id } )
		this.mesh = new THREE.Mesh( geometry, material )
		this.mesh.position.copy( this.origin )
		this.mesh.rotation.y = rotation
		this.mesh.castShadow = true
		this.mesh.receiveShadow = true
		// cidade antiga: a malha detalhada (camadas, furos, telhas: ~80 mil vértices) NÃO projeta sombra — no lugar, uma silhueta
		// simples (caixas dos colisores + telhados) só para o passe de sombra. Ganho medido ~0,7 ms no pátio, sombra igual
		if ( kind === 'zhou' ) {

			const boxes = this.colliders.filter( ( b ) => ! b.noShadow ).map( ( b ) => {

				const g = new THREE.BoxGeometry( b.hx * 2, b.hy * 2, b.hz * 2 ).toNonIndexed()
				g.deleteAttribute( 'uv' )
				return g.rotateY( b.rot ).translate( b.x, b.y, b.z )

			} )
			const roofs = [ ...( this.roofParts ?? [] ), ...( this.shadowParts ?? [] ) ].map( ( g ) => {

				const c = new THREE.BufferGeometry()
				c.setAttribute( 'position', g.attributes.position.clone() )
				c.setAttribute( 'normal', g.attributes.normal.clone() )
				return c

			} )
			const proxy = new THREE.Mesh( mergeGeometries( [ ...boxes, ...roofs ] ), new THREE.MeshBasicNodeMaterial( { colorWrite: false, depthWrite: false } ) )
			proxy.castShadow = true
			this.mesh.castShadow = false
			this.mesh.add( proxy )

		}
		if ( this.fieldParts?.length ) {

			const fields = new THREE.Mesh( mergeGeometries( this.fieldParts ), material )
			fields.receiveShadow = true
			this.mesh.add( fields )

		}

	}

	buildCottage( terrain, rnd ) {

		// ---------- casa: paredes, telhado em duas águas, chaminé, porta, janelas, degrau
		const W = 4.2, D = 3.4, H = 2.5
		this.box( 0, H / 2, 0, W, H, D, 'wall', 0, true )
		this.box( 0, 0.12, 0, W + 0.3, 0.24, D + 0.3, 'rock', 2 ) // base de pedra
		this.roof( W + 0.6, D + 0.7, 1.6, H )
		this.box( 1.1, H + 1.5, - 0.6, 0.55, 1.4, 0.55, 'chimney' )
		this.box( 1.1, H + 2.25, - 0.6, 0.7, 0.14, 0.7, 'rock', 2 )
		// porta e janelas com batente saliente: a dobra (normal) das laterais é o que o contorno desenha
		this.box( - 0.6, 0.95, D / 2 + 0.02, 1.05, 1.9, 0.12, 'wood', 1 ) // batente
		this.box( - 0.6, 0.9, D / 2 + 0.06, 0.8, 1.7, 0.1, 'wood', 2 ) // porta
		this.box( - 0.32, 0.95, D / 2 + 0.13, 0.08, 0.08, 0.06, 'metal' ) // maçaneta
		this.box( - 0.6, 0.1, D / 2 + 0.4, 1.3, 0.2, 0.7, 'rock' ) // degrau
		this.box( 1.15, 1.45, D / 2 + 0.03, 1.05, 0.95, 0.12, 'wood', 1 ) // moldura
		this.box( 1.15, 1.45, D / 2 + 0.06, 0.85, 0.75, 0.1, 'window' )
		this.box( 1.15, 1.45, D / 2 + 0.1, 0.06, 0.75, 0.04, 'wood', 1 ) // caixilho
		this.box( 1.15, 0.95, D / 2 + 0.12, 1.2, 0.1, 0.24, 'wood', 1 ) // peitoril
		for ( const wz of [ - 0.6, 0.7 ] ) {

			this.box( W / 2 + 0.03, 1.45, wz, 0.12, 0.9, 0.85, 'wood', 1 )
			this.box( W / 2 + 0.06, 1.45, wz, 0.1, 0.72, 0.68, 'window', 1 )

		}

		// ---------- cerca em volta do jardim (abertura na frente da porta); tábuas variam de tom
		const R = 5.2
		const posts = 22
		const isGate = ( a ) => Math.abs( THREE.MathUtils.euclideanModulo( a - Math.PI / 2 + Math.PI, Math.PI * 2 ) - Math.PI ) < 0.32
		for ( let i = 0; i < posts; i ++ ) {

			const a = ( i / posts ) * Math.PI * 2
			const a2 = ( ( i + 1 ) / posts ) * Math.PI * 2
			if ( isGate( a ) ) continue
			const px = Math.cos( a ) * R, pz = Math.sin( a ) * R * 0.85
			const qx = Math.cos( a2 ) * R, qz = Math.sin( a2 ) * R * 0.85
			const gy = this.localGround( terrain, px, pz )
			this.box( px, gy + 0.45, pz, 0.14, 0.9, 0.14, 'wood', 2, true )
			if ( isGate( a2 ) ) continue
			const len = Math.hypot( qx - px, qz - pz ), ang = Math.atan2( qz - pz, qx - px )
			const gy2 = this.localGround( terrain, qx, qz )
			for ( const y of [ 0.35, 0.7 ] ) this.box( ( px + qx ) / 2, ( gy + gy2 ) / 2 + y, ( pz + qz ) / 2, len, 0.08, 0.06, 'wood', rnd() < 0.5 ? 0 : 3, false, - ang )

		}

		// ---------- caixa de correio (acento laranja: o "objetivo" do mensageiro)
		const mx = - 1.6, mz = R * 0.85 + 0.8
		const my = this.localGround( terrain, mx, mz )
		this.box( mx, my + 0.5, mz, 0.12, 1.0, 0.12, 'wood', 2, true )
		this.box( mx, my + 1.12, mz, 0.42, 0.34, 0.62, 'mailbox' )
		this.box( mx, my + 1.32, mz, 0.36, 0.1, 0.56, 'mailbox', 1 )
		this.box( mx + 0.23, my + 1.25, mz - 0.1, 0.03, 0.28, 0.07, 'paper' ) // bandeirinha

		// ---------- poste de luz
		const lx = 1.6, lz = R * 0.85 + 0.9
		const ly = this.localGround( terrain, lx, lz )
		this.box( lx, ly + 1.3, lz, 0.12, 2.6, 0.12, 'metal', 0, true )
		this.box( lx, ly + 2.7, lz, 0.4, 0.38, 0.4, 'lamp' )
		this.box( lx, ly + 2.95, lz, 0.55, 0.1, 0.55, 'metal' )

		// ---------- caixotes e um banco perto da casa
		this.box( - 2.8, 0.3, 1.2, 0.6, 0.6, 0.6, 'crate', 0, true )
		this.box( - 2.75, 0.85, 1.25, 0.5, 0.5, 0.5, 'crate', 1, false, 0.3 )
		this.box( 2.7, 0.42, 1.0, 0.5, 0.08, 1.6, 'wood', 1, true )
		for ( const bz of [ 0.4, 1.6 ] ) this.box( 2.7, 0.2, bz, 0.4, 0.4, 0.1, 'wood', 2 )

	}

	// Rua de cidadezinha litorânea (referência: prints do Messenger) — tudo caixa/cilindro com cor da paleta; as linhas internas
	// (janelas, laje, persiana, faixas, juntas da calçada e do muro) vêm do ID (célula da paleta) e das dobras.
	// road[0] = rua principal ao longo de x [ax, z, bx, z]; road[1…] = ramais retos em z saindo do lado +z (guard-rail abre ali).
	// O chão sob as ruas já vem aplainado pelo Terrain (pad.road). Prédios variados atrás da calçada, muro de arrimo nos vãos,
	// guard-rail do outro lado, postes com fios e mato nas frestas. Precisa das cores town* na paleta do preset.
	buildTown( terrain, rnd, road, RW ) {

		const g = ( x, z ) => this.localGround( terrain, x, z )
		const [ X0, RZ, X1 ] = road[ 0 ]
		const walkZ = RZ - RW / 2 - 0.6 // meio da calçada (lado dos prédios)
		const backZ = RZ - RW / 2 - 1.2 // fundo da calçada = frente dos prédios / muro
		const branches = road.slice( 1 )
		const inBranch = ( x, pad = 0 ) => branches.some( ( [ bx ] ) => Math.abs( x - bx ) < RW / 2 + pad )

		// ---------- prédios: loja de 2 andares, casa de 3 com varanda, garagem com máquina de venda, galpão de chapa
		const buildings = [
			{ x: 0, W: 5.6, D: 4.4, floors: 2, F: 2.7, front: 'shop', roof: 'flat', wall: 'townWall' },
			{ x: - 9.6, W: 4.2, D: 4.0, floors: 3, F: 2.5, front: 'house', roof: 'gable', wall: 'townWall2' },
			{ x: 9.4, W: 6.2, D: 3.8, floors: 1, F: 3.1, front: 'garage', roof: 'flat', wall: 'townWall' },
			{ x: - 17.6, W: 3.8, D: 3.4, floors: 1, F: 2.6, front: 'shed', roof: 'gable', wall: 'townTin' }
		]
		for ( const b of buildings ) this.building( b, backZ, g )

		// ---------- ruas: asfalto em placas de 1 m acompanhando o chão, faixa branca nas bordas e tracejada no meio
		const strip = ( ax, az, bx, bz, skipEdge = () => false ) => {

			const len = Math.hypot( bx - ax, bz - az ), ux = ( bx - ax ) / len, uz = ( bz - az ) / len, nx = - uz, nz = ux
			const P = ( s, o, dy = 0 ) => {

				const px = ax + ux * s + nx * o, pz = az + uz * s + nz * o
				return new THREE.Vector3( px, g( px, pz ) + 0.05 + dy, pz )

			}
			for ( let s = 0; s < len; s += 1 ) {

				const e = Math.min( s + 1.02, len )
				this.beam( P( s, 0 ), P( e, 0 ), RW, 0.1, 'townRoad', 0 )
				for ( const o of [ - RW / 2 + 0.2, RW / 2 - 0.2 ] ) if ( ! skipEdge( ax + ux * s, o ) ) this.beam( P( s, o, 0.004 ), P( e, o, 0.004 ), 0.12, 0.1, 'townLine', 0 )
				if ( Math.round( s ) % 2 === 0 && e - s > 0.8 ) this.beam( P( s + 0.2, 0, 0.004 ), P( s + 0.8, 0, 0.004 ), 0.1, 0.1, 'townLine', 0 )

			}

		}
		// a borda +z da principal abre na boca dos ramais (normal da rua ao longo de x = −z, então o lado +z é o offset negativo)
		strip( X0, RZ, X1, RZ, ( x, o ) => o < 0 && inBranch( x ) )
		for ( const [ bx, , , bz ] of branches ) strip( bx, RZ + RW / 2 - 0.05, bx, bz )

		// ---------- calçada de placas (juntas = ID) com meio-fio, do lado dos prédios
		for ( let x = X0; x < X1; x += 2 ) {

			const e = Math.min( x + 2.02, X1 )
			const row = ( ( Math.floor( x / 2 ) % 2 ) + 2 ) % 2 ? 2 : 3
			this.beam( new THREE.Vector3( x, g( x, walkZ ) + 0.12, walkZ ), new THREE.Vector3( e, g( e, walkZ ) + 0.12, walkZ ), 1.2, 0.2, 'townWall', row )

		}

		// ---------- muro de arrimo nos vãos entre prédios: segura o morro de trás (mais alto onde o chão atrás sobe)
		const occupied = ( x ) => buildings.some( ( b ) => Math.abs( x - b.x ) < b.W / 2 + 0.3 )
		for ( let x = X0 + 1; x < X1 - 1; x += 2 ) {

			const cx = x + 1
			if ( occupied( cx - 0.9 ) || occupied( cx + 0.9 ) ) continue
			const base = g( cx, backZ )
			const h = THREE.MathUtils.clamp( g( cx, backZ - 3 ) - base + 0.7, 1.1, 2.6 )
			const row = ( ( Math.floor( x / 2 ) % 2 ) + 2 ) % 2 ? 3 : 0
			this.box( cx, base + h / 2 - 0.4, backZ - 0.2, 2.0, h + 0.8, 0.4, 'townWall', row, true )
			this.box( cx, base + h + 0.05, backZ - 0.2, 2.06, 0.1, 0.5, 'townWall', 2 ) // capa
			if ( h > 1.4 ) this.cyl( cx + 0.4, base + 0.55, backZ + 0.01, 0.06, 0.06, 0.1, 'townFrame', 0, false, Math.PI / 2 ) // dreno
			if ( rnd() < 0.5 ) this.ivy( cx, base + h, backZ + 0.02, rnd )

		}

		// ---------- guard-rail do outro lado: lâmina em W (2 faixas = linha no meio), postes a cada 2 m, abre nos ramais
		const railZ = RZ + RW / 2 + 0.45
		let prev = null
		for ( let x = X0 + 0.5; x <= X1 - 0.5; x += 2 ) {

			if ( inBranch( x, 0.7 ) ) { prev = null; continue }
			const gy = g( x, railZ )
			this.box( x, gy + 0.4, railZ + 0.08, 0.12, 0.8, 0.12, 'townPole', 0, true )
			this.box( x, gy + 0.62, railZ - 0.06, 0.05, 0.05, 0.06, 'townFrame' ) // parafuso
			const top = new THREE.Vector3( x, gy + 0.68, railZ - 0.02 ), bot = new THREE.Vector3( x, gy + 0.53, railZ )
			if ( prev ) {

				this.beam( prev.top, top, 0.04, 0.15, 'townRail', 0 )
				this.beam( prev.bot, bot, 0.06, 0.15, 'townRail', 2 )
				this.colliders.push( { x: x - 1, y: gy + 0.6, z: railZ, hx: 1, hy: 0.4, hz: 0.1, rot: 0 } )

			}
			prev = { top, bot }

		}

		// ---------- postes de concreto na beira da calçada, travessa, isoladores, degraus, transformador e fios caídos
		const poleZ = RZ - RW / 2 - 0.3
		const poleXs = []
		for ( let x = - 4.5; x > X0 + 2; x -= 9 ) poleXs.unshift( x )
		for ( let x = 4.5; x < X1 - 2; x += 9 ) poleXs.push( x )
		const poles = poleXs.map( ( x ) => {

			const gy = g( x, poleZ ) + 0.2, H = 8.5
			this.cyl( x, gy + H / 2, poleZ, 0.11, 0.17, H, 'townPole', 0, true )
			this.box( x, gy + H - 0.5, poleZ, 0.12, 0.12, 1.9, 'townPole', 2 ) // travessa
			for ( const dz of [ - 0.8, 0, 0.8 ] ) this.cyl( x, gy + H - 0.36, poleZ + dz, 0.05, 0.06, 0.18, 'townRail', 1 ) // isoladores
			for ( let i = 0; i < 5; i ++ ) this.box( x + 0.14, gy + 2.2 + i * 0.45, poleZ, 0.18, 0.04, 0.05, 'townFrame' ) // degraus
			return { x, top: gy + H - 0.3 }

		} )
		for ( let i = 1; i < poles.length; i += 3 ) this.cyl( poles[ i ].x - 0.42, poles[ i ].top - 2.0, poleZ, 0.26, 0.26, 0.9, 'townRail', 2 ) // transformadores
		for ( let i = 0; i < poles.length - 1; i ++ ) for ( const dz of [ - 0.8, 0, 0.8 ] ) {

			const a = poles[ i ], b = poles[ i + 1 ], N = 8, sag = 0.7
			let p0 = new THREE.Vector3( a.x, a.top, poleZ + dz )
			for ( let k = 1; k <= N; k ++ ) {

				const t = k / N
				const p1 = new THREE.Vector3( a.x + ( b.x - a.x ) * t, a.top + ( b.top - a.top ) * t - sag * 4 * t * ( 1 - t ), poleZ + dz )
				this.beam( p0, p1, 0.03, 0.03, 'townWire', 0 )
				p0 = p1

			}

		}

		// ---------- mato invadindo: pé do muro/prédios, fresta do meio-fio, juntas da calçada e a beira do guard-rail
		for ( let x = X0 + 0.3; x < X1 - 0.3; x += 0.5 ) {

			const j = ( rnd() - 0.5 ) * 0.3
			if ( rnd() < 0.5 ) this.weed( x + j, g( x, backZ ) + 0.2, backZ + 0.08, rnd, 1.1 ) // pé do muro / fachada
			if ( rnd() < 0.3 ) this.weed( x + j, g( x, RZ - RW / 2 ) + 0.08, RZ - RW / 2 - 0.02, rnd, 0.8 ) // fresta do meio-fio
			if ( ! inBranch( x, 0.3 ) && rnd() < 0.75 ) this.weed( x + j, g( x, RZ + RW / 2 ) + 0.04, RZ + RW / 2 + 0.2 + rnd() * 0.5, rnd, 1.5 ) // beira do guard-rail
			if ( Math.abs( x - Math.round( x / 2 ) * 2 ) < 0.26 && rnd() < 0.35 ) this.weed( x, g( x, walkZ ) + 0.22, walkZ + ( rnd() - 0.5 ) * 0.8, rnd, 0.6 ) // junta

		}

		// ---------- miudezas: frade laranja, cone, espelho de esquina no ramal
		this.cyl( 2.9, g( 2.9, walkZ ) + 0.7, walkZ + 0.3, 0.08, 0.08, 1.0, 'townBollard', 0, true )
		const cz = walkZ + 0.2, cy = g( - 3.4, cz ) + 0.22
		this.cyl( - 3.4, cy + 0.32, cz, 0.03, 0.2, 0.62, 'townCone', 0 )
		this.box( - 3.4, cy + 0.03, cz, 0.42, 0.06, 0.42, 'townCone', 2 )
		this.cyl( - 3.4, cy + 0.36, cz, 0.13, 0.15, 0.1, 'paper', 0 ) // faixa branca do cone
		for ( const [ bx ] of branches ) {

			const mx = bx + RW / 2 + 0.7, mz = RZ + RW / 2 + 0.7, my = g( mx, mz )
			this.cyl( mx, my + 1.3, mz, 0.05, 0.05, 2.6, 'townBollard', 0, true )
			// redondo (16 lados): com 8 o espelho vira placa de PARE
			this.cyl( mx, my + 2.75, mz - 0.05, 0.42, 0.42, 0.08, 'townCone', 0, false, Math.PI / 2, 16 )
			this.cyl( mx, my + 2.75, mz - 0.1, 0.34, 0.34, 0.04, 'townPane', 1, false, Math.PI / 2, 16 )

		}

	}

	// prédio com frente em +z encostada em frontZ; base no chão da calçada e 2 m enterrados (o chão de trás pode ser mais baixo)
	building( { x, W, D, floors, F, front, roof, wall }, frontZ, g ) {

		const z = frontZ - D / 2 - 0.05, y0 = g( x, frontZ ), H = F * floors
		const B = ( bx, by, bz, w, h, d, c, r = 0, solid = false ) => this.box( x + bx, y0 + by, z + bz, w, h, d, c, r, solid )
		B( 0, H / 2 - 1, 0, W, H + 2, D, wall, 0, true )
		B( 0, 0.08, 0.15, W + 0.35, 0.16, D + 0.3, wall, 2 ) // soco
		for ( let f = 1; f < floors; f ++ ) B( 0, F * f, 0, W + 0.16, 0.18, D + 0.16, wall, 2 ) // laje entre andares (vira linha)

		// janela: moldura escura + 2 painéis bege foscos + travessa + peitoril; side = parede +x (u = posição em z)
		const win = ( u, wy, w, h, side = false ) => {

			const P = ( du, dy, dn, bw, bh, bd, c, r = 0 ) => side
				? B( W / 2 + 0.02 + dn, wy + dy, u + du, bd, bh, bw, c, r )
				: B( u + du, wy + dy, D / 2 + 0.02 + dn, bw, bh, bd, c, r )
			P( 0, 0, 0, w + 0.16, h + 0.16, 0.08, 'townFrame' )
			P( - w / 4 - 0.01, 0, 0.03, w / 2 - 0.06, h - 0.06, 0.06, 'townPane', 0 )
			P( w / 4 + 0.01, 0, 0.03, w / 2 - 0.06, h - 0.06, 0.06, 'townPane', 2 )
			P( 0, - h * 0.12, 0.06, w - 0.04, 0.05, 0.04, 'townFrame' )
			P( 0, - h / 2 - 0.12, 0.08, w + 0.3, 0.08, 0.2, wall, 2 )

		}
		for ( let f = 1; f < floors; f ++ ) {

			const n = Math.max( 1, Math.floor( W / 2.3 ) )
			for ( let i = 0; i < n; i ++ ) win( ( i + 0.5 ) / n * W - W / 2, F * f + F * 0.48, Math.min( 1.7, W / n - 0.6 ), 1.2 )
			if ( D > 3.5 ) win( 0, F * f + F * 0.48, 1.2, 1.1, true )

		}

		const shutter = ( sx, sw, sh ) => {

			B( sx, sh / 2 + 0.16, D / 2 + 0.03, sw + 0.2, sh + 0.12, 0.08, 'townFrame' )
			const n = Math.round( sh / 0.25 )
			for ( let i = 0; i < n; i ++ ) B( sx, 0.3 + i * ( sh / n ) + 0.06, D / 2 + 0.07, sw, sh / n - 0.02, 0.05, 'townShutter', i % 2 ? 0 : 2 )
			B( sx, sh + 0.42, D / 2 + 0.06, sw + 0.3, 0.32, 0.18, 'townShutter', 2 ) // caixa da persiana

		}
		const awning = ( sx, sw, y ) => {

			const aw = new THREE.BoxGeometry( sw + 0.8, 0.06, 0.9 ).toNonIndexed()
			aw.rotateX( 0.32 ).translate( x + sx, y0 + y, z + D / 2 + 0.45 )
			this.paint( aw, 'roof', 0 )
			this.parts.push( aw )

		}

		if ( front === 'shop' ) {

			shutter( - 1.25, 2.1, 2.2 )
			awning( - 1.25, 2.1, 2.95 )
			win( 1.5, 1.45, 1.5, 1.1 )
			B( 1.5, F - 0.42, D / 2 + 0.09, 1.9, 0.5, 0.1, 'townSign', 0 ) // placa da loja
			B( 1.5, F - 0.42, D / 2 + 0.15, 1.5, 0.16, 0.04, 'paper', 0 )

		} else if ( front === 'house' ) {

			B( - W / 4, 1.0, D / 2 + 0.03, 1.0, 2.0, 0.1, 'townFrame' )
			B( - W / 4, 0.98, D / 2 + 0.07, 0.84, 1.88, 0.06, 'wood', 2 ) // porta
			B( - W / 4, 2.25, D / 2 + 0.35, 1.4, 0.08, 0.7, wall, 2 ) // marquise
			win( W / 4, 1.4, 1.3, 1.0 )
			B( W / 2 - 0.35, 0.45, D / 2 + 0.35, 0.5, 0.9, 0.5, 'townPole', 2 ) // caixa de gás
			if ( floors > 2 ) {

				// varanda no último andar: laje, grade de barras e corrimão
				const vy = F * ( floors - 1 )
				B( 0, vy + 0.05, D / 2 + 0.55, W - 0.6, 0.12, 1.0, wall, 2 )
				for ( let i = 0; i <= 10; i ++ ) B( - W / 2 + 0.35 + i * ( W - 0.7 ) / 10, vy + 0.5, D / 2 + 1.0, 0.04, 0.8, 0.04, 'townRail', 0 )
				B( 0, vy + 0.92, D / 2 + 1.0, W - 0.6, 0.06, 0.08, 'townRail', 2 )

			}

		} else if ( front === 'garage' ) {

			shutter( - 0.9, 3.4, 2.5 )
			awning( - 0.9, 3.4, 3.0 )
			// máquina de venda (bebidas): corpo azul, vitrine e boca
			B( 2.2, 0.9, D / 2 + 0.45, 0.9, 1.8, 0.7, 'townVend', 0, true )
			B( 2.2, 1.25, D / 2 + 0.81, 0.7, 0.7, 0.02, 'townPane', 1 )
			B( 2.2, 0.35, D / 2 + 0.81, 0.6, 0.18, 0.02, 'townFrame' )

		} else if ( front === 'shed' ) {

			// chapa ondulada: faixas verticais alternadas (linhas de ID) + porta
			const n = Math.round( W / 0.3 )
			for ( let i = 0; i < n; i ++ ) B( - W / 2 + ( i + 0.5 ) * W / n, F / 2, D / 2 + 0.03, W / n, F - 0.1, 0.05, wall, i % 2 ? 0 : 2 )
			B( 0.6, 0.95, D / 2 + 0.08, 1.1, 1.9, 0.05, 'townFrame' )

		}

		if ( roof === 'flat' ) {

			B( 0, H + 0.25, 0, W + 0.2, 0.5, D + 0.2, wall, 1 ) // platibanda
			B( 0, H + 0.52, 0, W - 0.3, 0.06, D - 0.3, wall, 2 ) // laje do teto

		} else this.roof( W + 0.5, D + 0.6, Math.min( 1.6, D * 0.35 ), y0 + H, x, z, { roof: 'townRoof', gable: wall } )

		// ar-condicionado com grade e cano na lateral
		if ( floors > 1 ) {

			B( - W / 2 - 0.25, F + 0.6, - 0.6, 0.5, 0.55, 0.85, 'townRail', 0 )
			for ( let i = 0; i < 4; i ++ ) B( - W / 2 - 0.51, F + 0.42 + i * 0.12, - 0.6, 0.02, 0.05, 0.7, 'townFrame' )

		}
		B( W / 2 + 0.08, H / 2, - D / 2 + 0.3, 0.1, H, 0.1, 'townPole', 2 )

	}

	// tufo de mato: 3–5 lâminas finas (cone de 3 lados) inclinadas ao acaso
	weed( x, y, z, rnd, s = 1 ) {

		const n = 3 + Math.floor( rnd() * 3 ), row = Math.floor( rnd() * 3 )
		for ( let i = 0; i < n; i ++ ) {

			const h = ( 0.18 + rnd() * 0.3 ) * s
			const g = new THREE.CylinderGeometry( 0, 0.035 * s, h, 3 ).toNonIndexed()
			g.translate( 0, h / 2, 0 ).rotateZ( ( rnd() - 0.5 ) * 1.1 ).rotateY( rnd() * Math.PI * 2 )
			g.translate( x + ( rnd() - 0.5 ) * 0.14 * s, y, z + ( rnd() - 0.5 ) * 0.14 * s )
			this.paint( g, 'townWeed', row )
			this.parts.push( g )

		}

	}

	// trepadeira caindo do alto do muro: folhas de 5 lados, achatadas e giradas ao acaso (discos redondos viravam "bolinhas"),
	// mais densas em cima e afinando para baixo
	ivy( x, top, z, rnd ) {

		const n = 28 + Math.floor( rnd() * 14 )
		for ( let i = 0; i < n; i ++ ) {

			const r = 0.07 + rnd() * 0.1, drop = Math.pow( rnd(), 1.8 ) * 1.4
			const g = new THREE.CylinderGeometry( r, r, 0.04, 5 ).toNonIndexed()
			g.rotateX( Math.PI / 2 ).scale( 1, 0.55 + rnd() * 0.5, 1 ).rotateZ( rnd() * Math.PI )
			g.translate( x + ( rnd() - 0.5 ) * ( 1.9 - drop * 0.6 ), top + 0.12 - drop, z + rnd() * 0.05 )
			this.paint( g, 'townWeed', Math.floor( rnd() * 3 ) )
			this.parts.push( g )

		}

	}

	// Cidade murada da China antiga, período das Primaveras e Outonos (~770–476 a.C.) — feita por nós, só caixas/cilindros/planos.
	// Referências de época: muralha de TAIPA (terra apiloada em camadas; aqui 0,45 m → cada camada é uma linha de ID), portão com
	// pavilhão de madeira sobre bastiões de terra, salão sobre plataforma de terra apiloada (tai) em 3 degraus, colunas laqueadas
	// (vermelho) com viga preta, telhado de 4 águas RETO de telha cinza (o beiral curvo só aparece séculos depois), alas laterais e
	// casas de taipa com palha, celeiros redondos, caldeirão ritual de bronze (ding), estandartes e uma biga de 2 rodas raiadas.
	// Portão em +z local. Precisa das cores zhou* na paleta do preset.
	buildZhou( terrain, rnd, S, moat = null ) {

		// lances de taipa de 1,2 m: uma linha por lance (camada por camada de 0,45 m virava "parede de tábuas")
		const half = S / 2, H = 6, T0 = 6, T1 = 3.2, layer = 1.2, gateW = 6
		this.box( 0, 0.03, 0, S - T0, 0.06, S - T0, 'zhouGround', 0 ) // chão batido

		// ---------- muralha em lances que afinam para cima (alongX: comprimento em x) + furos de andaime na face de fora
		const wall = ( cx, cz, len, alongX, h = H, t0 = T0, t1 = T1, holes = true ) => {

			const n = Math.round( h / layer ), lh = h / n
			for ( let i = 0; i < n; i ++ ) {

				const t = t0 + ( t1 - t0 ) * ( i / Math.max( 1, n - 1 ) ), y = i * lh + lh / 2
				if ( alongX ) this.box( cx, y, cz, len, lh, t, 'zhouEarth', i % 2 ? 0 : 1 )
				else this.box( cx, y, cz, t, lh, len, 'zhouEarth', i % 2 ? 0 : 1 );
				( this.shadowParts ??= [] ).push( this.parts[ this.parts.length - 1 ] ) // lance afinando = sombra certa
				// furos das vigas do andaime (marca da taipa feita em formas): fileira logo abaixo de cada junta
				if ( holes && i > 0 ) for ( let u = - len / 2 + 1.5; u < len / 2 - 1; u += 2.4 ) for ( const side of [ - 1, 1 ] ) {

					const tBelow = t0 + ( t1 - t0 ) * ( ( i - 1 ) / Math.max( 1, n - 1 ) ) // o furo fica no lance de BAIXO (mais grosso)
					const off = side * ( tBelow / 2 + 0.01 )
					if ( alongX ) this.box( cx + u, i * lh - 0.25, cz + off, 0.2, 0.18, 0.06, 'zhouBlack', 0 )
					else this.box( cx + off, i * lh - 0.25, cz + u, 0.06, 0.18, 0.2, 'zhouBlack', 0 )

				}

			}
			this.colliders.push( { x: cx, y: h / 2, z: cz, hx: ( alongX ? len : t0 ) / 2, hy: h / 2, hz: ( alongX ? t0 : len ) / 2, rot: 0, noShadow: true } )

		}
		wall( 0, - half, S + T0, true )
		wall( - half, 0, S - T0, false )
		wall( half, 0, S - T0, false )
		const segLen = half + T0 / 2 - gateW / 2 - 5 // trecho sul entre o canto e o bastião
		for ( const s of [ - 1, 1 ] ) {

			wall( s * ( half + T0 / 2 - segLen / 2 ), half, segLen, true )
			wall( s * ( gateW / 2 + 2.5 ), half, 9, false, 7.2, 5, 4.4, false ) // bastião do portão (mais largo e mais alto)

		}

		// ---------- portão: verga de madeira, folhas abertas para dentro, pavilhão de madeira sobre os bastiões
		const gy = 7.2
		this.box( 0, 5.6, half + 1.5, gateW + 0.6, 0.5, 0.5, 'zhouBlack', 0 ) // verga
		this.box( 0, 5.6, half - 1.5, gateW + 0.6, 0.5, 0.5, 'zhouBlack', 0 )
		for ( const s of [ - 1, 1 ] ) this.box( s * ( gateW / 2 - 0.4 ), 2.6, half - 2.6, 0.18, 5.2, 2.7, 'zhouTimber', s > 0 ? 0 : 2, false, s * 0.25 )
		this.box( 0, gy + 0.15, half, 16, 0.3, 7, 'zhouTimber', 2 ) // piso do pavilhão
		for ( const cx of [ - 7, - 2.4, 2.4, 7 ] ) for ( const cz of [ - 2.8, 2.8 ] ) this.cyl( cx, gy + 1.7, half + cz, 0.2, 0.22, 3.1, 'zhouLacquer', 0 )
		this.box( 0, gy + 3.3, half, 15.6, 0.35, 6.2, 'zhouBlack', 0 ) // viga
		for ( const cz of [ - 3.2, 3.2 ] ) this.box( 0, gy + 0.75, half + cz, 15.2, 0.12, 0.12, 'zhouTimber', 1 ) // guarda-corpo
		for ( const cz of [ - 1.6, 1.6 ] ) this.box( 0, gy + 1.6, half + cz, 9, 2.6, 0.12, 'zhouPlaster', 0 ) // paredes internas do pavilhão
		this.hipRoof( 0, half, 18, 9, 3.0, gy + 3.45, 'zhouTile', 6 )

		// ---------- torres de vigia nos cantos: 4 postes, plataforma, guarda-corpo, telhadinho de palha
		for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

			const tx = sx * half, tz = sz * half
			for ( const dx of [ - 1.5, 1.5 ] ) for ( const dz of [ - 1.5, 1.5 ] ) this.cyl( tx + dx, H + 2, tz + dz, 0.14, 0.16, 4, 'zhouTimber', 0 )
			this.box( tx, H + 2.4, tz, 4, 0.2, 4, 'zhouTimber', 2 )
			for ( const [ ax, az, bx, bz ] of [ [ - 2, - 2, 2, - 2 ], [ 2, - 2, 2, 2 ], [ 2, 2, - 2, 2 ], [ - 2, 2, - 2, - 2 ] ] ) {

				this.beam( new THREE.Vector3( tx + ax, H + 3.3, tz + az ), new THREE.Vector3( tx + bx, H + 3.3, tz + bz ), 0.1, 0.1, 'zhouTimber', 1 )

			}
			this.hipRoof( tx, tz, 4.8, 4.8, 1.7, H + 4.05, 'zhouThatch', 4 )

		}

		// ---------- salão principal sobre plataforma de terra em 3 degraus (tai), escada na frente
		const hz = - 10
		let top = 0
		for ( const [ w, d, h, row ] of [ [ 26, 18, 1.4, 1 ], [ 21, 14, 1.3, 0 ], [ 17, 10.5, 1.1, 1 ] ] ) {

			this.box( 0, top + h / 2, hz, w, h, d, 'zhouEarth', row ) // um degrau = um bloco (a dobra já desenha o degrau)
			this.box( 0, top + h - 0.05, hz, w + 0.12, 0.1, d + 0.12, 'zhouEarth', 2 ) // borda batida
			top += h

		}
		this.colliders.push( { x: 0, y: top / 2, z: hz, hx: 13, hy: top / 2, hz: 9, rot: 0 } )
		const steps = 12
		for ( let i = 0; i < steps; i ++ ) {

			const sh = ( i + 1 ) * top / steps // degrau maciço até o chão
			this.box( 0, sh / 2, hz + 9 + 2.4 - i * 0.4 - 0.2, 4.2, sh, 0.4, 'zhouEarth', i % 2 ? 2 : 3 )

		}
		for ( const s of [ - 1, 1 ] ) this.beam( new THREE.Vector3( s * 2.2, 0.3, hz + 11.4 ), new THREE.Vector3( s * 2.2, top + 0.3, hz + 9 - 2.4 ), 0.25, 0.4, 'zhouEarth', 3 )
		// salão: colunas no perímetro, paredes de taipa rebocada atrás e nos lados, portas recuadas na frente
		const HW = 15, HD = 9, CH = 4.2, base = top
		for ( let i = 0; i < 6; i ++ ) for ( const cz of [ - HD / 2, HD / 2 ] ) this.cyl( - HW / 2 + i * HW / 5, base + CH / 2, hz + cz, 0.24, 0.27, CH, 'zhouLacquer', 0, true )
		for ( const cx of [ - HW / 2, HW / 2 ] ) for ( const cz of [ - HD / 6, HD / 6 ] ) this.cyl( cx, base + CH / 2, hz + cz, 0.24, 0.27, CH, 'zhouLacquer', 0 )
		this.box( 0, base + CH / 2, hz - HD / 2 + 0.05, HW, CH, 0.3, 'zhouPlaster', 0, true )
		for ( const cx of [ - HW / 2, HW / 2 ] ) this.box( cx, base + CH / 2, hz, 0.3, CH, HD, 'zhouPlaster', 2, true )
		this.box( 0, base + CH / 2, hz + HD / 2 - 1.4, HW - 0.4, CH, 0.25, 'zhouPlaster', 0, true ) // fachada recuada (varanda na frente)
		for ( const cx of [ - 3.2, 0, 3.2 ] ) this.box( cx, base + 1.3, hz + HD / 2 - 1.25, 1.8, 2.6, 0.08, 'zhouBlack', 0 ) // portas
		this.box( 0, base + CH + 0.2, hz, HW + 0.8, 0.4, HD + 0.8, 'zhouBlack', 0 ) // viga de cinta
		this.hipRoof( 0, hz, HW + 4, HD + 4, 4.6, base + CH + 0.4, 'zhouTile', 8 )

		// ---------- alas leste/oeste do pátio (gable de palha, cumeeira ao longo de z)
		for ( const s of [ - 1, 1 ] ) {

			const ax = s * 17, az = 2
			this.box( ax, 0.4, az, 7.5, 0.8, 12, 'zhouEarth', 1, true )
			this.box( ax, 0.8 + 1.4, az, 5.5, 2.8, 10, 'zhouPlaster', 0, true )
			for ( let i = 0; i < 4; i ++ ) this.cyl( ax - s * 3.1, 0.8 + 1.5, az - 4.5 + i * 3, 0.16, 0.18, 3.0, 'zhouLacquer', 0 )
			for ( const dz of [ - 2.5, 2.5 ] ) this.box( ax - s * 2.78, 0.8 + 1.1, az + dz, 0.06, 2.0, 1.4, 'zhouBlack', 0 )
			this.roof( 12, 8, 2.3, 0.8 + 2.8, ax, az, { roof: 'zhouThatch', gable: 'zhouPlaster' }, Math.PI / 2 )

		}

		// ---------- casas do povo (taipa + palha), duas fileiras de cada lado do caminho do portão
		for ( const s of [ - 1, 1 ] ) for ( const [ hx, hz2 ] of [ [ 9, 13 ], [ 17, 13 ], [ 25, 14 ], [ 9, 22 ], [ 17, 22 ], [ 25, 23 ] ] ) {

			const x = s * hx + ( rnd() - 0.5 ), z = hz2 + ( rnd() - 0.5 )
			const w = 5 + rnd() * 1.2, d = 4 + rnd() * 0.6, wh = 2.2 + rnd() * 0.4
			this.box( x, wh / 2, z, w, wh, d, 'zhouEarth', 0, true ) // parede de taipa
			this.box( x, 0.2, z, w + 0.2, 0.4, d + 0.2, 'zhouEarth', 2 ) // soco
			const top2 = wh
			this.box( x - w * 0.2, 0.9, z + d / 2 + 0.02, 0.9, 1.8, 0.06, 'zhouBlack', 0 ) // porta
			this.box( x + w * 0.22, 1.5, z + d / 2 + 0.02, 0.7, 0.5, 0.06, 'zhouTimber', 2 ) // janela de treliça
			this.roof( w + 0.9, d + 1.0, 1.7 + rnd() * 0.4, top2, x, z, { roof: 'zhouThatch', gable: 'zhouEarth' } )

		}

		// ---------- celeiros redondos (taipa) com cone de palha, no canto de trás
		for ( const [ x, z ] of [ [ - 23, - 22 ], [ - 18, - 25 ], [ - 24, - 16.5 ], [ 23, - 22 ] ] ) {

			this.cyl( x, 0.2, z, 2.2, 2.3, 0.4, 'zhouEarth', 2, true, 0, 12 )
			this.cyl( x, 1.7, z, 1.8, 1.9, 2.6, 'zhouEarth', 1, true, 0, 12 )
			this.cyl( x, 3.0 + 1.15, z, 0.05, 2.35, 2.3, 'zhouThatch', 0, false, 0, 12 )

		}

		// ---------- caldeirão ritual de bronze (ding) no pátio, sobre base de terra
		const dx = 0, dz = 3.5
		this.box( dx, 0.25, dz, 2.6, 0.5, 2.6, 'zhouEarth', 2, true )
		for ( let i = 0; i < 3; i ++ ) {

			const a = i * Math.PI * 2 / 3
			this.cyl( dx + Math.cos( a ) * 0.62, 0.5 + 0.45, dz + Math.sin( a ) * 0.62, 0.11, 0.14, 0.9, 'zhouBronze', 2 )

		}
		this.cyl( dx, 1.85, dz, 0.98, 0.72, 1.0, 'zhouBronze', 0, false, 0, 16 );
		( this.shadowParts ??= [] ).push( this.parts[ this.parts.length - 1 ] ) // bojo do ding na silhueta de sombra
		this.cyl( dx, 2.38, dz, 1.04, 1.04, 0.08, 'zhouBronze', 1, false, 0, 16 ) // borda
		for ( const s of [ - 1, 1 ] ) {

			this.box( dx + s * 0.75, 2.7, dz, 0.1, 0.6, 0.45, 'zhouBronze', 2 ) // alças
			this.box( dx + s * 0.75, 2.95, dz, 0.1, 0.12, 0.45, 'zhouBronze', 1 )

		}

		// ---------- estandartes (vermelho / preto) ao longo do caminho do portão ao salão
		for ( const [ x, z, c ] of [ [ - 4, 22, 'zhouCloth' ], [ 4, 22, 'zhouCloth2' ], [ - 4, 9, 'zhouCloth2' ], [ 4, 9, 'zhouCloth' ] ] ) {

			this.cyl( x, 3.6, z, 0.06, 0.08, 7.2, 'zhouTimber', 0, true )
			this.box( x + Math.sign( x ) * 0.55, 6.9, z, 1.3, 0.08, 0.08, 'zhouTimber', 1 )
			this.box( x + Math.sign( x ) * 0.6, 5.3, z, 1.0, 3.1, 0.05, c, 0 )

		}

		// ---------- árvores do pátio e dos cantos (posições locais; o main.js entrega à Nature como árvores do mapa)
		this.treeSpots = [ [ - 10, 3 ], [ 10, 3.5 ], [ - 6.5, - 24 ], [ 7, - 23.5 ], [ - 20.5, 27.3 ], [ 21, 27.3 ], [ 25, - 8 ] ]

		const outer = moat ? moat.inner + moat.width : half + T0 / 2 + 2
		if ( moat ) this.zhouBridge( half + T0 / 2, outer + 1.2 )
		// campos numa malha à parte, sem sombra projetada (milhares de touceiras baixas: a sombra custava ~0,6 ms e quase não aparece)
		const main = this.parts
		this.parts = this.fieldParts = []
		this.zhouFields( terrain, rnd, outer + 3 )
		this.parts = main

		// ---------- biga estacionada do lado de fora (depois do fosso, ao lado da chegada da rua)
		this.chariot( 5.6, outer + 6, - 0.35 )

	}

	// ponte de pranchas no eixo do portão, de z0 (face da muralha) a z1 (margem de fora): estacas na água, longarinas, guarda-corpo
	zhouBridge( z0, z1 ) {

		const W = 4.4, y = 0.35
		for ( let z = z0; z < z1; z += 0.5 ) this.box( 0, y, z + 0.25, W, 0.14, 0.48, 'zhouTimber', Math.round( z * 2 ) % 2 ? 0 : 2 ) // pranchas
		for ( const s of [ - 1, 1 ] ) {

			this.box( s * ( W / 2 - 0.3 ), y - 0.2, ( z0 + z1 ) / 2, 0.25, 0.25, z1 - z0, 'zhouBlack', 0 ) // longarina
			this.box( s * ( W / 2 - 0.05 ), y + 0.95, ( z0 + z1 ) / 2, 0.12, 0.12, z1 - z0, 'zhouTimber', 1 ) // corrimão
			for ( let z = z0 + 0.6; z <= z1 - 0.4; z += ( z1 - z0 - 1 ) / 4 ) {

				this.box( s * ( W / 2 - 0.05 ), y + 0.5, z, 0.14, 0.9, 0.14, 'zhouTimber', 2 ) // montante
				this.cyl( s * ( W / 2 - 0.3 ), y - 1.1, z, 0.13, 0.15, 1.8, 'zhouBlack', 0 ) // estaca

			}

		}
		this.colliders.push( { x: 0, y: y - 0.05, z: ( z0 + z1 ) / 2, hx: W / 2, hy: 0.12, hz: ( z1 - z0 ) / 2, rot: 0 } )
		for ( const s of [ - 1, 1 ] ) this.colliders.push( { x: s * ( W / 2 - 0.05 ), y: y + 0.6, z: ( z0 + z1 ) / 2, hx: 0.08, hy: 0.5, hz: ( z1 - z0 ) / 2, rot: 0 } )

	}

	// campos de painço em faixas fora do fosso: canteiros com dique de terra, linhas de plantas de altura irregular (verde / maduro
	// dourado com cachos) ou terra lavrada em sulcos; caminhos de terra entre canteiros. r0 = início (distância "quadrada" ao centro)
	zhouFields( terrain, rnd, r0 ) {

		const g = ( x, z ) => this.localGround( terrain, x, z )
		const D = 15 // profundidade dos canteiros (do muro para fora)
		const plots = []
		for ( const s of [ - 1, 1 ] ) for ( const c of [ - 15, 0, 15 ] ) plots.push( { cx: s * ( r0 + D / 2 ), cz: c, w: D, d: 13, alongX: true } ) // laterais
		for ( const c of [ - 15, 0, 15 ] ) plots.push( { cx: c, cz: - ( r0 + D / 2 ), w: 13, d: D, alongX: false } ) // fundos
		for ( const s of [ - 1, 1 ] ) plots.push( { cx: s * 17, cz: r0 + D / 2, w: 18, d: D, alongX: false } ) // frente, dos 2 lados da chegada
		const kinds = [ 'green', 'ripe', 'fallow', 'ripe', 'green', 'ripe', 'green', 'fallow', 'ripe', 'green', 'ripe' ]
		plots.forEach( ( p, k ) => {

			const kind = kinds[ k % kinds.length ]
			const y0 = g( p.cx, p.cz )
			this.box( p.cx, y0 + 0.02, p.cz, p.w, 0.08, p.d, 'zhouSoil', kind === 'fallow' ? 2 : 0 ) // terra do canteiro
			for ( const [ ox, oz, w, d ] of [ [ 0, - p.d / 2, p.w, 0.4 ], [ 0, p.d / 2, p.w, 0.4 ], [ - p.w / 2, 0, 0.4, p.d ], [ p.w / 2, 0, 0.4, p.d ] ] ) this.box( p.cx + ox, y0 + 0.12, p.cz + oz, w + 0.4, 0.25, d + 0.4, 'zhouEarth', 2 ) // dique
			// linhas: ao longo do lado comprido do canteiro
			const len = p.alongX ? p.w : p.d, across = p.alongX ? p.d : p.w
			const n = Math.floor( ( across - 1 ) / 1.3 )
			for ( let i = 0; i < n; i ++ ) {

				const o = - ( n - 1 ) * 0.65 + i * 1.3
				if ( kind === 'fallow' ) {

					// sulcos: camalhões baixos de terra
					const [ x, z ] = p.alongX ? [ p.cx, p.cz + o ] : [ p.cx + o, p.cz ]
					this.box( x, y0 + 0.1, z, p.alongX ? len - 0.8 : 0.4, 0.14, p.alongX ? 0.4 : len - 0.8, 'zhouSoil', 1 )
					continue

				}
				// touceiras de 0,5–0,9 m com altura própria (uma caixa por trecho de 1 m parecia cerca-viva; de 0,3 m custava ~2,5 ms)
				const ripe = kind === 'ripe'
				for ( let u = - len / 2 + 0.4; u < len / 2 - 0.4; ) {

					const seg = 0.5 + rnd() * 0.4
					const h = ( ripe ? 0.8 : 0.55 ) + rnd() * 0.4
					const wd = 0.35 + rnd() * 0.2, jit = ( rnd() - 0.5 ) * 0.12
					const [ x, z ] = p.alongX ? [ p.cx + u + seg / 2, p.cz + o + jit ] : [ p.cx + o + jit, p.cz + u + seg / 2 ]
					this.box( x, y0 + h / 2, z, p.alongX ? seg : wd, h, p.alongX ? wd : seg, ripe ? 'zhouRipe' : 'zhouMillet', rnd() < 0.5 ? 0 : 1 )
					// cacho do painço maduro: caído para um lado, mais escuro
					if ( ripe && rnd() < 0.35 ) this.box( x + ( p.alongX ? 0 : 0.14 ), y0 + h + 0.04, z + ( p.alongX ? 0.14 : 0 ), 0.16, 0.14, 0.16, 'zhouRipe', 2 )
					u += seg + 0.12 + rnd() * 0.25

				}

			}

		} )

	}

	// biga de 2 rodas raiadas (eixo em x), caixa, eixo e lança com canga — parada, lança apoiada no chão
	chariot( x, z, rotY ) {

		const from = this.parts.length
		const R = 0.75
		for ( const s of [ - 1, 1 ] ) {

			const wx = s * 0.95
			const rim = new THREE.TorusGeometry( R, 0.05, 4, 18 ).toNonIndexed()
			rim.rotateY( Math.PI / 2 ).translate( wx, R, 0 )
			this.paint( rim, 'zhouTimber', 0 )
			this.parts.push( rim )
			this.box( wx, R, 0, 0.3, 0.22, 0.22, 'zhouBlack', 0 ) // cubo da roda
			for ( let i = 0; i < 12; i ++ ) {

				const a = i * Math.PI / 6 + 0.13 // fora do vertical exato (lookAt degenera)
				this.beam( new THREE.Vector3( wx, R, 0 ), new THREE.Vector3( wx, R + Math.sin( a ) * R, Math.cos( a ) * R ), 0.035, 0.035, 'zhouTimber', 1 )

			}

		}
		this.beam( new THREE.Vector3( - 1.1, R, 0.001 ), new THREE.Vector3( 1.1, R, 0 ), 0.08, 0.08, 'zhouBlack', 0 ) // eixo
		this.box( 0, R + 0.35, 0, 1.3, 0.12, 1.0, 'zhouTimber', 2 ) // piso da caixa
		for ( const [ bx, bz, w, d ] of [ [ 0, - 0.5, 1.3, 0.05 ], [ - 0.65, 0, 0.05, 1.0 ], [ 0.65, 0, 0.05, 1.0 ] ] ) this.box( bx, R + 0.65, bz, w, 0.55, d, 'zhouLacquer', 0 )
		this.beam( new THREE.Vector3( 0, R + 0.3, - 0.3 ), new THREE.Vector3( 0, 0.15, - 3.4 ), 0.1, 0.1, 'zhouBlack', 0 ) // lança
		this.beam( new THREE.Vector3( - 0.9, 0.3, - 3.2 ), new THREE.Vector3( 0.9, 0.3, - 3.2 ), 0.09, 0.09, 'zhouTimber', 1 ) // canga
		for ( let i = from; i < this.parts.length; i ++ ) this.parts[ i ].rotateY( rotY ).translate( x, 0, z )
		this.colliders.push( { x, y: 0.8, z, hx: 1.1, hy: 0.8, hz: 0.8, rot: rotY } )

	}

	// telhado de 4 águas reto: frente/trás trapézios até a cumeeira, laterais triângulos; em faixas (fiadas de telha = linhas de ID),
	// com espessura (face de baixo), cumeeira e espigões. Base w × d em y0, altura rise, centro (cx, cz) local
	hipRoof( cx, cz, w, d, rise, y0, colorName, rows = 6 ) {

		const hw = w / 2, hd = d / 2, r = Math.max( 0, hw - hd )
		const V = ( x, y, z ) => new THREE.Vector3( cx + x, y0 + y, cz + z )
		const A = V( - hw, 0, hd ), B = V( hw, 0, hd ), C = V( hw, 0, - hd ), D = V( - hw, 0, - hd )
		const R1 = V( - r, rise, 0 ), R2 = V( r, rise, 0 )
		const faces = [ [ A, B, R1, R2 ], [ C, D, R2, R1 ], [ B, C, R2, R2 ], [ D, A, R1, R1 ] ] // base b0→b1, cumeeira t0→t1
		const thick = 0.2
		for ( const [ b0, b1, t0, t1 ] of faces ) {

			for ( let i = 0; i < rows; i ++ ) {

				const k0 = i / rows, k1 = ( i + 1 ) / rows
				const p0 = b0.clone().lerp( t0, k0 ), p1 = b1.clone().lerp( t1, k0 ), p2 = b1.clone().lerp( t1, k1 ), p3 = b0.clone().lerp( t0, k1 )
				const pos = []
				const tri = ( a, b, c ) => pos.push( a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z )
				tri( p0, p1, p2 ); tri( p0, p2, p3 )
				const dn = new THREE.Vector3( 0, - thick, 0 )
				const q0 = p0.clone().add( dn ), q1 = p1.clone().add( dn ), q2 = p2.clone().add( dn ), q3 = p3.clone().add( dn )
				tri( q0, q2, q1 ); tri( q0, q3, q2 ) // face de baixo (beiral visto de baixo)
				if ( i === 0 ) { tri( p0, q0, q1 ); tri( p0, q1, p1 ) } // testeira do beiral
				const g = new THREE.BufferGeometry()
				g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) )
				g.computeVertexNormals()
				this.paint( g, colorName, i % 2 ? 0 : 2 )
				this.parts.push( g );
				( this.roofParts ??= [] ).push( g ) // silhueta de sombra (cidade antiga)

			}

		}
		const lift = new THREE.Vector3( 0, 0.12, 0 )
		if ( r > 0.01 ) this.beam( R1.clone().add( lift ), R2.clone().add( lift ), 0.32, 0.3, 'zhouBlack', 0 ) // cumeeira
		for ( const [ a, b ] of [ [ A, R1 ], [ D, R1 ], [ B, R2 ], [ C, R2 ] ] ) this.beam( a.clone().add( lift ), b.clone().add( lift ), 0.2, 0.18, 'zhouBlack', 0 ) // espigões

	}

	// ponto local (antes da rotação) → mundo, no chão
	worldPoint( terrain, lx, lz ) {

		const v = new THREE.Vector3( lx, 0, lz ).applyAxisAngle( THREE.Object3D.DEFAULT_UP, this.rotation ).add( this.origin )
		v.y = terrain.sampleHeight( v.x, v.z )
		return v

	}

	// altura do terreno num ponto LOCAL da vila (antes da rotação), relativa à base da vila
	localGround( terrain, lx, lz ) {

		const v = new THREE.Vector3( lx, 0, lz ).applyAxisAngle( THREE.Object3D.DEFAULT_UP, this.rotation ).add( this.origin )
		return terrain.sampleHeight( v.x, v.z ) - this.ground

	}

	box( x, y, z, w, h, d, colorName, row = 0, solid = false, rotY = 0 ) {

		const g = new THREE.BoxGeometry( w, h, d ).toNonIndexed() // não indexada: mergeGeometries exige o mesmo formato do telhado
		if ( rotY ) g.rotateY( rotY )
		g.translate( x, y, z )
		this.paint( g, colorName, row )
		this.parts.push( g )
		if ( solid ) this.colliders.push( { x, y, z, hx: w / 2, hy: h / 2, hz: d / 2, rot: rotY } )

	}

	// caixa w × h ao longo do segmento a → b (pontos locais): rua, guard-rail, fios
	beam( a, b, w, h, colorName, row = 0 ) {

		const g = new THREE.BoxGeometry( w, h, a.distanceTo( b ) ).toNonIndexed()
		const m = new THREE.Matrix4().lookAt( a, b, THREE.Object3D.DEFAULT_UP )
		m.setPosition( a.clone().add( b ).multiplyScalar( 0.5 ) )
		g.applyMatrix4( m )
		this.paint( g, colorName, row )
		this.parts.push( g )

	}

	// cilindro de 8 lados (facetado = ilustração); rotX deita (espelho, placa redonda)
	cyl( x, y, z, rTop, rBottom, h, colorName, row = 0, solid = false, rotX = 0, segments = 8 ) {

		const g = new THREE.CylinderGeometry( rTop, rBottom, h, segments ).toNonIndexed()
		if ( rotX ) g.rotateX( rotX )
		g.translate( x, y, z )
		this.paint( g, colorName, row )
		this.parts.push( g )
		if ( solid ) this.colliders.push( { x, y, z, hx: rBottom, hy: h / 2, hz: rBottom, rot: 0 } )

	}

	// telhado em duas águas: prisma triangular ao longo de X, em fiadas de telha (linhas alternadas da paleta)
	// rotY gira a cumeeira (0 = ao longo de x) em volta do centro antes de mover para (ox, oz)
	roof( w, d, rise, baseY, ox = 0, oz = 0, colors = { roof: 'roof', gable: 'gable' }, rotY = 0 ) {

		const from = this.parts.length

		const hd = d / 2, t = 0.12, rows = 5
		const slope = Math.hypot( hd, rise )
		for ( const s of [ - 1, 1 ] ) {

			for ( let i = 0; i < rows; i ++ ) {

				// cada fiada é uma tábua inclinada; a de cima fica um pouco por cima da de baixo (degrauzinho = traço do contorno)
				const len = slope / rows + 0.06
				const g = new THREE.BoxGeometry( w, t, len ).toNonIndexed()
				const k = ( i + 0.5 ) / rows
				g.rotateX( s * Math.atan2( rise, hd ) )
				g.translate( 0, baseY + rise * ( 1 - k ) + t * 0.5 + ( rows - i ) * 0.015, s * hd * k )
				this.paint( g, colors.roof, i % 2 ? 0 : 2 )
				this.parts.push( g );
				( this.roofParts ??= [] ).push( g ) // silhueta de sombra (cidade antiga)

			}

		}

		// cumeeira
		const ridge = new THREE.BoxGeometry( w + 0.05, 0.16, 0.24 ).toNonIndexed()
		ridge.translate( 0, baseY + rise + 0.1, 0 )
		this.paint( ridge, colors.roof, 2 )
		this.parts.push( ridge )

		// empena (triângulo de parede sob o telhado)
		const gable = new THREE.Shape()
		gable.moveTo( - hd + 0.35, 0 )
		gable.lineTo( 0, rise - 0.3 )
		gable.lineTo( hd - 0.35, 0 )
		gable.closePath()
		const e = new THREE.ExtrudeGeometry( gable, { depth: w - 0.9, bevelEnabled: false } )
		e.rotateY( Math.PI / 2 ).translate( - w / 2 + 0.45, baseY, 0 )
		this.paint( e, colors.gable )
		this.parts.push( e )
		if ( ox || oz || rotY ) for ( let i = from; i < this.parts.length; i ++ ) this.parts[ i ].rotateY( rotY ).translate( ox, 0, oz )

	}

	paint( g, colorName, row ) {

		const [ u, v ] = this.palette.uv( colorName, row )
		const n = g.attributes.position.count
		const uvs = new Float32Array( n * 2 )
		for ( let i = 0; i < n; i ++ ) { uvs[ i * 2 ] = u; uvs[ i * 2 + 1 ] = v }
		g.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) )

	}

	addToPhysics( physics ) {

		const { RAPIER, world } = physics
		const q = new THREE.Quaternion(), v = new THREE.Vector3()
		const body = world.createRigidBody( RAPIER.RigidBodyDesc.fixed() )
		for ( const b of this.colliders ) {

			v.set( b.x, b.y, b.z ).applyAxisAngle( THREE.Object3D.DEFAULT_UP, this.rotation ).add( this.origin )
			q.setFromAxisAngle( THREE.Object3D.DEFAULT_UP, this.rotation + b.rot )
			world.createCollider(
				RAPIER.ColliderDesc.cuboid( b.hx, b.hy, b.hz ).setTranslation( v.x, v.y, v.z ).setRotation( { x: q.x, y: q.y, z: q.z, w: q.w } ),
				body
			)

		}

	}

}
