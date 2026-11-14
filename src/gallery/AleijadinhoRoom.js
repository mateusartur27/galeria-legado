import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texture, vec2, vec3, vec4, float, mix, smoothstep, vertexColor, positionLocal, positionWorld, cameraPosition, modelWorldMatrixInverse, select } from 'three/tsl';
import { ROOM, TAU, canvasTex, withColor, xf, tube, arcPts, wallPanel, box, loadModel, texLoader, texCache, polyTex } from './PeriodRoom.js';

// ---------------------------------------------------------------------------------------------
// Aleijadinho (Antônio Francisco Lisboa) — canteiro ao ar livre, adro do Santuário do Bom Jesus de Matosinhos, Congonhas, c. 1800.
// O profeta Isaías (asset do usuário) está em obra: na bola de pedra do ombro é onde o Aleijadinho trabalha (andaime ao lado).
// Em vez de paredes: um azul profundo "sem fim" (degradê + piso que se dilui na bruma), com brilho controlado.
// Mesmo referencial e dimensões do PeriodRoom (ROOM): origem no centro do nicho, +Z = corredor.
// ---------------------------------------------------------------------------------------------

const rndFn = seed => { let s = seed; return () => ( s = ( Math.imul( s, 1664525 ) + 1013904223 ) >>> 0 ) / 4294967296 }

function paperBase( c, w, h ) {
	c.fillStyle = '#d6c79e'; c.fillRect( 0, 0, w, h )
	const g = c.createRadialGradient( w / 2, h / 2, 30, w / 2, h / 2, h * .8 ); g.addColorStop( 0, 'rgba(255,246,214,.35)' ); g.addColorStop( 1, 'rgba(120,88,40,.38)' ); c.fillStyle = g; c.fillRect( 0, 0, w, h )
	c.globalAlpha = .1; for ( let i = 0; i < 1600; i ++ ) { c.fillStyle = Math.random() < .5 ? '#3a2a14' : '#fff'; c.fillRect( Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 ) } c.globalAlpha = 1
	c.strokeStyle = 'rgba(70,50,25,.35)'; c.lineWidth = 2; c.strokeRect( 14, 14, w - 28, h - 28 )
}
function prophetSketch() { // estudo de profeta com filactério
	return canvasTex( 440, 640, ( c, w, h ) => {
		paperBase( c, w, h ); c.strokeStyle = '#33251a'; c.lineWidth = 2.2; c.lineJoin = 'round'; c.lineCap = 'round'
		const cx = w / 2
		c.beginPath(); c.ellipse( cx, 150, 34, 42, 0, 0, TAU ); c.stroke()
		c.beginPath(); c.moveTo( cx - 28, 170 ); c.bezierCurveTo( cx - 40, 230, cx + 40, 230, cx + 28, 170 ); c.stroke()
		c.beginPath(); c.moveTo( cx - 36, 130 ); c.bezierCurveTo( cx - 20, 98, cx + 20, 98, cx + 36, 130 ); c.stroke()
		c.beginPath(); c.moveTo( cx - 34, 200 ); c.bezierCurveTo( cx - 90, 240, cx - 100, 360, cx - 96, 540 ); c.lineTo( cx + 96, 540 ); c.bezierCurveTo( cx + 100, 360, cx + 90, 240, cx + 34, 200 ); c.stroke()
		for ( let i = 0; i < 9; i ++ ) { const x = cx - 80 + i * 20; c.beginPath(); c.moveTo( x, 290 + ( i % 2 ) * 14 ); c.bezierCurveTo( x - 6, 400, x + 6, 470, x - 4, 538 ); c.stroke() }
		c.beginPath(); c.moveTo( cx + 60, 260 ); c.bezierCurveTo( cx + 130, 250, cx + 150, 330, cx + 110, 360 ); c.bezierCurveTo( cx + 80, 390, cx + 40, 330, cx + 60, 260 ); c.stroke()
		c.lineWidth = 1.1; for ( let i = 0; i < 5; i ++ ) { c.beginPath(); c.moveTo( cx + 74 + i * 5, 282 + i * 16 ); c.lineTo( cx + 118 - i * 2, 276 + i * 16 ); c.stroke() }
		c.lineWidth = 2.2; c.beginPath(); c.ellipse( cx, 556, 120, 16, 0, 0, TAU ); c.stroke()
		c.fillStyle = '#33251a'; c.font = 'italic 22px Georgia'; c.textAlign = 'center'; c.fillText( 'Estudo · profeta Isaías', cx, 70 )
	} )
}
// Pano de linho estendido no chão para as ferramentas.
function clothTexture() {
	return canvasTex( 512, 384, ( c, w, h ) => {
		const r = rndFn( 9 ); c.fillStyle = '#b9a98a'; c.fillRect( 0, 0, w, h )
		for ( let y = 0; y < h; y += 3 ) { c.fillStyle = `rgba(${90 + r() * 40 | 0},${75 + r() * 30 | 0},${50 + r() * 20 | 0},${.08 + r() * .12})`; c.fillRect( 0, y, w, 1.5 ) }
		for ( let x = 0; x < w; x += 3 ) { c.fillStyle = `rgba(255,255,240,${.04 + r() * .08})`; c.fillRect( x, 0, 1.5, h ) }
		c.strokeStyle = 'rgba(90,60,35,.5)'; c.lineWidth = 6; c.strokeRect( 8, 8, w - 16, h - 16 )
	} )
}

export async function buildAleijadinhoRoom( group, { galleryBrightness } ) {
	await Promise.all( [ 'monastery_stone_floor', 'old_planks_02', 'dark_wood' ].flatMap( n => [ 'diff', 'nor_gl' ].map( async k => { const key = `${n}-${k}`; if ( ! texCache.has( key ) ) texCache.set( key, await texLoader.loadAsync( `/textures/set/${key}.webp` ) ) } ) ) )
	const warm = vec3( 1, .8, .55 )
	const mat = ( opts, glow = .1 ) => { const m = new THREE.MeshStandardNodeMaterial( opts ); m.emissiveNode = ( m.map ? texture( m.map ).rgb : vec3( m.color.r, m.color.g, m.color.b ) ).mul( warm ).mul( glow ).mul( galleryBrightness ); return m }
	const { halfW: W, spring: SP, front: ZF } = ROOM, ZB = -.98, ZBS = -40, D = ZF - ZB
	const room = new THREE.Group(); room.name = 'room-aleijadinho'; group.add( room )
	const add = ( g, m, { cast = false, recv = true, parent = null } = {} ) => { const mesh = new THREE.Mesh( g, m ); mesh.castShadow = cast; mesh.receiveShadow = recv; ( parent || room ).add( mesh ); return mesh }

	// --- CÉU + CHÃO INFINITOS: tudo que o fundo/lados mostram é calculado pelo raio do olhar (sem cantos nem paredes).
	//     Raio para cima = céu azul de dia (gradiente pela elevação). Raio para baixo = o MESMO piso de lajes continuando até o horizonte, diluído em bruma com a distância.
	const stoneTex = k => { const t = texCache.get( `monastery_stone_floor-${k}` ).clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if ( k === 'diff' ) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t }
	const TILE = 1.7, stoneDiff = stoneTex( 'diff' ), stoneNor = stoneTex( 'nor_gl' )
	const hv = c => vec3( c.r, c.g, c.b ), HAZE = hv( new THREE.Color( '#a8cdf3' ) ), MID = hv( new THREE.Color( '#5a9ce8' ) ), TOPC = hv( new THREE.Color( '#2c74d2' ) )
	const FLOORY = .02, tint = hv( new THREE.Color( '#d6cfc0' ) ), groundAt = xz => texture( stoneDiff, xz.div( TILE ) ).rgb.mul( tint ).mul( 1.75 )
	const camL = modelWorldMatrixInverse.mul( vec4( cameraPosition, 1 ) ).xyz, hazeGround = xz => mix( groundAt( xz ), HAZE, smoothstep( 3.5, 12.0, xz.sub( camL.xz ).length() ) )
	{ const rayL = positionLocal.sub( camL ), ry = rayL.y.min( - .0005 )
		const t = float( FLOORY ).sub( camL.y ).div( ry ), hit = camL.add( rayL.mul( t ) ), dist = rayL.length().mul( t )
		const ground = hazeGround( hit.xz )
		const dy = positionWorld.sub( cameraPosition ).normalize().y.max( 0 )
		const skyC = mix( mix( HAZE, MID, smoothstep( 0, .2, dy ) ), TOPC, smoothstep( .15, .8, dy ) )
		const sky = new THREE.MeshBasicNodeMaterial( { side: THREE.DoubleSide } ); sky.fog = false
		const shade = smoothstep( ZB + 1.0, ZF, positionLocal.z ) // sombra suave junto ao portal, clareando para o fundo
		sky.colorNode = select( rayL.y.lessThan( - .0005 ), ground, skyC ).mul( .96 )
		add( tube( [ [ - W, 0 ], [ - W, SP ] ], ZBS, ZF, 1 ), sky, { recv: false } ); add( tube( [ [ W, 0 ], [ W, SP ] ], ZBS, ZF, 1 ), sky, { recv: false } )
		add( tube( arcPts( 0, SP, W, Math.PI, 0, 40 ).reverse(), ZBS, ZF, 1 ), sky, { recv: false } )
		add( wallPanel( [ [ - W, 0 ], [ W, 0 ], [ W, SP ], [ - W, SP ] ], ZBS, 1 ), sky, { recv: false } )
		add( wallPanel( [ [ W, SP ], ...arcPts( 0, SP, W, 0, Math.PI, 40 ), [ - W, SP ] ], ZBS, 1 ), sky, { recv: false } ) }
	// piso real (iluminado): nos últimos 1,2 m antes das bordas ele vira o mesmo piso "sem luz" do fundo, para a emenda sumir
	const fadeToGround = m => { const p = positionLocal, e = float( W ).sub( p.x.abs() ).min( p.z.sub( ZB ) ).div( 1.2 ), f = float( 1 ).sub( smoothstep( 0, 1, e ) ), tgt = hazeGround( p.xz ); const orig = m.setupOutput.bind( m ); m.setupOutput = ( b, lit ) => orig( b, vec4( mix( lit.rgb, tgt, f ), lit.a ) ); return m }
	const floorG = new THREE.PlaneGeometry( W * 2, D ); floorG.rotateX( - Math.PI / 2 ); floorG.translate( 0, FLOORY, ( ZF + ZB ) / 2 )
	{ const pos = floorG.attributes.position, uv = floorG.attributes.uv; for ( let i = 0; i < pos.count; i ++ ) uv.setXY( i, pos.getX( i ) / TILE, pos.getZ( i ) / TILE ) }
	add( floorG, fadeToGround( mat( { map: stoneDiff, normalMap: stoneNor, roughness: .82, color: '#d6cfc0' }, .12 ) ) )
	{ const g = new THREE.PlaneGeometry( W * 2, ZB - ZBS ); g.rotateX( - Math.PI / 2 ); g.translate( 0, FLOORY, ( ZB + ZBS ) / 2 ); const m = new THREE.MeshBasicNodeMaterial(); m.fog = false; m.colorNode = hazeGround( positionLocal.xz ).mul( .96 ); add( g, m, { recv: false } ) }

	// --- materiais e listas de geometria
	const woodMat = mat( { map: polyTex( 'dark_wood', 'diff', 1.2, 1.2, 1.2, true ), normalMap: polyTex( 'dark_wood', 'nor_gl', 1.2, 1.2, 1.2 ), roughness: .68, vertexColors: true, side: THREE.DoubleSide }, .1 )
	const stoneMat = mat( { map: polyTex( 'monastery_stone_floor', 'diff', 1.2, 1.2, 1.2, true ), roughness: .9, vertexColors: true }, .09 )
	const ropeMat = mat( { color: '#ffffff', roughness: .95, vertexColors: true }, .1 ), ironMat = mat( { color: '#ffffff', roughness: .5, metalness: .8, vertexColors: true }, .1 )
	const wood = [], stone = [], rope = [], chips = [], iron = []
	const r = rndFn( 31 )

	// --- andaime rústico de troncos e cordas (coordenadas LOCAIS ao grupo do andaime; origem = centro dele, no chão).
	//     O Aleijadinho trabalha AJOELHADO no tablado, junto à bola de pedra do ombro do profeta.
	const scaf = new THREE.Group(); scaf.name = 'andaime'; room.add( scaf )
	const SC = { x: 0, z: 0, w: 1.2, d: .8, deck: 2.0, top: 2.7 }
	const jit = () => ( r() - .5 )
	const log = ( x, y, z, len, axis, rad = .045, hex = '#9a7c58' ) => { const g = new THREE.CylinderGeometry( rad * ( .85 + r() * .3 ), rad * ( 1 + r() * .25 ), len, 9 ); const t = .025, rot = axis === 'x' ? [ jit() * t, jit() * t, Math.PI / 2 + jit() * t ] : axis === 'z' ? [ Math.PI / 2 + jit() * t, jit() * t, jit() * t ] : [ jit() * t * 1.4, 0, jit() * t * 1.4 ]; wood.push( withColor( xf( g, [ x, y, z ], rot ), r() < .5 ? hex : '#8a6d4b' ) ) }
	const knot = ( x, y, z, rot, n = 3 ) => { for ( let k = 0; k < n; k ++ ) rope.push( withColor( xf( new THREE.TorusGeometry( .056 + k * .002, .009, 6, 14 ), [ x, y + ( k - 1 ) * .02, z ], rot ), '#bda071' ) ) }
	const px = [ SC.x - SC.w / 2, SC.x + SC.w / 2 ], pz = [ SC.z - SC.d / 2, SC.z + SC.d / 2 ]
	for ( const x of px ) for ( const z of pz ) { log( x, SC.top / 2 + .02, z, SC.top, 'y', .05, '#8e7150' ); for ( const y of [ .5, SC.deck - .12 ] ) knot( x, y, z, [ Math.PI / 2, 0, 0 ] ) }
	for ( const y of [ .5, SC.deck - .12 ] ) for ( const z of pz ) log( SC.x, y, z, SC.w + .2, 'x', .04 )
	for ( const y of [ .5, SC.deck - .12 ] ) for ( const x of px ) log( x, y, SC.z, SC.d + .15, 'z', .04 )
	for ( const z of pz ) wood.push( withColor( xf( new THREE.CylinderGeometry( .028, .03, 1.65, 7 ), [ SC.x, 1.2, z ], [ 0, 0, .87 ] ), '#8a6d4b' ) ) // travessa em X
	{ const xa = SC.x - SC.w / 2 - .08, xb = 1.22, n = 7 // tablado de tábuas irregulares, estendido até o ombro do profeta
		for ( let i = 0; i < n; i ++ ) { const len = xb - xa - r() * .14, cx = xa + len / 2, zz = SC.z - SC.d / 2 + .07 + i * ( SC.d - .14 ) / ( n - 1 ) + jit() * .015; wood.push( box( len, .04 + r() * .012, .13 + r() * .02, [ cx, SC.deck + .01 + r() * .012, zz ], [ '#a88660', '#97774f', '#b29068', '#8f7049' ][ i % 4 ] ) ) } }
	log( SC.x, SC.deck + .5, pz[ 0 ], SC.w + .2, 'x', .028 ); log( px[ 0 ], SC.deck + .5, SC.z, SC.d + .15, 'z', .028 ) // guarda-corpo baixo (só atrás e à esquerda)
	for ( const [ x, z ] of [ [ px[ 0 ], pz[ 0 ] ], [ px[ 1 ], pz[ 0 ] ], [ px[ 0 ], pz[ 1 ] ] ] ) knot( x, SC.deck + .5, z, [ Math.PI / 2, 0, 0 ], 2 )
	{ const g = new THREE.SphereGeometry( .17, 14, 10 ); g.scale( 1.35, .3, 1 ); wood.push( withColor( xf( g, [ SC.x + .45, SC.deck + .07, SC.z - .02 ], [ 0, .3, 0 ] ), '#6f5238' ) ) } // almofada onde ele se ajoelha
	// lascas de pedra-sabão no pé do profeta
	for ( let i = 0; i < 160; i ++ ) { const a = r() * TAU, d = Math.pow( r(), .6 ) * 2.4, x = .1 + Math.cos( a ) * d * 1.3, z = - .3 + Math.sin( a ) * d * .5
		if ( z > ZF - .1 || z < ZB + .2 || Math.abs( x ) > W - .3 ) continue
		const s = .016 + r() * .045, hex = r() < .6 ? '#b8bcae' : ( r() < .6 ? '#8fa095' : '#a4a99a' )
		chips.push( withColor( xf( new THREE.BoxGeometry( s * ( 1 + r() ), s * .45, s * ( 1 + r() ) ), [ x, .035 + s * .2, z ], [ r() * .4, r() * TAU, r() * .4 ] ), hex ) ) }

	const mergeInto = ( arr, material, opts = {} ) => { if ( arr.length ) add( mergeGeometries( arr.map( g => g.index ? g.toNonIndexed() : g ), false ), material, opts ) }
	mergeInto( wood, woodMat, { cast: true, parent: scaf } ); mergeInto( rope, ropeMat, { parent: scaf } ); mergeInto( chips, stoneMat )

	// --- registro de objetos posicionáveis (painel "Cenário · posições"): cada um tem x, z, giro; a altura (y) é a do chão e fica fixa
	const objs = {}
	const reg = ( key, label, grp ) => { objs[ key ] = { label, grp, base: grp.rotation.y, def: { x: grp.position.x, y: grp.position.y, z: grp.position.z, rot: 0 } } }

	// --- pano com as ferramentas (cinzéis e ponteiros; cabos presos com tiras de couro)
	const toolsG = new THREE.Group(); toolsG.position.set( 1.7, 0, .15 ); room.add( toolsG )
	{ const g = new THREE.PlaneGeometry( 1.0, .72 ); g.rotateX( - Math.PI / 2 ); g.translate( 0, .027, 0 ); const m = new THREE.Mesh( g, mat( { map: clothTexture(), roughness: 1, color: '#c9baa0' }, .08 ) ); m.receiveShadow = true; toolsG.add( m ) }
	const toolMesh = ( kind, x, z, rot ) => { const parts = { wood: [], iron: [], leather: [] }, len = kind === 'chisel' ? .2 : .26
		parts.wood.push( withColor( xf( new THREE.CylinderGeometry( .014, .017, .11, 10 ), [ 0, .016, - .055 ], [ Math.PI / 2, 0, 0 ] ), '#6a4a2c' ) )
		parts.leather.push( withColor( xf( new THREE.CylinderGeometry( .019, .019, .028, 10 ), [ 0, .016, - .03 ], [ Math.PI / 2, 0, 0 ] ), '#4a2e1c' ), withColor( xf( new THREE.CylinderGeometry( .019, .019, .02, 10 ), [ 0, .016, - .09 ], [ Math.PI / 2, 0, 0 ] ), '#4a2e1c' ) )
		parts.iron.push( withColor( xf( new THREE.CylinderGeometry( kind === 'chisel' ? .007 : .0035, .008, len, 8 ), [ 0, .016, .1 ], [ Math.PI / 2, 0, 0 ] ), '#b9bcc0' ) )
		if ( kind === 'chisel' ) parts.iron.push( withColor( xf( new THREE.BoxGeometry( .03, .006, .022 ), [ 0, .016, .2 ] ), '#d5d8dc' ) )
		const g = new THREE.Group(); for ( const [ arr, mt ] of [ [ parts.wood, woodMat ], [ parts.leather, ropeMat ], [ parts.iron, ironMat ] ] ) { const mesh = new THREE.Mesh( mergeGeometries( arr.map( q => q.toNonIndexed() ), false ), mt ); mesh.castShadow = true; mesh.receiveShadow = true; g.add( mesh ) }
		g.position.set( x, .03, z ); g.rotation.y = rot; g.scale.setScalar( 1.4 ); toolsG.add( g ) }
	toolMesh( 'chisel', - .3, - .08, .3 ); toolMesh( 'chisel', - .15, 0, - .15 ); toolMesh( 'point', 0, - .06, .1 ); toolMesh( 'point', .15, .04, .5 ); toolMesh( 'point', .3, - .02, - .2 )
	reg( 'tools', 'Ferramentas (pano)', toolsG )

	// --- cerca de pedra (balaustrada do adro) bem ao fundo, com pilares e bolas nas pontas: é o LIMITE de caminhada
	const fenceG = new THREE.Group(); fenceG.position.set( 0, 0, - 4.0 ); room.add( fenceG )
	{ const fp = [], step = .7, L1 = [ '#e2dccb', '#d7d1c0' ], L2 = '#dcd6c5'
		for ( let x = - W + .35; x < W - .2; x += step ) fp.push( box( step - .015, .86, .36, [ x + step / 2 - .35, .43, 0 ], r() < .5 ? L1[ 0 ] : L1[ 1 ] ) )
		fp.push( box( W * 2, .08, .46, [ 0, .9, 0 ], '#e8e2d1' ) )
		for ( const x of [ - W + .2, - 1.6, 0, 1.6, W - .2 ] ) { fp.push( box( .3, 1.1, .3, [ x, .55, 0 ], L2 ), box( .36, .07, .36, [ x, 1.12, 0 ], '#ece6d5' ) ); fp.push( withColor( xf( new THREE.SphereGeometry( .1, 14, 10 ), [ x, 1.26, 0 ] ), '#e6e0cf' ) ) }
		// pedra com textura, clara, que se dilui na mesma bruma azul do chão com a distância
		const fm = new THREE.MeshStandardNodeMaterial( { map: polyTex( 'monastery_stone_floor', 'diff', 1.2, 1.2, 1.2, true ), normalMap: polyTex( 'monastery_stone_floor', 'nor_gl', 1.2, 1.2, 1.2 ), roughness: .88, vertexColors: true, color: '#ffffff' } )
		fm.emissiveNode = texture( fm.map ).rgb.mul( vertexColor() ).mul( vec3( 1, .93, .82 ) ).mul( .55 ).mul( galleryBrightness )
		const haze = smoothstep( 3.5, 12.0, positionLocal.xz.sub( camL.xz ).length() ), // a mesma bruma do chão (distância no plano)
			 orig = fm.setupOutput.bind( fm ); fm.setupOutput = ( b, lit ) => orig( b, vec4( mix( lit.rgb, HAZE, haze ), lit.a ) )
		mergeInto( fp, fm, { cast: true, parent: fenceG } ) }	reg( 'fence', 'Cerca de pedra (limite de caminhada)', fenceG )

	// --- objetos (Poly Haven CC0 + asset do usuário)
	const SOAP = '#b2bdb0'
	const items = [
		{ key: 'isaias', label: 'Profeta Isaías', id: 'isaias', h: 3.0, pos: [ .62, .02, - .3 ], rotY: 0, vc: true },
		{ key: 'block', label: 'Bloco de pedra-sabão', id: 'stone_01', h: .8, pos: [ 2.15, .02, - .2 ], rotY: .5, tint: SOAP },
		{ key: 'rock', label: 'Pedra', id: 'rock_07', h: .36, pos: [ 1.7, .02, - .7 ], rotY: 1.1, tint: '#9aa095' },
		{ key: 'stool', label: 'Banco', id: 'wooden_stool_01', h: .4, pos: [ 1.7, .02, .45 ], rotY: .4 },
		{ key: 'basket', label: 'Cesto', id: 'wicker_basket_01', h: .26, pos: [ - 2.2, .02, .3 ], rotY: .3 },
		{ key: 'bucket', label: 'Balde', id: 'wooden_bucket_01', h: .3, pos: [ 1.55, .02, .15 ], rotY: 0 },
		{ key: 'crate', label: 'Caixote', id: 'wooden_crate_01', h: .42, pos: [ - 2.25, .02, - .6 ], rotY: .2 },
		{ key: 'lantern', label: 'Lanterna', id: 'Lantern_01', h: .42, pos: [ - .2, .02, .55 ], rotY: .3 },
		{ key: 'ladder', label: 'Escada', id: 'wooden_ladder_02', h: 2.25, pos: [ - 1.92, .02, - .1 ], rotY: - Math.PI / 2 },
		{ parent: scaf, id: 'wooden_bucket_01', h: .26, pos: [ SC.x - .3, SC.deck + .03, SC.z + .12 ], rotY: .6 },
	]
	const mats = new Map()
	const fix = src => { if ( mats.has( src ) ) return mats.get( src ); if ( /glass/i.test( src.name || '' ) ) { const gm = new THREE.MeshStandardNodeMaterial( { color: '#dfe8e4', roughness: .05, metalness: .1, transparent: true, opacity: .14, depthWrite: false } ); mats.set( src, gm ); return gm }
		const m = new THREE.MeshStandardNodeMaterial( { color: src.color, map: src.map, normalMap: src.normalMap, normalScale: new THREE.Vector2( .6, .6 ), roughness: src.roughnessMap ? 1 : Math.max( .45, src.roughness ?? .7 ), roughnessMap: src.roughnessMap, metalness: src.metalness ?? 0, metalnessMap: src.metalnessMap, aoMap: src.aoMap, alphaMap: src.alphaMap, transparent: src.transparent, alphaTest: src.alphaTest, side: src.side, emissive: src.emissive, emissiveMap: src.emissiveMap } )
		if ( m.map ) m.emissiveNode = texture( m.map ).rgb.mul( warm ).mul( .08 ).mul( galleryBrightness ); mats.set( src, m ); return m }
	const tints = new Map(); const tinted = ( src, hex ) => { const k = src.uuid + hex; if ( ! tints.has( k ) ) { const m = fix( src ).clone(); m.color = new THREE.Color( hex ); m.emissiveNode = m.map ? texture( m.map ).rgb.mul( new THREE.Color( hex ) ).mul( warm ).mul( .08 ).mul( galleryBrightness ) : null; tints.set( k, m ) } return tints.get( k ) }
	const vcMat = new THREE.MeshStandardNodeMaterial( { vertexColors: true, roughness: .9, metalness: 0, color: '#dfe3da' } ); vcMat.emissiveNode = vertexColor().mul( vec3( 1, .97, .92 ) ).mul( .045 ).mul( galleryBrightness )
	const placed = {}
	for ( const it of items ) {
		const src = await loadModel( it.id === 'isaias' ? '/models/set/isaias.glb' : it.id ); if ( ! src ) continue
		const obj = src.clone( true ); obj.traverse( n => { if ( n.isMesh ) { n.material = it.vc ? vcMat : it.tint ? tinted( n.material, it.tint ) : fix( n.material ); n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false } } )
		obj.updateMatrixWorld( true ); const bb = new THREE.Box3().setFromObject( obj ), size = bb.getSize( new THREE.Vector3() ), ctr = bb.getCenter( new THREE.Vector3() )
		const s = it.h / size.y, holder = new THREE.Group()
		obj.position.set( - ctr.x, - bb.min.y, - ctr.z ); holder.add( obj ); holder.scale.setScalar( s ); holder.position.set( ...it.pos ); holder.rotation.y = it.rotY; ( it.parent || room ).add( holder )
		if ( it.key ) reg( it.key, it.label, holder )
		placed[ it.key || it.id ] = { size: size.toArray().map( v => +( v * s ).toFixed( 3 ) ), pos: it.pos }
	}
	{ const m = mat( { map: prophetSketch(), roughness: .9, side: THREE.DoubleSide }, .06 ), mesh = new THREE.Mesh( new THREE.PlaneGeometry( .3, .43 ), m ); mesh.position.set( SC.x + SC.w / 2 - .12, 1.3, SC.z + SC.d / 2 + .06 ); mesh.rotation.y = .15; scaf.add( mesh ) } // risco do profeta no esteio
	scaf.position.set( - 1.2, 0, - .3 ); reg( 'scaffold', 'Andaime', scaf )
	// --- Aleijadinho no andaime: onde ele pisa/olha, onde ele bate e a altura da cintura do rig (todos posicionáveis no painel; coordenadas do andaime)
	const CH = 1.55, MODEL_H = 2.368, FEET_Y = - .995, workHooks = {}
	const anchor = new THREE.Group(); anchor.position.set( SC.x + .89, SC.deck + .03, SC.z - .13 ); anchor.rotation.y = .42; scaf.add( anchor ); reg( 'aleijadinho', 'Aleijadinho (onde pisa e para onde olha)', anchor )
	const targetG = new THREE.Group(); targetG.position.set( SC.x + 1.16, SC.deck + .58, SC.z - .13 ); scaf.add( targetG ); reg( 'alvo', 'Ponto do golpe (onde ele bate)', targetG )
	const waistG = new THREE.Group(); waistG.position.set( anchor.position.x, anchor.position.y + ( .28 - FEET_Y ) * CH / MODEL_H, anchor.position.z ); scaf.add( waistG ); reg( 'cintura', 'Cintura do rig (só a altura importa)', waistG )

	// --- posições: ordem do painel, ajuste, salvar no navegador
	const fenceLight = new THREE.SpotLight( '#fff0d8', 14, 14, .7, .8, 1.4 ); room.add( fenceLight, fenceLight.target ) // sol que também alcança a cerca do fundo
	// posições salvas pelo usuário (recuperadas do navegador): viram o padrão do cenário
	const LAYOUT_DEFAULT = {"isaias":{"x":0.62,"y":0.02,"z":-0.3,"rot":0},"scaffold":{"x":-1.2,"y":-0.26,"z":-0.3,"rot":0},"ladder":{"x":-1.44,"y":-0.5,"z":0.43,"rot":180},"fence":{"x":0,"y":0,"z":-4,"rot":0},"block":{"x":2.15,"y":0.02,"z":-0.2,"rot":0},"rock":{"x":1.7,"y":0.02,"z":-0.7,"rot":0},"stool":{"x":1.7,"y":0.02,"z":0.95,"rot":0},"basket":{"x":-2.27,"y":0.02,"z":0.71,"rot":71},"bucket":{"x":0.04,"y":0.02,"z":0.4,"rot":0},"crate":{"x":-2.31,"y":0.02,"z":-0.35,"rot":-96},"lantern":{"x":-0.2,"y":0.02,"z":0.55,"rot":0},"tools":{"x":1.05,"y":0,"z":0.84,"rot":-90}}
	for ( const k of Object.keys( LAYOUT_DEFAULT ) ) if ( objs[ k ] ) objs[ k ].def = { ...objs[ k ].def, ...LAYOUT_DEFAULT[ k ] }
	const LKEY = 'legado.layout.aleijadinho.v1', saved = ( () => { try { return JSON.parse( localStorage.getItem( LKEY ) ) || {} } catch { return {} } } )()
	const marker = new THREE.Mesh( new THREE.RingGeometry( .42, .47, 48 ).rotateX( - Math.PI / 2 ), new THREE.MeshBasicNodeMaterial( { color: '#ffd27a', transparent: true, opacity: .9, depthTest: false } ) ); marker.renderOrder = 20; marker.visible = false; room.add( marker )
	const order = [ 'isaias', 'scaffold', 'aleijadinho', 'alvo', 'cintura', 'ladder', 'fence', 'block', 'rock', 'stool', 'basket', 'bucket', 'crate', 'lantern', 'tools' ].filter( k => objs[ k ] )
	let current = order[ 0 ]
	const apply = k => { const o = objs[ k ]; if ( ! o ) return; const v = o.val; o.grp.position.set( v.x, v.y, v.z ); o.grp.rotation.y = o.base + v.rot * Math.PI / 180; if ( k === current ) { scaf.updateMatrix(); const mp = new THREE.Vector3( v.x, v.y + .05, v.z ); if ( o.grp.parent === scaf ) mp.applyMatrix4( scaf.matrix ); marker.position.copy( mp ) } if ( k === 'fence' ) { fenceLight.position.set( v.x - 1.6, 4.0, v.z + 3.2 ); fenceLight.target.position.set( v.x, .6, v.z ); fenceLight.target.updateMatrixWorld() } }
	for ( const k of order ) { const o = objs[ k ]; o.val = { ...o.def, ...( saved[ k ] || {} ) }; apply( k ) }
	const desk = {
		meta: { title: 'Cenário · posições', spec: [ [ 'x', 'Ao longo do corredor', - 2.5, 2.5, .01, 'm' ], [ 'y', 'Altura', - .5, 3, .01, 'm' ], [ 'z', 'Frente ↔ fundo', - 8, 1.3, .01, 'm' ], [ 'rot', 'Giro', - 180, 180, 1, '°' ] ] },
		keys: () => order, label: k => objs[ k ].label, get: k => ( { ...objs[ k ].val } ),
		set( k, prop, v ) { objs[ k ].val[ prop ] = Number( v ); apply( k ) },
		select( k ) { current = k; if ( k === 'cintura' ) { objs.cintura.val.x = objs.aleijadinho.val.x; objs.cintura.val.z = objs.aleijadinho.val.z } apply( k ); workHooks.onSelect?.( k ) }, marker( on ) { marker.visible = !! on; workHooks.onMarker?.( !! on ) },
		save() { try { const out = {}; for ( const k of order ) out[ k ] = { ...objs[ k ].val }; localStorage.setItem( LKEY, JSON.stringify( out ) ); return true } catch { return false } },
		reset( k ) { for ( const kk of k ? [ k ] : order ) { objs[ kk ].val = { ...objs[ kk ].def }; apply( kk ) } if ( ! k ) try { localStorage.removeItem( LKEY ) } catch {} },
		all() { const out = {}; for ( const k of order ) out[ k ] = { ...objs[ k ].val }; if ( out.cintura && out.aleijadinho ) out.cintura.modelZ = +( FEET_Y + ( out.cintura.y - out.aleijadinho.y ) / ( CH / MODEL_H ) ).toFixed(3); return out }, // cintura.modelZ = altura da articulação nas coordenadas do modelo (para refazer o rig)
	}
	// limite de caminhada = a cerca de pedra: |x| mundial máximo = 6,25 − z da cerca − margem (o nicho está a 6,25 do eixo do corredor)
	const walkMaxX = () => 6.25 - objs.fence.val.z - .3
	// luz: frio vindo do fundo (contraluz) e preenchimento quente da frente
	const sun = new THREE.SpotLight( '#bcd4ff', 5, 9, .95, .9, 1.5 ); sun.position.set( .8, 4.4, ZB + .2 ); sun.target.position.set( .6, 1.4, - .3 ); room.add( sun, sun.target )
	const fill = new THREE.SpotLight( '#fff0d8', 9, 10, .8, .85, 1.5 ); fill.position.set( - 2.2, 4.4, ZF + .9 ); fill.target.position.set( .6, 1.4, - .2 ); room.add( fill, fill.target )
	return { room, placed, sun, desk, walkMaxX, scaf, workPose: { anchor, target: targetG, waist: waistG, hooks: workHooks, hitTime: 1.25 } }
}




