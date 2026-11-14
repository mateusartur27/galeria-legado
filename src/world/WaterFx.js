import * as THREE from 'three/webgpu'
import { Fn, uv, texture, vec2, vec4, float, color, smoothstep, step, abs, fwidth, length, atan, positionWorld, instancedDynamicBufferAttribute } from 'three/tsl'
import { inkMRT } from '../render/ToonMaterial.js'

// Interação com a água (mar, rio, poça — Terrain.waterAt): anéis que abrem na lâmina (passo, parado, nado, gota caindo),
// respingos (gotinhas brancas balísticas) ao entrar, pular, pousar e correr, e som (Sfx.splash / Sfx.water).
// 2 draw calls (anéis + gotas). Anéis andam com a correnteza do rio.
const RINGS = 40, DROPS = 90

export class WaterFx {

	constructor( { terrain, palette, noiseTexture, sfx = null, falls = [] } ) {

		this.terrain = terrain
		this.sfx = sfx
		this.falls = falls
		const white = color( palette.riverColors?.foam ?? '#f0f8e8' )

		// ---- anéis: quad deitado por anel; idade/força por instância (atualizadas na CPU)
		this.ringAttr = new THREE.InstancedBufferAttribute( new Float32Array( RINGS * 2 ), 2 )
		this.ringAttr.setUsage( THREE.DynamicDrawUsage )
		const ringMat = new THREE.MeshBasicNodeMaterial( { transparent: true, depthWrite: false } )
		ringMat.alphaTest = 0.5
		const rip = instancedDynamicBufferAttribute( this.ringAttr, 'vec2' )
		ringMat.colorNode = vec4( white, 1 )
		ringMat.opacityNode = Fn( () => {

			const q = uv().sub( 0.5 ).mul( 2 )
			const r = length( q )
			const age = rip.x, seed = rip.y
			const R = float( 1 ).sub( float( 1 ).sub( age ).pow( 2 ) ) // abre rápido e desacelera
			const th = float( 0.07 ).mul( float( 1 ).sub( age ) ).add( 0.025 )
			const aa = fwidth( r ).max( 1e-4 )
			const ring = float( 1 ).sub( smoothstep( th.sub( aa ), th.add( aa ), abs( r.sub( R ) ) ) )
			// segundo anel por dentro, mais fino
			const ring2 = float( 1 ).sub( smoothstep( th.mul( 0.5 ).sub( aa ), th.mul( 0.5 ).add( aa ), abs( r.sub( R.mul( 0.55 ) ) ) ) ).mul( step( 0.15, age ) )
			// quebra o traço pelo ângulo (cada anel com seu pedaço do ruído) e falha mais quando velho
			const ang = atan( q.y, q.x ).div( Math.PI * 2 )
			const brk = texture( noiseTexture, vec2( ang.mul( 3 ).add( seed ), seed.mul( 3.7 ).add( age.mul( 0.2 ) ) ) ).r
			const keep = step( age.mul( 0.45 ).add( 0.25 ), brk )
			// só sobre a água: onde o chão (heightTexture) passa da lâmina, o anel some (não sobe na margem)
			const ground = texture( terrain.heightTexture, terrain.worldToUV( positionWorld.xz ) ).r
			const wet = step( ground, positionWorld.y.sub( 0.06 ) )
			return ring.max( ring2 ).mul( keep ).mul( step( age, 0.999 ) ).mul( wet )

		} )()
		ringMat.mrtNode = inkMRT( 0 )
		this.rings = new THREE.InstancedMesh( new THREE.PlaneGeometry( 2, 2 ).rotateX( - Math.PI / 2 ), ringMat, RINGS )
		this.rings.frustumCulled = false
		this.rings.renderOrder = 3 // depois do mar (transparente)
		this.ringData = Array.from( { length: RINGS }, () => ( { life: 0, age: 1, x: 0, y: 0, z: 0, size: 1, vx: 0, vz: 0, seed: Math.random() * 10 } ) )
		this.ringNext = 0

		// ---- gotas
		const dropMat = new THREE.MeshBasicNodeMaterial()
		dropMat.colorNode = vec4( white, 1 )
		dropMat.mrtNode = inkMRT( 0 )
		this.drops = new THREE.InstancedMesh( new THREE.IcosahedronGeometry( 1, 1 ), dropMat, DROPS )
		this.drops.frustumCulled = false
		this.dropData = Array.from( { length: DROPS }, () => ( { alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.05, floor: 0 } ) )
		this.dropNext = 0

		this.group = new THREE.Group()
		this.group.add( this.rings, this.drops )
		this._m = new THREE.Matrix4()
		this.prevIn = false
		this.prevVy = 0
		this.stepTimer = 0
		this.idleTimer = 0
		this.depth = 0
		for ( let i = 0; i < RINGS; i ++ ) this.writeRing( i )
		for ( let i = 0; i < DROPS; i ++ ) this.writeDrop( i )

	}

	ring( x, y, z, size = 1, life = 1.2, flow = null ) {

		const r = this.ringData[ this.ringNext ]
		this.ringNext = ( this.ringNext + 1 ) % RINGS
		Object.assign( r, { x, y: y + 0.03, z, size, life, age: 0, vx: flow ? flow[ 0 ] * 0.7 : 0, vz: flow ? flow[ 1 ] * 0.7 : 0, seed: Math.random() * 10 } )

	}

	splash( x, y, z, power = 1, count = 14, flow = null ) {

		for ( let k = 0; k < count; k ++ ) {

			const d = this.dropData[ this.dropNext ]
			this.dropNext = ( this.dropNext + 1 ) % DROPS
			const a = Math.random() * Math.PI * 2, h = ( 0.6 + Math.random() * 1.6 ) * power
			const r = 0.2 + Math.random() * 0.35
			Object.assign( d, { alive: true, x: x + Math.cos( a ) * r, y: y + 0.05, z: z + Math.sin( a ) * r, vx: Math.cos( a ) * h * 0.9 + ( flow?.[ 0 ] ?? 0 ) * 0.3, vz: Math.sin( a ) * h * 0.9 + ( flow?.[ 1 ] ?? 0 ) * 0.3, vy: 2.2 + Math.random() * 3.2 * power, s: 0.06 + Math.random() * 0.07 * Math.min( 1.6, power ), floor: y } )

		}
		this.ring( x, y, z, 0.5 + power * 0.4, 1.0, flow )
		this.ring( x, y, z, 0.3 + power * 0.2, 0.7, flow )

	}

	// player: Player (renderPosition, velocity, swimming) · chamado por frame
	update( dt, player, camera ) {

		const p = player.renderPosition
		const w = this.terrain.waterAt( p.x, p.z )
		const ground = this.terrain.sampleHeight( p.x, p.z )
		const has = ground < w.y - 0.02 // tem água aqui
		const depth = has ? w.y - p.y : - 1 // > 0: pés abaixo da lâmina
		const inWater = depth > 0.02
		const v = player.velocity
		const hs = Math.hypot( v.x, v.z )
		this.depth = inWater ? depth : 0

		// entrar caindo / pular de dentro
		if ( inWater && ! this.prevIn && this.prevVy < - 3 ) {

			const power = Math.min( 2, - this.prevVy / 7 )
			this.splash( p.x, w.y, p.z, power, Math.round( 10 + power * 10 ), w.flow )
			this.sfx?.splash( power )

		} else if ( ! inWater && this.prevIn && v.y > 3 && has ) {

			this.splash( p.x, w.y, p.z, 0.7, 10, w.flow )
			this.sfx?.splash( 0.6 )

		}
		// andando / nadando: anel a cada passo (atrás do corpo) + gotas ao correr; parado: anel calmo de vez em quando
		if ( inWater ) {

			const swim = player.swimming
			this.stepTimer -= dt
			if ( hs > 0.6 && this.stepTimer <= 0 ) {

				this.stepTimer = swim ? 0.42 : Math.max( 0.16, 0.5 - hs * 0.045 )
				const bx = p.x - v.x / hs * 0.35, bz = p.z - v.z / hs * 0.35
				this.ring( bx, w.y, bz, swim ? 0.85 : 0.42 + hs * 0.04, swim ? 1.3 : 0.9, w.flow )
				if ( hs > 5 && depth < 0.9 ) this.splash( p.x, w.y, p.z, 0.35, 4, w.flow ) // corrida: espirra
				this.sfx?.wade( Math.min( 1, hs / 8 ), swim )

			}
			this.idleTimer -= dt
			if ( hs <= 0.6 && this.idleTimer <= 0 ) {

				this.idleTimer = swim ? 0.9 : 1.4
				this.ring( p.x, w.y, p.z, swim ? 0.7 : 0.5, 1.6 )

			}

		}
		this.prevIn = inWater
		this.prevVy = v.y

		// ---- simula anéis
		for ( let i = 0; i < RINGS; i ++ ) {

			const r = this.ringData[ i ]
			if ( r.age >= 1 ) continue
			r.age = Math.min( 1, r.age + dt / r.life )
			r.x += r.vx * dt
			r.z += r.vz * dt
			this.writeRing( i )

		}
		this.ringAttr.needsUpdate = true
		this.rings.instanceMatrix.needsUpdate = true

		// ---- simula gotas: caem na lâmina → anelzinho
		for ( let i = 0; i < DROPS; i ++ ) {

			const d = this.dropData[ i ]
			if ( ! d.alive ) continue
			d.vy -= 18 * dt
			d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt
			if ( d.vy < 0 && d.y < d.floor ) {

				d.alive = false
				if ( Math.random() < 0.35 ) this.ring( d.x, d.floor, d.z, 0.25 + d.s * 3, 0.6 )

			}
			this.writeDrop( i )

		}
		this.drops.instanceMatrix.needsUpdate = true

		// ---- som ambiente: cachoeira (mais perto = mais alto), rio correndo, ondas do mar
		if ( this.sfx?.ctx ) {

			// alcance CURTO e queda forte (quadrática): longe da água, silêncio — é para chegar perto e ouvir, não um chiado
			// constante no mapa todo (antes: 45 m / 22 m e o mar contava por altura do chão → tocava na ilha inteira)
			const near = ( d, r ) => { const k = 1 - Math.min( 1, Math.max( 0, d ) / r ); return k * k }
			let fall = 0
			for ( const f of this.falls ) fall = Math.max( fall, f.power * near( Math.hypot( f.x - p.x, f.z - p.z ), 24 ) )
			const river = near( this.terrain.riverDistance( p.x, p.z ), 9 )
			// mar: distância até a água de verdade, sondando anéis em volta (a cada 0,3 s)
			this.seaTimer = ( this.seaTimer ?? 0 ) - dt
			if ( this.seaTimer <= 0 ) {

				this.seaTimer = 0.3
				this.seaDist = Infinity
				const lvl = this.terrain.waterLevel - 0.3
				if ( ground < lvl ) this.seaDist = 0
				else for ( const r of [ 3, 6, 10, 15 ] ) {

					for ( let a = 0; a < 8 && this.seaDist === Infinity; a ++ ) if ( this.terrain.sampleHeight( p.x + Math.cos( a * 0.785 ) * r, p.z + Math.sin( a * 0.785 ) * r ) < lvl ) this.seaDist = r
					if ( this.seaDist < Infinity ) break

				}

			}
			this.sfx.water( fall, river, near( this.seaDist, 16 ) )

		}

	}

	writeRing( i ) {

		const r = this.ringData[ i ]
		const s = r.age < 1 ? r.size : 0
		this._m.makeScale( s, 1, s ).setPosition( r.x, r.y, r.z )
		this.rings.setMatrixAt( i, this._m )
		this.ringAttr.setXY( i, r.age, r.seed )

	}

	writeDrop( i ) {

		const d = this.dropData[ i ]
		const s = d.alive ? d.s : 0
		this._m.makeScale( s, s * 1.4, s ).setPosition( d.x, d.y, d.z )
		this.drops.setMatrixAt( i, this._m )

	}

}
