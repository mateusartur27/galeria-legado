import { LightProbeGrid } from 'three/addons/lighting/LightProbeGrid.js'
import { LightProbeGridNode } from 'three/addons/tsl/lighting/LightProbeGridNode.js'

/**
 * GI barata assada (Starter Kit Racing usa LightProbeGrid): uma grade 3D de sondas captura a luz em volta
 * (céu + chão iluminado + sombras) em harmônicos esféricos → luz indireta COLORIDA por região
 * (embaixo das árvores mais escuro/esverdeado, perto de areia mais quente), custo ~0 por frame.
 * Só afeta materiais PBR (o modelo toon ignora luz indireta de propósito).
 *
 * O bake é feito em fatias (`perFrame` sondas por quadro) depois do 1º frame → o jogo abre na hora.
 * config: { size: [w, h, d], probes: [nx, ny, nz], perFrame, cubemapSize }
 */
export class ProbeGI {

	constructor( { renderer, scene, center, config } ) {

		const [ w, h, d ] = config.size ?? [ 90, 14, 90 ]
		const [ nx, ny, nz ] = config.probes ?? [ 12, 3, 12 ]
		// registra o nó de luz ANTES de compilar a cena (o bake() só faz isso no 1º bake → aviso "Light node not found")
		if ( renderer.library.getLightNodeClass( LightProbeGrid ) === null ) renderer.library.addLight( LightProbeGridNode, LightProbeGrid )
		this.grid = new LightProbeGrid( w, h, d, nx, ny, nz )
		this.grid.position.copy( center )
		this.grid.intensity = config.intensity ?? 1
		this.renderer = renderer
		this.scene = scene
		this.total = nx * ny * nz
		this.next = 0
		this.perFrame = config.perFrame ?? 16
		this.cubemapSize = config.cubemapSize ?? 16
		scene.add( this.grid )

	}

	get done() { return this.next >= this.total }

	// chamar ANTES de renderizar o frame; devolve true enquanto ainda está assando
	update() {

		if ( this.done ) return false
		const count = Math.min( this.perFrame, this.total - this.next )
		this.grid.bake( this.renderer, this.scene, { start: this.next, count, cubemapSize: this.cubemapSize, far: 600 } ) // far > raio do céu (450)
		this.next += count
		return true

	}

}
