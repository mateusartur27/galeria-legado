import * as THREE from 'three/webgpu';

// Glória Maria repórter: fala ao microfone no calçadão. Clipe "Falando" (Mixamo "Talking – General Conversation", retargetado em
// Apoio/Scripts/gloria_retarget.py). O microfone é procedural e fica preso ao osso da mão (acompanha o quadro da animação).
export const SHOW_MIC = false
export const SHOW_MOUTH = false // boca animada (shape key MouthOpen): desligada a pedido
export const MIC = { bone: 'RightHand', pos: [ .0, .02, .0 ], rot: [ 0, 0, 0 ], scale: 1 } // ajustável: posição/rotação no referencial do osso (unidades do rig)

function buildMic() {
	const g = new THREE.Group(); g.name = 'microfone'
	const black = new THREE.MeshStandardMaterial( { color: '#16161a', roughness: .5, metalness: .4 } )
	const foam = new THREE.MeshStandardMaterial( { color: '#2a2a30', roughness: .95 } )
	const band = new THREE.MeshStandardMaterial( { color: '#e8e8ee', roughness: .5, emissive: '#bfc4d8', emissiveIntensity: .25 } )
	const handle = new THREE.Mesh( new THREE.CylinderGeometry( .028, .024, .26, 14 ), black ); handle.position.y = .0
	const head = new THREE.Mesh( new THREE.SphereGeometry( .052, 18, 14 ), foam ); head.position.y = .17
	const ring = new THREE.Mesh( new THREE.CylinderGeometry( .034, .034, .018, 14 ), band ); ring.position.y = .122
	const flag = new THREE.Mesh( new THREE.BoxGeometry( .09, .07, .09 ), new THREE.MeshStandardMaterial( { color: '#1b4fa8', roughness: .6 } ) ); flag.position.y = .095
	g.add( handle, head, ring, flag ); g.traverse( n => { if ( n.isMesh ) { n.castShadow = true; n.frustumCulled = false } } )
	return g
}

export class GloriaTalking {
	constructor( entry, gltf, roomApi, def ) {
		this.entry = entry; this.roomApi = roomApi; this.root = gltf.scene
		this.holder = new THREE.Group(); this.holder.name = 'character-gloria'
		this.root.updateMatrixWorld( true )
		const box = new THREE.Box3().setFromObject( this.root ), size = box.getSize( new THREE.Vector3() )
		this.scale = def.height / size.y
		this.root.position.set( 0, - box.min.y, 0 ); this.holder.add( this.root ) // pé no zero do holder
		this.holder.scale.setScalar( this.scale ); this.holder.rotation.y = def.facing ?? 0
		entry.group.add( this.holder ); entry.character3d = this.holder
		this.spot = roomApi?.spot
		this.mixer = new THREE.AnimationMixer( this.root )
		const clip = gltf.animations.find( a => a.name === 'Falando' ) ?? gltf.animations[ 0 ]
		if ( ! clip ) throw new Error( 'Glória: falta o clipe Falando' )
		this.action = this.mixer.clipAction( clip ).setLoop( THREE.LoopRepeat, Infinity ).play()
		this.playing = ! matchMedia( '(prefers-reduced-motion: reduce)' ).matches
		this.speed = .85 // um pouco mais calma que o clipe do Mixamo
		this.action.setEffectiveTimeScale( this.speed )
		this.mic = buildMic(); this.mic.position.set( ...MIC.pos ); this.mic.rotation.set( ...MIC.rot ); this.mic.scale.setScalar( MIC.scale )
		if ( SHOW_MIC ) { const bone = this.root.getObjectByName( MIC.bone ); if ( bone ) bone.add( this.mic ); else console.warn( 'Glória: osso do microfone não achado', MIC.bone ) } // microfone removido a pedido (SHOW_MIC = false)
		// boca: shape key MouthOpen na cabeça (criada em Apoio/Scripts/gloria_boca.py), movida no ritmo de sílabas com pausas de respiração
		this.mouth = null; this.root.traverse( n => { if ( n.isMesh && n.morphTargetDictionary && n.morphTargetDictionary.MouthOpen !== undefined ) this.mouth = { mesh: n, i: n.morphTargetDictionary.MouthOpen } } )
		this.talkT = 0
		this.place()
	}
	place() { const s = this.spot?.position; this.holder.position.set( s?.x ?? 0, s?.y ?? .02, s?.z ?? .1 ); if ( this.spot ) this.holder.rotation.y = this.spot.rotation.y }
	update( dt ) { if ( ! this.playing ) return; dt = Math.min( dt, .1 ); this.mixer.update( dt ); this.talkT += dt; this.speak(); this.place() }
	speak() { // sílabas ~4 por segundo, com ritmo irregular e pausas
		if ( ! SHOW_MOUTH || ! this.mouth ) return; const t = this.talkT, syl = Math.max( 0, Math.sin( t * 24 ) * .55 + Math.sin( t * 15.3 + 1.7 ) * .45 ), gate = THREE.MathUtils.smoothstep( Math.sin( t * .85 ) + Math.sin( t * 2.3 + .6 ) * .5, - .55, - .1 )
		this.mouth.mesh.morphTargetInfluences[ this.mouth.i ] = THREE.MathUtils.clamp( .04 + syl * gate * 1.6, 0, 1 ) }
	getStats() { return { t: +this.action.time.toFixed( 2 ), scale: +this.scale.toFixed( 3 ) } }
}
