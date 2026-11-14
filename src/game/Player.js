import * as THREE from 'three/webgpu'
import { color, attribute, positionLocal, sin, step } from 'three/tsl'
import { createToonMaterial } from '../render/ToonMaterial.js'
import { damp, dampAngle, clamp } from '../core/utils.js'

// Personagem com esqueleto (opcional): { gltf, anims, height, headScale } — ver tools/character/build_kid.py.
// Velocidade de referência de cada animação (m/s na escala do modelo) → o passo acompanha o chão (sem "patinar").
const LOCOMOTION = [
	{ name: 'Idle_Loop', max: 0.25, ref: 1 },
	{ name: 'Walk_Loop', max: 2.6, ref: 1.25 },
	{ name: 'Jog_Fwd_Loop', max: 6.2, ref: 3.4 },
	{ name: 'Sprint_Loop', max: Infinity, ref: 5.6 }
]

const WALK = 4.6, RUN = 8.2, ACCEL = 14, AIR_ACCEL = 5, GRAVITY = - 26, JUMP = 9.2
const COYOTE = 0.12, BUFFER = 0.12
const SWIM_DEPTH = 1.05 // água acima disto (dos pés) → nada

// Personagem com controlador cinemático do Rapier (sobe degraus, desliza em parede, gruda no chão)
// + "juice": inclina na direção, quica ao andar, estica no pulo, achata ao pousar. Visual interpolado entre passos de física.
export class Player {

	constructor( { look, palette, physics, spawn, character = null } ) {

		this.physics = physics
		this.velocity = new THREE.Vector3()
		this.grounded = false
		this.coyote = 0
		this.jumpBuffer = 0
		this.facing = 0
		this.walkPhase = 0
		this.squash = 1
		this.prev = new THREE.Vector3().copy( spawn )
		this.curr = new THREE.Vector3().copy( spawn )
		this.renderPosition = new THREE.Vector3().copy( spawn )

		if ( character ) this.buildCharacter( look, character )
		else this.buildVisual( look, palette )
		this.buildPhysics( spawn )

	}

	// Modelo riggado + animações por nome de osso (mesmo esqueleto: Quaternius UBC × UAL)
	// inkNoise (Messenger): traço com falhas por ruído senoidal na posição LOCAL (anda com o corpo, não escorrega como a caneta
	// presa ao mundo) · shadowCut [a, b]: sombra com corte duro em N·L × sombra projetada
	buildCharacter( look, { gltf, anims, height = 1.45, headScale = 1.15, inkNoise = false, shadowCut = null } ) {

		this.root = new THREE.Group()
		this.model = new THREE.Group() // squash/inclinação (como no boneco procedural)
		this.root.add( this.model )
		const rig = gltf.scene
		this.model.add( rig )

		// altura → escala (bounding box da pose de descanso)
		const box = new THREE.Box3().setFromObject( rig )
		const s = height / ( box.max.y - box.min.y )

		let ink = 1
		if ( inkNoise ) {

			// positionLocal (depois do skinning) × escala = metros no corpo; soma de senos ≈ ruído suave, ~25% do traço falha
			const p = positionLocal.mul( s * 9 )
			const n = sin( p.x.add( sin( p.y.mul( 0.7 ).add( p.z ) ).mul( 1.8 ) ) ).mul( sin( p.y.mul( 1.3 ).sub( p.z.mul( 0.8 ) ).add( sin( p.x.mul( 0.6 ) ).mul( 1.5 ) ) ) )
			ink = step( - 0.3, n.add( sin( p.z.mul( 1.7 ).add( p.y ) ).mul( 0.35 ) ) )

		}

		// sem brilho chapado: na calça preta ele vira mancha cinza (o Messenger usa material próprio no personagem)
		const material = createToonMaterial( look, { colorNode: attribute( 'color' ), hatch: false, specular: false, ink, pen: ! inkNoise, shadowCut } )
		rig.traverse( ( o ) => {

			if ( o.isMesh ) { o.material = material; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false }

		} )

		rig.scale.setScalar( s )
		rig.position.y = - box.min.y * s
		this.animScale = s

		this.headBone = rig.getObjectByName( 'Head' )
		this.headScale = headScale

		// clipes: só rotações + posição do quadril (reescalada para o corpo deste modelo); escala por osso nunca
		const pelvis = rig.getObjectByName( 'pelvis' )
		this.mixer = new THREE.AnimationMixer( rig )
		this.actions = {}
		for ( const clip of anims.animations ) {

			clip.tracks = clip.tracks.filter( ( t ) => ( t.name.endsWith( '.quaternion' ) || t.name === 'pelvis.position' ) && rig.getObjectByName( t.name.split( '.' )[ 0 ] ) )
			const hip = clip.tracks.find( ( t ) => t.name === 'pelvis.position' )
			if ( hip && pelvis ) {

				const first = new THREE.Vector3().fromArray( hip.values, 0 )
				const k = pelvis.position.length() / Math.max( first.length(), 1e-6 )
				for ( let i = 0; i < hip.values.length; i ++ ) hip.values[ i ] *= k

			}

			const action = this.mixer.clipAction( clip )
			if ( clip.name.startsWith( 'Jump_Start' ) || clip.name.startsWith( 'Jump_Land' ) ) {

				action.setLoop( THREE.LoopOnce )
				action.clampWhenFinished = true

			}

			this.actions[ clip.name ] = action

		}

		this.current = null
		this.landTimer = 0
		this.play( 'Idle_Loop', 0 )

	}

	play( name, fade = 0.2 ) {

		const next = this.actions[ name ]
		if ( ! next || this.current === next ) return
		next.reset().setEffectiveWeight( 1 ).fadeIn( fade ).play()
		if ( this.current ) this.current.fadeOut( fade )
		this.current = next

	}

	updateCharacter( dt, hSpeed ) {

		if ( this.jumped ) { this.play( 'Jump_Start', 0.08 ); this.jumped = false; this.landTimer = 0 }
		else if ( this.swimming ) {

			// sem clipe de nado: o passo lento parece "pedalar" a água; o corpo deita um pouco ao avançar (update)
			this.play( 'Walk_Loop', 0.3 )
			this.current.timeScale = 0.55 + Math.min( 0.5, hSpeed / this.animScale * 0.12 )
			this.landed = false

		} else if ( ! this.grounded ) {

			if ( this.current !== this.actions.Jump_Start || ! this.current.isRunning() ) this.play( 'Jump_Loop', 0.15 )

		} else if ( this.landed ) { this.play( 'Jump_Land', 0.06 ); this.landed = false; this.landTimer = 0.22 }
		else if ( ( this.landTimer -= dt ) <= 0 ) {

			// locomoção pela velocidade; o ritmo do passo acompanha a velocidade real
			const speed = hSpeed / this.animScale
			const state = LOCOMOTION.find( ( l ) => speed < l.max )
			this.play( state.name, 0.25 )
			this.current.timeScale = state.name === 'Idle_Loop' ? 1 : clamp( speed / state.ref, 0.6, 1.6 )

		}

		this.mixer.update( dt )
		if ( this.headBone ) this.headBone.scale.setScalar( this.headScale ) // cabeça maior = proporção de desenho

	}

	buildVisual( look, palette ) {

		const mat = ( hex, opts = {} ) => createToonMaterial( look, { colorNode: color( hex ), hatch: false, ...opts } ) // personagem limpo (Messenger): hachura só no cenário
		// palette.playerGlow (synthwave): roupa e chapéu emissivos (HDR > 1 → bloom)
		const glow = palette.playerGlow
		const body = mat( palette.player, glow ? { emissiveNode: color( glow ).mul( 0.35 ) } : {} )
		const hat = mat( palette.hat, glow ? { emissiveNode: color( palette.hat ).mul( 2.2 ) } : {} )
		const skin = mat( palette.playerSkin ), dark = mat( '#2b2b33', { ink: 0 } )

		this.root = new THREE.Group()
		this.model = new THREE.Group() // recebe squash/inclinação
		this.root.add( this.model )

		const torso = new THREE.Mesh( new THREE.CapsuleGeometry( 0.34, 0.42, 6, 16 ), body )
		torso.position.y = 0.72
		const head = new THREE.Mesh( new THREE.SphereGeometry( 0.31, 24, 16 ), skin )
		head.position.y = 1.38
		const brim = new THREE.Mesh( new THREE.CylinderGeometry( 0.56, 0.56, 0.05, 28 ), hat )
		brim.position.y = 1.56
		const crown = new THREE.Mesh( new THREE.CylinderGeometry( 0.24, 0.3, 0.24, 20 ), hat )
		crown.position.y = 1.7
		const eyeGeo = new THREE.SphereGeometry( 0.045, 10, 8 )
		const eyeL = new THREE.Mesh( eyeGeo, dark ), eyeR = new THREE.Mesh( eyeGeo, dark )
		eyeL.position.set( - 0.11, 1.4, 0.27 )
		eyeR.position.set( 0.11, 1.4, 0.27 )

		const footGeo = new THREE.SphereGeometry( 0.13, 12, 8 ).scale( 1, 0.7, 1.4 )
		this.footL = new THREE.Mesh( footGeo, dark )
		this.footR = new THREE.Mesh( footGeo, dark )
		this.footL.position.set( - 0.16, 0.08, 0 )
		this.footR.position.set( 0.16, 0.08, 0 )

		const armGeo = new THREE.CapsuleGeometry( 0.08, 0.3, 4, 8 ).translate( 0, - 0.2, 0 )
		this.armL = new THREE.Mesh( armGeo, skin )
		this.armR = new THREE.Mesh( armGeo, skin )
		this.armL.position.set( - 0.42, 0.95, 0 )
		this.armR.position.set( 0.42, 0.95, 0 )

		this.model.add( torso, head, brim, crown, eyeL, eyeR, this.footL, this.footR, this.armL, this.armR )
		this.model.traverse( ( o ) => { if ( o.isMesh ) { o.castShadow = true; o.receiveShadow = true } } )

	}

	buildPhysics( spawn ) {

		const { RAPIER, world } = this.physics
		this.halfHeight = 0.42
		this.radius = 0.34
		this.body = world.createRigidBody( RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation( spawn.x, spawn.y + 0.8, spawn.z ) )
		this.collider = world.createCollider( RAPIER.ColliderDesc.capsule( this.halfHeight, this.radius ), this.body )
		this.controller = world.createCharacterController( 0.02 )
		this.controller.setMaxSlopeClimbAngle( THREE.MathUtils.degToRad( 52 ) )
		this.controller.setMinSlopeSlideAngle( THREE.MathUtils.degToRad( 58 ) )
		this.controller.enableAutostep( 0.45, 0.2, false )
		this.controller.enableSnapToGround( 0.35 )
		this.controller.setSlideEnabled( true )
		const t = this.body.translation()
		this.curr.set( t.x, t.y - this.halfHeight - this.radius, t.z )
		this.prev.copy( this.curr )

	}

	// Move instantaneamente (respawn, portais, debug: window.__game.player.teleport(x, y, z)) — pés na posição dada.
	teleport( x, y, z ) {

		this.body.setTranslation( { x, y: y + this.halfHeight + this.radius, z }, true )
		this.velocity.set( 0, 0, 0 )
		this.curr.set( x, y, z )
		this.prev.copy( this.curr )
		this.renderPosition.copy( this.curr )

	}

	// false = "guardado" (dentro de veículo, cutscene): sem colisão e invisível
	setActive( active ) {

		this.collider.setEnabled( active )
		this.root.visible = active
		this.velocity.set( 0, 0, 0 )

	}

	// chamado a 60 Hz
	fixedUpdate( dt, input, camBasis ) {

		const move = input.moveVector
		const target = new THREE.Vector3()
			.addScaledVector( camBasis.forward, move.y )
			.addScaledVector( camBasis.right, move.x )
		// água (this.waterAt = Terrain.waterAt): fundo segura o passo; acima de SWIM_DEPTH flutua e nada; correnteza empurra
		const w = this.waterAt ? this.waterAt( this.curr.x, this.curr.z ) : null
		const wet = w && this.waterGround( this.curr.x, this.curr.z ) < w.y - 0.02 ? w.y - this.curr.y : 0
		this.swimming = wet > SWIM_DEPTH
		const drag = 1 - 0.45 * clamp( wet / 0.9, 0, 1 )
		const speed = ( input.running ? RUN : WALK ) * ( this.swimming ? 0.55 : drag )
		target.multiplyScalar( speed )
		if ( w?.flow && wet > 0.15 ) target.x += w.flow[ 0 ] * Math.min( 1, wet ), target.z += w.flow[ 1 ] * Math.min( 1, wet )

		const accel = this.grounded ? ACCEL : this.swimming ? ACCEL * 0.35 : AIR_ACCEL
		this.velocity.x = damp( this.velocity.x, target.x, accel, dt )
		this.velocity.z = damp( this.velocity.z, target.z, accel, dt )

		this.coyote = this.grounded || this.swimming ? COYOTE : Math.max( 0, this.coyote - dt )
		this.jumpBuffer = input.jump ? BUFFER : Math.max( 0, this.jumpBuffer - dt )
		input.jump = false

		if ( this.jumpBuffer > 0 && this.coyote > 0 ) {

			this.velocity.y = JUMP
			this.jumpBuffer = 0
			this.coyote = 0
			this.squash = this.mixer ? 1.08 : 1.25 // com animação de verdade, o exagero vem da pose
			this.jumped = true

		}

		if ( this.swimming && this.velocity.y < JUMP * 0.5 ) {

			// boia: os pés ficam SWIM_DEPTH abaixo da lâmina (ombros de fora), balançando de leve
			this.swimTime = ( this.swimTime ?? 0 ) + dt
			const goal = w.y - SWIM_DEPTH + Math.sin( this.swimTime * 2.4 ) * 0.05
			this.velocity.y = damp( this.velocity.y, ( goal - this.curr.y ) * 5, 10, dt )

		} else this.velocity.y += GRAVITY * dt * ( wet > 0.3 ? 0.7 : 1 )
		if ( this.grounded && this.velocity.y < 0 ) this.velocity.y = - 2

		const desired = { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt }
		this.controller.computeColliderMovement( this.collider, desired )
		const m = this.controller.computedMovement()
		const wasGrounded = this.grounded
		this.grounded = this.controller.computedGrounded()
		if ( this.grounded && ! wasGrounded && this.velocity.y < - 6 ) { this.squash = this.mixer ? 0.9 : 0.72; this.landed = true }
		if ( this.grounded && this.velocity.y < 0 ) this.velocity.y = 0
		if ( this.velocity.y > 0 && m.y < desired.y - 1e-4 ) this.velocity.y = 0 // bateu a cabeça

		const t = this.body.translation()
		// limite do mundo (nadando para o horizonte): volta devagar para dentro
		if ( this.bounds ) {

			const r = Math.hypot( t.x + m.x, t.z + m.z )
			if ( r > this.bounds ) { const k = this.bounds / r; m.x = ( t.x + m.x ) * k - t.x; m.z = ( t.z + m.z ) * k - t.z }

		}
		this.body.setNextKinematicTranslation( { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z } )

		this.prev.copy( this.curr )
		this.curr.set( t.x + m.x, t.y + m.y - this.halfHeight - this.radius, t.z + m.z )

		// caiu do mundo → volta ao início
		if ( this.curr.y < - 20 ) this.teleport( 0, 6, 0 )

	}

	// chamado por frame (visual)
	update( dt, alpha ) {

		this.renderPosition.lerpVectors( this.prev, this.curr, alpha )
		this.root.position.copy( this.renderPosition )

		const hSpeed = Math.hypot( this.velocity.x, this.velocity.z )
		if ( hSpeed > 0.3 ) this.facing = dampAngle( this.facing, Math.atan2( this.velocity.x, this.velocity.z ), 14, dt )
		this.root.rotation.y = this.facing

		const k = clamp( hSpeed / RUN, 0, 1 )

		if ( this.mixer ) {

			this.updateCharacter( dt, hSpeed )
			this.squash = damp( this.squash, 1, 10, dt )
			this.model.scale.set( 1 / Math.sqrt( this.squash ), this.squash, 1 / Math.sqrt( this.squash ) )
			this.model.rotation.x = damp( this.model.rotation.x, this.swimming ? 0.15 + k * 0.45 : k * 0.08, 8, dt ) // a corrida já inclina o corpo; nadando deita
			return

		}

		this.walkPhase += dt * ( 4 + hSpeed * 2.2 ) * ( this.grounded ? 1 : 0.2 )
		const s = Math.sin( this.walkPhase ), c = Math.cos( this.walkPhase )
		const stride = this.grounded ? clamp( hSpeed / WALK, 0, 1.4 ) : 0.4

		this.footL.position.z = s * 0.22 * stride
		this.footR.position.z = - s * 0.22 * stride
		this.footL.position.y = 0.08 + Math.max( 0, c ) * 0.12 * stride
		this.footR.position.y = 0.08 + Math.max( 0, - c ) * 0.12 * stride
		this.armL.rotation.x = - s * 0.7 * stride
		this.armR.rotation.x = s * 0.7 * stride
		const airArms = this.grounded ? 0 : 0.9
		this.armL.rotation.z = damp( this.armL.rotation.z, - airArms, 10, dt )
		this.armR.rotation.z = damp( this.armR.rotation.z, airArms, 10, dt )

		this.squash = damp( this.squash, 1, 10, dt )
		const bob = this.grounded ? Math.abs( s ) * 0.06 * stride : 0
		this.model.position.y = bob
		this.model.scale.set( 1 / Math.sqrt( this.squash ), this.squash, 1 / Math.sqrt( this.squash ) )
		this.model.rotation.x = damp( this.model.rotation.x, k * 0.22, 8, dt )

	}

}
