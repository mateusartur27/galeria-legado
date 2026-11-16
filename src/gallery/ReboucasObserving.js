import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// André Rebouças em pé, inclinado sobre o teodolite: olho na luneta, uma mão no tubo e outra no parafuso; de tempos em tempos
// levanta a cabeça e olha para o lado do corredor. O movimento é procedural (Rigs/André Rebouças - Desenhando.blend, ação "Observando";
// script Apoio/Scripts/andre_observando.py), exportado como GLB só com o esqueleto e aplicado ao mesmo modelo do desenho.
// A posição dele é derivada do teodolite (a cada quadro), então mover o teodolite no painel leva o André junto.
const FRONT = 0.6518 // distância (unidades do rig) da origem do rig ao centro da luneta, no eixo da frente
export class ReboucasObserving {
	constructor( entry, gltf, theo, room, height, hands = null, hooks = null, url = '/models/characters/reboucas-observando.glb' ) {
		this.entry = entry; this.root = gltf.scene; this.theo = theo
		this.root.updateMatrixWorld( true )
		const box = new THREE.Box3().setFromObject( this.root ), s = height / box.getSize( new THREE.Vector3() ).y
		this.s = s
		this.holder = new THREE.Group(); this.holder.name = 'character-reboucas'
		this.root.position.y = - box.min.y // sola do pé no chão
		this.holder.add( this.root ); this.holder.scale.setScalar( s )
		this.stand = new THREE.Group(); this.stand.name = 'andre-teodolito'; this.stand.add( this.holder ); room.add( this.stand )
		entry.character3d = this.holder
		this.mixer = new THREE.AnimationMixer( this.root )
		this.time = 0; this.clip = null; this.action = null
		this.hands = hands // { esq, dir, dedosEsq, dedosDir }: objetos do painel; .val = { x, y, z (cm), rot (°) } / { x = % de curvatura }
		this.restQ = new Map() // pose de repouso dos dedos, para escalar a curvatura
		this.bakedQ = new Map() // pose da animação (sem ajustes) dos ossos que o editor de mãos mexe
		for ( const side of [ 'Left', 'Right' ] ) for ( const f of [ 'Thumb', 'Index', 'Middle', 'Ring', 'Pinky' ] ) for ( const i of [ 1, 2, 3 ] ) { const b = this.root.getObjectByName( side + 'Hand' + f + i ); if ( b ) this.restQ.set( b, b.quaternion.clone() ) }
		for ( const side of [ 'Left', 'Right' ] ) for ( const n of [ 'Arm', 'ForeArm', 'Hand' ] ) { const b = this.root.getObjectByName( side + n ); if ( b ) this.bakedQ.set( b, b.quaternion.clone() ) }
		for ( const b of this.restQ.keys() ) this.bakedQ.set( b, b.quaternion.clone() )
		if ( hooks ) hooks.onHand = on => { if ( on && this.clip ) { this.playing = false; this.seek( 1.0 ) } } // ao editar uma mão, congela na pose de pegada
		this.playing = ! matchMedia( '(prefers-reduced-motion: reduce)' ).matches
		this.holder.visible = false // some até o movimento chegar (senão aparece em T)
		this.ready = new GLTFLoader().loadAsync( url ).then( m => {
			this.clip = m.animations[ 0 ]
			this.action = this.mixer.clipAction( this.clip ).setLoop( THREE.LoopRepeat, Infinity ).play()
			this.holder.visible = true; this.update( 0 )
		} ).catch( err => console.warn( 'André: movimento do teodolito não carregou', err ) )
		this.place()
		window.__andre = this // depuração
	}
	// o centro da luneta fica a FRONT*s à frente dele; ele olha para onde a objetiva aponta (-Z do teodolite)
	place() {
		const t = this.theo, phi = t.rotation.y + Math.PI, d = FRONT * this.s
		this.stand.position.set( t.position.x - d * Math.sin( phi ), t.position.y, t.position.z - d * Math.cos( phi ) )
		this.stand.rotation.y = phi
	}
	update( dt ) {
		this.place()
		if ( ! this.clip ) return
		if ( this.playing ) this.time = ( this.time + Math.min( dt, .1 ) ) % this.clip.duration
		// o AnimationMixer só regrava um osso quando o valor da animação muda; se o tempo não mudou (pausado), meus ajustes do quadro anterior ficariam e se somariam.
		// Por isso desfaço os ajustes (volta à pose da animação) antes do mixer e guardo a pose limpa depois dele.
		for ( const [ b, q ] of this.bakedQ ) b.quaternion.copy( q )
		this.mixer.setTime( this.time )
		for ( const b of this.bakedQ.keys() ) this.bakedQ.get( b ).copy( b.quaternion )
		this.adjustHands()
	}
	// ajustes das mãos por cima da animação: deslocamento do punho (IK de dois ossos), giro do punho e curvatura dos dedos
	adjustHands() {
		const H = this.hands; if ( ! H ) return
		const u = this.time / this.clip.duration, ss = ( a, b, x ) => { const t = Math.min( Math.max( ( x - a ) / ( b - a ), 0 ), 1 ); return t * t * ( 3 - 2 * t ) }
		const free = ss( .27, .35, u ) - ss( .72, .80, u ) // a esquerda solta o tubo: o ajuste de pegada some junto
		this.armIK( 'Left', H.esq.val, 1 - free ); this.armIK( 'Right', H.dir.val, 1 )
		this.curl( 'Left', H.dedosEsq.val.x / 100 * ( 1 - free ) ); this.curl( 'Right', H.dedosDir.val.x / 100 )
	}
	armIK( side, v, w ) {
		if ( ! w || ( ! v.x && ! v.y && ! v.z && ! v.rot && ! v.pitch && ! v.yaw ) ) return
		const arm = this.root.getObjectByName( side + 'Arm' ), fore = this.root.getObjectByName( side + 'ForeArm' ), hand = this.root.getObjectByName( side + 'Hand' ); if ( ! arm || ! fore || ! hand ) return
		const V = THREE.Vector3, Q = THREE.Quaternion, sg = side === 'Left' ? 1 : - 1
		const S = arm.getWorldPosition( new V() ), E = fore.getWorldPosition( new V() ), W = hand.getWorldPosition( new V() ), qHand = hand.getWorldQuaternion( new Q() )
		const off = new V( sg * v.x, v.y, v.z ).multiplyScalar( .01 * w ).applyQuaternion( this.holder.getWorldQuaternion( new Q() ) ) // cm no quadro do André -> mundo
		const a = S.distanceTo( E ), b = E.distanceTo( W ), T = W.clone().add( off )
		const dir = T.clone().sub( S ), d = Math.min( Math.max( dir.length(), Math.abs( a - b ) + 1e-4 ), a + b - 1e-4 ); dir.normalize()
		const old = W.clone().sub( S ).normalize(), pole = E.clone().sub( S ); pole.addScaledVector( old, - pole.dot( old ) ); pole.addScaledVector( dir, - pole.dot( dir ) ); if ( pole.lengthSq() < 1e-10 ) pole.set( 0, - 1, 0 ); pole.normalize()
		const x = ( a * a - b * b + d * d ) / ( 2 * d ), h = Math.sqrt( Math.max( a * a - x * x, 0 ) )
		const E2 = S.clone().addScaledVector( dir, x ).addScaledVector( pole, h ), T2 = S.clone().addScaledVector( dir, d )
		const turn = ( bone, from, to ) => { const dq = new Q().setFromUnitVectors( from.clone().normalize(), to.clone().normalize() ), pq = bone.parent.getWorldQuaternion( new Q() ); bone.quaternion.copy( pq.clone().invert().multiply( dq ).multiply( pq ).multiply( bone.quaternion ) ) }
		turn( arm, E.clone().sub( S ), E2.clone().sub( S ) )
		const Ec = fore.getWorldPosition( new V() ), Wc = hand.getWorldPosition( new V() ); turn( fore, Wc.clone().sub( Ec ), T2.clone().sub( Ec ) )
		const Ef = fore.getWorldPosition( new V() ), Wf = hand.getWorldPosition( new V() ), axis = Wf.clone().sub( Ef ).normalize()
		const want = new Q().setFromAxisAngle( axis, sg * v.rot * Math.PI / 180 * w ).multiply( qHand ) // mantém a orientação da pegada + giro do punho
		hand.quaternion.copy( hand.parent.getWorldQuaternion( new Q() ).invert().multiply( want ) )
		if ( v.pitch || v.yaw ) hand.quaternion.multiply( new Q().setFromEuler( new THREE.Euler( ( v.pitch || 0 ) * Math.PI / 180 * w, 0, ( v.yaw || 0 ) * Math.PI / 180 * w ) ) ) // flexão (eixo X do osso) e desvio (eixo Z), no quadro da própria mão
	}
	curl( side, k ) {
		if ( ! k ) return
		for ( const [ bone, rest ] of this.restQ ) if ( bone.name.startsWith( side ) ) { const cur = bone.quaternion.clone(); bone.quaternion.copy( rest ).slerp( cur, 1 + k ) }
	}
	seek( seconds ) { if ( ! this.clip ) return; this.time = ( ( seconds % this.clip.duration ) + this.clip.duration ) % this.clip.duration; this.update( 0 ) }
	getStats() { return { clip: this.clip?.name, duration: this.clip?.duration, time: this.time, playing: this.playing, source: 'procedural (Blender)' } }
}
