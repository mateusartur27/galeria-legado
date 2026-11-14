import * as THREE from 'three/webgpu'
import { color } from 'three/tsl'
import { createToonMaterial } from '../render/ToonMaterial.js'
import { damp, dampAngle, clamp } from '../core/utils.js'

const RADIUS = 0.5
const MAX_SPEED = 22, REVERSE = 8, ACCEL = 5.5, TURN = 2.4
const _up = new THREE.Vector3( 0, 1, 0 ), _f = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion()

/**
 * Carro arcade (padrão Kenney / Starter Kit Racing, também Horizon Drive): o corpo físico é uma ESFERA que rola;
 * o input vira velocidade angular da esfera (ω = (cima × frente) · v / r). O modelo visual só segue a posição,
 * tem yaw próprio e inclina (pitch na aceleração, roll na curva). Simples, estável e gostoso de dirigir.
 * F perto do carro = entrar/sair. Lanternas e faróis emissivos (bloom nos estilos com bloom).
 */
export class Car {

	constructor( { look, physics, palette, sfx, position, yaw = 0 } ) {

		this.physics = physics
		this.sfx = sfx
		this.yaw = yaw
		this.speed = 0 // velocidade "de pista" desejada (m/s)
		this.driving = false
		this.renderPosition = new THREE.Vector3().copy( position )
		this.velocity = new THREE.Vector3()
		this.prev = new THREE.Vector3().copy( position )
		this.curr = new THREE.Vector3().copy( position )
		this.spawn = { position: position.clone(), yaw }
		this.pitch = 0
		this.roll = 0
		this.wheelSpin = 0

		const { RAPIER, world } = physics
		this.body = world.createRigidBody( RAPIER.RigidBodyDesc.dynamic()
			.setTranslation( position.x, position.y + RADIUS + 0.3, position.z )
			.setCcdEnabled( true ).setAngularDamping( 2.5 ).setLinearDamping( 0.15 ).setGravityScale( 1.6 ) )
		world.createCollider( RAPIER.ColliderDesc.ball( RADIUS ).setDensity( 900 ).setFriction( 2.5 ).setRestitution( 0 ), this.body )

		this.buildVisual( look, palette )

	}

	buildVisual( look, palette ) {

		const m = ( hex, o = {} ) => createToonMaterial( look, { colorNode: color( hex ), ...o } )
		const paint = m( palette.car ?? '#e8453c', { roughness: 0.35, metalness: 0.2 } )
		const dark = m( '#22232a', { roughness: 0.8 } )
		const glass = m( palette.carGlass ?? '#2c3e57', { roughness: 0.15, metalness: 0.4 } )
		const rim = m( '#c9ccd2', { roughness: 0.4, metalness: 0.7 } )
		const tail = m( '#ff2a3d', { emissiveNode: color( '#ff2a3d' ).mul( 3 ), ink: 0 } )
		const head = m( '#fff6dc', { emissiveNode: color( '#fff2cc' ).mul( 2.5 ), ink: 0 } )

		this.root = new THREE.Group()
		this.body3d = new THREE.Group() // recebe pitch/roll
		this.root.add( this.body3d )
		const box = ( w, h, d, mat, x, y, z ) => { const o = new THREE.Mesh( new THREE.BoxGeometry( w, h, d ), mat ); o.position.set( x, y, z ); this.body3d.add( o ); return o }

		box( 1.5, 0.42, 2.9, paint, 0, 0.55, 0 ) // chassi
		box( 1.2, 0.42, 1.4, glass, 0, 0.97, - 0.15 ) // cabine
		box( 1.24, 0.08, 1.2, paint, 0, 1.2, - 0.15 ) // teto
		box( 1.52, 0.12, 0.3, dark, 0, 0.42, 1.46 ) // para-choque
		box( 1.52, 0.12, 0.3, dark, 0, 0.42, - 1.46 )
		box( 0.34, 0.12, 0.05, tail, - 0.5, 0.62, - 1.46 )
		box( 0.34, 0.12, 0.05, tail, 0.5, 0.62, - 1.46 )
		box( 0.3, 0.12, 0.05, head, - 0.5, 0.62, 1.46 )
		box( 0.3, 0.12, 0.05, head, 0.5, 0.62, 1.46 )
		box( 1.3, 0.06, 0.32, dark, 0, 0.95, - 1.38 ) // aerofólio

		this.wheels = []
		const tire = new THREE.CylinderGeometry( 0.34, 0.34, 0.26, 16 ).rotateZ( Math.PI / 2 )
		const hub = new THREE.CylinderGeometry( 0.18, 0.18, 0.28, 10 ).rotateZ( Math.PI / 2 )
		for ( const [ x, z, front ] of [ [ - 0.78, 0.95, true ], [ 0.78, 0.95, true ], [ - 0.78, - 0.95, false ], [ 0.78, - 0.95, false ] ] ) {

			const steer = new THREE.Group()
			steer.position.set( x, 0.34, z )
			const spin = new THREE.Group()
			spin.add( new THREE.Mesh( tire, dark ), new THREE.Mesh( hub, rim ) )
			steer.add( spin )
			this.root.add( steer )
			this.wheels.push( { steer, spin, front } )

		}

		this.root.traverse( ( o ) => { if ( o.isMesh ) { o.castShadow = true; o.receiveShadow = true } } )
		this.root.position.copy( this.renderPosition )
		this.root.rotation.y = this.yaw

	}

	get position() { return this.renderPosition }

	reset() {

		const s = this.spawn
		this.body.setTranslation( { x: s.position.x, y: s.position.y + RADIUS + 0.5, z: s.position.z }, true )
		this.body.setLinvel( { x: 0, y: 0, z: 0 }, true )
		this.body.setAngvel( { x: 0, y: 0, z: 0 }, true )
		this.yaw = s.yaw
		this.speed = 0

	}

	// 60 Hz. input.moveVector: y = acelerar/ré, x = esterço
	fixedUpdate( dt, input ) {

		const t = this.body.translation()
		this.prev.copy( this.curr )
		const throttle = this.driving ? input.moveVector.y : 0
		const steer = this.driving ? input.moveVector.x : 0

		// velocidade-alvo com aceleração/frenagem
		const target = throttle > 0 ? throttle * MAX_SPEED * ( input.running ? 1.15 : 1 ) : throttle * REVERSE
		const rate = Math.sign( target - this.speed ) === Math.sign( this.speed ) || this.speed === 0 ? ACCEL : ACCEL * 2.2 // frear é mais forte
		this.speed = damp( this.speed, target, throttle === 0 ? 1.2 : rate * 0.25, dt )

		// esterço proporcional à velocidade (parado não gira)
		const lin = this.body.linvel()
		const groundSpeed = Math.hypot( lin.x, lin.z )
		this.velocity.set( lin.x, lin.y, lin.z )
		const grip = clamp( groundSpeed / 6, 0, 1 )
		this.yaw -= steer * TURN * grip * dt * Math.sign( this.speed || 1 )
		this.steer = damp( this.steer ?? 0, steer, 10, dt )

		// ω = (cima × frente) · v / r  → a esfera rola para "frente"
		_f.set( Math.sin( this.yaw ), 0, Math.cos( this.yaw ) )
		_w.crossVectors( _up, _f ).multiplyScalar( this.speed / RADIUS )
		const av = this.body.angvel()
		const k = 1 - Math.exp( - 8 * dt )
		this.body.setAngvel( { x: av.x + ( _w.x - av.x ) * k, y: av.y * ( 1 - k ), z: av.z + ( _w.z - av.z ) * k }, true )

		// derrapagem lateral amortecida (puxa a velocidade para a direção do carro = aderência)
		const forwardSpeed = lin.x * _f.x + lin.z * _f.z
		const side = { x: lin.x - _f.x * forwardSpeed, z: lin.z - _f.z * forwardSpeed }
		this.drift = Math.hypot( side.x, side.z )
		this.body.setLinvel( { x: lin.x - side.x * 0.12, y: lin.y, z: lin.z - side.z * 0.12 }, true )

		this.curr.set( t.x, t.y - RADIUS, t.z )
		if ( t.y < - 6 ) this.reset()

	}

	update( dt, alpha ) {

		this.renderPosition.lerpVectors( this.prev, this.curr, alpha )
		this.root.position.copy( this.renderPosition )
		this.root.rotation.y = dampAngle( this.root.rotation.y, this.yaw, 20, dt )

		// inclinações (juice): nariz levanta acelerando, carroceria deita na curva
		const accel = ( this.speed - ( this._lastSpeed ?? 0 ) ) / Math.max( dt, 1e-3 )
		this._lastSpeed = this.speed
		this.pitch = damp( this.pitch, clamp( - accel * 0.012, - 0.08, 0.08 ), 6, dt )
		this.roll = damp( this.roll, clamp( ( this.steer ?? 0 ) * this.speed * 0.006, - 0.12, 0.12 ), 6, dt )
		this.body3d.rotation.set( this.pitch, 0, this.roll )

		const fwd = this.velocity.x * Math.sin( this.yaw ) + this.velocity.z * Math.cos( this.yaw )
		this.wheelSpin += ( fwd / 0.34 ) * dt
		for ( const w of this.wheels ) {

			w.spin.rotation.x = this.wheelSpin
			if ( w.front ) w.steer.rotation.y = - ( this.steer ?? 0 ) * 0.45

		}

		if ( this.driving ) this.sfx?.engine( Math.abs( fwd ) / MAX_SPEED, Math.abs( this.speed ) > 0.5 ? 1 : 0 )

	}

}
