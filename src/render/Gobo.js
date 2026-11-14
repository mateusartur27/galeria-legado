import * as THREE from 'three/webgpu'
import { Fn, texture, positionWorld, luminance, smoothstep, float, vec2, time, mix, uniform } from 'three/tsl'

/**
 * GOBO (Firewood / screen.toys): sombras de folhagem ANIMADAS projetadas pelo sol, sem nenhuma árvore de verdade.
 * Um quad invisível na câmera (colorWrite = false) fica entre o sol e o jogador e só existe no shadow pass:
 * maskShadowNode recorta o quad com um VÍDEO de folhas balançando (escuro = folha = bloqueia luz).
 *
 * - O padrão é preso ao MUNDO (projeção ao longo do sol até y = 0), então não "anda" junto com o quad.
 * - `coverage` liga/desliga o efeito em manchas grandes → áreas sombreadas por copas invisíveis + clareiras de sol.
 * - Sem vídeo (arquivo ausente ou bloqueado) usa um padrão procedural com o mesmo visual.
 * Gerar o vídeo: node D:/threejs-lab/tools/make-gobo-video.mjs public/gobo/leaves.webm
 *
 * config: { video, scale (m por repetição), coverage 0..1, threshold, distance (m até o jogador, rumo ao sol), size }
 */
export class Gobo {

	constructor( { look, sun, noiseTexture, config } ) {

		this.sun = sun
		this.distance = config.distance ?? 5
		const size = config.size ?? 18
		const scale = config.scale ?? 7

		this.useVideo = uniform( 0 )
		this.coverage = uniform( config.coverage ?? 0.45 )
		this.threshold = uniform( config.threshold ?? 0.5 )
		const placeholder = new THREE.DataTexture( new Uint8Array( [ 255, 255, 255, 255 ] ), 1, 1 )
		placeholder.needsUpdate = true
		// ponto do chão "dono" deste fragmento do quad (projeção ao longo do raio de sol até y = 0)
		const sd = look.sunDir
		const P = positionWorld.xz.sub( sd.xz.div( sd.y.max( 0.2 ) ).mul( positionWorld.y ) )
		// nó de textura com UV fixo; trocamos só .value quando o vídeo carrega (sem recompilar)
		this.videoNode = texture( placeholder, P.div( scale ) )

		const material = new THREE.MeshBasicNodeMaterial( { side: THREE.DoubleSide, colorWrite: false, depthWrite: false } )
		material.maskShadowNode = Fn( () => {

			// vídeo: luminância invertida (folha escura = 1)
			const fromVideo = float( 1 ).sub( luminance( this.videoNode.rgb ) )

			// procedural: 2 camadas de ruído deslizando em sentidos opostos (copas balançando)
			const sway = vec2( time.mul( 0.9 ).sin(), time.mul( 0.7 ).cos() ).mul( 0.25 )
			const a = texture( noiseTexture, P.add( sway ).mul( 0.16 ) ).r
			const b = texture( noiseTexture, P.sub( sway.mul( 1.6 ) ).mul( 0.43 ) ).g
			const fromNoise = smoothstep( 0.42, 0.58, a.mul( 0.55 ).add( b.mul( 0.45 ) ) )

			const leaves = mix( fromNoise, fromVideo, this.useVideo )
			const cover = smoothstep( this.coverage.sub( 0.06 ), this.coverage.add( 0.06 ), texture( noiseTexture, P.mul( 0.017 ) ).b )
			return leaves.mul( cover ).greaterThan( this.threshold )

		} )()

		this.mesh = new THREE.Mesh( new THREE.PlaneGeometry( size, size ), material )
		this.mesh.castShadow = true
		this.mesh.receiveShadow = false
		this.mesh.frustumCulled = false
		this.mesh.renderOrder = - 1

		if ( config.video ) this.loadVideo( config.video )

	}

	loadVideo( url ) {

		const video = document.createElement( 'video' )
		Object.assign( video, { src: url, loop: true, muted: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' } )
		video.addEventListener( 'canplay', () => {

			if ( this.video ) return
			this.video = video
			video.currentTime = Math.random() * ( video.duration || 1 ) // cada sessão começa num ponto diferente (como o Firewood)
			const tex = new THREE.VideoTexture( video )
			tex.wrapS = tex.wrapT = THREE.RepeatWrapping
			tex.colorSpace = THREE.SRGBColorSpace // exigido para vídeo no WebGPU (o padrão é preto/branco, o limiar não muda)
			this.videoNode.value = tex
			this.useVideo.value = 1

		}, { once: true } )
		video.addEventListener( 'error', () => console.info( `[gobo] vídeo ${ url } indisponível → padrão procedural` ) )
		video.play().catch( () => addEventListener( 'pointerdown', () => video.play(), { once: true } ) )

	}

	update( target ) {

		const dir = this.sun.direction
		this.mesh.position.copy( target ).addScaledVector( dir, this.distance )
		this.mesh.lookAt( this.mesh.position.x + dir.x, this.mesh.position.y + dir.y, this.mesh.position.z + dir.z )

	}

}
