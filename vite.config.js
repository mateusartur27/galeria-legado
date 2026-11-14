import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { handReferenceStorage } from './tools/HandReferenceStorage.mjs';
import { rigReferenceStorage } from './tools/RigReferenceStorage.mjs';
export default defineConfig({
 plugins:[handReferenceStorage(fileURLToPath(new URL('.',import.meta.url))),rigReferenceStorage(fileURLToPath(new URL('.',import.meta.url)))],
 server:{port:5186,strictPort:true,host:true},
 build:{target:'es2022',chunkSizeWarningLimit:1800,rollupOptions:{output:{manualChunks(id){if(id.includes('node_modules/three'))return 'three';}}}}
});
