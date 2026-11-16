import * as THREE from 'three/webgpu';

// André Rebouças sentado no banquinho, desenhando a planta das docas na prancheta.
// Movimento: Mixamo "Writing" (espelhado para a mão direita e com o laço fechado) retargetado para o rig dele
// (Rigs/André Rebouças - Desenhando.blend; scripts em Apoio/Scripts/andre_*.py).
// A origem do modelo fica sob o quadril; `seat` (criado em ReboucasRoom) diz onde ele senta e para onde olha.
export class ReboucasDrawing {
	constructor( entry, gltf, seat, height ) {
		this.entry = entry
		this.root = gltf.scene
		this.root.updateMatrixWorld( true )
		const box = new THREE.Box3().setFromObject( this.root ), s = height / box.getSize( new THREE.Vector3() ).y
		this.holder = new THREE.Group(); this.holder.name = 'character-reboucas'
		this.root.position.y = - box.min.y // sola do pé no chão (T-pose do rig); o clipe já traz a pose sentada
		this.holder.add( this.root ); this.holder.scale.setScalar( s )
		; ( seat || entry.group ).add( this.holder )
		entry.character3d = this.holder
		this.mixer = new THREE.AnimationMixer( this.root )
		this.clip = gltf.animations.find( c => c.name === 'Desenhando_Loop' ) ?? gltf.animations[ 0 ]
		if ( ! this.clip ) throw new Error( 'O André está sem o clipe de desenho.' )
		this.action = this.mixer.clipAction( this.clip ).setLoop( THREE.LoopRepeat, Infinity ).play()
		this.addPencil()
		this.time = 0
		this.playing = ! matchMedia( '(prefers-reduced-motion: reduce)' ).matches
		this.update( 0 )
		window.__andre = this // depuração
	}
	// lápis de engenheiro na mão direita (a animação foi espelhada: escreve com a direita). Posicionado a cada quadro pelos dedos (polegar + indicador).
	addPencil() {
		const b = n => this.root.getObjectByName( n ); this.idx = b( 'RightHandIndex3' ); this.thb = b( 'RightHandThumb3' ); this.hnd = b( 'RightHand' )
		if ( ! this.idx || ! this.thb || ! this.hnd ) return
		const wood = new THREE.MeshStandardNodeMaterial( { color: '#d2a24c', roughness: .7 } ), lead = new THREE.MeshStandardNodeMaterial( { color: '#26262b', roughness: .5 } )
		const body = new THREE.Mesh( new THREE.CylinderGeometry( .0042, .0042, .15, 6 ), wood ), tip = new THREE.Mesh( new THREE.ConeGeometry( .0042, .02, 6 ), lead )
		tip.position.y = - .01; body.position.y = - .095 // origem = ponta do grafite; o corpo vai para trás (−Y)
		this.pencil = new THREE.Group(); this.pencil.name = 'lapis'; this.pencil.add( body, tip )
		this.pencil.traverse( n => { if ( n.isMesh ) { n.castShadow = true; n.frustumCulled = false } } )
		this.entry.group.add( this.pencil ); this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._d = new THREE.Vector3(); this._g = new THREE.Vector3(); this._up = new THREE.Vector3( 0, 1, 0 ); this._down = new THREE.Vector3( 0, - 1, 0 )
	}
	placePencil() {
		if ( ! this.pencil ) return
		const g = this.entry.group; this.root.updateWorldMatrix( true, true )
		this.idx.getWorldPosition( this._a ); this.thb.getWorldPosition( this._b ); this.hnd.getWorldPosition( this._d )
		this._g.copy( this._a ).lerp( this._b, .5 ) // pegada
		this._d.subVectors( this._a, this._d ).normalize().addScaledVector( this._down, .85 ).normalize() // dedos para a frente, inclinado para baixo
		this._g.addScaledVector( this._d, .02 ); g.worldToLocal( this._g ); this._d.transformDirection( g.matrixWorld.clone().invert() )
		this.pencil.position.copy( this._g ); this.pencil.quaternion.setFromUnitVectors( this._up, this._d )
	}	update( dt ) {
		if ( this.playing ) this.time = ( this.time + Math.min( dt, .1 ) ) % this.clip.duration
		this.mixer.setTime( this.time ); this.placePencil()
	}
	seek( seconds ) { this.time = ( ( seconds % this.clip.duration ) + this.clip.duration ) % this.clip.duration; this.update( 0 ) }
	getStats() { return { clip: this.clip.name, duration: this.clip.duration, time: this.time, playing: this.playing, source: 'Mixamo Writing' } }
}
