import * as THREE from 'three/webgpu'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { Fn, positionLocal, positionGeometry, positionWorld, instanceIndex, instancedBufferAttribute, time, hash, vec2, vec3, max, float, color, mix, texture, smoothstep, fwidth } from 'three/tsl'
import { createToonMaterial } from '../render/ToonMaterial.js'
import { rng } from '../core/utils.js'
import { Foliage } from './Foliage.js'

// Árvores e pedras instanciadas (2 + 1 draw calls para centenas de objetos).
// kind: 'round' (copa fofa — normais esféricas, Bruno Foliage) · 'palm' (synthwave) · 'cone' (pinheiro Kenney) · 'lowpoly' (Interland)
// leafShadows: a SOMBRA da copa ganha furos animados (luz passando entre as folhas) — maskShadowNode, custo ~0.
export class Props {

	// kind 'tall' (Messenger): tronco fino e alto + 2º tronco, copa em cachos no topo, pintas escuras na folhagem
	// rockKind 'slab' (Messenger): blocos creme facetados com rachaduras desenhadas (curvas de nível de ruído)
	constructor( { look, terrain, palette, treeCount = 200, rockCount = 80, seed = 11, avoid = [], kind = 'round', rockKind = 'round', treeScale = [ 0.75, 1.45 ], rockScale = null, leafShadows = false, noiseTexture = null, build = true, groves = [], bushes = 0 } ) {

		this.trees = []
		this.rocks = []
		this.kind = kind
		this.rockKind = rockKind
		this.treeScale = treeScale
		this.rockScale = rockScale
		this.look = look
		const random = rng( seed )
		this.placeTrees( terrain, treeCount, random, avoid )
		// bosques (biomas com `trees`): árvores a mais dentro do círculo → o bioma tem a SUA floresta (ex.: bordos do outono)
		for ( const g of groves ) if ( g.trees ) this.placeTrees( terrain, g.trees, random, avoid, g )
		this.placeRocks( terrain, rockCount, random, avoid )
		if ( bushes && kind === 'foliage' ) this.placeBushes( terrain, bushes, random, avoid )

		this.group = new THREE.Group()
		if ( ! build ) return // só a distribuição (trees/rocks): quem desenha é outro módulo (ex.: world/Nature.js com assets)
		this.buildTrees( look, palette, random, leafShadows && noiseTexture )
		this.buildRocks( look, palette, random )

	}

	// Geometrias por tipo. Copa e tronco em malhas separadas (2 draw calls); y = 0 no chão.
	treeGeometries() {

		const v = new THREE.Vector3(), n = new THREE.Vector3()

		if ( this.kind === 'palm' ) {

			// tronco curvo em anéis + 8 folhas em arco caindo (facetadas, silhueta forte contra o pôr do sol)
			const curve = new THREE.QuadraticBezierCurve3( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0.15, 2.4, 0 ), new THREE.Vector3( 0.9, 4.6, 0 ) )
			const trunk = new THREE.TubeGeometry( curve, 8, 0.17, 6, false )
			const top = curve.getPoint( 1 )
			const fronds = []
			for ( let i = 0; i < 8; i ++ ) {

				const a = ( i / 8 ) * Math.PI * 2 + ( i % 2 ) * 0.2
				const len = 2.3 + ( i % 3 ) * 0.35
				const pts = [], segs = 6
				for ( let s = 0; s <= segs; s ++ ) {

					const t = s / segs
					const w = Math.sin( t * Math.PI ) * 0.42 + 0.04
					const droop = Math.sin( t * 1.6 ) * 0.55 - t * t * 1.5
					pts.push( [ t * len, droop, w ] )

				}

				const pos = []
				for ( let s = 0; s < segs; s ++ ) {

					const [ x0, y0, w0 ] = pts[ s ], [ x1, y1, w1 ] = pts[ s + 1 ]
					// folha com nervura central (2 faces em V) → facetas pegam luz diferente
					pos.push( x0, y0, 0, x1, y1, 0, x0, y0 - 0.12, w0, x1, y1, 0, x1, y1 - 0.12, w1, x0, y0 - 0.12, w0 )
					pos.push( x0, y0, 0, x0, y0 - 0.12, - w0, x1, y1, 0, x1, y1, 0, x0, y0 - 0.12, - w0, x1, y1 - 0.12, - w1 )

				}

				const g = new THREE.BufferGeometry()
				g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) )
				g.rotateY( a ).translate( top.x, top.y, top.z )
				g.computeVertexNormals()
				fronds.push( g )

			}

			return { trunk, canopy: mergeGeometries( fronds ), canopyY: top.y, flat: true, trunkHeight: 4.4, trunkRadius: 0.2 }

		}

		if ( this.kind === 'cone' ) {

			const trunk = new THREE.CylinderGeometry( 0.14, 0.2, 1.0, 6, 1 ).translate( 0, 0.5, 0 )
			const cones = [ [ 1.25, 1.5, 1.45 ], [ 1.0, 1.3, 2.35 ], [ 0.7, 1.1, 3.15 ] ].map( ( [ r, h, y ] ) => new THREE.ConeGeometry( r, h, 8, 1 ).translate( 0, y, 0 ) )
			return { trunk, canopy: mergeGeometries( cones ), canopyY: 2.2, flat: true, trunkHeight: 1.0, trunkRadius: 0.2 }

		}

		if ( this.kind === 'tall' ) {

			// tronco principal fino + tronco secundário inclinado (as árvores do Messenger crescem em grupo)
			const main = new THREE.CylinderGeometry( 0.08, 0.15, 4.4, 6, 1 ).translate( 0, 2.2, 0 )
			const second = new THREE.CylinderGeometry( 0.05, 0.1, 3.2, 5, 1 ).translate( 0, 1.6, 0 ).rotateZ( - 0.28 ).translate( 0.12, 0, 0.05 )
			const trunk = mergeGeometries( [ main.toNonIndexed(), second.toNonIndexed() ] )
			const blobs = [ [ 0, 4.7, 0, 1.15 ], [ 0.75, 4.15, 0.3, 0.85 ], [ - 0.7, 4.3, - 0.3, 0.9 ], [ 0.2, 5.4, - 0.1, 0.75 ], [ - 0.25, 3.55, 0.45, 0.7 ], [ 1.05, 3.4, - 0.1, 0.6 ] ]
			const center = new THREE.Vector3( 0, 4.5, 0 )
			const parts = blobs.map( ( [ x, y, z, r ] ) => new THREE.IcosahedronGeometry( r, 1 ).translate( x, y, z ) )
			const canopyGeo = mergeGeometries( parts )
			const pos = canopyGeo.attributes.position, nor = canopyGeo.attributes.normal
			for ( let i = 0; i < pos.count; i ++ ) {

				v.fromBufferAttribute( pos, i ).sub( center ).normalize()
				n.fromBufferAttribute( nor, i ).lerp( v, 0.55 ).normalize() // fofa mas ainda com cachos legíveis
				nor.setXYZ( i, n.x, n.y, n.z )

			}

			return { trunk, canopy: canopyGeo, canopyY: 3.3, flat: false, trunkHeight: 4.4, trunkRadius: 0.15 }

		}

		const trunkGeo = new THREE.CylinderGeometry( 0.16, 0.26, 2.4, this.kind === 'lowpoly' ? 5 : 7, 1 ).translate( 0, 1.2, 0 )

		if ( this.kind === 'lowpoly' ) {

			// poucas faces grandes: cada triângulo uma cor de luz (Interland)
			const blobs = [ [ 0, 3.0, 0, 1.4 ], [ 0.7, 2.55, 0.3, 0.95 ], [ - 0.55, 2.7, - 0.4, 1.0 ] ]
			const parts = blobs.map( ( [ x, y, z, r ] ) => new THREE.IcosahedronGeometry( r, 0 ).translate( x, y, z ) )
			return { trunk: trunkGeo, canopy: mergeGeometries( parts ), canopyY: 3.0, flat: true, trunkHeight: 2.4, trunkRadius: 0.24 }

		}

		const blobs = [ [ 0, 3.05, 0, 1.35 ], [ 0.75, 2.6, 0.25, 0.95 ], [ - 0.65, 2.7, - 0.35, 1.0 ], [ 0.1, 3.85, - 0.1, 0.85 ] ]
		const center = new THREE.Vector3( 0, 3.0, 0 )
		const parts = blobs.map( ( [ x, y, z, r ] ) => new THREE.IcosahedronGeometry( r, 1 ).translate( x, y, z ) )
		const canopyGeo = mergeGeometries( parts )
		const pos = canopyGeo.attributes.position, nor = canopyGeo.attributes.normal
		for ( let i = 0; i < pos.count; i ++ ) {

			v.fromBufferAttribute( pos, i ).sub( center ).normalize()
			n.fromBufferAttribute( nor, i ).lerp( v, 0.8 ).normalize()
			nor.setXYZ( i, n.x, n.y, n.z )

		}

		return { trunk: trunkGeo, canopy: canopyGeo, canopyY: 2.0, flat: false, trunkHeight: 2.4, trunkRadius: 0.24 }

	}

	// area = { x, z, r }: só dentro dela (bosque de um bioma); count = quantas a MAIS (somadas às que já existem)
	placeTrees( terrain, count, random, avoid, area = null ) {

		const half = terrain.size * 0.5
		const minDist = 3.2
		const target = this.trees.length + ( area ? count : count - this.trees.length )
		let tries = 0
		while ( this.trees.length < target && tries ++ < count * 60 ) {

			const a = random() * Math.PI * 2, d = Math.sqrt( random() ) * ( area?.r ?? 0 )
			const x = area ? area.x + Math.cos( a ) * d : ( random() * 2 - 1 ) * half * 0.9
			const z = area ? area.z + Math.sin( a ) * d : ( random() * 2 - 1 ) * half * 0.9
			if ( terrain.grassAt( x, z ) < 0.6 || terrain.normalYAt( x, z ) < 0.86 ) continue
			if ( avoid.some( ( a ) => a.test ? a.test( x, z ) : Math.hypot( x - a.x, z - a.z ) < a.r ) ) continue // a.test(x, z) = área livre custom (pista)
			if ( this.trees.some( ( t ) => Math.hypot( x - t.x, z - t.z ) < minDist * t.s ) ) continue
			const [ s0, s1 ] = this.treeScale
			this.trees.push( { x, z, y: terrain.sampleHeight( x, z ) - 0.15, s: s0 + random() * ( s1 - s0 ), r: random() * Math.PI * 2 } )

		}

	}

	placeRocks( terrain, count, random, avoid ) {

		const half = terrain.size * 0.5
		let tries = 0
		while ( this.rocks.length < count && tries ++ < count * 40 ) {

			const x = ( random() * 2 - 1 ) * half * 0.85, z = ( random() * 2 - 1 ) * half * 0.85
			const h = terrain.sampleHeight( x, z )
			if ( h < - 0.5 ) continue
			if ( avoid.some( ( a ) => a.test ? a.test( x, z ) : Math.hypot( x - a.x, z - a.z ) < a.r ) ) continue // a.test(x, z) = área livre custom (pista)
			if ( this.trees.some( ( t ) => Math.hypot( x - t.x, z - t.z ) < 1.8 ) ) continue
			const s = this.rockScale ? this.rockScale[ 0 ] + Math.pow( random(), 2 ) * ( this.rockScale[ 1 ] - this.rockScale[ 0 ] ) : 0.35 + Math.pow( random(), 2.5 ) * 1.6
			this.rocks.push( { x, z, y: h - s * 0.25, s, r: random() * Math.PI * 2, t: random() } )

		}

	}

	buildTrees( look, palette, random, noiseTexture ) {

		if ( this.kind === 'foliage' ) return this.buildFoliageTrees( look, palette, random )
		const { trunk: trunkGeo, canopy: canopyGeo, canopyY, flat, trunkHeight, trunkRadius } = this.treeGeometries()
		this.trunkHeight = trunkHeight
		this.trunkRadius = trunkRadius

		const count = this.trees.length
		const tints = new Float32Array( count * 3 )
		const leaf = palette.leaves.map( ( h ) => new THREE.Color( h ) )
		const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
		const trunk = new THREE.InstancedMesh( trunkGeo, null, count )
		const canopy = new THREE.InstancedMesh( canopyGeo, null, count )

		this.trees.forEach( ( t, i ) => {

			q.setFromAxisAngle( THREE.Object3D.DEFAULT_UP, t.r )
			m.compose( p.set( t.x, t.y, t.z ), q, s.setScalar( t.s ) )
			trunk.setMatrixAt( i, m )
			canopy.setMatrixAt( i, m )
			const c = leaf[ Math.floor( random() * leaf.length ) ].clone().offsetHSL( ( random() - 0.5 ) * 0.03, 0, ( random() - 0.5 ) * 0.06 )
			tints.set( [ c.r, c.g, c.b ], i * 3 )

		} )

		const tint = instancedBufferAttribute( new THREE.InstancedBufferAttribute( tints, 3 ) )

		trunk.material = createToonMaterial( look, { colorNode: color( palette.trunk ), roughness: 0.9, fade: true, flatShading: flat } )

		// pintas na folhagem (Messenger): manchas mais escuras + pontinhos de nanquim, presas ao mundo
		let canopyColor = tint
		if ( this.kind === 'tall' && look.noiseTexture ) {

			canopyColor = Fn( () => {

				const p = positionWorld
				const a = texture( look.noiseTexture, p.xz.mul( 0.9 ).add( p.y.mul( vec2( 0.53, 0.31 ) ) ) ).r
				const b = texture( look.noiseTexture, p.zy.mul( 2.6 ).add( p.x.mul( vec2( 0.41, 0.77 ) ) ) ).g
				const darker = smoothstep( 0.6, 0.62, a )
				const speck = smoothstep( 0.705, 0.715, b )
				return mix( mix( vec3( tint ), vec3( tint ).mul( 0.74 ), darker ), color( palette.ink ?? '#22302c' ), speck.mul( 0.85 ) )

			} )()

		}

		canopy.material = createToonMaterial( look, {
			colorNode: canopyColor, roughness: 0.8, fade: true, flatShading: flat,
			side: this.kind === 'palm' ? THREE.DoubleSide : THREE.FrontSide
		} )

		// balanço da copa (positionLocal já inclui a instância; peso pela altura original)
		const swayAmount = this.kind === 'palm' ? 0.07 : 0.05
		canopy.material.positionNode = Fn( () => {

			const phase = hash( instanceIndex ).mul( 6.28 )
			const k = max( positionGeometry.y.sub( canopyY ), 0 ).add( this.kind === 'palm' ? positionGeometry.xz.length().mul( 0.4 ) : 0 ).mul( swayAmount )
			return positionLocal.add( vec3( time.mul( 1.3 ).add( phase ).sin(), 0, time.mul( 1.1 ).add( phase ).cos() ).mul( k ) )

		} )()

		// Luz passando entre as folhas: a copa projeta sombra com FUROS que mexem com o vento (Firewood/Summer Afternoon).
		// Só afeta o shadow pass; na câmera a copa continua cheia. O dither de proximidade (fade) não vai para a sombra.
		if ( noiseTexture ) {

			canopy.material.maskShadowNode = Fn( () => {

				const p = positionGeometry.add( hash( instanceIndex ).mul( 17 ) )
				const wind = vec3( time.mul( 0.35 ), 0, time.mul( 0.22 ) )
				const a = texture( noiseTexture, p.xz.mul( 0.55 ).add( p.y.mul( 0.31 ) ).add( wind.xz ) ).r
				const b = texture( noiseTexture, p.zy.mul( 1.3 ).sub( wind.xz.mul( 1.7 ) ) ).g
				return a.mul( 0.6 ).add( b.mul( 0.4 ) ).greaterThan( 0.4 )

			} )()

		}

		for ( const mesh of [ trunk, canopy ] ) {

			mesh.castShadow = true
			mesh.receiveShadow = true
			mesh.computeBoundingSphere()
			this.group.add( mesh )

		}

	}

	// kind 'foliage' (Bruno 2025): tronco fino + 3–4 bolas de folhagem em cartões (world/Foliage.js); bushes = bolas no chão
	buildFoliageTrees( look, palette, random ) {

		this.trunkHeight = 2.6
		this.trunkRadius = 0.2
		const count = this.trees.length
		const trunkGeo = new THREE.CylinderGeometry( 0.11, 0.2, 2.6, 6, 1 ).translate( 0, 1.3, 0 )
		const trunk = new THREE.InstancedMesh( trunkGeo, null, count )
		const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
		const shape = [ [ 0, 3.1, 0, 1.25 ], [ 0.75, 2.6, 0.3, 0.9 ], [ - 0.65, 2.7, - 0.35, 0.95 ], [ 0.1, 3.9, - 0.15, 0.8 ] ]
		const balls = []
		this.trees.forEach( ( t, i ) => {

			q.setFromAxisAngle( THREE.Object3D.DEFAULT_UP, t.r )
			m.compose( p.set( t.x, t.y, t.z ), q, s.setScalar( t.s ) )
			trunk.setMatrixAt( i, m )
			const tint = random()
			for ( const [ bx, by, bz, br ] of shape.slice( 0, random() < 0.4 ? 3 : 4 ) ) {

				p.set( bx, by, bz ).applyQuaternion( q ).multiplyScalar( t.s )
				balls.push( { x: t.x + p.x, y: t.y + p.y, z: t.z + p.z, s: br * t.s, tint } )

			}

		} )
		for ( const b of this.bushes ?? [] ) balls.push( b )
		trunk.material = createToonMaterial( look, { colorNode: color( palette.trunk ), roughness: 0.9, fade: true } )
		trunk.castShadow = trunk.receiveShadow = true
		trunk.computeBoundingSphere()
		this.group.add( trunk )
		this.foliage = new Foliage( { look, balls, colors: palette.foliage ?? [ palette.leaves[ 0 ], palette.leaves[ 1 ] ] } )
		this.group.add( this.foliage.mesh )

	}

	// arbustos (bolas de folhagem no chão) — só o kind 'foliage' desenha; chamar antes de buildTrees
	placeBushes( terrain, count, random, avoid ) {

		this.bushes = []
		let tries = 0
		while ( this.bushes.length < count && tries ++ < count * 40 ) {

			const x = ( random() * 2 - 1 ) * terrain.size * 0.45, z = ( random() * 2 - 1 ) * terrain.size * 0.45
			if ( terrain.grassAt( x, z ) < 0.6 || terrain.normalYAt( x, z ) < 0.85 ) continue
			if ( avoid.some( ( a ) => a.test ? a.test( x, z ) : Math.hypot( x - a.x, z - a.z ) < a.r ) ) continue
			if ( this.trees.some( ( t ) => Math.hypot( x - t.x, z - t.z ) < 2 ) ) continue
			const r = 0.55 + random() * 0.5
			this.bushes.push( { x, z, y: terrain.sampleHeight( x, z ) + r * 0.45, s: r } )

		}

	}

	buildRocks( look, palette, random ) {

		const slab = this.rockKind === 'slab'
		// slab: caixa subdividida, cantos arredondados por mistura com elipsoide e faces "talhadas" por ruído → bloco de arenito
		let geo = slab ? new THREE.BoxGeometry( 1.7, 1.0, 1.2, 3, 2, 3 ) : new THREE.IcosahedronGeometry( 1, 1 )
		if ( slab ) geo = mergeVertices( geo.deleteAttribute( 'uv' ).deleteAttribute( 'normal' ) )
		const pos = geo.attributes.position
		const v = new THREE.Vector3(), ell = new THREE.Vector3()
		for ( let i = 0; i < pos.count; i ++ ) {

			v.fromBufferAttribute( pos, i )
			if ( slab ) {

				ell.copy( v ).normalize().multiply( new THREE.Vector3( 0.95, 0.55, 0.7 ) )
				v.lerp( ell, 0.3 )
				const d = 1 + Math.sin( v.x * 5.3 + v.z * 2.1 ) * 0.07 + Math.cos( v.z * 6.1 - v.y * 3.7 ) * 0.06
				pos.setXYZ( i, v.x * d, v.y * ( v.y > 0.2 ? 0.92 : 1 ) * d, v.z * d ) // topo levemente achatado

			} else {

				const d = 1 + ( Math.sin( v.x * 4.1 ) * Math.cos( v.z * 3.3 ) + Math.sin( v.y * 5.7 ) ) * 0.12
				pos.setXYZ( i, v.x * d, v.y * d * 0.7, v.z * d )

			}

		}

		geo.computeVertexNormals()

		const count = this.rocks.length
		const mesh = new THREE.InstancedMesh( geo, null, count )
		const tints = new Float32Array( count * 3 )
		const base = new THREE.Color( palette.rock )
		const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler()

		this.rocks.forEach( ( r, i ) => {

			q.setFromEuler( e.set( ( random() - 0.5 ) * 0.4, r.r, ( random() - 0.5 ) * 0.4 ) )
			m.compose( p.set( r.x, r.y, r.z ), q, s.set( r.s * ( 0.9 + random() * 0.4 ), r.s, r.s * ( 0.9 + random() * 0.4 ) ) )
			mesh.setMatrixAt( i, m )
			const c = base.clone().offsetHSL( 0, - 0.02, ( r.t - 0.5 ) * 0.12 )
			tints.set( [ c.r, c.g, c.b ], i * 3 )

		} )

		let rockColor = instancedBufferAttribute( new THREE.InstancedBufferAttribute( tints, 3 ) )
		if ( slab && look.noiseTexture ) {

			// rachaduras: curva de nível de um ruído (|n − 0.5| ≈ 0) = linha torta contínua; outro ruído apaga trechos
			const base = rockColor
			rockColor = Fn( () => {

				const p = positionWorld
				const nA = texture( look.noiseTexture, p.xz.mul( 0.22 ).add( p.y.mul( vec2( 0.31, 0.17 ) ) ) ).r
				const nB = texture( look.noiseTexture, p.zy.mul( 0.25 ).add( p.x.mul( vec2( 0.23, 0.11 ) ) ) ).g
				const crack = ( n ) => float( 1 ).sub( smoothstep( fwidth( n ).mul( 0.6 ), fwidth( n ).mul( 1.6 ), n.sub( 0.5 ).abs() ) )
				const keep = smoothstep( 0.45, 0.55, texture( look.noiseTexture, p.xz.mul( 0.4 ).add( 9.1 ) ).b )
				const lines = max( crack( nA ), crack( nB ) ).mul( keep )
				return mix( vec3( base ), color( palette.ink ?? '#22302c' ), lines.mul( 0.85 ) )

			} )()

		}

		mesh.material = createToonMaterial( look, {
			colorNode: rockColor,
			flatShading: true,
			roughness: 0.95,
			fade: true
		} )
		mesh.castShadow = true
		mesh.receiveShadow = true
		mesh.computeBoundingSphere()
		this.group.add( mesh )

	}

	addToPhysics( physics ) {

		const { RAPIER, world } = physics
		const body = world.createRigidBody( RAPIER.RigidBodyDesc.fixed() )
		for ( const t of this.trees ) {

			const hh = this.trunkHeight * 0.5 * t.s
			world.createCollider( RAPIER.ColliderDesc.cylinder( hh, this.trunkRadius * t.s ).setTranslation( t.x, t.y + hh, t.z ), body )

		}

		for ( const r of this.rocks ) {

			if ( r.s < 0.5 ) continue
			world.createCollider( RAPIER.ColliderDesc.ball( r.s * 0.75 ).setTranslation( r.x, r.y + r.s * 0.1, r.z ), body )

		}

	}

}
