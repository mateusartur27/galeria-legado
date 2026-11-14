import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
	Fn, uniform, positionLocal, positionGeometry, instanceIndex, instancedBufferAttribute, hash, time, vec2, vec3, float, smoothstep, step,
	length, positionView, fract, texture, uv, normalize, cross, dot, cameraPosition, mix, sin
} from 'three/tsl'
import { createToonMaterial } from '../render/ToonMaterial.js'
import { rng } from '../core/utils.js'

const SHAPES = 8 // silhuetas diferentes no atlas (1 linha)

// Tufos de grama "desenhados" (Messenger): moitinhas esparsas sobre o chão liso. 1 draw call (instanced).
// style 'blades': leque de 7 lâminas finas em geometria — o contorno desenha cada lâmina.
// style 'card'  : (Messenger) UM cartão com silhueta desenhada (atlas gerado por código), virado para a câmera mas preso ao `up` do chão;
//                 com ids, cada tufo ganha ID próprio → contorno fechado em volta da silhueta, separado do vizinho; base sem tinta.
export class Tufts {

	// lawnDensity: chance relativa de um tufo no gramado (1 = igual às moitas)
	// farInk [a, b] = distância (m) em que a tinta do tufo-cartão some (longe = só mancha de cor)
	constructor( { look, terrain, palette, count = 1500, seed = 17, avoid = [], lawnDensity = 0.22, ids = false, style = 'blades', farInk = [ 5, 10 ] } ) {

		const random = rng( seed )
		this.player = uniform( new THREE.Vector3( 0, - 100, 0 ) )
		const card = style === 'card'

		// ---- espalha onde é gramado (máscara do terreno), longe de áreas reservadas
		const half = terrain.size * 0.5
		const placed = []
		let tries = 0
		while ( placed.length < count && tries ++ < count * 40 ) {

			const x = ( random() * 2 - 1 ) * half * 0.9, z = ( random() * 2 - 1 ) * half * 0.9
			if ( terrain.grassAt( x, z ) < 0.6 || terrain.normalYAt( x, z ) < 0.8 ) continue
			if ( avoid.some( ( a ) => a.test ? a.test( x, z ) : Math.hypot( x - a.x, z - a.z ) < a.r ) ) continue // a.test = área custom (rua)
			// gramado: tufos raros e pequenos · fora dele (moitas): densos e maiores — substitui a grama alta (Messenger)
			const lawn = terrain.lawn ? terrain.lawnAt( x, z ) : 1
			if ( random() > THREE.MathUtils.lerp( 1, lawnDensity, lawn ) ) continue
			const big = 1 - lawn
			placed.push( { x, z, y: terrain.sampleHeight( x, z ), s: ( 0.55 + random() * 0.5 ) * ( 1 + big * 0.9 ), r: random() * Math.PI * 2, t: random() } )

		}

		const n = placed.length
		const tints = new Float32Array( n * 3 )
		const tuftIds = new Float32Array( n )
		const base0 = new THREE.Color( palette.tuft ?? palette.grass )
		// bioma (Terrain.biomes): tufo na cor <kind>Tuft
		const biomeTuft = {}
		for ( const k of terrain.biomeKinds ?? [] ) if ( palette[ k + 'Tuft' ] ) biomeTuft[ k ] = new THREE.Color( palette[ k + 'Tuft' ] )
		placed.forEach( ( t, i ) => {

			const kind = terrain.biomeKinds?.length ? terrain.biomeKindAt( t.x, t.z ) : null
			const base = ( kind && biomeTuft[ kind ] ) || base0
			// card (Messenger): 3 variantes de VALOR (−/0/+) em vez de variação contínua · blades: leve variação contínua
			const c = card
				? base.clone().offsetHSL( 0, 0, [ - 0.04, 0, 0.04 ][ Math.floor( t.t * 3 ) ] )
				: base.clone().offsetHSL( ( t.t - 0.5 ) * 0.03, 0, ( t.t - 0.5 ) * 0.08 )
			tints.set( [ c.r, c.g, c.b ], i * 3 )
			tuftIds[ i ] = 0.5 + random() * 0.45 // longe dos IDs do terreno (0.1–0.3); > 0 sempre

		} )
		const tintNode = instancedBufferAttribute( new THREE.InstancedBufferAttribute( tints, 3 ) )
		const idAttr = new THREE.InstancedBufferAttribute( tuftIds, 1 )

		const mesh = card ? this.buildCards( { look, terrain, placed, random, tintNode, idAttr, ids, farInk } ) : this.buildBlades( { look, placed, random, tintNode, idAttr, ids } )
		mesh.castShadow = false // tufo pequeno: sombra vira ruído e custa shadow pass
		mesh.receiveShadow = true
		this.mesh = mesh
		this.count = n

	}

	buildBlades( { look, placed, random, tintNode, idAttr, ids } ) {

		// ---- geometria de UM tufo (y = 0 no chão)
		const blades = []
		for ( let i = 0; i < 7; i ++ ) {

			const a = ( i / 7 ) * Math.PI * 2 + random() * 0.6
			const h = 0.2 + random() * 0.22
			const w = 0.028 + random() * 0.014
			const lean = 0.25 + random() * 0.45 // abre em leque
			const bx = Math.cos( a ) * 0.04, bz = Math.sin( a ) * 0.04
			const tx = bx + Math.cos( a ) * h * lean, tz = bz + Math.sin( a ) * h * lean
			const px = - Math.sin( a ) * w, pz = Math.cos( a ) * w // largura perpendicular à direção da lâmina
			const g = new THREE.BufferGeometry()
			g.setAttribute( 'position', new THREE.Float32BufferAttribute( [ bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz ], 3 ) )
			g.setAttribute( 'normal', new THREE.Float32BufferAttribute( [ 0, 1, 0, 0, 1, 0, 0, 1, 0 ], 3 ) )
			blades.push( g )

		}

		const mesh = new THREE.InstancedMesh( mergeGeometries( blades ), null, placed.length )
		const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
		placed.forEach( ( t, i ) => {

			q.setFromAxisAngle( THREE.Object3D.DEFAULT_UP, t.r )
			m.compose( p.set( t.x, t.y - 0.01, t.z ), q, s.set( t.s, t.s * ( 0.8 + random() * 0.5 ), t.s ) )
			mesh.setMatrixAt( i, m )

		} )

		const material = createToonMaterial( look, {
			colorNode: tintNode,
			normalNode: vec3( 0, 1, 0 ),
			side: THREE.DoubleSide,
			hatch: false,
			specular: false,
			ink: ids ? step( 0.02, positionGeometry.y ) : 1,
			id: ids ? instancedBufferAttribute( idAttr ) : null
		} )

		// vento (peso pela altura da lâmina) + abaixa perto do jogador
		material.positionNode = Fn( () => {

			const phase = hash( instanceIndex ).mul( 6.28 )
			const k = positionGeometry.y.mul( 0.35 )
			const wind = vec3( time.mul( 1.7 ).add( phase ).sin(), 0, time.mul( 1.3 ).add( phase ).cos().mul( 0.5 ) ).mul( k )
			// positionLocal já inclui a matriz da instância (= mundo, a malha fica na origem); não usar positionWorld aqui (circular)
			const near = float( 1 ).sub( smoothstep( 0.25, 0.8, length( positionLocal.xz.sub( this.player.xz ) ) ) )
			return positionLocal.add( wind ).sub( vec3( 0, positionGeometry.y.mul( near ).mul( 0.6 ), 0 ) )

		} )()

		mesh.material = material
		mesh.computeBoundingSphere()
		return mesh

	}

	buildCards( { look, terrain, placed, random, tintNode, idAttr, ids, farInk = [ 5, 10 ] } ) {

		// cartão: x −0.5..0.5, y 0..1 (pivô na base), proporção do atlas (largura 1.3 × altura)
		const geometry = new THREE.PlaneGeometry( 1, 1, 1, 2 ) // 2 faixas na altura: o vento curva o meio
		geometry.translate( 0, 0.5, 0 )

		const n = placed.length
		const baseArr = new Float32Array( n * 4 ) // xyz da base + altura do cartão
		const upArr = new Float32Array( n * 4 ) // up do chão + (forma + espelho) codificados
		const e = 0.5
		placed.forEach( ( t, i ) => {

			const dx = terrain.sampleHeight( t.x + e, t.z ) - terrain.sampleHeight( t.x - e, t.z )
			const dz = terrain.sampleHeight( t.x, t.z + e ) - terrain.sampleHeight( t.x, t.z - e )
			const up = new THREE.Vector3( - dx, 2 * e, - dz ).normalize().lerp( THREE.Object3D.DEFAULT_UP, 0.4 ).normalize() // meio-termo: tufo não deita com o morro
			const h = 0.36 * t.s * ( 0.85 + random() * 0.35 )
			baseArr.set( [ t.x, t.y - 0.015, t.z, h ], i * 4 )
			const shape = Math.floor( random() * SHAPES ) + ( random() < 0.5 ? 0 : 0.5 ) // .5 = espelhado
			upArr.set( [ up.x, up.y, up.z, shape ], i * 4 )

		} )

		const mesh = new THREE.InstancedMesh( geometry, null, n ) // matrizes identidade: posição vem dos atributos
		const baseNode = instancedBufferAttribute( new THREE.InstancedBufferAttribute( baseArr, 4 ) )
		const upNode = instancedBufferAttribute( new THREE.InstancedBufferAttribute( upArr, 4 ) )

		const atlas = makeTuftAtlas( 911 )
		const aspect = 1.3

		// uv do atlas: célula da forma, espelhada por tufo (o .5 de upArr.w)
		const atlasUV = Fn( () => {

			const shape = upNode.w.floor()
			const mirror = step( 0.25, fract( upNode.w ) )
			const u = mix( uv().x, float( 1 ).sub( uv().x ), mirror )
			return vec2( u.add( shape ).div( SHAPES ), uv().y )

		} )

		const alpha = texture( atlas, atlasUV() ).a
		// base sem tinta (~1–2 cm): nada de risco cortando o chão no pé do tufo · longe (5–10 m, limite ±1,5 m por tufo) o tufo tem
		// poucos pixels e o traço (fino + grosso da caneta) o enche de preto → tinta some e fica só a mancha de cor
		const far = smoothstep( farInk[ 0 ], farInk[ 1 ], positionView.z.negate().add( fract( instancedBufferAttribute( idAttr ).mul( 7.31 ) ).sub( 0.5 ).mul( 3 ) ) )
		const inkNode = ( ids ? step( 0.04, uv().y ) : float( 1 ) ).mul( float( 1 ).sub( far ) )
		const material = createToonMaterial( look, {
			colorNode: tintNode,
			normalNode: vec3( 0, 1, 0 ), // cor chapada (como o chão), sem dobra
			side: THREE.DoubleSide,
			hatch: false,
			alphaNode: alpha,
			alphaTest: 0.5,
			specular: false,
			ink: inkNode,
			id: ids ? instancedBufferAttribute( idAttr ) : null
		} )

		material.positionNode = Fn( () => {

			const b = baseNode.xyz
			const h = baseNode.w
			const up = normalize( upNode.xyz )
			const toCam = normalize( cameraPosition.sub( b ) )
			// de cima, o cartão sobe 2 cm: a base não "corta" o chão com traço (Messenger)
			const lift = smoothstep( 0.05, 0.3, dot( up, toCam ).max( 0 ) ).mul( 0.02 )
			const right = normalize( cross( up, toCam ).add( vec3( 0.0001, 0, 0 ) ) )
			const y = positionGeometry.y // 0 base … 1 topo
			// vento: 2 camadas de seno na posição da base, mais forte no topo · jogador: empurra para fora (só horizontal)
			const ph = b.x.mul( 0.35 ).add( b.z.mul( 0.27 ) )
			const wind = sin( time.mul( 1.6 ).add( ph ) ).add( sin( time.mul( 2.7 ).add( ph.mul( 1.7 ) ).add( 3.1 ) ).mul( 0.5 ) ).mul( 0.06 ).mul( y.mul( y ) )
			const away = b.xz.sub( this.player.xz )
			const near = float( 1 ).sub( smoothstep( 0.2, 0.9, length( away ) ) ).mul( float( 1 ).sub( smoothstep( 0.5, 2.0, this.player.y.sub( b.y ).abs() ) ) )
			const push = normalize( away.add( vec2( 0.0001 ) ) ).mul( near ).mul( h ).mul( 0.6 ).mul( y )
			const p = b.add( up.mul( lift ) )
				.add( right.mul( positionGeometry.x.mul( h ).mul( aspect ).add( wind.mul( h ) ) ) )
				.add( up.mul( y.mul( h ).mul( float( 1 ).sub( near.mul( 0.35 ) ) ) ) )
				.add( vec3( push.x, 0, push.y ) )
			return p

		} )()

		mesh.material = material

		mesh.frustumCulled = false // posições vêm do shader (bounding da geometria não vale)
		return mesh

	}

	update( focus ) {

		this.player.value.copy( focus )

	}

}

// Atlas de silhuetas de tufo desenhadas por código (nosso, sem asset de terceiros): SHAPES células lado a lado, branco no alfa.
// Cada tufo = 5–9 lâminas curvas afinando até a ponta, abrindo em leque a partir de uma base estreita → silhueta única fechada.
function makeTuftAtlas( seed ) {

	const random = rng( seed )
	const W = 160, H = 128
	const canvas = document.createElement( 'canvas' )
	canvas.width = W * SHAPES; canvas.height = H
	const ctx = canvas.getContext( '2d' )
	ctx.fillStyle = '#fff'
	for ( let s = 0; s < SHAPES; s ++ ) {

		const ox = s * W
		ctx.save()
		ctx.beginPath()
		ctx.rect( ox + 3, 0, W - 6, H ) // margem: a ponta não invade a célula vizinha (nem no mipmap)
		ctx.clip()
		const blades = 5 + Math.floor( random() * 5 )
		for ( let b = 0; b < blades; b ++ ) {

			const f = blades === 1 ? 0 : b / ( blades - 1 ) - 0.5 // −0.5 … 0.5 da esquerda para a direita
			const angle = f * ( 1.2 + random() * 0.4 ) + ( random() - 0.5 ) * 0.25 // abre em leque (rad a partir da vertical)
			const len = H * ( 0.55 + random() * 0.42 ) * ( 1 - Math.abs( f ) * 0.45 ) // centro mais alto
			const bx = ox + W / 2 + f * W * 0.22 + ( random() - 0.5 ) * 6
			const by = H - 1
			const tx = bx + Math.sin( angle ) * len, ty = by - Math.cos( angle ) * len
			const bend = ( random() - 0.5 ) * 0.5 + angle * 0.35 // curva para fora (ponta cai)
			const cx = ( bx + tx ) / 2 + Math.cos( angle ) * len * bend * 0.3, cy = ( by + ty ) / 2 + Math.abs( Math.sin( angle ) ) * len * 0.12
			const w = 5 + random() * 5
			ctx.beginPath()
			ctx.moveTo( bx - w, by )
			ctx.quadraticCurveTo( cx - w * 0.6, cy, tx, ty )
			ctx.quadraticCurveTo( cx + w * 0.6, cy, bx + w, by )
			ctx.closePath()
			ctx.fill()

		}

		ctx.restore()

	}

	const tex = new THREE.CanvasTexture( canvas )
	tex.colorSpace = THREE.NoColorSpace
	tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
	tex.anisotropy = 4
	return tex

}
