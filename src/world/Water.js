import * as THREE from 'three/webgpu'
import { Fn, texture, positionWorld, cameraPosition, time, vec2, vec3, vec4, float, mix, smoothstep, pow, normalize, max, dot, color, sin, fract, fwidth } from 'three/tsl'
import { inkMRT } from '../render/ToonMaterial.js'

// Cor do mar 'bands' num ponto (positionWorld) com profundidade `depth` (nó) — exportada para a foz do rio pintar a MESMA
// água do mar por cima dele (a fita termina sem emenda). Degraus por profundidade, manchas esticadas, listras de onda, espuma.
export function seaBands( { depth, palette, noiseTexture, sky } ) {

	const xz = positionWorld.xz
	const shallow = color( palette.water ), deep = color( palette.waterDeep )
	const n = texture( noiseTexture, xz.mul( 0.05 ).add( time.mul( 0.01 ) ) )
	const aa = ( v ) => fwidth( v ).max( 1e-4 ) // borda nítida sem serrilhado (aastep)
	const below = ( v, t ) => float( 1 ).sub( smoothstep( t.sub( aa( v ) ), t.add( aa( v ) ), v ) ) // 1 onde v < t

	// degraus: fundo → raso (+) → beira (+) com borda ondulada pelo ruído
	const col = vec3( deep ).toVar()
	col.assign( mix( col, shallow, below( depth, n.r.mul( 0.8 ).add( 1.4 ) ) ) )
	col.addAssign( vec3( 0.03, 0.06, 0.05 ).mul( below( depth, n.g.mul( 0.25 ).add( 0.35 ) ) ) )
	// manchas claras andando: esticadas na direção das ondas (x 4× mais lento que z) e mais raras no fundo
	if ( palette.waterLight ) {

		const m = texture( noiseTexture, xz.mul( vec2( 0.012, 0.05 ) ).add( time.mul( vec2( 0.004, 0.006 ) ) ) ).b
			.add( texture( noiseTexture, xz.mul( vec2( 0.04, 0.13 ) ).sub( time.mul( 0.01 ) ) ).r.mul( 0.3 ) )
			.add( smoothstep( 1.5, 0.4, depth ).mul( 0.12 ) )
		col.assign( mix( col, color( palette.waterLight ), smoothstep( 0.84, aa( m ).add( 0.84 ), m ).mul( 0.8 ) ) )

	}
	// listras de onda: fract anda para a margem; só entre 0,25 e 1,1 m de profundidade, somem nas pontas
	const w = fract( n.b.mul( 0.7 ).add( depth.mul( 1.6 ) ).add( time.mul( 0.12 ) ) )
	const band = smoothstep( 0.2, 0.35, depth ).mul( float( 1 ).sub( smoothstep( 0.8, 1.1, depth ) ) )
	const stripe = below( w, float( 0.12 ) ).mul( band )
	// espuma colada na areia
	const foam = below( depth.add( n.g.sub( 0.5 ).mul( 0.1 ) ), float( 0.08 ) )
	col.assign( mix( col, vec3( 0.93, 0.98, 0.95 ), stripe.max( foam ) ) )

	// longe: funde com o horizonte do céu (senão a borda do mar corta o céu)
	const V = normalize( cameraPosition.sub( positionWorld ) )
	col.assign( mix( col, sky.horizon, pow( float( 1 ).sub( max( V.y, 0 ) ), 6 ).mul( 0.6 ) ) )
	return col

}

// Água estilizada barata: profundidade vem da textura de altura do terreno (sem cópia de depth buffer),
// espuma animada na costa, Fresnel para o céu, brilhos do sol. Renderiza depois dos opacos (transparent).
export class Water {

	// mode 'bands' (Messenger): cor em DEGRAUS pela distância da margem (aqui = profundidade, já assada na textura de altura do
	// terreno) + listras brancas paralelas à margem, andando para a praia, só numa faixa perto da costa. Sem degradê, sem brilho.
	constructor( { look, terrain, palette, noiseTexture, sky, mode = 'smooth' } ) {

		const shallow = color( palette.water ), deep = color( palette.waterDeep )
		const material = new THREE.MeshBasicNodeMaterial( { transparent: true, depthWrite: true } ) // névoa via scene.fogNode

		material.colorNode = mode === 'bands' ? Fn( () => {

			const depth = float( terrain.waterLevel ).sub( texture( terrain.heightTexture, terrain.worldToUV( positionWorld.xz ) ).r ).max( 0 )
			return vec4( seaBands( { depth, palette, noiseTexture, sky } ), float( 1 ) )

		} )() : Fn( () => {

			const xz = positionWorld.xz
			const ground = texture( terrain.heightTexture, terrain.worldToUV( xz ) ).r
			const depth = float( terrain.waterLevel ).sub( ground ).max( 0 )
			const n = texture( noiseTexture, xz.mul( 0.06 ).add( time.mul( 0.015 ) ) )
			const n2 = texture( noiseTexture, xz.mul( 0.13 ).sub( time.mul( 0.02 ) ) )

			const col = mix( shallow, deep, smoothstep( 0.2, 4.5, depth ) ).toVar()
			// faixas de espuma que "respiram" na costa
			const wave = sin( depth.mul( 9 ).sub( time.mul( 1.6 ) ).add( n.r.mul( 5 ) ) ).mul( 0.5 ).add( 0.5 )
			const foam = float( 1 ).sub( smoothstep( 0.06, 0.2, depth.add( n2.g.sub( 0.5 ).mul( 0.12 ) ) ) ).max( smoothstep( 0.86, 0.93, wave ).mul( float( 1 ).sub( smoothstep( 0.15, 0.7, depth ) ) ) )
			col.assign( mix( col, vec3( 1.0, 1.0, 0.97 ), foam.mul( 0.9 ) ) )

			const V = normalize( cameraPosition.sub( positionWorld ) )
			const fresnel = pow( float( 1 ).sub( max( V.y, 0 ) ), 4 )
			col.assign( mix( col, sky.horizon, fresnel.mul( 0.55 ) ) )

			// brilho do sol em "pontinhos" (reflexo especular falso)
			const R = vec3( V.x.negate(), V.y, V.z.negate() )
			const spec = smoothstep( 0.992, 0.998, dot( R, look.sunDir ) ).mul( smoothstep( 0.62, 0.7, n.b.add( n2.r.mul( 0.3 ) ) ) )
			col.addAssign( look.sunColor.mul( spec.mul( 1.6 ) ) )

			return vec4( col, float( 1 ) )

		} )()
		material.mrtNode = inkMRT( 0 )

		const size = terrain.size * 3
		this.mesh = new THREE.Mesh( new THREE.PlaneGeometry( size, size, 1, 1 ).rotateX( - Math.PI / 2 ), material )
		this.mesh.position.y = terrain.waterLevel
		this.mesh.receiveShadow = false

	}

}
