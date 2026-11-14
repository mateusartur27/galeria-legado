import * as THREE from 'three/webgpu'
import { Fn, attribute, texture, vec2, vec3, float, mix, smoothstep, fract, atan, length, color, PI, normalMap, uv } from 'three/tsl'
import { createToonMaterial } from '../render/ToonMaterial.js'
import { createNoise2D, rng, clamp } from '../core/utils.js'

// Estação de rachar lenha (Firewood Splitting Simulator / screen.toys), funciona em TODOS os estilos.
// - Tronco = "cunha" paramétrica (ângulo a0..a1, raio, altura). Rachar = dividir o ângulo em dois → as metades se encaixam
//   perfeitamente (a face rachada é deslocada pelo MESMO ruído dos dois lados) e racham de novo em quartos, oitavos…
// - Cada pedaço é um corpo dinâmico do Rapier (casco convexo) → cai, rola e empilha em volta do toco.
// - Madeira 100% procedural no espaço do tronco (atributo aWood): casca com sulcos, anéis no topo, fibras na face rachada,
//   + relevo (bump) exagerado → aspecto "tátil".
// - Juice: machado com antecipação, câmera treme, lascas voando, som sintetizado (Sfx.js).
// Controles: E ou clique (sem arrastar) perto do toco.

const LOG_R = 0.27, LOG_H = 0.62
const STUMP_R = 0.5, STUMP_H = 0.55
const REACH = 2.4
const MAX_PIECES = 40
const TAU = Math.PI * 2
const END_UV = 0.42 // raio do tronco → 0,42 da foto do corte (TreeEnd: o disco ocupa ~90% da imagem)

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler()

export class Firewood {

	// Assets externos (opcionais): stump = { object, radius, height } (ex.: toco escaneado do Poly Haven, base na origem),
	// axe = Object3D (cabo ao longo de +Z a partir da mão, lâmina ~0.86 m à frente), bark = { map, normalMap, armMap } (casca tileável),
	// endGrain = { map, normalMap, roughnessMap, aoMap } (FOTO de um corte de tronco, ex.: ambientCG TreeEnd003),
	// splitWood = { map, normalMap, roughnessMap } (madeira crua com fibra vertical, ex.: ambientCG Wood096) — como o Firewood original.
	constructor( { look, terrain, physics, noiseTexture, sfx, rig, player, position = new THREE.Vector3( 1.5, 0, - 3.8 ), blobShadows = null, stump: stumpAsset = null, axe: axeAsset = null, bark = null, endGrain = null, splitWood = null } ) {

		this.look = look
		this.terrain = terrain
		this.physics = physics
		this.sfx = sfx
		this.rig = rig
		this.player = player
		this.random = rng( 5 )
		this.splitNoise = createNoise2D( rng( 9 ) )
		this.pieces = []
		this.group = new THREE.Group()
		this.materials = createWoodMaterials( look, noiseTexture, bark, endGrain, splitWood )

		// ---------- toco (estático)
		const ground = Math.min(
			terrain.sampleHeight( position.x, position.z ),
			terrain.sampleHeight( position.x + STUMP_R, position.z ), terrain.sampleHeight( position.x - STUMP_R, position.z ),
			terrain.sampleHeight( position.x, position.z + STUMP_R ), terrain.sampleHeight( position.x, position.z - STUMP_R )
		)
		const stumpR = stumpAsset?.radius ?? STUMP_R, stumpH = stumpAsset?.height ?? STUMP_H
		this.stumpR = stumpR
		this.center = new THREE.Vector3( position.x, ground - ( stumpAsset ? 0 : 0.12 ), position.z ) // procedural: base levemente enterrada
		this.top = this.center.y + stumpH
		const stump = stumpAsset ? stumpAsset.object : new THREE.Mesh( buildPieceGeometry( 0, TAU, STUMP_R, STUMP_H, this.splitNoise, 23 ).geometry, this.materials )
		if ( stumpAsset ) stump.position.copy( this.center )
		else stump.position.set( this.center.x, this.center.y + STUMP_H / 2, this.center.z )
		stump.traverse( ( o ) => { if ( o.isMesh ) o.castShadow = o.receiveShadow = true } )
		this.group.add( stump )
		const { RAPIER, world } = physics
		const fixed = world.createRigidBody( RAPIER.RigidBodyDesc.fixed().setTranslation( this.center.x, this.center.y + stumpH / 2, this.center.z ) )
		world.createCollider( RAPIER.ColliderDesc.cylinder( stumpH / 2, stumpR ).setFriction( 0.9 ), fixed )
		blobShadows?.add( { x: this.center.x, y: this.center.y, z: this.center.z, radius: stumpR * 1.5, height: 0.3 } )

		// ---------- machado (pivô = mão; cabo ao longo de +Z; cabeça na ponta)
		this.axe = new THREE.Group()
		this.swingNode = new THREE.Group()
		this.axe.add( this.swingNode )
		const handleMat = createToonMaterial( look, { colorNode: color( '#b07a4a' ), roughness: 0.6 } )
		const metalMat = createToonMaterial( look, { colorNode: color( '#a9b2bb' ), roughness: 0.3, metalness: 0.9 } )
		const paintMat = createToonMaterial( look, { colorNode: color( '#ff6a1a' ), roughness: 0.45 } )
		const handle = new THREE.Mesh( new THREE.CylinderGeometry( 0.025, 0.032, 0.9, 8 ).rotateX( Math.PI / 2 ).translate( 0, 0, 0.42 ), handleMat )
		const blade = new THREE.Mesh( new THREE.BoxGeometry( 0.035, 0.2, 0.12 ).translate( 0, - 0.06, 0.86 ), metalMat )
		const back = new THREE.Mesh( new THREE.BoxGeometry( 0.06, 0.09, 0.1 ).translate( 0, 0.05, 0.86 ), paintMat )
		if ( axeAsset ) this.swingNode.add( axeAsset )
		else this.swingNode.add( handle, blade, back )
		this.axe.traverse( ( o ) => { if ( o.isMesh ) o.castShadow = true } )
		this.axe.visible = false
		this.group.add( this.axe )
		this.swing = null

		// ---------- lascas (instanced, física simples na CPU)
		const chipGeo = new THREE.BoxGeometry( 0.05, 0.012, 0.03 )
		this.chips = new THREE.InstancedMesh( chipGeo, createToonMaterial( look, { colorNode: color( '#cfa36c' ), ink: 0 } ), 48 )
		this.chips.count = 0
		this.chips.frustumCulled = false
		this.chips.castShadow = true
		this.chipData = []
		this.group.add( this.chips )

		this.spawnLog( 0.01 )

	}

	get near() {

		const p = this.player.renderPosition
		return Math.hypot( p.x - this.center.x, p.z - this.center.z ) < REACH

	}

	// ---------------------------------------------------------------- pedaços

	createPiece( a0, a1, R, H, position, quaternion, velocity = null ) {

		const { RAPIER, world } = this.physics
		const { geometry, hull, centroid } = buildPieceGeometry( a0, a1, R, H, this.splitNoise, 11 )
		const mesh = new THREE.Mesh( geometry, this.materials )
		mesh.castShadow = mesh.receiveShadow = true
		this.group.add( mesh )

		const body = world.createRigidBody( RAPIER.RigidBodyDesc.dynamic()
			.setTranslation( position.x, position.y, position.z )
			.setRotation( quaternion )
			.setCcdEnabled( true )
			.setAngularDamping( 0.4 ).setLinearDamping( 0.05 ) )
		const desc = RAPIER.ColliderDesc.convexHull( hull ) ?? RAPIER.ColliderDesc.cylinder( H / 2, R * 0.6 )
		world.createCollider( desc.setDensity( 600 ).setFriction( 0.85 ).setRestitution( 0.05 ), body )
		if ( velocity ) body.setLinvel( velocity, true )

		const piece = {
			a0, a1, R, H, centroid, mesh, body, born: performance.now(), dying: 0,
			prevP: new THREE.Vector3().copy( position ), currP: new THREE.Vector3().copy( position ),
			prevQ: new THREE.Quaternion().copy( quaternion ), currQ: new THREE.Quaternion().copy( quaternion ), lastVy: 0
		}
		mesh.position.copy( position )
		mesh.quaternion.copy( quaternion )
		this.pieces.push( piece )
		this.trim()
		return piece

	}

	spawnLog( drop = 0.9 ) {

		_q.setFromEuler( _e.set( ( this.random() - 0.5 ) * 0.06, this.random() * TAU, ( this.random() - 0.5 ) * 0.06 ) )
		const H = LOG_H * ( 0.9 + this.random() * 0.2 )
		this.createPiece( 0, TAU, LOG_R * ( 0.9 + this.random() * 0.2 ), H, _v.set( this.center.x, this.top + H / 2 + drop, this.center.z ), _q )

	}

	removePiece( piece ) {

		this.physics.world.removeRigidBody( piece.body )
		this.group.remove( piece.mesh )
		piece.mesh.geometry.dispose()
		this.pieces.splice( this.pieces.indexOf( piece ), 1 )

	}

	trim() {

		// some com os mais antigos que não estão no toco (encolhendo)
		let alive = this.pieces.filter( ( p ) => ! p.dying )
		while ( alive.length > MAX_PIECES ) {

			const oldest = alive.find( ( p ) => ! this.onStump( p ) ) ?? alive[ 0 ]
			oldest.dying = performance.now()
			alive = alive.filter( ( p ) => p !== oldest )

		}

	}

	onStump( p ) {

		const t = p.body.translation()
		return Math.hypot( t.x - this.center.x, t.z - this.center.z ) < this.stumpR * 0.95 && t.y > this.top && t.y < this.top + 1.0

	}

	// origem do "espaço do tronco" do pedaço em mundo (o corpo fica no centróide)
	logOrigin( p, out ) {

		const t = p.body.translation(), r = p.body.rotation()
		_q.set( r.x, r.y, r.z, r.w )
		return out.copy( p.centroid ).applyQuaternion( _q ).negate().add( _v.set( t.x, t.y, t.z ) )

	}

	split( p ) {

		const range = p.a1 - p.a0
		const am = range > TAU - 1e-3
			? p.a0 + this.random() * TAU // tronco inteiro: primeira rachadura em ângulo qualquer
			: p.a0 + range * ( 0.5 + ( this.random() - 0.5 ) * 0.2 )
		const parts = range > TAU - 1e-3 ? [ [ am, am + Math.PI ], [ am + Math.PI, am + TAU ] ] : [ [ p.a0, am ], [ am, p.a1 ] ]

		const r = p.body.rotation()
		const q = new THREE.Quaternion( r.x, r.y, r.z, r.w )
		const origin = this.logOrigin( p, new THREE.Vector3() )
		const lv = p.body.linvel()
		this.removePiece( p )

		for ( const [ a0, a1 ] of parts ) {

			const c = wedgeCentroid( a0, a1, p.R )
			const pos = c.clone().applyQuaternion( q ).add( origin )
			const child = this.createPiece( a0, a1, p.R, p.H, pos, q, lv )
			// empurra para fora (direção do meio da cunha) + para cima + gira
			const mid = ( a0 + a1 ) / 2
			const out = new THREE.Vector3( Math.cos( mid ), 0, Math.sin( mid ) ).applyQuaternion( q )
			const mass = child.body.mass()
			child.body.applyImpulse( { x: out.x * mass * 1.7, y: mass * 1.6, z: out.z * mass * 1.7 }, true )
			child.body.applyTorqueImpulse( { x: ( this.random() - 0.5 ) * mass * 0.05, y: 0, z: ( this.random() - 0.5 ) * mass * 0.05 }, true )

		}

	}

	// ---------------------------------------------------------------- ação

	chop() {

		if ( this.swing ) return false
		const p = this.player.renderPosition
		const toPlayer = new THREE.Vector3( p.x - this.center.x, 0, p.z - this.center.z )
		if ( toPlayer.lengthSq() < 1e-4 ) toPlayer.set( 0, 0, 1 )
		toPlayer.normalize()
		this.swing = { t: 0, hit: false, dir: toPlayer }
		this.sfx?.swing()

		// machado: mão ao lado do jogador, lâmina desce no centro do toco
		// cabo 0.86 m a 35° abaixo da horizontal no impacto → pivô 0.70 m para trás e 0.49 m acima do topo do tronco
		const pivotY = this.top + LOG_H + 0.5
		this.axe.position.set( this.center.x, pivotY, this.center.z ).addScaledVector( toPlayer, 0.7 )
		this.axe.lookAt( this.center.x, pivotY, this.center.z )
		this.axe.visible = true
		this.axe.scale.setScalar( 1 )
		return true

	}

	impact() {

		this.rig?.shake( 0.35 )
		this.sfx?.chop( 1 )
		this.emitChips( 14 )

		const target = this.pieces.filter( ( p ) => ! p.dying && this.onStump( p ) ).sort( ( a, b ) => ( b.a1 - b.a0 ) - ( a.a1 - a.a0 ) )[ 0 ]
		if ( ! target ) { this.spawnLog(); return }
		if ( target.a1 - target.a0 > 0.55 ) {

			this.split( target )

		} else {

			// pequeno demais para rachar: o machado o arremessa para longe do toco
			const m = target.body.mass()
			const d = this.swing.dir
			target.body.applyImpulse( { x: - d.x * m * 2.5, y: m * 2, z: - d.z * m * 2.5 }, true )

		}

		// nada mais em cima do toco? a maior peça ainda rachável volta para ele (metade → quartos → oitavos); senão, tronco novo
		clearTimeout( this.refillTimer )
		this.refillTimer = setTimeout( () => this.refill(), 1100 )

	}

	refill() {

		if ( this.pieces.some( ( q ) => ! q.dying && this.onStump( q ) ) ) return
		const c = this.center
		const next = this.pieces
			.filter( ( p ) => ! p.dying && p.a1 - p.a0 > 0.55 && this.distanceTo( p ) < 3.5 )
			.sort( ( a, b ) => ( b.a1 - b.a0 ) - ( a.a1 - a.a0 ) )[ 0 ]
		if ( ! next ) { this.spawnLog(); return }

		// em pé sobre o toco, centróide no eixo, cai de 30 cm
		_q.setFromAxisAngle( _v.set( 0, 1, 0 ), this.random() * TAU )
		const pos = new THREE.Vector3( c.x, this.top + next.H / 2 + 0.3, c.z )
		next.body.setTranslation( pos, true )
		next.body.setRotation( _q, true )
		next.body.setLinvel( { x: 0, y: 0, z: 0 }, true )
		next.body.setAngvel( { x: 0, y: 0, z: 0 }, true )
		next.prevP.copy( pos )
		next.currP.copy( pos )
		next.prevQ.copy( _q )
		next.currQ.copy( _q )

	}

	distanceTo( p ) {

		const t = p.body.translation()
		return Math.hypot( t.x - this.center.x, t.z - this.center.z )

	}

	emitChips( n ) {

		for ( let i = 0; i < n; i ++ ) {

			const a = this.random() * TAU, s = 1.5 + this.random() * 2.5
			const chip = {
				p: new THREE.Vector3( this.center.x, this.top + 0.6, this.center.z ),
				v: new THREE.Vector3( Math.cos( a ) * s, 2.5 + this.random() * 3, Math.sin( a ) * s ),
				r: new THREE.Euler( this.random() * TAU, this.random() * TAU, 0 ), w: ( this.random() - 0.5 ) * 30, life: 2.5 + this.random(), rest: false
			}
			if ( this.chipData.length >= this.chips.instanceMatrix.count ) this.chipData.shift()
			this.chipData.push( chip )

		}

	}

	// ---------------------------------------------------------------- loop

	fixedUpdate() {

		for ( const p of this.pieces ) {

			const t = p.body.translation(), r = p.body.rotation()
			p.prevP.set( t.x, t.y, t.z )
			p.prevQ.set( r.x, r.y, r.z, r.w )

		}

	}

	update( dt, alpha ) {

		const now = performance.now()

		for ( const p of [ ...this.pieces ] ) {

			const t = p.body.translation(), r = p.body.rotation()
			p.currP.set( t.x, t.y, t.z )
			p.currQ.set( r.x, r.y, r.z, r.w )
			p.mesh.position.lerpVectors( p.prevP, p.currP, alpha )
			p.mesh.quaternion.slerpQuaternions( p.prevQ, p.currQ, alpha )

			// som ao bater no chão/pilha
			const vy = p.body.linvel().y
			if ( p.lastVy < - 2.2 && vy > p.lastVy + 2 ) this.sfx?.clack( - p.lastVy )
			p.lastVy = vy

			if ( p.dying ) {

				const k = 1 - ( now - p.dying ) / 400
				if ( k <= 0 ) this.removePiece( p )
				else p.mesh.scale.setScalar( k )

			} else if ( t.y < this.terrain.waterLevel - 8 ) {

				p.dying = now

			}

		}

		this.updateSwing( dt )
		this.updateChips( dt )

	}

	updateSwing( dt ) {

		const s = this.swing
		if ( ! s ) return
		s.t += dt
		// ângulo do cabo: −120° (levantado atrás) → +35° (lâmina no topo do toco)
		const RAISE = 0.16, DOWN = 0.11, HOLD = 0.3
		let a
		if ( s.t < RAISE ) {

			const k = s.t / RAISE
			a = THREE.MathUtils.lerp( - 0.6, - 2.1, 1 - ( 1 - k ) * ( 1 - k ) ) // sobe desacelerando (antecipação)

		} else if ( s.t < RAISE + DOWN ) {

			const k = ( s.t - RAISE ) / DOWN
			a = THREE.MathUtils.lerp( - 2.1, 0.61, k * k * k ) // desce acelerando

		} else {

			a = 0.61
			if ( ! s.hit ) { s.hit = true; this.impact() }
			const k = ( s.t - RAISE - DOWN - HOLD ) / 0.2
			if ( k > 0 ) this.axe.scale.setScalar( Math.max( 0.001, 1 - k ) )
			if ( k >= 1 ) { this.axe.visible = false; this.swing = null }

		}

		this.swingNode.rotation.x = a
		// o personagem encara o toco durante o golpe
		if ( this.player ) this.player.facing = Math.atan2( - s.dir.x, - s.dir.z )

	}

	updateChips( dt ) {

		const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3()
		let n = 0
		for ( let i = this.chipData.length - 1; i >= 0; i -- ) {

			const c = this.chipData[ i ]
			c.life -= dt
			if ( c.life <= 0 ) { this.chipData.splice( i, 1 ); continue }
			if ( ! c.rest ) {

				c.v.y -= 18 * dt
				c.p.addScaledVector( c.v, dt )
				c.r.x += c.w * dt
				c.r.y += c.w * 0.7 * dt
				const onStump = Math.hypot( c.p.x - this.center.x, c.p.z - this.center.z ) < this.stumpR
				const floor = onStump ? this.top : this.terrain.sampleHeight( c.p.x, c.p.z )
				if ( c.p.y < floor + 0.006 ) {

					c.p.y = floor + 0.006
					if ( Math.abs( c.v.y ) < 1.5 ) { c.rest = true; c.r.x = 0; c.r.z = 0 }
					c.v.set( c.v.x * 0.4, - c.v.y * 0.3, c.v.z * 0.4 )

				}

			}

		}

		for ( const c of this.chipData ) {

			const k = clamp( c.life / 0.4, 0, 1 )
			m.compose( c.p, q.setFromEuler( c.r ), sc.setScalar( k ) )
			this.chips.setMatrixAt( n ++, m )

		}

		this.chips.count = n
		this.chips.instanceMatrix.needsUpdate = true

	}

}

// ======================================================================= geometria

function wedgeCentroid( a0, a1, R ) {

	const range = a1 - a0
	if ( range > TAU - 1e-3 ) return new THREE.Vector3()
	const mid = ( a0 + a1 ) / 2
	const d = ( 4 * R * Math.sin( range / 2 ) ) / ( 3 * range ) // centróide de um setor circular
	return new THREE.Vector3( Math.cos( mid ) * d, 0, Math.sin( mid ) * d )

}

/**
 * Cunha de tronco no espaço do tronco (eixo = Y, centro na origem), depois centralizada no centróide.
 * Grupos de material: 0 casca · 1 topo/base (anéis) · 2 face rachada (fibras).
 * A face rachada é deslocada por ruído f(raio, altura, ângulo) — o vizinho do outro lado usa o mesmo f → encaixe perfeito.
 */
function buildPieceGeometry( a0, a1, R, H, noise, seed ) {

	const full = a1 - a0 > TAU - 1e-3
	const range = a1 - a0
	const segs = full ? 22 : Math.max( 2, Math.ceil( range / ( Math.PI / 11 ) ) )
	const h = H / 2
	const groups = [ { pos: [], nor: [] }, { pos: [], nor: [] }, { pos: [], nor: [] } ]
	const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), X = new THREE.Vector3()

	// triângulo com winding corrigido pela normal desejada (sem adivinhar sentido)
	const tri = ( g, a, b, c, na, nb = na, nc = na ) => {

		X.subVectors( b, a ).cross( C.subVectors( c, a ) )
		const flat = na === nb && nb === nc ? na : N.copy( na ).add( nb ).add( nc )
		const G = groups[ g ]
		if ( X.dot( flat ) < 0 ) { [ b, c ] = [ c, b ];[ nb, nc ] = [ nc, nb ] }
		G.pos.push( a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z )
		G.nor.push( na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z )

	}

	const ring = ( θ, y, r = R ) => new THREE.Vector3( Math.cos( θ ) * r, y, Math.sin( θ ) * r )
	const radial = ( θ ) => new THREE.Vector3( Math.cos( θ ), 0, Math.sin( θ ) )
	const up = new THREE.Vector3( 0, 1, 0 ), down = new THREE.Vector3( 0, - 1, 0 )

	for ( let k = 0; k < segs; k ++ ) {

		const t0 = a0 + ( range * k ) / segs, t1 = a0 + ( range * ( k + 1 ) ) / segs
		const p00 = ring( t0, - h ), p10 = ring( t1, - h ), p11 = ring( t1, h ), p01 = ring( t0, h )
		const n0 = radial( t0 ), n1 = radial( t1 )
		tri( 0, p00, p01, p11, n0, n0, n1 )
		tri( 0, p00, p11, p10, n0, n1, n1 )
		const ct = new THREE.Vector3( 0, h, 0 ), cb = new THREE.Vector3( 0, - h, 0 )
		tri( 1, ct, p01, p11, up )
		tri( 1, cb, p00, p10, down )

	}

	if ( ! full ) {

		// faces rachadas: grade (raio × altura) com deslocamento ao longo da tangente do ângulo
		const M = 4, V = 6
		for ( const [ θ, sign ] of [ [ a0, - 1 ], [ a1, 1 ] ] ) {

			const tangent = new THREE.Vector3( - Math.sin( θ ), 0, Math.cos( θ ) )
			const normal = tangent.clone().multiplyScalar( sign )
			const P = ( i, j ) => {

				const r = ( i / M ) * R, y = - h + ( j / V ) * H
				const edge = i === 0 || i === M || j === 0 || j === V
				const d = edge ? 0 : noise( r * 9 + θ * 3.1 + seed, y * 7 ) * 0.012
				return ring( θ, y, r ).addScaledVector( tangent, d )

			}

			for ( let i = 0; i < M; i ++ ) for ( let j = 0; j < V; j ++ ) {

				const a = P( i, j ), b = P( i + 1, j ), c = P( i + 1, j + 1 ), d = P( i, j + 1 )
				tri( 2, a, b, c, normal )
				tri( 2, a, c, d, normal )

			}

		}

	}

	const centroid = wedgeCentroid( a0, a1, R )
	const geometry = new THREE.BufferGeometry()
	const pos = [], nor = [], wood = [], uvs = []
	let start = 0
	groups.forEach( ( G, gi ) => {

		for ( let i = 0; i < G.pos.length; i += 3 ) {

			pos.push( G.pos[ i ] - centroid.x, G.pos[ i + 1 ] - centroid.y, G.pos[ i + 2 ] - centroid.z )
			wood.push( G.pos[ i ], G.pos[ i + 1 ], G.pos[ i + 2 ], R ) // espaço do tronco (contínuo entre pedaços)
			// UV por face (o normalMap monta a base tangente pelas derivadas do UV → cada face precisa do seu):
			//   casca: cilíndrico · topo: planar centrado no disco da foto do corte · face rachada: (raio, altura) = fibra ao longo do eixo
			const x = G.pos[ i ], y = G.pos[ i + 1 ], z = G.pos[ i + 2 ]
			if ( gi === 0 ) uvs.push( ( Math.atan2( z, x ) / TAU + 0.5 ) * 3, y * 1.4 )
			else if ( gi === 1 ) uvs.push( x / R * END_UV + 0.5, z / R * END_UV + 0.5 )
			else uvs.push( Math.hypot( x, z ) / R * 0.5, y * 0.8 )

		}

		nor.push( ...G.nor )
		const count = G.pos.length / 3
		if ( count ) geometry.addGroup( start, count, gi )
		start += count

	} )

	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) )
	geometry.setAttribute( 'normal', new THREE.Float32BufferAttribute( nor, 3 ) )
	geometry.setAttribute( 'aWood', new THREE.Float32BufferAttribute( wood, 4 ) )
	geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) )
	geometry.computeBoundingSphere()

	// casco convexo para a física (sem o ruído da face; já centrado no centróide)
	const hull = []
	const hs = full ? 12 : Math.max( 2, segs )
	for ( let k = 0; k <= hs; k ++ ) {

		const θ = a0 + ( range * k ) / hs
		for ( const y of [ - h, h ] ) hull.push( Math.cos( θ ) * R - centroid.x, y, Math.sin( θ ) * R - centroid.z )

	}

	if ( ! full ) for ( const y of [ - h, h ] ) hull.push( - centroid.x, y, - centroid.z )

	return { geometry, hull: new Float32Array( hull ), centroid }

}

// ======================================================================= materiais

function createWoodMaterials( look, noiseTexture, barkTextures = null, endTex = null, splitTex = null ) {

	const w = attribute( 'aWood', 'vec4' )
	const p = w.xyz, R = w.w
	const rr = length( p.xz )
	const u = atan( p.z, p.x ).div( PI.mul( 2 ) ).add( 0.5 ) // 0..1 em volta do tronco (ruído é tileável → sem costura)

	// anéis de crescimento (topo E face rachada: na face eles aparecem como listras verticais onduladas)
	const ringsAt = Fn( ( [ wave ] ) => {

		const ring = fract( rr.mul( 26 ).add( wave.mul( 1.6 ) ) )
		// linha do anel que volta a 0 antes do salto do fract (1 → 0): sem degrau → relevo sem tracejado
		return smoothstep( 0.68, 0.9, ring ).mul( float( 1 ).sub( smoothstep( 0.9, 0.995, ring ) ) )

	} )

	// ---- casca: sulcos verticais, musgo nos sulcos
	const barkN = texture( noiseTexture, vec2( u.mul( 3 ), p.y.mul( 0.32 ) ) )
	const barkN2 = texture( noiseTexture, vec2( u.mul( 7 ), p.y.mul( 1.1 ) ) )
	const crevice = float( 1 ).sub( smoothstep( 0.36, 0.52, barkN.r.mul( 0.7 ).add( barkN2.g.mul( 0.3 ) ) ) )
	const barkCol = mix( color( '#6e5039' ), color( '#2a1c13' ), crevice ).mul( barkN2.b.mul( 0.3 ).add( 0.85 ) )
	const moss = smoothstep( 0.6, 0.75, barkN.a ).mul( crevice ).mul( 0.7 )
	const bark = createToonMaterial( look, {
		colorNode: mix( barkCol, color( '#4f5e2c' ), moss ),
		bump: { height: float( 1 ).sub( crevice ).add( barkN2.r.mul( 0.3 ) ), scale: 2.2 },
		roughness: 0.95
	} )
	if ( barkTextures?.map ) {

		// casca escaneada (Poly Haven): UV cilíndrico no espaço do tronco; 3 repetições inteiras na volta → sem costura
		const barkUV = vec2( u.mul( 3 ), p.y.mul( 1.4 ) )
		bark.colorNode = texture( barkTextures.map, barkUV ).rgb
		if ( barkTextures.normalMap && look.mode === 'pbr' ) bark.normalNode = normalMap( texture( barkTextures.normalMap, barkUV ), vec2( 1.4 ) )
		if ( barkTextures.armMap && look.mode === 'pbr' ) bark.roughnessNode = texture( barkTextures.armMap, barkUV ).g

	}

	// ---- topo (anéis + rachaduras radiais + borda de casca)
	const wave = texture( noiseTexture, p.xz.mul( 1.3 ) ).r
	const rings = ringsAt( wave )
	const cracks = smoothstep( 0.9, 0.96, texture( noiseTexture, vec2( u.mul( 8 ), rr.mul( 0.6 ) ) ).g ).mul( smoothstep( 0.05, 0.2, rr ) )
	const rim = smoothstep( R.sub( 0.035 ), R.sub( 0.015 ), rr )
	const heart = smoothstep( 0, R, rr )
	const blotch = texture( noiseTexture, p.xz.mul( 2.2 ) ).g // manchas (umidade, sujeira)
	const rays = texture( noiseTexture, vec2( u.mul( 16 ), rr.mul( 9 ) ) ).b // raios medulares finos (estrias radiais)
	const weather = smoothstep( 0.55, 0.75, texture( noiseTexture, p.xz.mul( 0.7 ).add( 3.3 ) ).a ).mul( 0.35 ) // acinzentado pelo tempo
	const endBase = mix( color( '#8f6038' ), color( '#c99a63' ), smoothstep( 0.1, 0.9, heart ) ) // cerne escuro → alburno claro
	const endCol = mix( endBase.mul( float( 1 ).sub( rings.mul( 0.28 ) ) ).mul( blotch.mul( 0.3 ).add( 0.85 ) ).mul( rays.mul( 0.16 ).add( 0.92 ) ), color( '#8a8478' ), weather )
		.mul( float( 1 ).sub( cracks.mul( 0.6 ) ) )
	const endFinal = mix( endCol, color( '#3a281a' ), rim )
	const end = createToonMaterial( look, {
		colorNode: endFinal,
		bump: { height: rings.mul( 0.6 ).add( rays.mul( 0.4 ) ).sub( cracks.mul( 1.2 ) ).sub( rim.mul( 0.4 ) ), scale: 2.4 },
		roughness: 0.85
	} )

	// ---- face rachada: fibras finas ao longo do eixo + anéis como listras + farpas levantadas (mais claras)
	const fib = texture( noiseTexture, vec2( rr.mul( 38 ), p.y.mul( 1.6 ) ) )
	const streak = texture( noiseTexture, vec2( rr.mul( 6 ).add( u.mul( 2 ) ), p.y.mul( 0.18 ) ) )
	const splinter = smoothstep( 0.62, 0.8, streak.r )
	const innerRings = ringsAt( texture( noiseTexture, vec2( rr.mul( 0.5 ), p.y.mul( 0.25 ) ) ).r )
	const innerBase = mix( color( '#b98552' ), color( '#d9ac74' ), smoothstep( 0.2, 0.8, fib.r ) )
		.mul( float( 1 ).sub( innerRings.mul( 0.18 ) ) ).mul( streak.g.mul( 0.24 ).add( 0.88 ) )
	const inner = createToonMaterial( look, {
		colorNode: mix( mix( innerBase, color( '#e9c896' ), splinter.mul( 0.6 ) ), color( '#5a3d27' ), rim ),
		bump: { height: fib.r.mul( 0.5 ).add( fib.g.mul( 0.3 ) ).add( splinter.mul( 0.6 ) ), scale: 2.4 },
		roughness: 0.9
	} )

	// fotos reais (ambientCG/Poly Haven) no lugar do procedural — normal exagerado (1,5–2×) = aspecto tátil do Firewood
	const photo = ( mat, tex, normalScale ) => {

		if ( ! tex?.map ) return
		mat.colorNode = texture( tex.map, uv() ).rgb.mul( vec3( ...( tex.tint ?? [ 1, 1, 1 ] ) ) ) // tint: casar fotos de fontes diferentes
		if ( look.mode !== 'pbr' ) return
		if ( tex.normalMap ) mat.normalNode = normalMap( texture( tex.normalMap, uv() ), vec2( normalScale ) )
		if ( tex.roughnessMap ) mat.roughnessNode = texture( tex.roughnessMap, uv() ).r
		if ( tex.aoMap ) mat.aoNode = texture( tex.aoMap, uv() ).r

	}

	photo( end, endTex, 1.6 )
	photo( inner, splitTex, splitTex?.normalScale ?? 2.6 )
	return [ bark, end, inner ]

}
