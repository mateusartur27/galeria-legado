import * as THREE from 'three/webgpu'
import { damp, dampAngle, clamp } from '../core/utils.js'

const _dir = new THREE.Vector3()

// Câmera terceira pessoa "diorama": FOV baixo, órbita amortecida, look-ahead pela velocidade.
// Colisão: raio (Rapier) do foco até a câmera contra o TERRENO → encosta/paredão nunca fica entre câmera e jogador.
// (Árvores/pedras não puxam a câmera: elas somem por dither — look.fadeMask.)
// config (preset.camera): yaw/pitch/distance iniciais · fixed = isométrica travada (Kenney, Bruno 2019; só zoom) · lead = antecipação
// shake(força): tremor por ruído suave (trauma²), decai sozinho — impactos, explosões, aterrissagens.
export class CameraRig {

	constructor( camera, terrain, physics = null, config = {} ) {

		this.camera = camera
		this.terrain = terrain
		this.physics = physics
		this.fixed = config.fixed ?? false
		this.lead = config.lead ?? 0.18
		this.trauma = 0
		this.yaw = config.yaw ?? Math.PI * 0.25
		this.pitch = config.pitch ?? 0.38
		this.distance = config.distance ?? 12
		this.height = config.height ?? 1.3 // altura do ponto que a câmera olha (acima do pé do jogador)
		this.minPitch = Math.min( 0.12, this.pitch - 0.06 )
		this.targetYaw = this.yaw
		this.targetPitch = this.pitch
		this.targetDistance = this.distance
		this.collisionDistance = this.distance
		this.focus = new THREE.Vector3()
		this.initialized = false
		this._desired = new THREE.Vector3()

		if ( physics ) {

			this.ray = new physics.RAPIER.Ray( { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 } )
			// config.collideAll: encosta em TUDO que é sólido (prédio, pedra, tronco), menos o jogador (ignore) — para estilos sem o
			// círculo de "ver através". Senão só o terreno puxa a câmera
			this.ignore = null
			this.onlyTerrain = config.collideAll
				? ( collider ) => collider !== this.ignore && ! collider.isSensor()
				: ( collider ) => collider === terrain.collider

		}

	}

	update( dt, look, playerPos, playerVel ) {

		if ( ! this.fixed ) {

			this.targetYaw -= look.x * 0.0045
			this.targetPitch = clamp( this.targetPitch + look.y * 0.003, this.minPitch, 1.25 )

		}

		this.targetDistance = clamp( this.targetDistance + look.zoom * 1.2, 3.5, 30 )

		this.yaw = dampAngle( this.yaw, this.targetYaw, 12, dt )
		this.pitch = damp( this.pitch, this.targetPitch, 12, dt )
		this.distance = damp( this.distance, this.targetDistance, 8, dt )

		this._desired.set( playerPos.x + playerVel.x * this.lead, playerPos.y + this.height, playerPos.z + playerVel.z * this.lead )
		if ( ! this.initialized ) { this.focus.copy( this._desired ); this.initialized = true }
		this.focus.x = damp( this.focus.x, this._desired.x, 7, dt )
		this.focus.y = damp( this.focus.y, this._desired.y, 5, dt )
		this.focus.z = damp( this.focus.z, this._desired.z, 7, dt )

		const cp = Math.cos( this.pitch )
		_dir.set( Math.sin( this.yaw ) * cp, Math.sin( this.pitch ), Math.cos( this.yaw ) * cp ) // unitário

		// distância livre até o terreno: encolhe na hora (não atravessa), volta devagar (sem "pulos")
		let free = this.distance
		if ( this.physics && this.terrain.collider ) {

			this.ray.origin = this.focus
			this.ray.dir = _dir
			const hit = this.physics.world.castRay( this.ray, this.distance, true, undefined, undefined, undefined, undefined, this.onlyTerrain )
			if ( hit ) free = Math.max( hit.timeOfImpact - 0.6, 1.5 )

		}

		this.collisionDistance = free < this.collisionDistance ? free : damp( this.collisionDistance, free, 3, dt )

		const cam = this.camera
		cam.position.copy( this.focus ).addScaledVector( _dir, this.collisionDistance )
		const ground = this.terrain.sampleHeight( cam.position.x, cam.position.z ) + 0.8
		if ( cam.position.y < ground ) cam.position.y = ground
		cam.lookAt( this.focus )

		if ( this.trauma > 0 ) {

			// ruído suave (somas de senos defasados), não random puro → treme sem "teleportar"
			const t = performance.now() * 0.001, s = this.trauma * Math.sqrt( this.trauma )
			cam.rotateX( ( Math.sin( t * 37 ) + Math.sin( t * 23 + 1.7 ) ) * 0.03 * s )
			cam.rotateY( ( Math.sin( t * 31 + 4.1 ) + Math.sin( t * 19 ) ) * 0.03 * s )
			cam.rotateZ( Math.sin( t * 29 + 2.3 ) * 0.04 * s )
			this.trauma = Math.max( 0, this.trauma - dt * 2.2 )

		}

	}

	// câmera de perseguição (veículos): puxa o yaw para trás do alvo; arrastar ainda funciona (é corrigido aos poucos)
	chase( headingYaw, dt, strength = 2.5 ) {

		if ( this.fixed ) return
		this.targetYaw = dampAngle( this.targetYaw, headingYaw + Math.PI, strength, dt )

	}

	shake( amount = 0.3 ) {

		this.trauma = Math.min( 1, this.trauma + amount )

	}

	// direções no chão relativas à câmera (para mover o jogador)
	basis() {

		return {
			forward: new THREE.Vector3( - Math.sin( this.yaw ), 0, - Math.cos( this.yaw ) ),
			right: new THREE.Vector3( Math.cos( this.yaw ), 0, - Math.sin( this.yaw ) )
		}

	}

}
