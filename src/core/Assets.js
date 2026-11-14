import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

// Carregador único de assets (o que todos os sites analisados configuram):
// - Meshopt (padrão do tools/optimize-glb.mjs): decoder embutido no JS, sem fetch extra.
// - KTX2/Basis: texturas comprimidas na GPU (menos VRAM, upload rápido).
// - Draco: só se o asset vier assim (decoder via CDN).
// Uso: const assets = new Assets(renderer); const gltf = await assets.gltf('/models/casa.glb')
export class Assets {

	constructor( renderer, { threeVersion = '0.186.1' } = {} ) {

		this.manager = new THREE.LoadingManager()
		this.cache = new Map()

		const draco = new DRACOLoader( this.manager )
		draco.setDecoderPath( 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/' )

		const ktx2 = new KTX2Loader( this.manager )
		ktx2.setTranscoderPath( `https://cdn.jsdelivr.net/npm/three@${ threeVersion }/examples/jsm/libs/basis/` )
		ktx2.detectSupport( renderer )

		this.gltfLoader = new GLTFLoader( this.manager )
		this.gltfLoader.setDRACOLoader( draco )
		this.gltfLoader.setKTX2Loader( ktx2 )
		this.gltfLoader.setMeshoptDecoder( MeshoptDecoder )

		this.textureLoader = new THREE.TextureLoader( this.manager )
		this.ktx2Loader = ktx2

	}

	onProgress( fn ) {

		this.manager.onProgress = ( url, loaded, total ) => fn( loaded / total, url )

	}

	gltf( url ) {

		if ( ! this.cache.has( url ) ) this.cache.set( url, this.gltfLoader.loadAsync( url ) )
		return this.cache.get( url )

	}

	async texture( url, { srgb = true, repeat = false } = {} ) {

		const loader = url.endsWith( '.ktx2' ) ? this.ktx2Loader : this.textureLoader
		const tex = await loader.loadAsync( url )
		if ( srgb ) tex.colorSpace = THREE.SRGBColorSpace
		if ( repeat ) tex.wrapS = tex.wrapT = THREE.RepeatWrapping
		return tex

	}

}
