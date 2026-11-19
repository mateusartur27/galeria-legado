import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ktx2Loader } from './Ktx.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { texture, vec3, vertexColor, positionGeometry, smoothstep, dot, mix, float, materialEmissive } from 'three/tsl';
import { MachadoWriting } from './MachadoWriting.js';
import { AleijadinhoWorking } from './AleijadinhoWorking.js';
import { ReboucasDrawing } from './ReboucasDrawing.js';
import { ReboucasObserving } from './ReboucasObserving.js';
import { SavedRigCalibration } from './SavedRigCalibration.js';
import { repairTorsoSkinWeights } from './TorsoSkinWeights.js';
import { buildStudyRoom } from './PeriodRoom.js';
import { buildAleijadinhoRoom } from './AleijadinhoRoom.js';
import { buildReboucasRoom } from './ReboucasRoom.js';
import { PeleRun } from './PeleRun.js';
import { buildAdhemarRoom, buildPeleRoom } from './AdhemarRoom.js';
import { AdhemarRun } from './AdhemarRun.js';
import { buildGloriaRoom } from './GloriaRoom.js';
import { addGloriaPoseControls, GloriaGreeting, MIC_URL } from './GloriaGreeting.js';
import { buildLuizGamaRoom } from './LuizGamaRoom.js';
import { seatLuizGama } from './LuizGamaReading.js';
import { buildPixinguinhaRoom } from './PixinguinhaRoom.js';
import { PixinguinhaPlaying } from './PixinguinhaPlaying.js';
import { buildMiltonRoom } from './MiltonRoom.js';
import { buildNiloRoom } from './NiloRoom.js';
import { NiloWriting } from './NiloWriting.js';
import { BAY_LENGTH, applyReceivedLighting, galleryBrightness, nicheInside } from './Gallery.js';

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
	model: '/models/characters/machado-escrita.glb?v=hands-corrected-20261114',
	// Altura do personagem em metros e onde ele fica no set (x ao longo do corredor, z para a frente).
	sharedSpot: true, // no passeio em anel, a luz da sala é uma só para a cena toda (ver CharacterSets.cull)
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
	model: '/models/characters/aleijadinho-martelando.glb', height: 1.55, stand: { x: 0.45, z: 0.55 }, facing: 0.0, aim: { x: -.3, z: -.3, y: 1.9 }, room: buildAleijadinhoRoom, lightScale: .12, openBack: true, maxX: 44,
}
// -------- André Rebouças: cais das Docas D. Pedro II, Rio de Janeiro, aurora de c. 1873 --------
const REBOUCAS = {
	id: 'reboucas', name: 'André Rebouças', dates: '1838 · 1898', role: 'Engenheiro e abolicionista',
	model: '/models/characters/reboucas-desenhando.glb', height: 1.7, stand: { x: 0.45, z: 0.55 }, facing: 0.0, room: buildReboucasRoom, lightScale: .12, openBack: true, maxX: 44,
}
// Escurecimento da pele de cada personagem (a pele vem pintada na textura; o shader escurece só os pixels de pele, mantendo detalhe).
export const SKIN = { aleijadinho: .78 } // 1 = sem mudança
// -------- Adhemar da Silva: pista azul de salto triplo (corre, salta na areia, levanta, repete) --------
const ADHEMAR = {
	id: 'adhemar', name: 'Adhemar da Silva', dates: '1927 · 2001', role: 'Atleta, bicampeão olímpico do salto triplo',
	model: '/models/characters/adhemar-tripo-braco-original.glb', strideRig: 1.589108, height: 1.78, stand: { x: -1.2, z: 0.35 }, facing: Math.PI / 2, cx: 1.5, eye: 2.1, pitch: -.2 /* câmera mais longe e mais alta: a pista inteira cabe no quadro, por cima do cordão */, room: buildAdhemarRoom, lightScale: .12, openBack: true, maxX: 44,
}
const PELE = {
	id: 'pele', name: 'Pelé', dates: '1940 · 2022', role: 'Futebolista, tricampeão mundial',
	model: '/models/characters/pele-corrida.glb', height: 1.73,
	cx: ADHEMAR.cx, eye: ADHEMAR.eye, pitch: ADHEMAR.pitch,
	room: buildPeleRoom, lightScale: ADHEMAR.lightScale, openBack: ADHEMAR.openBack, maxX: ADHEMAR.maxX,
}
// -------- Luiz Gama: frente do sobrado do escritório de rábula, Largo de São Francisco, São Paulo, noite de c. 1870 --------
const LUIZGAMA = {
	id: 'luizgama', name: 'Luiz Gama', dates: '1830 · 1882', role: 'Rábula, jornalista e abolicionista',
	model: '/models/rig-studio/luiz-gama.glb', height: 1.75, stand: { x: -0.1, z: 0.6 }, facing: 0.0, room: buildLuizGamaRoom, lightScale: .12, openBack: true, maxX: 44,
}
// -------- Pixinguinha: noite de roda de choro na Lapa, sob os Arcos (Rio de Janeiro) --------
const PIXINGUINHA = {
	id: 'pixinguinha', name: 'Pixinguinha', dates: '1897 · 1973', role: 'Compositor, flautista e saxofonista · Pai do choro',
	model: '/models/rig-studio/pixinguinha.glb', height: 1.75, eye: 1.47, pitch: -.12, aim: { x: .38, z: .42, y: .94 }, room: buildPixinguinhaRoom, lightScale: .12, openBack: true, maxX: 44,
}
// -------- Glória Maria: repórter de rua ao vivo, calçadão de Copacabana --------
const GLORIA = {
	id: 'gloria', name: 'Glória Maria', dates: '1949 · 2023', role: 'Jornalista e repórter · Primeira repórter negra da TV brasileira',
	model: '/models/set/gloria/gloria-detalhada.glb', height: 1.68, stand: { x: 0, z: .1 }, facing: 0, room: buildGloriaRoom, lightScale: .12, openBack: true, maxX: 44,
}
// -------- Milton Santos: Gabinete de Geografia, Universidade de São Paulo (USP), c. 1994 --------
const MILTON = {
	id: 'milton', name: 'Milton Santos', dates: '1926 · 2001', role: 'Geógrafo e pensador social · Prêmio Vautrin Lud',
	model: '/models/characters/milton-looking-behind.glb', height: 1.74, stand: { x: 0.0, z: 0.5 }, facing: 0.0,
	cx: 2.7, eye: 1.68, pitch: -0.04, aim: { x: 0.0, z: 0.5, y: 1.4 },
	room: buildMiltonRoom, lightScale: .12, openBack: false, maxX: 44,
}
// -------- Nilo Peçanha: gabinete presidencial no Palácio do Catete, Rio de Janeiro, 1909 --------
const NILO = {
	id: 'nilo', name: 'Nilo Peçanha', dates: '1867 · 1924', role: 'Presidente da República · ensino profissional',
	model: '/models/rig-studio/nilo.glb', height: 1.72,
	cx: 2.8, eye: 1.7, pitch: -0.04, room: buildNiloRoom, openBack: true, maxX: 11.15,
}
export const CATALOG = [ MACHADO, ALEIJADINHO, REBOUCAS, ADHEMAR, LUIZGAMA, PIXINGUINHA, GLORIA, MILTON, NILO, PELE ]

// Quem aparece onde.
//   people = quantas pessoas existem na galeria (1, 2, 3…), startSide = lado da primeira (-1 esquerda, 1 direita).
//   - 1 pessoa: ela fica sozinha no lado escolhido (startSide).
//   - 2 ou mais: alternam esquerda/direita a cada baia (0: startSide, 1: oposto, 2: startSide…), assim o corredor fica
//     equilibrado; com 2 pessoas cada uma ocupa um lado.
// Retorna [{ character, logical, side }]. `logical` é a baia onde o nicho está (a 1ª pessoa fica na baia `first`).
export function layout( people = 1, startSide = -1, first = 1, focus = null, only = null, pattern = null ) {
	const pool = only ? CATALOG.filter( c => only.includes( c.id ) ) : CATALOG // `only`: só estes personagens (o site publicado só tem o Machado: ele repete em todos os nichos)
	const order = focus && pool.some( c => c.id === focus ) ? [ pool.find( c => c.id === focus ), ...pool.filter( c => c.id !== focus ) ] : pool // `focus`: personagem que vai primeiro (link ?set=)
	return Array.from( { length: people }, ( _, i ) => ( { character: pattern ? CATALOG.find( c => c.id === pattern[ i % pattern.length ] ) ?? order[ i % order.length ] : order[ i % order.length ], logical: first + i, side: people === 1 ? startSide : ( i % 2 === 0 ? startSide : - startSide ) } ) )
}

const _bx = new THREE.Box3(), _pv = new THREE.Matrix4(), _fr = new THREE.Frustum(), _sp = new THREE.Sphere()

export class CharacterSets {
	constructor( gallery, { people = 1, side = -1, first = 1, focus = null, renderer = null, only = null, pattern = null, loop = false, maxRange = 1e9, nearDist = 18, lodDist = 1e9, minRadius = 0, empty = false, continuous = false } = {} ) {
		// loop = passeio infinito: as `people` salas formam um anel; quando uma fica para trás, pula `people` baias adiante (já escondida na névoa) e o passeio repete.
		this.empty = empty; this.continuous = continuous; this.loop = loop; this.period = people; this.range = Math.min( maxRange, people * BAY_LENGTH / ( continuous ? 4 : 2 ) - 3 ); this.nearDist = nearDist; this.lodDist = lodDist; this.minRadius = minRadius; this.first = first; this.startSide = side // range: além disso a sala fica escondida (a névoa já a apagou); o pulo de uma sala para a baia seguinte acontece sempre fora desse alcance
		this.renderer = renderer; this.gallery = gallery; this.entries = layout( people, side, first, focus, only, pattern ).map( e => ( { ...e, base: e.logical, group: new THREE.Group(), ready: false } ) )
		this.lights = []; this.statics = new Map(); this.characterMaterials = new Map(); this.dimensions = {}
		this.propMat = new THREE.MeshStandardNodeMaterial( { vertexColors: true, roughness: .72, metalness: .05 } )
		this.propMat.emissiveNode = vertexColor().mul( vec3( .2, .15, .1 ) ).mul( galleryBrightness )
		applyReceivedLighting( this.propMat )
		for ( const e of this.entries ) { gallery.scene.add( e.group ) }
	}
	async load() {
		if ( this.empty ) {
			for ( const entry of this.entries ) entry.ready = true
			return
		}
		const loader = new GLTFLoader().setMeshoptDecoder( MeshoptDecoder )
		if(this.renderer) loader.setKTX2Loader(ktx2Loader.detectSupport(this.renderer))
		let peleAssets, gloriaMicrophone;
		const modelCache = new Map() // um download/decodificação por modelo; as repetições são clones (geometria, materiais e texturas compartilhados)
		for ( const e of this.entries ) {
			const def = e.character
			// sala de época fechada (piso, paredes, abóbada, móveis) + placa na entrada
			e.room = await ( def.room ?? buildStudyRoom )( e.group, { galleryBrightness } )
			// luz do set: UMA só para a cena toda, que acompanha a sala mais próxima (uma luz por sala encareceria todos os pixels)
			if ( this.loop && def.sharedSpot && e.room?.sun?.isSpotLight ) {
				const s = e.room.sun
				if ( ! this.spot ) { this.spot = s.clone(); this.spot.target = new THREE.Object3D(); this.gallery.scene.add( this.spot, this.spot.target ) }
				e.spotLocal = { p: s.position.clone(), t: s.target.position.clone() }
				e.room.room.remove( s, s.target ); e.room.sun = this.spot
			}
			// personagem
			try {
				if ( def.model ) { let src = modelCache.get( def.model ); const first = ! src; if ( first ) { src = await loader.loadAsync( def.model ); modelCache.set( def.model, { ...src, scene: SkeletonUtils.clone( src.scene ) } ) /* molde intacto: o 1º personagem anima/calibra os ossos de src, os clones saem do molde */ }
					const gltf = first ? src : { ...src, scene: SkeletonUtils.clone( src.scene ) } // clona do molde, sem tocar nele
					if ( def.id === 'pele' ) peleAssets ??= Promise.all( [
						loader.loadAsync( '/models/set/pele/soccer-ball.glb' ),
						loader.loadAsync( '/models/characters/pele-chute.glb' ),
					] );
					if ( def.id === 'gloria' ) gloriaMicrophone ??= loader.loadAsync( MIC_URL );
					const assets = def.id === 'pele' ? await peleAssets
						: def.id === 'pixinguinha' ? [ await loader.loadAsync( '/models/set/pixinguinha/saxophone.glb' ) ]
						: def.id === 'gloria' ? await gloriaMicrophone : null;
					await this.placeCharacter( e, gltf, assets ); if(def.id==='aleijadinho'){const calibration=new SavedRigCalibration(e.animation);e.animation.rigCalibration=calibration;await calibration.load();await e.animation.toolEditor.load();} }
			} catch ( err ) { throw new Error(`Personagem ${def.id}: ${err.message}`) }
			e.ready = true; if ( this.loop ) this.buildLod( e )
		}
	}
	// Nível de detalhe por sala: objetos pequenos (< 0,55 m) só são desenhados quando a sala está perto (`lodDist`); de longe custam draw calls sem aparecer.
	buildLod( e ) {
		e.group.updateMatrixWorld( true ); e.small = []
		const box = new THREE.Box3(), sph = new THREE.Sphere()
		e.group.traverse( o => { if ( ! o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || ! o.visible ) return; box.setFromObject( o ); box.getBoundingSphere( sph ); if ( sph.radius < this.minRadius ) { o.visible = false; return } /* detalhes minúsculos: invisíveis no celular */ if ( sph.radius < 1.4 ) { o.userData.lodR = sph.radius; e.small.push( o ) } } )
	}
	material( src, id = null, meshName = '', mesh = null ) {
		if ( this.characterMaterials.has( src ) ) return this.characterMaterials.get( src )
		const vc = !! src.vertexColors, m = new THREE.MeshStandardNodeMaterial( { color: src.color.clone(), map: src.map, normalMap: src.normalMap, normalScale: new THREE.Vector2( .5, .5 ), roughness: Math.max( .55, src.roughness ?? .8 ), metalness: 0, side: src.side, vertexColors: vc } )
		if ( id === 'gloria' ) {
			m.roughness = src.roughness;
			m.roughnessMap = src.roughnessMap;
			m.metalness = src.metalness;
			m.metalnessMap = src.metalnessMap;
			m.emissive.copy( src.emissive );
			m.emissiveMap = src.emissiveMap;
			m.emissiveIntensity = src.emissiveIntensity;
		}
		const d = SKIN[ id ] // 1 = pele como veio no modelo; menor = mais escura
		if ( m.map ) {
			let c = texture( m.map ).rgb // vertexColors = tom de pele (Aleijadinho)
			let vcMask = float( 1 ); if ( vc ) { const v = vertexColor().rgb; vcMask = smoothstep( .03, .12, v.max( v.zxy ).max( v.yzx ).sub( v.min( v.zxy ).min( v.yzx ) ) ); c = c.mul( v ); m.vertexColors = false } // no Aleijadinho a cor de vértice marca a pele
			if ( d != null && d < 1 ) { // pele = pixels avermelhados; na cabeça vale a malha toda, no corpo só as mãos (pontas dos braços do modelo)
				const skin = vc ? vcMask : smoothstep( .05, .15, c.r.sub( c.b ) ).mul( smoothstep( 0, .05, c.r.sub( c.g ) ) )
				const region = /cabe/i.test( meshName ) || id === 'aleijadinho' ? float( 1 ) : smoothstep( .76, .84, positionGeometry.x.abs() )
					const lum = dot( c, vec3( .299, .587, .114 ) ); c = mix( c, vec3( 1, .58, .36 ).mul( lum ).mul( d * 1.6 ), skin.mul( region ) ) // troca a cor da pele por marrom (mesma luminosidade x d), mantendo o detalhe
			}
			if ( id === 'gloria' ) {
				// Reproduz a máscara do Blender nas coordenadas do GLB (+Y para cima).
				const p = positionGeometry.mul( vec3( ...mesh.scale.toArray() ) ).add( vec3( ...mesh.position.toArray() ) );
				const region = /cabe/i.test( meshName )
					? smoothstep( .865, .915, p.y ).mul( float( 1 ).sub( smoothstep( .10, .145, p.x.abs() ) ) ).mul( smoothstep( -.015, .055, p.z ) )
					: smoothstep( .82, .90, p.x.abs() ).max( float( 1 ).sub( smoothstep( -.79, -.68, p.y ) ) );
				const value = c.r.max( c.g ).max( c.b );
				const saturation = value.sub( c.r.min( c.g ).min( c.b ) ).div( value.max( .0001 ) );
				const skin = smoothstep( .55, .72, saturation ).mul( smoothstep( .045, .11, value ) );
				const skinTone = float( 1 ).sub( region.mul( skin ).mul( .40 ) );
				// Compensa a saturação das luzes quentes do set só nos tons de pele.
				const skinBalance = mix( vec3( 1 ), vec3( .66, .87, 1 ), skin );
				c = c.mul( skinBalance ).mul( skinTone );
				m.emissiveNode = materialEmissive.mul( skinBalance ).mul( skinTone ).mul( float( 1 ).sub( skin.mul( .25 ) ) );
			}
			if ( id === 'milton' ) {
				const skin = smoothstep( .025, .105, c.r.sub( c.g ) ).mul( smoothstep( .04, .13, c.r.sub( c.b ) ) )
				const region = /cabe/i.test( meshName ) ? float( 1 ) : smoothstep( .70, .745, positionGeometry.x.abs() )
				c = c.mul( mix( vec3( 1 ), vec3( .24, .27, .30 ), skin.mul( region ) ) )
			}
			if ( id === 'reboucas' ) {
				const original = c;
				const lum = dot( original, vec3( .299, .587, .114 ) );
				const head = /\.011$/.test( src.name );
				const skin = smoothstep( .025, .12, original.r.sub( original.g ) ).mul( smoothstep( .04, .16, original.r.sub( original.b ) ) ).mul( smoothstep( .055, .14, lum ) );
				const region = head ? float( 1 ) : smoothstep( .76, .88, positionGeometry.x.abs() );
				c = original.mul( mix( vec3( 1 ), vec3( .20, .30, .42 ), skin.mul( region ) ) );
				if ( head ) {
					// Dark texels describe hair, beard, brows and pupils: retain relief in neutral black.
					const hair = float( 1 ).sub( smoothstep( .045, .105, lum ) );
					c = mix( c, vec3( lum.mul( .12 ) ), hair );
				}
			}
			m.colorNode = c;
			if ( id !== 'machado' && id !== 'reboucas' && id !== 'gloria' ) m.emissiveNode = c.mul( vec3( .1, .08, .06 ) ).mul( galleryBrightness )
		} else {
			m.emissiveNode = vec3( m.color.r, m.color.g, m.color.b ).mul( vec3( .1, .08, .06 ) ).mul( galleryBrightness )
		}
		applyReceivedLighting( m ); this.characterMaterials.set( src, m ); return m
	}
	async placeCharacter( e, gltf, extraAssets ) {
		const def = e.character, root = gltf.scene
		if(def.id==='aleijadinho')repairTorsoSkinWeights(root);
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
		if ( def.id === 'pele' ) {
			root.traverse( node => {
				if ( !node.isMesh ) return;
				node.material = this.material( node.material, def.id, node.name );
				node.castShadow = true;
				node.receiveShadow = true;
				node.frustumCulled = false;
			} );
			const [ ball, strike ] = extraAssets;
			e.animation = new PeleRun( e, gltf, e.room, def.height, ball.scene.clone(), strike.animations[ 0 ] );
			this.dimensions[ def.id ] = { height: def.height, animated: true };
			return;
		}
		if ( def.id === 'adhemar' ) { // atleta: corre, salta na areia, levanta e repete
			root.traverse( n => { if ( n.isMesh ) { n.material = this.material( n.material, 'adhemar', n.name ); n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false } } )
			e.animation = new AdhemarRun( e, gltf, e.room, def )
			this.dimensions[ def.id ] = { height: def.height, animated: true }
			return
		}
		if ( def.id === 'reboucas' ) { // engenheiro sentado no banquinho, desenhando na prancheta
			root.traverse( n => { if ( n.isMesh ) { n.material = this.material( n.material, 'reboucas', n.name ); n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false } } )
			e.animation = e.room.mode === 'teodolito' ? new ReboucasObserving( e, gltf, e.room.theo, e.room.room, def.height, e.room.hands, e.room.hooks ) : new ReboucasDrawing( e, gltf, e.room.seat, def.height )
			this.dimensions[ def.id ] = { height: def.height, animated: true }
			return
		}
		if ( def.id === 'luizgama' ) {
			root.traverse( n => { if ( n.isMesh ) { n.material = this.material( n.material, def.id, n.name, n ); n.castShadow = true; n.receiveShadow = true } } )
			e.animation = seatLuizGama( e, root, def.height )
			this.dimensions[ def.id ] = { height: def.height, animated: true }
			return
		}
		if ( def.id === 'pixinguinha' ) {
			root.traverse( n => { if ( n.isMesh ) { n.material = this.material( n.material, def.id, n.name ); n.castShadow = true; n.receiveShadow = true } } )
			e.animation = new PixinguinhaPlaying( e, root, extraAssets[ 0 ].scene, def.height )
			this.dimensions[ def.id ] = { height: def.height, animated: true }
			return
		}
		if ( def.id === 'nilo' ) {
			const [reference, retouchedAlbedo] = await Promise.all([
				fetch('/rigs/nilo.json').then(r => { if (!r.ok) throw new Error('Rig do Nilo indisponível'); return r.json() }),
				new THREE.TextureLoader().loadAsync('/models/set/nilo/corpo-albedo-maos.png'),
			])
			const body = root.getObjectByName('Corpo_Nilo')
			if (body?.material?.map) {
				body.material = body.material.clone()
				body.material.map = body.material.map.clone()
				body.material.map.source = retouchedAlbedo.source
				body.material.map.needsUpdate = true
			}
			root.traverse( n => { if ( n.isMesh ) { n.material = this.material( n.material, 'nilo', n.name ); n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false } } )
			e.animation = new NiloWriting( e, gltf, e.room.seat, def.height, reference )
			this.dimensions[ def.id ] = { height: def.height, animated: true }
			return
		}
		root.updateMatrixWorld( true )
		const box = new THREE.Box3().setFromObject( root ), size = box.getSize( new THREE.Vector3() ), center = box.getCenter( new THREE.Vector3() )
		const scale = def.height / size.y
		this.dimensions[ def.id ] = { size: size.toArray().map( v => +v.toFixed( 3 ) ), scale: +scale.toFixed( 3 ) }
		const holder = new THREE.Group(); holder.name = `character-${def.id}`
		root.traverse( n => { if ( n.isMesh ) { n.material = this.material( n.material, def.id, n.name, n ); n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false } } )
		root.position.set( - center.x, - box.min.y, - center.z ); holder.add( root ); holder.scale.setScalar( scale )
		holder.position.set( def.stand.x, .035, def.stand.z ); holder.rotation.y = def.facing
		const spot = def.id === 'gloria' ? e.room?.spot : null
		if ( spot ) { holder.position.set( 0, 0, 0 ); spot.add( holder ) }
		else e.group.add( holder )
		e.character3d = holder
		if ( def.id === 'gloria' ) {
			e.animation = new GloriaGreeting( root, holder, extraAssets.scene );
			if ( e.room?.desk ) e.room.desk = addGloriaPoseControls( e.room.desk, e.animation );
			this.dimensions[ def.id ].animated = true;
		}
		if ( def.id === 'milton' ) {
			const clip = THREE.AnimationClip.findByName( gltf.animations, 'Looking Behind' )
			if ( ! clip ) throw new Error( 'Clipe Looking Behind ausente' )
			const mixer = new THREE.AnimationMixer( root )
			mixer.clipAction( clip ).play()
			mixer.update( 0 )
			e.animation = {
				root, holder, clip, mixer,
				update: dt => mixer.update( dt ),
				getStats: () => ( { clip: clip.name, duration: clip.duration, time: mixer.time % clip.duration } ),
			}
			this.dimensions[ def.id ].animated = true
		}
		if ( e.room?.anim ) e.animation = e.room.anim // cenário com vida própria (Pixinguinha: notas, bonde, estrelas)
	}
	stopDistance( logical ) {
		return BAY_LENGTH + ( logical - this.first + ( this.startSide === 1 ? 1 : 0 ) ) * BAY_LENGTH / 2
	}
	update( progress ) {
		const g = this.gallery
		for ( const e of this.entries ) {
			if ( this.continuous ) {
				const cycleDistance = this.period * BAY_LENGTH / 2
				e.logical = e.base + this.period * Math.round( ( progress - this.stopDistance( e.base ) ) / cycleDistance )
				e.side = ( e.logical - this.first ) % 2 === 0 ? this.startSide : -this.startSide
			} else if ( this.loop ) { // anel de salas: a mais próxima da câmera (±period/2 baias); lado alterna pela paridade da baia
				e.logical = e.base + this.period * Math.round( ( progress / BAY_LENGTH - e.base ) / this.period )
				e.side = ( ( ( e.logical - this.first ) % 2 ) + 2 ) % 2 === 0 ? this.startSide : - this.startSide
			}
			const z = this.continuous ? progress - this.stopDistance( e.logical ) : progress - e.logical * BAY_LENGTH + ( e.side === 1 ? - BAY_LENGTH / 2 : 0 ) // centro do nicho (esq.: no meio da baia; dir.: meia baia à frente)
			e.bay = this.continuous ? Math.floor( this.stopDistance( e.logical ) / BAY_LENGTH ) : e.logical
			e.group.position.set( e.side * NICHE_X, NICHE_TOP, z )
			e.group.rotation.y = e.side === - 1 ? Math.PI / 2 : - Math.PI / 2 // +Z local → corredor
			e.group.visible = Math.abs( z ) < 62
			e.worldZ = z
		}
	}
	// Chamar a cada quadro, depois de posicionar a câmera (só no passeio em anel): sala só desenhada se está ao alcance E no campo de visão;
	// o personagem só existe/anima nas salas a menos de 18 m; a luz do set vai para a sala visível mais próxima.
	cull( camera ) {
		// isolamento: com a câmera DENTRO de um nicho (além da parede do museu, na largura da abertura), os outros sets não são desenhados: nada de um set vaza no outro
		const inside = this.entries.find( e => e.worldZ !== undefined && Math.abs( e.worldZ - camera.position.z ) < 2.9 && camera.position.x * e.side > NICHE_X - .35 )
		nicheInside.value = inside ? 1 : 0
		let chg = false
		for ( const e of this.entries ) { const v = e === inside; if ( !! e.inside !== v ) chg = true; e.inside = v }
		if ( chg ) this.gallery.dirty = true // openWalls só vale com a câmera dentro do nicho (Gallery.bayFlag): do corredor as baias vizinhas ficam intactas
		const isolate = () => { if ( inside ) for ( const o of this.entries ) if ( o !== inside ) o.group.visible = false }
		if ( ! this.loop ) { isolate(); return }
		camera.updateMatrixWorld(); _pv.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse ); _fr.setFromProjectionMatrix( _pv )
		let best = null, bd = 1e9
		for ( const e of this.entries ) {
			if ( e.worldZ === undefined ) continue
			const x = e.side * NICHE_X, d = Math.hypot( x - camera.position.x, e.worldZ - camera.position.z )
			_bx.min.set( e.side === 1 ? 3.6 : - 7.6, 0, e.worldZ - 2.6 ); _bx.max.set( e.side === 1 ? 7.6 : - 3.6, 4.6, e.worldZ + 2.6 ) // abertura do nicho na parede: só vale a pena desenhar a sala se a entrada dela está no campo de visão
			e.group.visible = e.ready && Math.abs( e.worldZ ) < this.range && ( d < 6 || Math.abs( camera.position.x ) > 4 || _fr.intersectsBox( _bx ) )
			e.near = e.group.visible && d < this.nearDist
				if ( e.small && e.group.visible ) { const tier = d > this.lodDist * 1.6 ? 2 : d > this.lodDist ? 1 : 0; if ( tier !== e.tier ) { e.tier = tier; for ( const o of e.small ) o.visible = tier === 0 || ( tier === 1 && o.userData.lodR >= .55 ) || o.userData.lodR >= 1.4 } }
			if ( e.animation?.holder ) e.animation.holder.visible = e.near
			if ( e.group.visible && d < bd ) { bd = d; best = e }
		}
		isolate()
		if ( this.spot ) {
			if ( best?.spotLocal ) {
				if ( this.spotBase == null ) this.spotBase = this.spot.intensity
				best.group.updateMatrixWorld( true )
				this.spot.position.copy( best.spotLocal.p ).applyMatrix4( best.group.matrixWorld ); this.spot.target.position.copy( best.spotLocal.t ).applyMatrix4( best.group.matrixWorld )
				this.spot.intensity = this.spotBase
			} else if ( this.spotBase != null ) this.spot.intensity = 0
		}
	}
	animate(dt) { for (const e of this.entries) if (e.animation && e.group.visible && e.near !== false) e.animation.update(dt); }
	getStats() { return { sets: this.entries.map( e => ( { id: e.character.id, logical: e.logical, side: e.side, ready: e.ready, animation: e.animation?.getStats?.() } ) ), dimensions: this.dimensions } }
}








