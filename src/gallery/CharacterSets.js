import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ktx2Loader } from './Ktx.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { texture, vec3, vertexColor, positionGeometry, smoothstep, dot, mix, float } from 'three/tsl';
import { MachadoWriting } from './MachadoWriting.js';
import { AleijadinhoWorking } from './AleijadinhoWorking.js';
import { buildStudyRoom } from './PeriodRoom.js';
import { buildAleijadinhoRoom } from './AleijadinhoRoom.js';
import { buildReboucasRoom } from './ReboucasRoom.js';
import { BAY_LENGTH, applyReceivedLighting, galleryBrightness } from './Gallery.js';

// ---------------------------------------------------------------------------------------------
// Sets de personagens.
//  - Cada set é construído UMA vez num referencial local: origem no centro do nicho, no piso do pedestal,
//    +Z aponta para o corredor (frente do personagem), -Z para a parede do fundo, X acompanha o corredor.
//  - O set é só girado ±90° para cair no lado esquerdo ou direito. Nada é espelhado: texto e rosto continuam certos.
//  - Quantas pessoas existem e de que lado cada uma fica vem de `layout()` — ver comentário ali.
// ---------------------------------------------------------------------------------------------

export const NICHE_X = 6.25; // centro do nicho em relação ao eixo do corredor
export const NICHE_TOP = 0.21; // topo do pedestal
const mod = (a, b) => ((a % b) + b) % b;

function canvasTexture(w, h, paint) {
	const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h)
	const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t
}

function plaqueTexture(name, dates, role) {
	return canvasTexture(512, 256, ( c, w, h ) => {
		c.fillStyle = '#2a2320'; c.fillRect( 0, 0, w, h )
		c.strokeStyle = '#d4af6a'; c.lineWidth = 4; c.strokeRect( 10, 10, w - 20, h - 20 )
		c.lineWidth = 1.5; c.strokeRect( 20, 20, w - 40, h - 40 )
		c.fillStyle = '#ecd7a6'; c.textAlign = 'center'
		c.font = '600 46px Georgia'; c.fillText( name.toUpperCase(), w / 2, 98 )
		c.font = 'italic 30px Georgia'; c.fillText( dates, w / 2, 148 )
		c.fillStyle = '#c9a869'; c.fillRect( w / 2 - 60, 168, 120, 2 )
		c.font = '22px Georgia'; c.fillText( role, w / 2, 208 )
	} )
}

// Acumula caixas/cilindros com cor por vértice numa geometria só (1 draw call por material).
class SetBuilder {
	constructor() { this.parts = []; this.o = new THREE.Object3D() }
	add( g, p = [ 0, 0, 0 ], r = [ 0, 0, 0 ], tint = '#ffffff', s = [ 1, 1, 1 ] ) {
		g = g.index ? g.toNonIndexed() : g
		this.o.position.set( ...p ); this.o.rotation.set( ...r ); this.o.scale.set( ...s ); this.o.updateMatrix(); g.applyMatrix4( this.o.matrix )
		const c = new THREE.Color( tint ), n = g.attributes.position.count, col = new Float32Array( n * 3 )
		for ( let i = 0; i < n; i ++ ) { col[ i * 3 ] = c.r; col[ i * 3 + 1 ] = c.g; col[ i * 3 + 2 ] = c.b }
		g.setAttribute( 'color', new THREE.BufferAttribute( col, 3 ) )
		if ( ! g.attributes.uv ) g.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( n * 2 ), 2 ) )
		for ( const k of Object.keys( g.attributes ) ) if ( ! [ 'position', 'normal', 'uv', 'color' ].includes( k ) ) g.deleteAttribute( k )
		this.parts.push( g ); return this
	}
	box( p, s, tint, r ) { return this.add( new THREE.BoxGeometry( 1, 1, 1 ), p, r, tint, s ) }
	round( p, s, tint, radius = .03, r ) { return this.add( new RoundedBoxGeometry( s[ 0 ], s[ 1 ], s[ 2 ], 2, radius ), p, r, tint ) }
	cyl( p, rt, rb, h, tint, seg = 14, r ) { return this.add( new THREE.CylinderGeometry( rt, rb, h, seg ), p, r, tint ) }
	finish() { const g = mergeGeometries( this.parts, false ); this.parts.forEach( p => p.dispose() ); g.computeBoundingSphere(); return g }
}

// Estante com livros: fileiras de lombadas de cores/alturas variadas (determinístico).
function bookshelf( b, { x = 0, z = -1.18, w = 3.7, h = 2.75, shelves = 5, wood = '#4a3326', seed = 7 } ) {
	let s = seed; const rnd = () => ( s = ( Math.imul( s, 1664525 ) + 1013904223 ) >>> 0 ) / 4294967296
	const spines = [ '#7b2d26', '#2f4a3d', '#1f3552', '#8a6a2f', '#5a3b52', '#3b2a22', '#b08a52', '#2d3b3a', '#6b4f2c', '#9a4a32' ]
	b.box( [ x, h / 2, z - .13 ], [ w + .16, h, .06 ], '#2a1d16' ) // fundo
	b.box( [ x - w / 2 - .04, h / 2, z ], [ .1, h, .36 ], wood ); b.box( [ x + w / 2 + .04, h / 2, z ], [ .1, h, .36 ], wood )
	b.box( [ x, h + .06, z ], [ w + .34, .12, .42 ], wood ); b.box( [ x, .06, z ], [ w + .2, .12, .4 ], wood )
	const gap = ( h - .2 ) / shelves
	for ( let i = 0; i <= shelves; i ++ ) {
		const y = .12 + i * gap
		b.box( [ x, y, z ], [ w, .04, .34 ], wood )
		if ( i === shelves ) break
		let cx = x - w / 2 + .05
		while ( cx < x + w / 2 - .12 ) {
			const bw = .035 + rnd() * .045, bh = gap * ( .62 + rnd() * .32 ), skip = rnd() < .05
			if ( skip ) { cx += .14; continue }
			const lean = rnd() < .06 ? ( rnd() - .5 ) * .35 : 0
			b.box( [ cx + bw / 2, y + .02 + bh / 2, z + .02 ], [ bw, bh, .22 + rnd() * .06 ], spines[ Math.floor( rnd() * spines.length ) ], [ 0, 0, lean ] )
			if ( rnd() < .35 ) b.box( [ cx + bw / 2, y + .02 + bh * .72, z + .14 ], [ bw * 1.02, .012, .01 ], '#d6b26a' ) // filete dourado
			cx += bw + .004
		}
	}
}

// -------- Cenário do Machado de Assis: gabinete de escritor do Rio, séc. XIX --------
const MACHADO = {
	id: 'machado', name: 'Machado de Assis', dates: '1839 · 1908', role: 'Escritor · Fundador da ABL',
	model: '/models/characters/machado-escrita.glb',
	// Altura do personagem em metros e onde ele fica no set (x ao longo do corredor, z para a frente).
	height: 1.72, stand: { x: 0.45, z: 0.55 }, facing: 0.0,
	build( b ) {
		const wood = '#5a3d2b', dark = '#352318', gold = '#d3ad66', leather = '#7a2f2a'
		// Tapete oriental
		b.box( [ 0, .008, .05 ], [ 3.3, .016, 2.3 ], '#6e2230' )
		b.box( [ 0, .018, .05 ], [ 3.0, .008, 2.0 ], '#a48a4f' ); b.box( [ 0, .022, .05 ], [ 2.84, .008, 1.84 ], '#52202c' )
		b.box( [ 0, .028, .05 ], [ 1.9, .008, 1.1 ], '#2e4a52' ); b.box( [ 0, .034, .05 ], [ 1.5, .008, .8 ], '#8a2d3a' )
		// Estante cobrindo o fundo
		bookshelf( b, { x: 0, z: -1.16, w: 3.7, h: 2.75 } )
		// Escrivaninha (à esquerda do personagem), com tampo de couro, livro aberto, tinteiro e pena
		const dx = - 0.95, dz = - 0.25
		b.round( [ dx, .74, dz ], [ 1.25, .07, .66 ], wood, .02 )
		b.box( [ dx, .779, dz ], [ 1.05, .01, .5 ], leather )
		for ( const sx of [ -1, 1 ] ) b.box( [ dx + sx * .55, .36, dz ], [ .08, .72, .56 ], dark )
		b.box( [ dx, .62, dz ], [ 1.0, .22, .5 ], wood ); b.box( [ dx, .62, dz + .26 ], [ .9, .16, .01 ], dark )
		b.cyl( [ dx - .3, .65, dz + .27 ], .018, .018, .03, gold, 8, [ Math.PI / 2, 0, 0 ] )
		b.cyl( [ dx + .3, .65, dz + .27 ], .018, .018, .03, gold, 8, [ Math.PI / 2, 0, 0 ] )
		b.box( [ dx + .05, .795, dz + .02 ], [ .44, .02, .3 ], '#d8c9a3' ); b.box( [ dx + .05, .81, dz + .02 ], [ .42, .01, .28 ], '#efe3c2', [ 0, 0, 0 ] )
		b.box( [ dx + .05, .812, dz + .02 ], [ .01, .012, .27 ], '#9a8a62' )
		for ( let i = 0; i < 6; i ++ ) { b.box( [ dx - .05 - i * .02, .818, dz - .1 + i * .035 ], [ .17, .002, .004 ], '#6a5b3d' ); b.box( [ dx + .17 + i * .0, .818, dz - .1 + i * .035 ], [ .15, .002, .004 ], '#6a5b3d' ) }
		b.box( [ dx - .45, .84, dz - .1 ], [ .26, .06, .18 ], '#2f4a3d' ); b.box( [ dx - .45, .895, dz - .1 ], [ .24, .05, .16 ], '#8a2d3a' ) // pilha de livros
		b.cyl( [ dx + .45, .835, dz + .12 ], .035, .04, .06, '#1b1b22', 12 ); b.cyl( [ dx + .45, .87, dz + .12 ], .02, .035, .02, gold, 12 ) // tinteiro
		b.cyl( [ dx + .42, .93, dz + .1 ], .004, .002, .24, '#e8e2d0', 5, [ 0, 0, -.45 ] ) // pena
		// Abajur de mesa com cúpula verde
		b.cyl( [ dx - .42, .81, dz + .08 ], .05, .06, .03, gold, 14 ); b.cyl( [ dx - .42, .93, dz + .08 ], .012, .012, .22, gold, 8 )
		b.add( new THREE.CylinderGeometry( .08, .16, .13, 20, 1, true ), [ dx - .42, 1.07, dz + .08 ], [ 0, 0, 0 ], '#2d6a4a' )
		// Cadeira de espaldar, de frente para a escrivaninha
		const cx = dx, cz = dz + .78
		b.round( [ cx, .46, cz ], [ .5, .08, .5 ], leather, .03 ); b.box( [ cx, .72, cz + .22 ], [ .46, .56, .05 ], wood )
		for ( const [ sx, sz ] of [ [ -.2, -.2 ], [ .2, -.2 ], [ -.2, .2 ], [ .2, .2 ] ] ) b.box( [ cx + sx, .21, cz + sz ], [ .045, .42, .045 ], dark )
		// Poltrona lateral e mesinha com livro
		b.round( [ 1.65, .35, - 0.15 ], [ .8, .5, .8 ], '#31503f', .09 ); b.round( [ 1.65, .76, -.5 ], [ .8, .55, .16 ], '#31503f', .06 )
		b.round( [ 1.65, .6, .45 ], [ .5, .03, .5 ], wood, .015 ); b.cyl( [ 1.65, .3, .45 ], .03, .05, .58, dark, 10 )
		// Globo terrestre
		b.cyl( [ -1.78, .38, .5 ], .03, .06, .76, dark, 8 ); b.add( new THREE.SphereGeometry( .21, 20, 14 ), [ -1.78, .98, .5 ], [ 0, 0, .4 ], '#5b8aa0' )
		b.add( new THREE.TorusGeometry( .23, .01, 6, 24 ), [ -1.78, .98, .5 ], [ Math.PI / 2, 0, .4 ], gold )
		// Busto-pedestal discreto e vaso com ramos (nicho do canto)
		// Placa de identificação (frente) vem em mesh separado, com textura própria
	},
}
// -------- Ateliê do Aleijadinho: casa de pau-a-pique em Vila Rica, fim do séc. XVIII --------
const ALEIJADINHO = {
	id: 'aleijadinho', name: 'Aleijadinho', dates: '1738 · 1814', role: 'Escultor e arquiteto do barroco mineiro',
	model: '/models/characters/aleijadinho-martelando.glb', height: 1.55, stand: { x: 0.45, z: 0.55 }, facing: 0.0, room: buildAleijadinhoRoom, lightScale: .12, openBack: true, maxX: 44,
}
// -------- André Rebouças: cais das Docas D. Pedro II, Rio de Janeiro, aurora de c. 1873 --------
const REBOUCAS = {
	id: 'reboucas', name: 'André Rebouças', dates: '1838 · 1898', role: 'Engenheiro e abolicionista',
	model: null, height: 1.5, stand: { x: 0.45, z: 0.55 }, facing: 0.0, room: buildReboucasRoom, lightScale: .12, openBack: true, maxX: 44,
}
// Escurecimento da pele de cada personagem (a pele vem pintada na textura; o shader escurece só os pixels de pele, mantendo detalhe).
export const SKIN = { machado: .52, aleijadinho: .78 } // 1 = sem mudança
export const CATALOG = [ MACHADO, ALEIJADINHO, REBOUCAS ]

// Quem aparece onde.
//   people = quantas pessoas existem na galeria (1, 2, 3…), startSide = lado da primeira (-1 esquerda, 1 direita).
//   - 1 pessoa: ela fica sozinha no lado escolhido (startSide).
//   - 2 ou mais: alternam esquerda/direita a cada baia (0: startSide, 1: oposto, 2: startSide…), assim o corredor fica
//     equilibrado; com 2 pessoas cada uma ocupa um lado.
// Retorna [{ character, logical, side }]. `logical` é a baia onde o nicho está (a 1ª pessoa fica na baia `first`).
export function layout( people = 1, startSide = -1, first = 1, focus = null ) {
	const order = focus && CATALOG.some( c => c.id === focus ) ? [ CATALOG.find( c => c.id === focus ), ...CATALOG.filter( c => c.id !== focus ) ] : CATALOG // `focus`: personagem que vai primeiro (link ?set=)
	return Array.from( { length: people }, ( _, i ) => ( { character: order[ i % order.length ], logical: first + i, side: people === 1 ? startSide : ( i % 2 === 0 ? startSide : - startSide ) } ) )
}

export class CharacterSets {
	constructor( gallery, { people = 1, side = -1, first = 1, focus = null, renderer = null } = {} ) {
		this.renderer = renderer; this.gallery = gallery; this.entries = layout( people, side, first, focus ).map( e => ( { ...e, group: new THREE.Group(), ready: false } ) )
		this.lights = []; this.statics = new Map(); this.characterMaterials = new Map(); this.dimensions = {}
		this.propMat = new THREE.MeshStandardNodeMaterial( { vertexColors: true, roughness: .72, metalness: .05 } )
		this.propMat.emissiveNode = vertexColor().mul( vec3( .2, .15, .1 ) ).mul( galleryBrightness )
		applyReceivedLighting( this.propMat )
		for ( const e of this.entries ) { gallery.scene.add( e.group ) }
	}
	async load() {
		const loader = new GLTFLoader().setMeshoptDecoder( MeshoptDecoder )
		if(this.renderer) loader.setKTX2Loader(ktx2Loader.detectSupport(this.renderer))
		for ( const e of this.entries ) {
			const def = e.character
			// sala de época fechada (piso, paredes, abóbada, móveis) + placa na entrada
			e.room = await ( def.room ?? buildStudyRoom )( e.group, { galleryBrightness } )
			// personagem
			try {
				if ( def.model ) { const gltf = await loader.loadAsync( def.model ); this.placeCharacter( e, gltf ) }
			} catch ( err ) { throw new Error(`Personagem ${def.id}: ${err.message}`) }
			e.ready = true
		}
	}
	material( src, id = null, meshName = '' ) {
		if ( this.characterMaterials.has( src ) ) return this.characterMaterials.get( src )
		const vc = !! src.vertexColors, m = new THREE.MeshStandardNodeMaterial( { color: src.color.clone(), map: src.map, normalMap: src.normalMap, normalScale: new THREE.Vector2( .5, .5 ), roughness: Math.max( .55, src.roughness ?? .8 ), metalness: 0, side: src.side, vertexColors: vc } )
		const d = SKIN[ id ] // 1 = pele como veio no modelo; menor = mais escura
		if ( m.map ) {
			let c = texture( m.map ).rgb // vertexColors = tom de pele (Aleijadinho)
			let vcMask = float( 1 ); if ( vc ) { const v = vertexColor().rgb; vcMask = smoothstep( .03, .12, v.max( v.zxy ).max( v.yzx ).sub( v.min( v.zxy ).min( v.yzx ) ) ); c = c.mul( v ); m.vertexColors = false } // no Aleijadinho a cor de vértice marca a pele
			if ( d != null && d < 1 ) { // pele = pixels avermelhados; na cabeça vale a malha toda, no corpo só as mãos (pontas dos braços do modelo)
				const skin = vc ? vcMask : smoothstep( .05, .15, c.r.sub( c.b ) ).mul( smoothstep( 0, .05, c.r.sub( c.g ) ) )
				const region = /cabe/i.test( meshName ) || id === 'aleijadinho' ? float( 1 ) : smoothstep( .76, .84, positionGeometry.x.abs() )
				const lum = dot( c, vec3( .299, .587, .114 ) ); c = mix( c, vec3( 1, .58, .36 ).mul( lum ).mul( d * 1.6 ), skin.mul( region ) ) // troca a cor da pele por marrom (mesma luminosidade x d), mantendo o detalhe
			}
			m.colorNode = c; m.emissiveNode = c.mul( vec3( .1, .08, .06 ) ).mul( galleryBrightness )
		}		applyReceivedLighting( m ); this.characterMaterials.set( src, m ); return m
	}
	placeCharacter( e, gltf ) {
		const def = e.character, root = gltf.scene
		if (def.id === 'machado') {
			root.traverse(n => {if(n.isMesh){n.material=this.material(n.material,'machado',n.name);n.castShadow=true;n.receiveShadow=true;n.frustumCulled=false;}})
			e.animation = new MachadoWriting(e, gltf);
			this.dimensions[def.id] = {height:1.72, animated:true};
			return;
		}
		if ( def.id === 'aleijadinho' ) { // escultor no andaime: rig + animação do Mixamo, ferramentas amarradas aos braços
			root.traverse( n => { if ( n.isMesh ) { n.material = this.material( n.material, 'aleijadinho', n.name ); n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false } } )
			e.animation = new AleijadinhoWorking( e, gltf, e.room.scaf, e.room.workPose )
			this.dimensions[ def.id ] = { height: def.height, animated: true }
			return
		}
		root.updateMatrixWorld( true )
		const box = new THREE.Box3().setFromObject( root ), size = box.getSize( new THREE.Vector3() ), center = box.getCenter( new THREE.Vector3() )
		const scale = def.height / size.y
		this.dimensions[ def.id ] = { size: size.toArray().map( v => +v.toFixed( 3 ) ), scale: +scale.toFixed( 3 ) }
		const holder = new THREE.Group(); holder.name = `character-${def.id}`
		root.traverse( n => { if ( n.isMesh ) { n.material = this.material( n.material, def.id, n.name ); n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false } } )
		root.position.set( - center.x, - box.min.y, - center.z ); holder.add( root ); holder.scale.setScalar( scale )
		holder.position.set( def.stand.x, .035, def.stand.z ); holder.rotation.y = def.facing
		e.group.add( holder ); e.character3d = holder
	}
	update( progress ) {
		const g = this.gallery
		for ( const e of this.entries ) {
			const z = progress - e.logical * BAY_LENGTH + ( e.side === 1 ? - BAY_LENGTH / 2 : 0 ) // centro do nicho (esq.: no meio da baia; dir.: meia baia à frente)
			e.group.position.set( e.side * NICHE_X, NICHE_TOP, z )
			e.group.rotation.y = e.side === - 1 ? Math.PI / 2 : - Math.PI / 2 // +Z local → corredor
			e.group.visible = Math.abs( z ) < 62
			e.worldZ = z
		}
	}
	animate(dt) { for (const e of this.entries) if (e.animation && e.group.visible) e.animation.update(dt); }
	getStats() { return { sets: this.entries.map( e => ( { id: e.character.id, logical: e.logical, side: e.side, ready: e.ready, animation: e.animation?.getStats() } ) ), dimensions: this.dimensions } }
}








