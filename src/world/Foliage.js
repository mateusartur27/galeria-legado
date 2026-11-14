import * as THREE from 'three/webgpu'
import { Fn, uv, vec2, vec3, float, mix, smoothstep, texture, time, hash, instanceIndex, instancedBufferAttribute, attribute, positionWorld, normalize, dot, sin, cos, cameraWorldMatrix } from 'three/tsl'
import { createToonMaterial } from '../render/ToonMaterial.js'
import { rng } from '../core/utils.js'

// Folhagem fofa (estudo do Bruno Simon 2025, código nosso): cada "bola" de folhas é um cacho de cartões espalhados numa esfera,
// recortados por uma textura de folhas gerada aqui (máximo de manchas radiais = campo de distância barato). A luz usa a normal
// ESFÉRICA (centro da bola → pixel), não a do cartão: a bola acende como uma esfera macia e os cartões só desenham a borda.
// Cor = mistura de 2 tons pela face virada pro sol. O recorte gira com o vento → a borda "mexe" sem mover vértice.
// Cartões = BILLBOARDS (sempre de frente para a câmera; no passe de sombra, para o sol): a nossa câmera gira em volta, então
// cartão fixo ficava de lado (risco) ou de costas (normal invertida no DoubleSide = cartão preto). Aqui é sempre FrontSide.
// balls: [{ x, y, z, s, tint? }] (s = raio) · 1 draw call (InstancedMesh; a matriz da instância não é usada — tudo vem dos atributos)
export class Foliage {

	// cardSize 0.8 (o do jogo) com a câmera girando virava "plástico bolha" (cada cartão um disco): 0.58 e mais cartões = silhueta fofa
	constructor( { look, balls, colors = [ '#b4b536', '#d8cf3b' ], cards = 60, cardSize = 0.58, seed = 5, threshold = 0.32, castShadow = true } ) {

		const random = rng( seed )
		this.texture = Foliage.leafTexture( random )

		// ---- cacho: cartões (0,8 × raio) com centro dentro da esfera de raio 1, mais densos na casca, girados no próprio plano
		const pos = [], uvs = [], corner = [], cardCenter = [], cardAngle = [], index = []
		const p = new THREE.Vector3()
		for ( let i = 0; i < cards; i ++ ) {

			p.randomDirection().multiplyScalar( 1.05 - Math.pow( random(), 2 ) * 0.8 )
			const a = random() * Math.PI * 2
			for ( const [ cx, cy ] of [ [ - 0.5, - 0.5 ], [ 0.5, - 0.5 ], [ 0.5, 0.5 ], [ - 0.5, 0.5 ] ] ) {

				pos.push( p.x, p.y, p.z )
				cardCenter.push( p.x, p.y, p.z )
				corner.push( cx, cy )
				uvs.push( cx + 0.5, cy + 0.5 )
				cardAngle.push( a )

			}
			const j = i * 4
			index.push( j, j + 1, j + 2, j, j + 2, j + 3 )

		}
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) )
		geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) )
		geometry.setAttribute( 'corner', new THREE.Float32BufferAttribute( corner, 2 ) )
		geometry.setAttribute( 'cardCenter', new THREE.Float32BufferAttribute( cardCenter, 3 ) )
		geometry.setAttribute( 'cardAngle', new THREE.Float32BufferAttribute( cardAngle, 1 ) )
		geometry.setIndex( index )

		const mesh = new THREE.InstancedMesh( geometry, null, balls.length )
		const centers = new Float32Array( balls.length * 3 )
		const sizes = new Float32Array( balls.length )
		const tints = new Float32Array( balls.length )
		balls.forEach( ( b, i ) => {

			centers.set( [ b.x, b.y, b.z ], i * 3 )
			sizes[ i ] = b.s
			tints[ i ] = b.tint ?? random()

		} )

		const center = instancedBufferAttribute( new THREE.InstancedBufferAttribute( centers, 3 ) )
		const size = instancedBufferAttribute( new THREE.InstancedBufferAttribute( sizes, 1 ) )
		const tint = instancedBufferAttribute( new THREE.InstancedBufferAttribute( tints, 1 ) )
		const colorA = new THREE.Color( colors[ 0 ] ), colorB = new THREE.Color( colors[ 1 ] )
		const sphereNormal = normalize( positionWorld.sub( center ) )

		// recorte que gira com o vento (fase por bola) — a borda das folhas mexe
		const leafAlpha = Fn( () => {

			const phase = hash( instanceIndex ).mul( 6.28 )
			const a = sin( time.mul( 1.4 ).add( phase ) ).mul( 0.35 )
			const d = uv().sub( 0.5 )
			const r = vec2( d.x.mul( cos( a ) ).sub( d.y.mul( sin( a ) ) ), d.x.mul( sin( a ) ).add( d.y.mul( cos( a ) ) ) ).add( 0.5 )
			return texture( this.texture, r ).r

		} )

		const material = createToonMaterial( look, {
			// 2 tons pela face virada pro sol + leve variação por bola
			colorNode: Fn( () => {

				const lit = smoothstep( 0, 1, dot( sphereNormal, look.sunDir ) )
				const base = mix( vec3( colorA.r, colorA.g, colorA.b ), vec3( colorB.r, colorB.g, colorB.b ), lit )
				return base.mul( float( 0.92 ).add( tint.mul( 0.16 ) ) )

			} )(),
			normalNode: sphereNormal,
			alphaNode: leafAlpha(), alphaTest: threshold,
			ink: 0, hatch: false, specular: false, fade: true
		} )
		// billboard: canto do cartão no plano da câmera (eixos direita/cima da matriz de mundo da câmera em uso)
		material.positionNode = Fn( () => {

			const c = attribute( 'corner', 'vec2' ), a = attribute( 'cardAngle', 'float' )
			const rc = vec2( c.x.mul( cos( a ) ).sub( c.y.mul( sin( a ) ) ), c.x.mul( sin( a ) ).add( c.y.mul( cos( a ) ) ) ).mul( cardSize )
			const right = cameraWorldMatrix.element( 0 ).xyz, up = cameraWorldMatrix.element( 1 ).xyz
			return center.add( attribute( 'cardCenter', 'vec3' ).add( right.mul( rc.x ).add( up.mul( rc.y ) ) ).mul( size ) )

		} )()
		// sombra projetada só onde há folha (furos de luz entre os cartões)
		material.maskShadowNode = texture( this.texture, uv() ).r.greaterThan( 0.5 )
		// sombra RECEBIDA lida um pouco na direção do sol: a bola não se auto-sombreia em manchas (acne entre cartões)
		material.receivedShadowPositionNode = positionWorld.add( look.sunDir.mul( 0.9 ) )

		mesh.material = material
		mesh.castShadow = castShadow
		mesh.receiveShadow = true
		mesh.frustumCulled = false
		this.mesh = mesh

	}

	// Textura de folhas: máximo de manchas radiais (cada folha = degradê 1 → 0) num canvas → R funciona como campo de
	// distância: limiar baixo = cacho cheio, alto = folhas separadas. Bordas em lóbulos (não um disco liso)
	static leafTexture( random, size = 128 ) {

		const canvas = document.createElement( 'canvas' )
		canvas.width = canvas.height = size
		const ctx = canvas.getContext( '2d' )
		ctx.fillStyle = '#000'
		ctx.fillRect( 0, 0, size, size )
		ctx.globalCompositeOperation = 'lighten'
		const leaf = ( x, y, r ) => {

			const g = ctx.createRadialGradient( x, y, 0, x, y, r )
			g.addColorStop( 0, '#fff' )
			g.addColorStop( 1, '#000' )
			ctx.fillStyle = g
			ctx.beginPath()
			ctx.arc( x, y, r, 0, Math.PI * 2 )
			ctx.fill()

		}
		// tudo dentro de r ≈ 0,4 do centro: girando com o vento a folha nunca encosta na borda do cartão (quina reta)
		leaf( size * 0.5, size * 0.5, size * 0.4 )
		for ( let i = 0; i < 9; i ++ ) {

			const a = ( i / 9 ) * Math.PI * 2 + random() * 0.5, d = size * ( 0.17 + random() * 0.07 )
			leaf( size * 0.5 + Math.cos( a ) * d, size * 0.5 + Math.sin( a ) * d, size * ( 0.14 + random() * 0.06 ) )

		}
		const tex = new THREE.CanvasTexture( canvas )
		tex.colorSpace = THREE.NoColorSpace
		tex.generateMipmaps = true
		tex.minFilter = THREE.LinearMipmapLinearFilter
		return tex

	}

}
