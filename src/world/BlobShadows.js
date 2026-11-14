import * as THREE from 'three/webgpu'
import { Fn, uv, vec4, float, smoothstep, instancedBufferAttribute } from 'three/tsl'
import { inkMRT } from '../render/ToonMaterial.js'

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3()
const _n = new THREE.Vector3(), _up = new THREE.Vector3( 0, 1, 0 ), _yaw = new THREE.Quaternion()

/**
 * Sombras falsas (Bruno Simon 2019, Horizon Drive): um quad com gradiente radial por objeto, deitado no terreno,
 * deslocado na direção oposta ao sol e mais fraco/maior quanto mais alto o objeto está. Zero shadow map, 1 draw call.
 * add({ x, y, z, radius, height, stretch }) → índice · setDynamic(i, position, heightAboveGround)
 */
export class BlobShadows {

	constructor( { look, terrain, sun, color = '#000000', max = 512 } ) {

		this.terrain = terrain
		this.sun = sun
		this.entries = []
		this.max = max

		this.opacity = new Float32Array( max )
		this.opacityAttr = new THREE.InstancedBufferAttribute( this.opacity, 1 )
		this.opacityAttr.setUsage( THREE.DynamicDrawUsage )

		const material = new THREE.MeshBasicNodeMaterial( { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: - 2, polygonOffsetUnits: - 2 } )
		const alpha = Fn( () => {

			const d = uv().sub( 0.5 ).length().mul( 2 )
			const blob = float( 1 ).sub( smoothstep( 0.15, 1.0, d ) )
			return blob.mul( blob ).mul( instancedBufferAttribute( this.opacityAttr ) )

		} )()
		material.colorNode = vec4( look.shadowTint.mul( look.shadowValue ), alpha )
		material.mrtNode = inkMRT( 0 )

		const geometry = new THREE.PlaneGeometry( 1, 1 ).rotateX( - Math.PI / 2 )
		this.mesh = new THREE.InstancedMesh( geometry, material, max )
		this.mesh.count = 0
		this.mesh.frustumCulled = false
		this.mesh.renderOrder = 10

	}

	// height = altura do "centro de massa" acima do chão (desloca a sombra para longe do sol)
	add( { x, y, z, radius = 1, height = 1, stretch = 1, strength = 0.75, yaw = 0 } ) {

		if ( this.entries.length >= this.max ) return - 1
		const i = this.entries.length
		this.entries.push( { x, y, z, radius, height, stretch, strength, yaw } )
		this.mesh.count = this.entries.length
		this.place( i )
		return i

	}

	setDynamic( i, position, heightAboveGround = 0, yaw = 0 ) {

		const e = this.entries[ i ]
		if ( ! e ) return
		e.x = position.x
		e.z = position.z
		e.lift = heightAboveGround
		e.yaw = yaw
		this.place( i )

	}

	place( i ) {

		const e = this.entries[ i ]
		const dir = this.sun.direction
		const lift = e.lift ?? 0
		// sombra cai do lado oposto ao sol: deslocamento = altura × tan(ângulo)
		const k = Math.min( ( e.height + lift ) / Math.max( dir.y, 0.25 ), 6 ) * 0.5
		const x = e.x - dir.x * k, z = e.z - dir.z * k
		const ground = this.terrain.sampleHeight( x, z )

		// alinha ao terreno (normal por diferenças finitas)
		const d = 0.5
		_n.set( this.terrain.sampleHeight( x - d, z ) - this.terrain.sampleHeight( x + d, z ), 2 * d, this.terrain.sampleHeight( x, z - d ) - this.terrain.sampleHeight( x, z + d ) ).normalize()
		_q.setFromUnitVectors( _up, _n ).multiply( _yaw.setFromAxisAngle( _up, e.yaw ) )

		const fade = Math.max( 0, 1 - lift / 4 ) // longe do chão = sombra some
		const r = e.radius * ( 1 + lift * 0.25 )
		_m.compose( _p.set( x, ground + 0.03, z ), _q, _s.set( r * 2, 1, r * 2 * e.stretch ) )
		this.mesh.setMatrixAt( i, _m )
		this.mesh.instanceMatrix.needsUpdate = true
		this.opacity[ i ] = e.strength * fade
		this.opacityAttr.needsUpdate = true

	}

}
