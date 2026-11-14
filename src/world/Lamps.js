import * as THREE from 'three/webgpu'
import { Fn, uniform, color, float, vec4, uv, smoothstep, length } from 'three/tsl'
import { createToonMaterial, inkMRT } from '../render/ToonMaterial.js'
import { rng } from '../core/utils.js'

// Lanternas de poste (Bruno 2025: luzes que acendem à noite e brilham com o bloom). Poste + lanterna instanciados (2 draws)
// e uma poça de luz no chão (disco aditivo, 1 draw) — sem PointLight: luz "pintada", custo ~0.
// glow (0..1) vem do ciclo do dia (DayCycle.night). Lanterna HDR (> 1) → bloom.
export class Lamps {

	constructor( { look, terrain, palette, count = 24, seed = 21, avoid = [], spots = null } ) {

		const random = rng( seed )
		this.glow = uniform( 0 )
		const list = spots ? [ ...spots ] : []
		let tries = 0
		while ( list.length < count && tries ++ < count * 60 ) {

			const x = ( random() * 2 - 1 ) * terrain.size * 0.4, z = ( random() * 2 - 1 ) * terrain.size * 0.4
			if ( terrain.grassAt( x, z ) < 0.5 || terrain.normalYAt( x, z ) < 0.9 ) continue
			if ( avoid.some( ( a ) => a.test ? a.test( x, z ) : Math.hypot( x - a.x, z - a.z ) < a.r ) ) continue
			if ( list.some( ( l ) => Math.hypot( x - l[ 0 ], z - l[ 1 ] ) < 9 ) ) continue
			list.push( [ x, z ] )

		}
		this.spots = list.map( ( [ x, z ] ) => ( { x, z, y: terrain.sampleHeight( x, z ) } ) )

		const n = this.spots.length
		const pole = new THREE.InstancedMesh( new THREE.CylinderGeometry( 0.06, 0.09, 2.2, 6 ).translate( 0, 1.1, 0 ), null, n )
		const head = new THREE.InstancedMesh( new THREE.BoxGeometry( 0.34, 0.42, 0.34 ).translate( 0, 2.38, 0 ), null, n )
		const pool = new THREE.InstancedMesh( new THREE.PlaneGeometry( 1, 1 ).rotateX( - Math.PI / 2 ), null, n )
		const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3( 1, 1, 1 ), p = new THREE.Vector3()
		this.spots.forEach( ( l, i ) => {

			q.setFromAxisAngle( THREE.Object3D.DEFAULT_UP, random() * Math.PI )
			m.compose( p.set( l.x, l.y - 0.05, l.z ), q, s.set( 1, 1, 1 ) )
			pole.setMatrixAt( i, m )
			head.setMatrixAt( i, m )
			m.compose( p.set( l.x, l.y + 0.06, l.z ), q, s.set( 7, 1, 7 ) )
			pool.setMatrixAt( i, m )

		} )

		const lamp = color( palette.lamp ?? '#ffb347' )
		pole.material = createToonMaterial( look, { colorNode: color( palette.metal ?? '#4a3f5c' ), fade: true } )
		// de dia a lanterna é um vidro cor de mel; à noite vira luz forte (HDR → bloom)
		head.material = createToonMaterial( look, {
			colorNode: lamp, emissiveNode: lamp.mul( this.glow.mul( 5 ) ), fade: true
		} )
		// poça de luz: disco aditivo que some na borda, só à noite
		const poolMat = new THREE.MeshBasicNodeMaterial( { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false } )
		poolMat.colorNode = Fn( () => {

			const d = length( uv().sub( 0.5 ) ).mul( 2 )
			const a = float( 1 ).sub( smoothstep( 0, 1, d ) ).pow( 2 ).mul( this.glow ).mul( 0.55 )
			return vec4( lamp.mul( a ), 1 )

		} )()
		poolMat.mrtNode = inkMRT( 0 )
		pool.material = poolMat

		for ( const mesh of [ pole, head ] ) { mesh.castShadow = true; mesh.receiveShadow = true }
		this.group = new THREE.Group()
		for ( const mesh of [ pole, head, pool ] ) { mesh.computeBoundingSphere(); this.group.add( mesh ) }
		this.pool = pool

	}

	update( night ) {

		this.glow.value = night
		this.pool.visible = night > 0.01

	}

}
