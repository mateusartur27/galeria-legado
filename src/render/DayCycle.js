import * as THREE from 'three/webgpu'

// Ciclo do dia (estudo do Bruno Simon 2025, código nosso): dia → entardecer → noite → amanhecer num laço (padrão 4 min).
// Cada momento é um conjunto de cores/intensidades; entre dois momentos tudo é interpolado e escrito nos uniforms do look
// (sol, sombra, névoa radial) → nenhum shader recompila. O sol também anda: sobe/desce e gira em volta do mundo.
// config (style.dayCycle): { duration, start, presets: { day, dusk, night, dawn }, keys: [[t, nome], …], sunSwing: [elev°, azim°] }
// URL: ?time=day|dusk|night|dawn (para no momento) · ?cycle=<segundos> (duração; 0 = parado)
// night (0..1) sai pronto para quem acende coisas à noite (lanternas: world/Lamps.js)
const NAMED = { day: 0.05, dusk: 0.25, night: 0.47, dawn: 0.8 }

export class DayCycle {

	constructor( { look, sun, config } ) {

		const params = new URLSearchParams( location.search )
		this.look = look
		this.sun = sun
		this.presets = Object.fromEntries( Object.entries( config.presets ).map( ( [ k, p ] ) => [ k, {
			...p, sunColor: new THREE.Color( p.sunColor ), shadow: new THREE.Color( p.shadow ),
			fogA: new THREE.Color( p.fogA ), fogB: new THREE.Color( p.fogB )
		} ] ) )
		this.keys = config.keys
		this.duration = params.has( 'cycle' ) ? Number( params.get( 'cycle' ) ) : config.duration ?? 240
		this.progress = NAMED[ params.get( 'time' ) ] ?? config.start ?? 0.05
		if ( params.has( 'time' ) && ! params.has( 'cycle' ) ) this.duration = 0
		this.base = { elevation: config.elevation, azimuth: config.azimuth }
		this.swing = config.sunSwing ?? [ 18, 70 ]
		this.night = 0
		this.apply()

	}

	update( dt ) {

		if ( this.duration > 0 ) this.progress = ( this.progress + dt / this.duration ) % 1
		this.apply()

	}

	apply() {

		const t = this.progress
		let i = 0
		while ( i < this.keys.length - 2 && this.keys[ i + 1 ][ 0 ] <= t ) i ++
		const [ t0, n0 ] = this.keys[ i ], [ t1, n1 ] = this.keys[ i + 1 ]
		const k = t1 > t0 ? THREE.MathUtils.smoothstep( t, t0, t1 ) : 0
		const a = this.presets[ n0 ], b = this.presets[ n1 ]
		const L = this.look
		L.sunColor.value.copy( a.sunColor ).lerp( b.sunColor, k )
		L.sunIntensity.value = THREE.MathUtils.lerp( a.intensity, b.intensity, k )
		L.shadowTint.value.copy( a.shadow ).lerp( b.shadow, k )
		L.fogColor.value.copy( a.fogA ).lerp( b.fogA, k )
		if ( L.fogRadial ) L.fogRadial.colorB.value.copy( a.fogB ).lerp( b.fogB, k )
		L.fogNear.value = THREE.MathUtils.lerp( a.near, b.near, k )
		L.fogFar.value = THREE.MathUtils.lerp( a.far, b.far, k )
		this.night = THREE.MathUtils.lerp( a.night ?? 0, b.night ?? 0, k )

		// sol: sobe e desce (elevação) e gira em volta (azimute) ao longo do laço
		const w = ( t + 9 / 16 ) * Math.PI * 2
		this.sun.setAngles( this.base.elevation - Math.cos( w ) * this.swing[ 0 ], this.base.azimuth + Math.sin( w ) * this.swing[ 1 ] )

	}

}
