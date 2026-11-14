import * as THREE from 'three/webgpu'

const _m = new THREE.Matrix4()
const _inv = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _zero = new THREE.Vector3()
const _up = new THREE.Vector3( 0, 1, 0 )

// Luz direcional que SEGUE o jogador (Bruno/Kenney/Firewood): frustum de sombra apertado = sombra nítida com mapa pequeno.
// "Texel snapping": o centro anda em passos de 1 texel no espaço da luz → a sombra não treme ao andar.
export class Sun {

	constructor( look, style, quality ) {

		this.look = look
		this.extent = 28 // meia largura do frustum de sombra (m)
		this.distance = 80
		this.mapSize = quality.shadowMap

		// Toon: luz branca/1 → no lighting model, lightColor = fator de sombra (a cor do sol vem de look.sunColor).
		// PBR: luz física de verdade.
		const isPBR = style.shading === 'pbr'
		this.light = isPBR ? new THREE.DirectionalLight( style.sun.color, style.sun.intensity ) : new THREE.DirectionalLight( 0xffffff, 1 )
		// shadows.type 'blob' (matcap-toy) = sem shadow map: sombras falsas em world/BlobShadows.js
		this.light.castShadow = style.shadows?.type !== 'blob'
		const s = this.light.shadow
		s.mapSize.set( this.mapSize, this.mapSize )
		s.camera.left = s.camera.bottom = - this.extent
		s.camera.right = s.camera.top = this.extent
		s.camera.near = 1
		s.camera.far = this.distance * 2
		s.bias = - 0.0004
		s.normalBias = 0.05
		s.radius = style.shadows?.radius ?? 2 // 1 = nítida (Kenney) · 4 = macia (Firewood)

		this.direction = new THREE.Vector3()
		this.setAngles( style.sun.elevation, style.sun.azimuth )

	}

	setAngles( elevationDeg, azimuthDeg ) {

		const el = THREE.MathUtils.degToRad( elevationDeg ), az = THREE.MathUtils.degToRad( azimuthDeg )
		this.direction.set( Math.cos( el ) * Math.cos( az ), Math.sin( el ), Math.cos( el ) * Math.sin( az ) ).normalize()
		this.look.sunDir.value.copy( this.direction )

	}

	update( target ) {

		const texel = ( this.extent * 2 ) / this.mapSize
		_m.lookAt( _zero, _p.copy( this.direction ).negate(), _up )
		_inv.copy( _m ).invert()
		_p.copy( target ).applyMatrix4( _inv )
		_p.x = Math.round( _p.x / texel ) * texel
		_p.y = Math.round( _p.y / texel ) * texel
		_p.applyMatrix4( _m )

		this.light.target.position.copy( _p )
		this.light.position.copy( _p ).addScaledVector( this.direction, this.distance )
		this.light.target.updateMatrixWorld()

	}

}
