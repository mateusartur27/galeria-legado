import * as THREE from 'three/webgpu'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { Fn, attribute, texture, positionWorld, normalWorld, vec2, vec3, float, color, mix, max, smoothstep, step, fwidth, abs } from 'three/tsl'
import { createToonMaterial } from '../render/ToonMaterial.js'
import { rng } from '../core/utils.js'

// Pedras do Messenger feitas em código (referência: prints do jogo): PILHAS DE LAJES — blocos achatados com cantos arredondados,
// empilhados em camadas que recuam para cima (arenito), creme claro com sombra suave, linhas finas nas bordas de cada laje
// (ID por laje), escorridos verticais escuros de desgaste, pouco musgo nas bordas de cima e rachaduras finas e curtas.
// Geometria única por pilha (nada de modelo repetido), juntada por bloco espacial (recorte por frustum, como as árvores).

// ruído de valor 3D barato (só para deformar vértices na CPU)
function makeNoise( random ) {

	const perm = new Float32Array( 512 ).map( () => random() )
	const h = ( x, y, z ) => perm[ ( ( x * 73 + y * 151 + z * 283 ) & 511 + 512 ) & 511 ]
	const s = ( t ) => t * t * ( 3 - 2 * t )
	return ( x, y, z ) => {

		const xi = Math.floor( x ), yi = Math.floor( y ), zi = Math.floor( z )
		const xf = s( x - xi ), yf = s( y - yi ), zf = s( z - zi )
		const l = ( a, b, t ) => a + ( b - a ) * t
		const c = ( dx, dy, dz ) => h( xi + dx, yi + dy, zi + dz )
		return l( l( l( c( 0, 0, 0 ), c( 1, 0, 0 ), xf ), l( c( 0, 1, 0 ), c( 1, 1, 0 ), xf ), yf ),
			l( l( c( 0, 0, 1 ), c( 1, 0, 1 ), xf ), l( c( 0, 1, 1 ), c( 1, 1, 1 ), xf ), yf ), zf ) * 2 - 1

	}

}

// laje: caixa arredondada (raio r nos cantos) com a face de cima levemente abaulada e borda irregular por ruído
function slab( w, h, d, noise, seed, value, id ) {

	const g0 = new THREE.BoxGeometry( w, h, d, Math.max( 3, Math.round( w / 0.45 ) ), 3, Math.max( 3, Math.round( d / 0.45 ) ) )
	g0.deleteAttribute( 'uv' ); g0.deleteAttribute( 'normal' )
	const g = mergeVertices( g0 )
	const pos = g.attributes.position
	const r = Math.min( w, h, d ) * 0.24 // 0.42 = "bolinha de massa"; laje tem quina só um pouco gasta
	const half = new THREE.Vector3( w / 2 - r, h / 2 - r, d / 2 - r )
	const v = new THREE.Vector3(), inner = new THREE.Vector3()
	const amp = Math.min( w, d ) * 0.06
	for ( let i = 0; i < pos.count; i ++ ) {

		v.fromBufferAttribute( pos, i )
		inner.set( THREE.MathUtils.clamp( v.x, - half.x, half.x ), THREE.MathUtils.clamp( v.y, - half.y, half.y ), THREE.MathUtils.clamp( v.z, - half.z, half.z ) )
		const n = v.clone().sub( inner )
		if ( n.lengthSq() > 1e-8 ) v.copy( inner ).addScaledVector( n.normalize(), r )
		// borda irregular: desloca no plano horizontal por ruído (a laje não é um retângulo perfeito) + topo abaulado
		const k = noise( v.x * 0.9 + seed, v.y * 0.6, v.z * 0.9 - seed )
		v.x += ( v.x / ( w / 2 ) ) * k * amp * 2
		v.z += ( v.z / ( d / 2 ) ) * k * amp * 2
		if ( v.y > 0 ) v.y += ( 1 - ( v.x / ( w / 2 ) ) ** 2 * 0.5 - ( v.z / ( d / 2 ) ) ** 2 * 0.5 ) * h * 0.08
		v.y += noise( v.x * 2.1 - seed, v.y * 2.1, v.z * 2.1 + seed ) * amp * 0.35
		pos.setXYZ( i, v.x, v.y, v.z )

	}
	g.computeVertexNormals()
	const n = pos.count
	const c = new THREE.Color().setScalar( value )
	g.setAttribute( 'shade', new THREE.Float32BufferAttribute( new Array( n ).fill( c.r ), 1 ) )
	g.setAttribute( 'sid', new THREE.Float32BufferAttribute( new Array( n ).fill( id ), 1 ) )
	return g

}

export class RockPiles {

	// rocks: [{ x, y, z, w (largura), r (rumo) }]
	constructor( { look, terrain, palette, rocks, chunk = terrain.size / 3, seed = 91, shadowValue = 0.74 } ) {

		const random = rng( seed )
		const noise = makeNoise( random )
		this.group = new THREE.Group()
		const byCell = {}
		let sid = 0
		const nextId = () => 1.05 + ( ( sid ++ * 0.6180339 ) % 1 ) * 0.9 // IDs > 1 (longe de terreno/árvores/tufos)

		for ( const rk of rocks ) {

			const W = rk.w
			const parts = []
			// camadas: base larga e baixa, as de cima menores e deslocadas (recuo de arenito); às vezes um bloco caído ao lado
			// lajes largas e baixas que recuam pouco, sempre para o mesmo lado (afloramento em degraus, não "boneco de neve")
			const layers = W < 1.6 ? 1 + Math.floor( random() * 2 ) : 2 + Math.floor( random() * 3 )
			let y = - W * 0.1, w = W, d = W * ( 0.6 + random() * 0.3 ), ox = 0, oz = 0
			// rk.back (local): para onde as camadas recuam — nas encostas, para o lado de cima (recebe 0 e o rumo já aponta o morro)
			const back = rk.back ?? random() * Math.PI * 2, bx = Math.cos( back ), bz = Math.sin( back )
			for ( let i = 0; i < layers; i ++ ) {

				const h = W * ( 0.13 + random() * 0.09 ) * ( i === 0 ? 1.3 : 1 )
				const g = slab( w, h, d, noise, random() * 100, 0.93 + random() * 0.14, nextId() )
				g.rotateY( ( random() - 0.5 ) * 0.3 ).translate( ox, y + h / 2, oz )
				parts.push( g )
				y += h * 0.94
				const step = 0.08 + random() * 0.1
				ox += bx * w * step; oz += bz * d * step
				w *= 0.74 + random() * 0.18; d *= 0.76 + random() * 0.18

			}
			if ( W > 2 && random() < 0.6 ) {

				const s = W * ( 0.25 + random() * 0.2 )
				const g = slab( s * 1.3, s * 0.8, s, noise, random() * 100, 0.9 + random() * 0.12, nextId() )
				const a = random() * Math.PI * 2
				g.rotateY( a ).rotateZ( ( random() - 0.5 ) * 0.4 ).translate( Math.cos( a ) * W * 0.62, s * 0.25, Math.sin( a ) * W * 0.45 )
				parts.push( g )

			}
			const pile = mergeGeometries( parts )
			pile.rotateY( rk.r ).translate( rk.x, rk.y, rk.z )
			const key = `${ Math.floor( rk.x / chunk ) },${ Math.floor( rk.z / chunk ) }`
			;( byCell[ key ] ??= [] ).push( pile )

		}

		// grama do musgo na cor do bioma onde a pedra está
		const grassAt = Fn( () => {

			const c = vec3( color( palette.grass ) ).toVar()
			if ( terrain.biomeKinds?.length ) {

				const w = texture( terrain.biomeTexture, terrain.worldToUV( positionWorld.xz ) )
				terrain.biomeKinds.forEach( ( kind, k ) => {

					if ( palette[ kind + 'Grass' ] ) c.assign( mix( c, color( palette[ kind + 'Grass' ] ), step( 0.5, w[ [ 'r', 'g', 'b' ][ k ] ] ) ) )

				} )

			}
			return c

		} )

		const noiseTex = look.noiseTexture
		const ink = color( palette.ink ?? '#373f42' )
		const colorNode = Fn( () => {

			const p = positionWorld
			const base = color( palette.rockSlab ?? palette.rock ).mul( attribute( 'shade', 'float' ) ).toVar()
			const up = normalWorld.y
			// manchas grandes de valor (pedra nunca é de uma cor só): ± 6%
			const blot = texture( noiseTex, p.xz.mul( 0.12 ).add( p.y.mul( 0.2 ) ) ).r
			base.mulAssign( mix( float( 0.94 ), float( 1.05 ), smoothstep( 0.4, 0.6, blot ) ) )
			// escorridos verticais nas faces de lado: ruído esticado na vertical, recorte duro, só onde a face é íngreme
			const side = float( 1 ).sub( smoothstep( 0.35, 0.7, abs( up ) ) )
			const sx = p.x.add( p.z ).mul( 1.7 )
			const streak = texture( noiseTex, vec2( sx, p.y.mul( 0.09 ) ) ).g
			const sMask = smoothstep( 0.6, 0.63, streak ).mul( side )
			base.assign( mix( base, base.mul( 0.8 ), sMask.mul( 0.75 ) ) )
			// rachaduras finas e curtas (poucas)
			const cA = texture( noiseTex, p.xz.mul( 0.22 ).add( p.y.mul( vec2( 0.31, 0.17 ) ) ) ).r
			const crack = float( 1 ).sub( smoothstep( fwidth( cA ).mul( 0.5 ), fwidth( cA ).mul( 1.3 ), cA.sub( 0.5 ).abs() ) )
			const keep = smoothstep( 0.55, 0.6, texture( noiseTex, p.xz.mul( 0.4 ).add( 2.3 ) ).b )
			base.assign( mix( base, ink, crack.mul( keep ).mul( 0.7 ) ) )
			// musgo: só no que olha para cima, em manchas pequenas e recortadas
			const mossN = texture( noiseTex, p.xz.mul( 0.55 ).add( 4.4 ) ).g
			const moss = smoothstep( 0.66, 0.67, mossN.add( up.sub( 0.8 ).mul( 0.5 ) ) ).mul( step( 0.6, up ) )
			return mix( base, grassAt().mul( 0.9 ), moss )

		} )

		const material = createToonMaterial( look, {
			colorNode: colorNode(),
			id: attribute( 'sid', 'float' ), // linha entre lajes
			shadowValue, // sombra suave: nos prints a face na sombra é só um bege mais escuro
			fade: false, hatch: false
		} )

		for ( const list of Object.values( byCell ) ) {

			const mesh = new THREE.Mesh( mergeGeometries( list ), material )
			mesh.castShadow = true
			mesh.receiveShadow = true
			this.group.add( mesh )

		}

	}

}
