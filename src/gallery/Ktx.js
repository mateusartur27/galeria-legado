import * as THREE from 'three/webgpu';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// Texturas comprimidas para a GPU (KTX2/Basis): 4–8× menos memória de vídeo que WebP/PNG e sem decodificar imagem na CPU.
// Pedir '/textures/x.webp' carrega '/textures/x.ktx2' (cai para o .webp se o .ktx2 não existir). Chame ktx2Loader.detectSupport(renderer) uma vez antes.
export const ktx2Loader = new KTX2Loader().setTranscoderPath('/basis/');
const plain = new THREE.TextureLoader();
export const texLoader = {
	loadAsync: url => ktx2Loader.loadAsync(url.replace(/\.webp$/, '.ktx2')).catch(() => plain.loadAsync(url)),
};
