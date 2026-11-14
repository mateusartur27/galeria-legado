import * as THREE from 'three/webgpu'

const TONE = {
	neutral: THREE.NeutralToneMapping,
	agx: THREE.AgXToneMapping,
	aces: THREE.ACESFilmicToneMapping,
	none: THREE.NoToneMapping
}

// Renderer + loop + resize + resolução adaptativa (mantém ~60 FPS baixando/subindo o pixel ratio).
export class Engine {

	constructor( settings ) {

		this.settings = settings
		this.maxDpr = Math.min( devicePixelRatio, settings.quality.maxDpr )
		this.minDpr = Math.min( 0.75, this.maxDpr )
		this.dpr = settings.fixedDpr ?? this.maxDpr
		this.adaptive = settings.fixedDpr === null
		this.frameTimes = []
		this.windowStart = performance.now()
		this.goodWindows = 0
		this.timer = new THREE.Timer()
		this.timer.connect( document ) // pausa o delta quando a aba fica oculta
		this.listeners = []

	}

	async init() {

		const { settings } = this
		const style = settings.style

		const renderer = new THREE.WebGPURenderer( {
			antialias: false, // AA em pós (FXAA/SMAA)
			powerPreference: 'high-performance',
			forceWebGL: settings.forceWebGL
		} )
		renderer.setPixelRatio( this.dpr )
		renderer.setSize( innerWidth, innerHeight )
		renderer.shadowMap.enabled = style.shadows?.type !== 'blob'
		renderer.shadowMap.type = THREE.PCFShadowMap // PCFSoftShadowMap foi removido na r186
		renderer.toneMapping = TONE[ style.toneMapping ] ?? THREE.NeutralToneMapping
		renderer.toneMappingExposure = style.exposure ?? 1
		renderer.domElement.classList.add( 'game-canvas' )
		document.body.prepend( renderer.domElement )
		await renderer.init()
		this.renderer = renderer
		this.backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2'

		addEventListener( 'resize', () => this.resize() )
		return this

	}

	onResize( fn ) { this.listeners.push( fn ) }

	resize() {

		this.renderer.setSize( innerWidth, innerHeight )
		for ( const fn of this.listeners ) fn( innerWidth, innerHeight )

	}

	setLoop( fn ) {

		this.renderer.setAnimationLoop( ( t ) => {

			this.timer.update( t )
			const dt = Math.min( this.timer.getDelta(), 1 / 20 )
			const t0 = performance.now()
			fn( dt, this.timer.getElapsed() )
			this.track( performance.now() - t0, dt )

		} )

	}

	// Resolução adaptativa por janela de 1.5 s
	track( cpuMs, dt ) {

		this.frameTimes.push( dt * 1000 )
		const now = performance.now()
		if ( now - this.windowStart < 1500 ) return
		const avg = this.frameTimes.reduce( ( a, b ) => a + b, 0 ) / this.frameTimes.length
		this.fps = 1000 / avg
		this.frameMs = avg
		this.frameTimes.length = 0
		this.windowStart = now
		if ( ! this.adaptive ) return

		if ( avg > 21 && this.dpr > this.minDpr ) {

			this.dpr = Math.max( this.minDpr, this.dpr - 0.25 )
			this.renderer.setPixelRatio( this.dpr )
			this.goodWindows = 0

		} else if ( avg < 17.5 && this.dpr < this.maxDpr ) {

			if ( ++ this.goodWindows >= 3 ) {

				this.dpr = Math.min( this.maxDpr, this.dpr + 0.25 )
				this.renderer.setPixelRatio( this.dpr )
				this.goodWindows = 0

			}

		}

	}

}
