import * as THREE from 'three/webgpu'
import { Fn, attribute, vec3, float, mix, smoothstep, abs, fract, step, color, fwidth, min } from 'three/tsl'
import { createToonMaterial } from '../render/ToonMaterial.js'
import { rng } from '../core/utils.js'

/**
 * Pista em laço por spline (Horizon Drive guarda a pista como pontos num JSON; Kenney monta por peças).
 * 1) `new Track()` gera só o traçado XZ (antes do terreno existir)
 * 2) o Terrain chama `track.flatten(...)` e aplaina o chão ao longo dela (rampas suaves, sem degraus)
 * 3) `track.build(look, terrain)` cria a fita da pista colada no terreno
 * Estilos de pista: 'neon' (asfalto escuro + bordas emissivas + faixa central tracejada) · 'kit' (cinza + zebra vermelho/branco).
 */
export class Track {

	constructor( { center = new THREE.Vector2( 0, - 30 ), radius = 27, width = 7, seed = 4, points = 10 } = {} ) {

		this.width = width
		const random = rng( seed )
		const ctrl = []
		for ( let i = 0; i < points; i ++ ) {

			const a = ( i / points ) * Math.PI * 2 + Math.PI / 2 // i = 0 → ponto mais perto da origem (spawn)
			const r = radius * ( i === 0 ? 1 : 0.82 + random() * 0.36 )
			ctrl.push( new THREE.Vector3( center.x + Math.cos( a ) * r, 0, center.y + Math.sin( a ) * r ) )

		}

		this.curve = new THREE.CatmullRomCurve3( ctrl, true, 'centripetal' )
		this.length = this.curve.getLength()
		this.samples = Math.ceil( this.length / 1.0 ) // 1 amostra por metro
		this.points = this.curve.getSpacedPoints( this.samples ) // XZ (y = 0 por enquanto)
		this.points.pop() // laço fechado: o último repete o primeiro

	}

	// distância horizontal até a linha central (força bruta sobre a polilinha — usado na geração, não por frame)
	distance( x, z ) {

		let best = Infinity
		const P = this.points, n = P.length
		for ( let i = 0; i < n; i ++ ) {

			const a = P[ i ], b = P[ ( i + 1 ) % n ]
			const dx = b.x - a.x, dz = b.z - a.z
			const t = Math.max( 0, Math.min( 1, ( ( x - a.x ) * dx + ( z - a.z ) * dz ) / ( dx * dx + dz * dz ) ) )
			const ex = a.x + dx * t - x, ez = a.z + dz * t - z
			best = Math.min( best, ex * ex + ez * ez )

		}

		return Math.sqrt( best )

	}

	// Aplaina o terreno: altura da pista = média móvel do chão ao longo do traçado; mistura numa faixa de transição.
	flatten( heights, res, size, heightAt ) {

		const P = this.points, n = P.length
		const raw = P.map( ( p ) => Math.max( heightAt( p.x, p.z ), 0.6 ) )
		const win = 9
		this.heights = raw.map( ( _, i ) => {

			let s = 0
			for ( let k = - win; k <= win; k ++ ) s += raw[ ( i + k + n ) % n ]
			return s / ( 2 * win + 1 )

		} )

		const step = size / ( res - 1 ), half = this.width * 0.5 + 0.8, blend = 5
		for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

			const x = - size / 2 + i * step, z = - size / 2 + j * step
			// segmento mais próximo (com altura interpolada)
			let best = Infinity, bh = 0
			for ( let s = 0; s < n; s ++ ) {

				const a = P[ s ], b = P[ ( s + 1 ) % n ]
				const dx = b.x - a.x, dz = b.z - a.z
				const t = Math.max( 0, Math.min( 1, ( ( x - a.x ) * dx + ( z - a.z ) * dz ) / ( dx * dx + dz * dz ) ) )
				const ex = a.x + dx * t - x, ez = a.z + dz * t - z
				const d = ex * ex + ez * ez
				if ( d < best ) { best = d; bh = this.heights[ s ] + ( this.heights[ ( s + 1 ) % n ] - this.heights[ s ] ) * t }

			}

			const d = Math.sqrt( best )
			if ( d > half + blend ) continue
			const w = d <= half ? 1 : 1 - ( d - half ) / blend
			const k = j * res + i
			heights[ k ] = heights[ k ] + ( bh - heights[ k ] ) * ( w * w * ( 3 - 2 * w ) )

		}

	}

	build( look, terrain, style = 'neon' ) {

		const P = this.points, n = P.length, hw = this.width / 2
		const pos = [], uvs = [], idx = []
		const tangent = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3( 0, 1, 0 )
		const across = 6 // subdivisões na largura → acompanha o terreno sem atravessar
		let dist = 0
		for ( let i = 0; i <= n; i ++ ) {

			const p = P[ i % n ], q = P[ ( i + 1 ) % n ], o = P[ ( i - 1 + n ) % n ]
			tangent.subVectors( q, o ).setY( 0 ).normalize()
			side.crossVectors( up, tangent ).normalize()
			if ( i > 0 ) dist += P[ i % n ].distanceTo( P[ i - 1 ] )
			for ( let k = 0; k <= across; k ++ ) {

				const u = k / across, off = ( u - 0.5 ) * 2 * hw
				const x = p.x + side.x * off, z = p.z + side.z * off
				pos.push( x, terrain.sampleHeight( x, z ) + 0.06, z )
				uvs.push( u, dist )

			}

		}

		for ( let i = 0; i < n; i ++ ) for ( let k = 0; k < across; k ++ ) {

			const a = i * ( across + 1 ) + k, b = a + 1, c = a + across + 1, d = c + 1
			idx.push( a, c, b, b, c, d )

		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) )
		geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) )
		geometry.setIndex( idx )
		geometry.computeVertexNormals()

		const uv = attribute( 'uv', 'vec2' )
		const u = uv.x, along = uv.y
		const edge = abs( u.sub( 0.5 ) ).mul( 2 ) // 0 centro … 1 borda
		const aa = fwidth( u ).mul( 1.5 )
		let colorNode, emissiveNode = null
		if ( style === 'neon' ) {

			const border = smoothstep( float( 0.9 ).sub( aa ), 0.9, edge )
			const dash = step( 0.5, fract( along.div( 4 ) ) ).mul( float( 1 ).sub( smoothstep( 0.025, float( 0.025 ).add( aa ), abs( u.sub( 0.5 ) ) ) ) )
			colorNode = mix( color( '#140a24' ), color( '#1d0f33' ), smoothstep( 0, 0.9, edge ) )
			emissiveNode = color( '#28e8ff' ).mul( border.mul( 4 ) ).add( color( '#ff3fb4' ).mul( dash.mul( 2.5 ) ) )

		} else {

			// zebra nas bordas (Kenney) + asfalto cinza com faixa central
			const curb = smoothstep( float( 0.86 ).sub( aa ), 0.86, edge )
			const stripe = step( 0.5, fract( along.div( 1.6 ) ) )
			const center = float( 1 ).sub( smoothstep( 0.02, float( 0.02 ).add( aa ), abs( u.sub( 0.5 ) ) ) ).mul( step( 0.5, fract( along.div( 5 ) ) ) )
			const asphalt = mix( color( '#5b6068' ), color( '#ffffff' ), center.mul( 0.9 ) )
			colorNode = mix( asphalt, mix( color( '#e8453c' ), color( '#ffffff' ), stripe ), curb )

		}

		const material = createToonMaterial( look, { colorNode, emissiveNode, roughness: 0.7, ink: 0 } )
		material.polygonOffset = true
		material.polygonOffsetFactor = - 1
		material.polygonOffsetUnits = - 2

		this.mesh = new THREE.Mesh( geometry, material )
		this.mesh.receiveShadow = true
		return this.mesh

	}

	// início da pista (posição + direção) para largar o carro
	start( terrain ) {

		const p = this.points[ 0 ], q = this.points[ 3 ]
		return {
			position: new THREE.Vector3( p.x, terrain.sampleHeight( p.x, p.z ), p.z ),
			yaw: Math.atan2( q.x - p.x, q.z - p.z )
		}

	}

}
