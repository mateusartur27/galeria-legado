import { defineConfig } from 'vite';
import { toolAttachmentStorage } from './tools/ToolAttachmentStorage.mjs';
import { fileURLToPath } from 'node:url';
import { handReferenceStorage } from './tools/HandReferenceStorage.mjs';
import { rigReferenceStorage } from './tools/RigReferenceStorage.mjs';
import { golpeReferenceStorage } from './tools/GolpeReferenceStorage.mjs';
import { layoutReferenceStorage } from './tools/LayoutReferenceStorage.mjs';
export default defineConfig({
 plugins:[toolAttachmentStorage(fileURLToPath(new URL('.',import.meta.url))),handReferenceStorage(fileURLToPath(new URL('.',import.meta.url))),rigReferenceStorage(fileURLToPath(new URL('.',import.meta.url))),golpeReferenceStorage(fileURLToPath(new URL('.',import.meta.url))),layoutReferenceStorage(fileURLToPath(new URL('.',import.meta.url)))],
 server:{port:5186,strictPort:true,host:true},
 build:{target:'es2022',chunkSizeWarningLimit:1800,rollupOptions:{output:{manualChunks(id){if(id.includes('node_modules/three'))return 'three';}}}}
});
