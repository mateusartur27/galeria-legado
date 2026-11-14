import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Fn, attribute, instancedBufferAttribute, positionGeometry, normalGeometry, time, vec3, float, mix, sin, cos, abs, max, step } from 'three/tsl'
import { createToonMaterial } from '../render/ToonMaterial.js'
import { rng } from '../core/utils.js'

// Moradores e animais da cidade antiga (Primaveras e Outonos, ~770–476 a.C.), modelados em código (nada baixado):
//   villager — túnica longa cruzada (shenyi) com faixa na cintura, mangas largas, cabelo preso em coque (ji)
//   guard    — mesma túnica + colete de lamelas de couro escuro e uma alabarda (ge) de bronze
//   farmer   — túnica curta, calça, chapéu cônico de palha e enxada
//   horse    — cavalo pequeno de estepe (cernelha ~1,35 m), crina escura, cauda
//   chicken  — galinha com crista vermelha
// Um InstancedMesh por tipo (5 draw calls). A posição/rumo vem de um atributo por instância (pos.xyz + yaw) que a CPU atualiza;
// o shader monta a transformação e anima: braços balançam e o corpo quica ao andar, galinha bica, cavalo pasta e abana a cauda.
// Partes da geometria (atributo `part`): 0 fixo · 1 braço esq · 2 braço dir · 3 cabeça/pescoço · 4 cauda.
// `robe` (0..1) = quanto daquela parte pega a cor da instância (túnica / pelagem); o resto usa a cor do vértice.

const PART = { fixed: 0, armL: 1, armR: 2, head: 3, tail: 4 }

// ---------- geometria: peças com cor, parte e máscara de cor da instância
function piece( geo, hex, part = PART.fixed, robe = 0 ) {

	const g = geo.index ? geo.toNonIndexed() : geo
	g.deleteAttribute( 'uv' )
	const n = g.attributes.position.count
	const c = new THREE.Color( hex )
	g.setAttribute( 'color', new THREE.Float32BufferAttribute( new Array( n ).fill( 0 ).flatMap( () => [ c.r, c.g, c.b ] ), 3 ) )
	g.setAttribute( 'part', new THREE.Float32BufferAttribute( new Array( n ).fill( part ), 1 ) )
	g.setAttribute( 'robe', new THREE.Float32BufferAttribute( new Array( n ).fill( robe ), 1 ) )
	return g

}
const cyl = ( rt, rb, h, seg = 8 ) => new THREE.CylinderGeometry( rt, rb, h, seg )
const ball = ( r, w = 8, h = 6 ) => new THREE.SphereGeometry( r, w, h )
const box = ( w, h, d ) => new THREE.BoxGeometry( w, h, d )
const at = ( g, x, y, z, rx = 0, ry = 0, rz = 0 ) => { if ( rx ) g.rotateX( rx ); if ( ry ) g.rotateY( ry ); if ( rz ) g.rotateZ( rz ); return g.translate( x, y, z ) }

const SKIN = '#e0b58f', HAIR = '#26221f', DARK = '#3a3431', BELT = '#3d3330'

function personGeometry( kind ) {

	const p = []
	const farmer = kind === 'farmer'
	const robeH = farmer ? 0.8 : 1.12 // túnica do lavrador vai até o joelho
	p.push( piece( at( cyl( 0.2, farmer ? 0.26 : 0.33, robeH ), 0, 1.22 - robeH / 2, 0 ), '#ffffff', PART.fixed, 1 ) ) // túnica
	p.push( piece( at( box( 0.44, 0.2, 0.26 ), 0, 1.2, 0 ), '#ffffff', PART.fixed, 1 ) ) // ombros
	p.push( piece( at( cyl( 0.215, 0.215, 0.09 ), 0, 0.88, 0 ), BELT ) ) // faixa
	// gola cruzada (lado direito por cima, como na época): faixa escura em diagonal no peito
	p.push( piece( at( box( 0.05, 0.36, 0.02 ), 0.03, 1.13, 0.135, 0, 0, - 0.55 ), BELT ) )
	if ( farmer ) for ( const s of [ - 1, 1 ] ) p.push( piece( at( cyl( 0.07, 0.065, 0.45 ), s * 0.1, 0.25, 0 ), '#6b5a45' ) ) // calças
	for ( const s of [ - 1, 1 ] ) p.push( piece( at( box( 0.1, 0.07, 0.2 ), s * 0.1, 0.035, 0.04 ), DARK ) ) // sapatos
	// braços: manga larga (pega a cor da túnica) + mão; pivô no ombro (y 1.25)
	for ( const [ s, part ] of [ [ - 1, PART.armL ], [ 1, PART.armR ] ] ) {

		p.push( piece( at( cyl( 0.075, 0.12, 0.55 ), s * 0.27, 0.98, 0 ), '#ffffff', part, 1 ) )
		p.push( piece( at( ball( 0.055 ), s * 0.28, 0.68, 0.02 ), SKIN, part ) )

	}
	p.push( piece( at( cyl( 0.06, 0.07, 0.1 ), 0, 1.33, 0 ), SKIN ) ) // pescoço
	p.push( piece( at( ball( 0.135, 10, 8 ), 0, 1.47, 0 ), SKIN ) ) // cabeça
	for ( const s of [ - 1, 1 ] ) {

		p.push( piece( at( box( 0.04, 0.022, 0.02 ), s * 0.05, 1.475, 0.124 ), HAIR ) ) // olho (traço horizontal, como no Messenger)
		p.push( piece( at( box( 0.05, 0.012, 0.02 ), s * 0.052, 1.515, 0.12, 0, 0, s * 0.12 ), HAIR ) ) // sobrancelha

	}
	p.push( piece( at( new THREE.SphereGeometry( 0.142, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55 ), 0, 1.48, - 0.012 ), HAIR ) ) // cabelo
	if ( farmer ) {

		p.push( piece( at( cyl( 0.02, 0.36, 0.2, 12 ), 0, 1.66, 0 ), '#c8ac6a' ) ) // chapéu cônico de palha
		// enxada na mão direita, apoiada no ombro
		p.push( piece( at( cyl( 0.022, 0.022, 1.3 ), 0.3, 1.05, 0.08, 0.35 ), '#7a5c40', PART.armR ) )
		p.push( piece( at( box( 0.16, 0.05, 0.22 ), 0.3, 1.66, 0.3 ), '#6f6650', PART.armR ) )

	} else {

		p.push( piece( at( ball( 0.06 ), 0, 1.64, - 0.02 ), HAIR ) ) // coque
		p.push( piece( at( cyl( 0.045, 0.05, 0.08 ), 0, 1.68, - 0.02 ), DARK ) ) // prendedor do coque (guan simples)
		p.push( piece( at( box( 0.012, 0.012, 0.2 ), 0, 1.68, - 0.02 ), '#c9b98e' ) ) // grampo

	}
	if ( kind === 'guard' ) {

		// colete de lamelas: faixas horizontais alternadas (linhas de contorno pela dobra) sobre o peito e as costas
		for ( let i = 0; i < 4; i ++ ) p.push( piece( at( cyl( 0.235 + i * 0.006, 0.245 + i * 0.006, 0.1 ), 0, 1.22 - i * 0.1, 0 ), i % 2 ? '#4b3a2c' : '#5d4734' ) )
		// alabarda (ge): haste de 2,4 m + lâmina de bronze em ângulo, na mão direita
		p.push( piece( at( cyl( 0.022, 0.022, 2.4 ), 0.3, 1.25, 0.05 ), '#4a3a2c', PART.armR ) )
		p.push( piece( at( box( 0.04, 0.07, 0.34 ), 0.3, 2.3, 0.2 ), '#a89656', PART.armR ) )
		p.push( piece( at( cyl( 0.0, 0.035, 0.16 ), 0.3, 2.53, 0.05 ), '#a89656', PART.armR ) )

	}
	return mergeGeometries( p )

}

function horseGeometry() {

	const p = []
	const COAT = '#ffffff' // cor da instância
	p.push( piece( at( new THREE.CapsuleGeometry( 0.32, 0.85, 4, 10 ), 0, 1.08, 0, Math.PI / 2 ), COAT, PART.fixed, 1 ) ) // corpo
	for ( const [ x, z ] of [ [ - 0.17, 0.48 ], [ 0.17, 0.48 ], [ - 0.17, - 0.48 ], [ 0.17, - 0.48 ] ] ) {

		p.push( piece( at( cyl( 0.075, 0.06, 0.62 ), x, 0.62, z ), COAT, PART.fixed, 1 ) ) // perna (cima)
		p.push( piece( at( cyl( 0.055, 0.06, 0.36 ), x, 0.18, z ), '#3a302a' ) ) // canela escura
		p.push( piece( at( cyl( 0.07, 0.075, 0.06 ), x, 0.03, z ), '#26211d' ) ) // casco

	}
	// pescoço + cabeça (parte 3: abaixa para pastar, pivô na base do pescoço)
	p.push( piece( at( cyl( 0.15, 0.22, 0.75 ), 0, 1.45, 0.68, 0.75 ), COAT, PART.head, 1 ) )
	p.push( piece( at( box( 0.22, 0.24, 0.56 ), 0, 1.68, 1.05, 0.55 ), COAT, PART.head, 1 ) ) // cabeça
	p.push( piece( at( box( 0.18, 0.16, 0.2 ), 0, 1.5, 1.28, 0.55 ), '#3a302a', PART.head ) ) // focinho
	for ( const s of [ - 1, 1 ] ) p.push( piece( at( cyl( 0.0, 0.04, 0.14 ), s * 0.07, 1.92, 0.88 ), COAT, PART.head, 1 ) ) // orelhas
	p.push( piece( at( box( 0.06, 0.14, 0.7 ), 0, 1.6, 0.6, 0.75 ), '#2b2420', PART.head ) ) // crina
	p.push( piece( at( cyl( 0.03, 0.09, 0.75 ), 0, 0.88, - 0.85, - 0.35 ), '#2b2420', PART.tail ) ) // cauda
	return mergeGeometries( p )

}

function chickenGeometry() {

	const p = []
	p.push( piece( at( ball( 0.15, 8, 6 ).scale( 0.9, 0.85, 1.2 ), 0, 0.26, 0 ), '#ffffff', PART.fixed, 1 ) ) // corpo
	p.push( piece( at( cyl( 0.0, 0.1, 0.18, 6 ), 0, 0.36, - 0.17, - 0.9 ), '#ffffff', PART.fixed, 1 ) ) // cauda
	p.push( piece( at( ball( 0.075, 8, 6 ), 0, 0.42, 0.14 ), '#ffffff', PART.head, 1 ) ) // cabeça
	p.push( piece( at( box( 0.03, 0.07, 0.08 ), 0, 0.5, 0.14 ), '#c8382c', PART.head ) ) // crista
	p.push( piece( at( cyl( 0.0, 0.025, 0.07, 4 ), 0, 0.41, 0.23, Math.PI / 2 ), '#e0a43a', PART.head ) ) // bico
	for ( const s of [ - 1, 1 ] ) p.push( piece( at( cyl( 0.012, 0.012, 0.14, 4 ), s * 0.05, 0.07, 0 ), '#e0a43a' ) ) // pernas
	return mergeGeometries( p )

}

// ---------- uma "tropa" de um tipo: InstancedMesh com transformação e animação no shader
class Herd {

	constructor( look, kind, count, colors, anim ) {

		const geometry = kind === 'horse' ? horseGeometry() : kind === 'chicken' ? chickenGeometry() : personGeometry( kind )
		this.count = count
		this.state = new Float32Array( count * 4 ) // x, y, z, yaw
		this.motion = new Float32Array( count * 4 ) // anda (0..1), fase, ação (bicar/pastar 0..1), id
		this.tint = new Float32Array( count * 3 )
		colors.forEach( ( c, i ) => { const col = new THREE.Color( c ); this.tint.set( [ col.r, col.g, col.b ], i * 3 ) } )
		this.stateAttr = new THREE.InstancedBufferAttribute( this.state, 4 )
		this.motionAttr = new THREE.InstancedBufferAttribute( this.motion, 4 )
		this.stateAttr.setUsage( THREE.DynamicDrawUsage )
		this.motionAttr.setUsage( THREE.DynamicDrawUsage )
		const S = instancedBufferAttribute( this.stateAttr ), M = instancedBufferAttribute( this.motionAttr )
		const T = instancedBufferAttribute( new THREE.InstancedBufferAttribute( this.tint, 3 ) )
		const part = attribute( 'part', 'float' ), robe = attribute( 'robe', 'float' ), vcol = attribute( 'color', 'vec3' )

		const rotX = ( v, a ) => vec3( v.x, v.y.mul( cos( a ) ).sub( v.z.mul( sin( a ) ) ), v.y.mul( sin( a ) ).add( v.z.mul( cos( a ) ) ) )
		const rotY = ( v, a ) => vec3( v.x.mul( cos( a ) ).add( v.z.mul( sin( a ) ) ), v.y, v.x.mul( sin( a ) ).negate().add( v.z.mul( cos( a ) ) ) )
		const is = ( id ) => step( abs( part.sub( id ) ), 0.1 )

		// pose local (antes de girar/mover): braço balança, cabeça abaixa, cauda abana, corpo quica
		const local = Fn( () => {

			const p = positionGeometry.toVar()
			const walk = M.x, phase = M.y.add( time.mul( anim.stride ) ), act = M.z
			const swing = sin( phase ).mul( walk ).mul( anim.arm ) // braços opostos
			p.assign( mix( p, rotX( p.sub( vec3( 0, anim.shoulder, 0 ) ), swing ).add( vec3( 0, anim.shoulder, 0 ) ), is( PART.armL ) ) )
			p.assign( mix( p, rotX( p.sub( vec3( 0, anim.shoulder, 0 ) ), swing.negate() ).add( vec3( 0, anim.shoulder, 0 ) ), is( PART.armR ) ) )
			// cabeça: galinha bica (pulsos rápidos), cavalo pasta (abaixa devagar) — ângulo × ação
			const nod = max( sin( time.mul( anim.nodSpeed ).add( M.y.mul( 3.1 ) ) ), 0 ).pow( 3 ).mul( act ).mul( anim.nod ).add( act.mul( anim.nodHold ) )
			p.assign( mix( p, rotX( p.sub( anim.neck ), nod ).add( anim.neck ), is( PART.head ) ) )
			const swish = sin( time.mul( 2.3 ).add( M.y ) ).mul( 0.35 )
			p.assign( mix( p, vec3( p.x.add( p.z.sub( anim.tailZ ).mul( swish ) ), p.y, p.z ), is( PART.tail ) ) )
			p.y.addAssign( abs( sin( phase ) ).mul( walk ).mul( anim.bob ) )
			return p

		} )()

		const material = createToonMaterial( look, {
			colorNode: mix( vcol, T, robe ),
			normalNode: rotY( normalGeometry, S.w ),
			hatch: false, specular: false,
			id: M.w, // ID por indivíduo → contorno separa um do outro
			shadowCut: [ 0.1, 0.15 ] // corte duro, como o personagem
		} )
		material.positionNode = rotY( local, S.w ).add( S.xyz )

		this.mesh = new THREE.InstancedMesh( geometry, material, count )
		this.mesh.castShadow = kind !== 'chicken'
		this.mesh.receiveShadow = true

	}

	set( i, x, y, z, yaw, walk, phase, act, id ) {

		const s = this.state, m = this.motion, k = i * 4
		s[ k ] = x; s[ k + 1 ] = y; s[ k + 2 ] = z; s[ k + 3 ] = yaw
		m[ k ] = walk; m[ k + 1 ] = phase; m[ k + 2 ] = act; m[ k + 3 ] = id

	}

	commit( sphere ) {

		this.stateAttr.needsUpdate = true
		this.motionAttr.needsUpdate = true
		this.mesh.boundingSphere = sphere // posições vêm do shader

	}

}

const PERSON = { stride: 7, arm: 0.45, shoulder: 1.25, bob: 0.045, nod: 0, nodHold: 0, nodSpeed: 1, neck: vec3( 0, 1.4, 0 ), tailZ: 0 }

/**
 * Folk: a população de uma Village (coordenadas LOCAIS da vila, convertidas para o mundo por `village.worldPoint`).
 * config = { walkers: [{ kind, path: [[x, z]…], speed? }], idle: [{ kind, x, z, yaw }], horses: [...], chickens: [{ x, z, n }] }
 */
export class Folk {

	constructor( { look, terrain, village, config, seed = 31 } ) {

		this.terrain = terrain
		this.village = village
		const random = rng( seed )
		const rot = village.rotation
		// roupas da época: cânhamo cru, marrom, índigo, ocre; os nobres/guardas em vermelho e preto
		const robes = [ '#cdbd98', '#8e7556', '#4a5b74', '#b08a4f', '#a8a08a', '#6d4f3e', '#8a3a2e' ]
		const coats = [ '#7a4f32', '#9b6a3e', '#c4a272', '#3b302b', '#8b8076' ] // baio, alazão, lobuno, preto, tordilho
		const hens = [ '#f2ece0', '#b5672f', '#5a4a3e', '#d9b07a' ]

		// ---------- quem é quem
		const people = { villager: [], guard: [], farmer: [] }
		for ( const w of config.walkers ?? [] ) people[ w.kind ].push( { ...w, mode: 'walk', i: 0, t: random() * 2, wait: random() * 2, pos: [ ...w.path[ 0 ] ], yaw: 0, phase: random() * 6 } )
		for ( const s of config.idle ?? [] ) people[ s.kind ].push( { ...s, mode: 'idle', pos: [ s.x, s.z ], yaw: s.yaw ?? 0, phase: random() * 6 } )
		this.groups = []
		let id = 0.62
		for ( const [ kind, list ] of Object.entries( people ) ) {

			if ( ! list.length ) continue
			const colors = list.map( ( p, i ) => kind === 'guard' ? ( i % 2 ? '#8a3a2e' : '#2f2b2a' ) : robes[ Math.floor( random() * robes.length ) ] )
			const herd = new Herd( look, kind, list.length, colors, PERSON )
			list.forEach( ( p ) => { p.id = ( id += 0.013 ) % 1 + 0.5 } )
			this.groups.push( { herd, list, type: 'person' } )

		}
		const horses = ( config.horses ?? [] ).map( ( h ) => ( { ...h, pos: [ h.x, h.z ], yaw: h.yaw ?? 0, phase: random() * 6, graze: random() * 10, id: ( id += 0.013 ) % 1 + 0.5 } ) )
		if ( horses.length ) this.groups.push( {
			herd: new Herd( look, 'horse', horses.length, horses.map( () => coats[ Math.floor( random() * coats.length ) ] ), { ...PERSON, stride: 5, arm: 0, bob: 0.03, nod: 0, nodHold: 1.05, nodSpeed: 0, neck: vec3( 0, 1.3, 0.45 ), tailZ: - 0.55 } ),
			list: horses, type: 'horse'
		} )
		const chickens = []
		for ( const c of config.chickens ?? [] ) for ( let k = 0; k < c.n; k ++ ) chickens.push( { home: [ c.x, c.z ], pos: [ c.x + ( random() - 0.5 ) * 3, c.z + ( random() - 0.5 ) * 3 ], target: null, yaw: random() * 6.28, phase: random() * 6, wait: random() * 2, id: ( id += 0.013 ) % 1 + 0.5 } )
		if ( chickens.length ) this.groups.push( {
			herd: new Herd( look, 'chicken', chickens.length, chickens.map( () => hens[ Math.floor( random() * hens.length ) ] ), { ...PERSON, stride: 16, arm: 0, bob: 0.05, nod: 0.9, nodHold: 0, nodSpeed: 7, neck: vec3( 0, 0.36, 0.08 ), tailZ: 0 } ),
			list: chickens, type: 'chicken'
		} )

		this.random = random
		this.rot = rot
		this.cosR = Math.cos( rot )
		this.sinR = Math.sin( rot )
		this.group = new THREE.Group()
		for ( const g of this.groups ) this.group.add( g.herd.mesh )
		const c = village.origin
		this.sphere = new THREE.Sphere( new THREE.Vector3( c.x, c.y, c.z ), ( config.radius ?? 70 ) )
		this.update( 0 )

	}

	// focus = posição do jogador: longe da cidade (> 1,7 × raio) atualiza 1 frame a cada 8 (ninguém vê de perto; economiza CPU e upload)
	update( dt, focus = null ) {

		this.acc = ( this.acc ?? 0 ) + dt
		if ( focus && focus.distanceTo( this.sphere.center ) > this.sphere.radius * 1.7 && ( this.skip = ( ( this.skip ?? 0 ) + 1 ) % 8 ) !== 0 ) return
		dt = this.acc
		this.acc = 0
		const random = this.random
		for ( const { herd, list, type } of this.groups ) {

			list.forEach( ( a, i ) => {

				let walk = 0, act = 0
				if ( type === 'person' && a.mode === 'walk' ) {

					// segue a trilha (ida e volta), parando um pouco em cada ponto
					if ( a.wait > 0 ) a.wait -= dt
					else {

						const tgt = a.path[ a.i ]
						const dx = tgt[ 0 ] - a.pos[ 0 ], dz = tgt[ 1 ] - a.pos[ 1 ], d = Math.hypot( dx, dz )
						const sp = a.speed ?? 1.1
						if ( d < 0.05 ) {

							a.i = ( a.i + 1 ) % a.path.length
							a.wait = a.pause ?? ( 0.6 + random() * 2.2 )

						} else {

							const k = Math.min( 1, sp * dt / d )
							a.pos[ 0 ] += dx * k; a.pos[ 1 ] += dz * k
							a.yaw = turn( a.yaw, Math.atan2( dx, dz ), dt * 6 )
							walk = 1

						}

					}

				} else if ( type === 'chicken' ) {

					// passeia perto de casa: escolhe um ponto, anda aos pulinhos, para e bica
					if ( a.wait > 0 ) { a.wait -= dt; act = 1 } else {

						if ( ! a.target ) a.target = [ a.home[ 0 ] + ( random() - 0.5 ) * 5, a.home[ 1 ] + ( random() - 0.5 ) * 5 ]
						const dx = a.target[ 0 ] - a.pos[ 0 ], dz = a.target[ 1 ] - a.pos[ 1 ], d = Math.hypot( dx, dz )
						if ( d < 0.05 ) { a.target = null; a.wait = 1 + random() * 3 } else {

							const k = Math.min( 1, 0.7 * dt / d )
							a.pos[ 0 ] += dx * k; a.pos[ 1 ] += dz * k
							a.yaw = turn( a.yaw, Math.atan2( dx, dz ), dt * 10 )
							walk = 1

						}

					}

				} else if ( type === 'horse' ) {

					// pasta em ciclos: abaixa a cabeça ~6 s, levanta ~4 s
					a.graze += dt
					const c = a.graze % 10
					act = THREE.MathUtils.smoothstep( c, 0, 1.2 ) * ( 1 - THREE.MathUtils.smoothstep( c, 6, 7.2 ) ) * ( a.grazing === false ? 0 : 1 )

				}

				// local → mundo sem alocar (mesma rotação da Village: em volta de y)
				const o = this.village.origin, c = this.cosR, s = this.sinR
				const wx = o.x + a.pos[ 0 ] * c + a.pos[ 1 ] * s, wz = o.z - a.pos[ 0 ] * s + a.pos[ 1 ] * c
				herd.set( i, wx, this.terrain.sampleHeight( wx, wz ), wz, a.yaw + this.rot, walk, a.phase, act, a.id )

			} )
			herd.commit( this.sphere )

		}

	}

}

// gira o rumo pelo caminho mais curto
function turn( a, b, k ) {

	let d = ( ( b - a + Math.PI ) % ( Math.PI * 2 ) + Math.PI * 2 ) % ( Math.PI * 2 ) - Math.PI
	return a + d * Math.min( 1, k )

}
