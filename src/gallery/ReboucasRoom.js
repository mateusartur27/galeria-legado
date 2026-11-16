import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texture, vec2, vec3, vec4, float, mix, smoothstep, vertexColor, positionLocal, cameraPosition, modelWorldMatrixInverse, select, dot, atan, uniform, triplanarTexture } from 'three/tsl';
import { buildTheodolite } from './Theodolite.js';
import { ROOM, TAU, canvasTex, withColor, xf, tube, arcPts, wallPanel, box, loadModel, texLoader, texCache, polyTex } from './PeriodRoom.js';

// ---------------------------------------------------------------------------------------------
// André Rebouças — cais das Docas D. Pedro II, baía de Guanabara, Rio de Janeiro, amanhecer de c. 1873.
// Ele projetou as docas: no cais, o teodolito de bronze sobre o tripé, a prancheta com a planta, trilhos e carga.
// Sem paredes: céu de aurora + cais de pedra que termina na água da baía (tudo calculado pelo raio do olhar),
// com um vapor e morros em silhueta ao longe. Mesmo referencial do PeriodRoom: origem no centro do nicho, +Z = corredor.
// ---------------------------------------------------------------------------------------------

const rndFn = seed => { let s = seed; return () => ( s = ( Math.imul( s, 1664525 ) + 1013904223 ) >>> 0 ) / 4294967296 }

function planTexture() { // planta das docas em papel de desenho
	return canvasTex( 720, 500, ( c, w, h ) => {
		c.fillStyle = '#d8d9c8'; c.fillRect( 0, 0, w, h )
		const g = c.createRadialGradient( w / 2, h / 2, 40, w / 2, h / 2, w * .7 ); g.addColorStop( 0, 'rgba(255,250,225,.3)' ); g.addColorStop( 1, 'rgba(110,95,60,.35)' ); c.fillStyle = g; c.fillRect( 0, 0, w, h )
		c.strokeStyle = '#2b3a4d'; c.fillStyle = '#2b3a4d'; c.lineWidth = 2; c.strokeRect( 18, 18, w - 36, h - 36 )
		c.lineWidth = 1.4
		c.strokeRect( 70, 110, 420, 190 ) // armazéns
		for ( let i = 0; i < 6; i ++ ) c.strokeRect( 78 + i * 68, 120, 60, 170 )
		c.beginPath(); c.moveTo( 40, 330 ); c.lineTo( 560, 330 ); c.lineTo( 640, 400 ); c.lineTo( 40, 400 ); c.stroke() // linha do cais
		c.lineWidth = .8; for ( let x = 50; x < 630; x += 10 ) { c.beginPath(); c.moveTo( x, 400 ); c.lineTo( x - 8, 416 ); c.stroke() } // hachura do mar
		c.lineWidth = 1; for ( const x of [ 70, 490 ] ) { c.beginPath(); c.moveTo( x, 82 ); c.lineTo( x, 104 ); c.stroke() }
		c.beginPath(); c.moveTo( 70, 92 ); c.lineTo( 490, 92 ); c.stroke(); c.font = 'italic 14px Georgia'; c.textAlign = 'center'; c.fillText( '84,0 m', 280, 86 )
		c.beginPath(); c.arc( 600, 130, 34, 0, TAU ); c.stroke(); c.beginPath(); c.moveTo( 600, 94 ); c.lineTo( 600, 166 ); c.moveTo( 564, 130 ); c.lineTo( 636, 130 ); c.stroke()
		c.font = 'italic 22px Georgia'; c.textAlign = 'left'; c.fillText( 'Docas D. Pedro II', 40, 56 )
		c.font = 'italic 14px Georgia'; c.fillText( 'Rio de Janeiro · Planta geral · 1871', 40, 76 )
		c.strokeRect( 470, 430, 220, 50 ); c.fillText( 'A. Rebouças, engenheiro', 482, 462 )
	} )
}

export async function buildReboucasRoom( group, { galleryBrightness } ) {
	await Promise.all( [ 'monastery_stone_floor', 'dark_wood' ].flatMap( n => [ 'diff', 'nor_gl' ].map( async k => { const key = `${n}-${k}`; if ( ! texCache.has( key ) ) texCache.set( key, await texLoader.loadAsync( `/textures/set/${key}.webp` ) ) } ) ) )
	const panoTex = await texLoader.loadAsync( '/textures/set/ceu_aurora_rio.webp' ); panoTex.colorSpace = THREE.SRGBColorSpace; panoTex.wrapS = panoTex.wrapT = THREE.ClampToEdgeWrapping; panoTex.anisotropy = 8; panoTex.needsUpdate = true
	const rustTex = await texLoader.loadAsync( '/textures/set/rust_coarse_01-diff.webp' ); rustTex.colorSpace = THREE.SRGBColorSpace; rustTex.wrapS = rustTex.wrapT = THREE.RepeatWrapping; rustTex.anisotropy = 8; rustTex.needsUpdate = true
	const warm = vec3( 1, .82, .6 )
	const mat = ( opts, glow = .1 ) => { const m = new THREE.MeshStandardNodeMaterial( opts ); m.emissiveNode = ( m.map ? texture( m.map ).rgb : vec3( m.color.r, m.color.g, m.color.b ) ).mul( warm ).mul( glow ).mul( galleryBrightness ); return m }
	const { halfW: W, spring: SP, front: ZF } = ROOM, ZB = -.98, ZBS = -40, D = ZF - ZB, QZ = - 3.6, WATERY = - 1.0
	const room = new THREE.Group(); room.name = 'room-reboucas'; group.add( room )
	const OBSERVE = new URLSearchParams( location.search ).get( 'acao' ) !== 'desenho' // padrão: ele olha pelo teodolite; ?acao=desenho = sentado na prancheta
	const add = ( g, m, { cast = false, recv = true, parent = null } = {} ) => { const mesh = new THREE.Mesh( g, m ); mesh.castShadow = cast; mesh.receiveShadow = recv; ( parent || room ).add( mesh ); return mesh }

	// --- CÉU + CAIS + BAÍA: tudo pelo raio do olhar. Para cima: céu de aurora com o sol baixo atrás. Para baixo: o piso do cais até a borda (QZ) e depois a água refletindo o céu.
	const stoneTex = k => { const t = texCache.get( `monastery_stone_floor-${k}` ).clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if ( k === 'diff' ) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t }
	const TILE = 1.7, stoneDiff = stoneTex( 'diff' ), stoneNor = stoneTex( 'nor_gl' )
	const hv = c => vec3( c.r, c.g, c.b ), HAZE = hv( new THREE.Color( '#2a2a6a' ) ), MID = hv( new THREE.Color( '#c283b2' ) ), UP = hv( new THREE.Color( '#7c6aba' ) ), TOPC = hv( new THREE.Color( '#5148a8' ) ), DEEP = hv( new THREE.Color( '#3a4a8a' ) )
	const FLOORY = .02, tint = hv( new THREE.Color( '#c4b9b8' ) ), groundAt = xz => texture( stoneDiff, xz.div( TILE ) ).rgb.mul( tint ).mul( 1.7 )
	const camL = modelWorldMatrixInverse.mul( vec4( cameraPosition, 1 ) ).xyz
	const botU = float( .8425 ), topU = float( .42 ), blueU = uniform( 153 ), blueBU = uniform( 20 ) // botU/topU: onde o azul sólido começa; blueU: canal B (0–255) do azul sólido, ajustável no painel
	// panorama por direção do olhar (céu, água da imagem e azul sólido em cima/embaixo)
	const panoAt = dir => {
		const SPAN = 150 * Math.PI / 180, uI = atan( dir.x, dir.z.negate() ).div( SPAN ).add( .5 ), vI = float( .637 ).sub( dir.y.asin().mul( 2 / SPAN ) )
		const panoRaw = texture( panoTex, vec2( uI.clamp( 0, 1 ), float( 1 ).sub( vI.clamp( 0, 1 ) ) ) ).rgb // laterais: como estavam (estica a borda)
		// topo e fundo: azul sólido, entrando bem antes da borda para aparecer de fato
		const NAVYT = vec3( 0, 0, blueU.div( 255 ) ), NAVYB = vec3( 0, 0, blueBU.div( 255 ) )
		return mix( mix( panoRaw, NAVYT, float( 1 ).sub( smoothstep( topU.sub( .24 ), topU, vI ) ) ), NAVYB, smoothstep( botU, botU.add( .15 ), vI ) )
	}
	// piso do cais: normal até a borda (coberta pela mureta); só muito longe (laterais) some na cor do fundo
	const hazeGround = xz => { const dir = vec3( xz.x, FLOORY, xz.y ).sub( camL ).normalize(), f = smoothstep( 9.0, 22.0, xz.sub( camL.xz ).length() ); return mix( groundAt( xz ), panoAt( dir ), f ) }
	const world = new THREE.MeshBasicNodeMaterial( { side: THREE.DoubleSide } ); world.fog = false
	{ const rayL = positionLocal.sub( camL ), dir = rayL.normalize(), ry = rayL.y.min( - .0005 )
		const hit1 = camL.add( rayL.mul( float( FLOORY ).sub( camL.y ).div( ry ) ) )
		// panorama de aurora (imagem do usuário, com bordas que escurecem para o azul-marinho) curvada numa cúpula de 150° de azimute; céu, horizonte e a água da própria imagem. Fora dela: o mesmo azul-marinho.
		const pano = panoAt( dir )
		world.colorNode = select( rayL.y.lessThan( - .0005 ).and( hit1.z.greaterThan( QZ ) ), hazeGround( hit1.xz ), pano ).mul( .96 )
		add( tube( [ [ - W, 0 ], [ - W, SP ] ], ZBS, ZF, 1 ), world, { recv: false } ); add( tube( [ [ W, 0 ], [ W, SP ] ], ZBS, ZF, 1 ), world, { recv: false } )
		add( tube( arcPts( 0, SP, W, Math.PI, 0, 40 ).reverse(), ZBS, ZF, 1 ), world, { recv: false } )
		add( wallPanel( [ [ - W, 0 ], [ W, 0 ], [ W, SP ], [ - W, SP ] ], ZBS, 1 ), world, { recv: false } )
		add( wallPanel( [ [ W, SP ], ...arcPts( 0, SP, W, 0, Math.PI, 40 ), [ - W, SP ] ], ZBS, 1 ), world, { recv: false } ) }
	// piso real (iluminado) → no fim vira o mesmo piso do raio, sem emenda
	const fadeToGround = m => { const p = positionLocal, e = float( W ).sub( p.x.abs() ).min( p.z.sub( ZB ) ).div( 1.2 ), f = float( 1 ).sub( smoothstep( 0, 1, e ) ), tgt = hazeGround( p.xz ); const orig = m.setupOutput.bind( m ); m.setupOutput = ( b, lit ) => orig( b, vec4( mix( lit.rgb, tgt, f ), lit.a ) ); return m }
	const floorG = new THREE.PlaneGeometry( W * 2, D ); floorG.rotateX( - Math.PI / 2 ); floorG.translate( 0, FLOORY, ( ZF + ZB ) / 2 )
	{ const pos = floorG.attributes.position, uv = floorG.attributes.uv; for ( let i = 0; i < pos.count; i ++ ) uv.setXY( i, pos.getX( i ) / TILE, pos.getZ( i ) / TILE ) }
	add( floorG, fadeToGround( mat( { map: stoneDiff, normalMap: stoneNor, roughness: .6, color: '#cfc6b4' }, .12 ) ) )
	{ const g = new THREE.PlaneGeometry( W * 2, ZB - ZBS ); g.rotateX( - Math.PI / 2 ); g.translate( 0, FLOORY, ( ZB + ZBS ) / 2 ); add( g, world, { recv: false } ) }

	// --- materiais e listas de geometria
	const woodMat = mat( { map: polyTex( 'dark_wood', 'diff', 1.2, 1.2, 1.2, true ), normalMap: polyTex( 'dark_wood', 'nor_gl', 1.2, 1.2, 1.2 ), roughness: .6, vertexColors: true, side: THREE.DoubleSide }, .1 )
	const stoneMat = mat( { map: polyTex( 'monastery_stone_floor', 'diff', 1.2, 1.2, 1.2, true ), roughness: .8, vertexColors: true }, .09 )
	const ropeMat = mat( { color: '#ffffff', roughness: .95, vertexColors: true }, .1 ), ironMat = mat( { color: '#ffffff', roughness: .5, metalness: .8, vertexColors: true }, .1 )
	const brassMat = mat( { color: '#ffffff', roughness: .3, metalness: .9, vertexColors: true }, .2 )
	// textura projetada em 3 eixos (triplanar): não depende de UV, escala fixa em metros
	const tri = s => triplanarTexture( texture( rustTex ), null, null, float( s ) ).rgb
	const rustMat = mat( { color: '#ffffff', roughness: .72, metalness: .55, vertexColors: true }, .1 ); rustMat.colorNode = tri( 1.6 ); rustMat.emissiveNode = tri( 1.6 ).mul( warm ).mul( .1 ).mul( galleryBrightness )
	{ const lum = dot( tri( 4 ), vec3( .3, .6, .1 ) ), k = lum.mul( 1.6 ).clamp( 0, 1 ); brassMat.colorNode = vec3( 1, .96, .9 ).mul( mix( float( .62 ), float( 1.18 ), k ) ); brassMat.roughnessNode = mix( float( .22 ), float( .5 ), k ) } // latão com pátina e brilho irregular
	const paperMat = mat( { map: planTexture(), roughness: .9, side: THREE.DoubleSide }, .08 )
	const mk = () => ( { wood: [], brass: [], iron: [], rust: [], rope: [], stone: [] } )
	const mats = { wood: woodMat, brass: brassMat, iron: ironMat, rust: rustMat, rope: ropeMat, stone: stoneMat }
	const flush = ( L, parent, cast = true ) => { for ( const k of Object.keys( L ) ) if ( L[ k ].length ) add( mergeGeometries( L[ k ].map( g => g.index ? g.toNonIndexed() : g ), false ), mats[ k ], { cast, parent } ) }
	const limb = ( a, b, rad, hex ) => { const A = new THREE.Vector3( ...a ), B = new THREE.Vector3( ...b ), d = B.clone().sub( A ), len = d.length(), mid = A.clone().add( B ).multiplyScalar( .5 )
		const g = new THREE.CylinderGeometry( rad * .8, rad, len, 9 ); g.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), d.normalize() ) ); g.translate( mid.x, mid.y, mid.z ); return withColor( g, hex ) }
	const objs = {}
	const reg = ( key, label, grp ) => { objs[ key ] = { label, grp, base: grp.rotation.y, def: { x: grp.position.x, y: grp.position.y, z: grp.position.z, rot: 0 } } }

	// --- teodolito de bronze sobre tripé de nogueira (Theodolite.js): luneta apontada para a baía (-Z), eixo a 1,56 m
	const theo = buildTheodolite( { HY: 1.23, add, room, woodMat, ironMat, tri, galleryBrightness, warm } )
	theo.position.set( - .1, .02, - .7 ); if ( OBSERVE ) theo.rotation.y = Math.PI / 2 // luneta apontada para -X: ele fica de perfil para o corredor
	reg( 'teodolito', 'Teodolito de bronze', theo )

	// --- prancheta de desenho inclinada, com planta das docas, esquadro, compasso e tinteiro
	let tableTop = null
	const table = new THREE.Group(); table.name = 'prancheta'; room.add( table )
	{ const L = mk(), TH = .98
		for ( const x of [ - .56, .56 ] ) for ( const [ z, y2 ] of [ [ - .3, TH + .08 ], [ .3, TH - .06 ] ] ) L.wood.push( limb( [ x, 0, z * 1.15 ], [ x, y2 - .04, z ], .035, '#4d3422' ) )
		L.wood.push( box( 1.2, .05, .05, [ 0, .35, - .34 ], '#4d3422' ), box( 1.2, .05, .05, [ 0, .35, .34 ], '#4d3422' ) )
		flush( L, table )
		const top = tableTop = new THREE.Group(); top.position.y = TH; top.rotation.x = .16; table.add( top )
		const T = mk(); T.wood.push( box( 1.3, .04, .9, [ 0, 0, 0 ], '#5a3d27' ), box( 1.3, .06, .03, [ 0, .02, .465 ], '#4a3220' ) ); flush( T, top )
		{ const g = new THREE.PlaneGeometry( 1.05, .73 ); g.rotateX( - Math.PI / 2 ); g.translate( 0, .0215, 0 ); const m = new THREE.Mesh( g, paperMat ); m.receiveShadow = true; top.add( m ) }
		const U = mk(); U.wood.push( box( 1.1, .01, .045, [ 0, .026, .2 ], '#8a6a44' ), box( .045, .012, .5, [ - .45, .027, - .05 ], '#8a6a44' ) ) // esquadro em T
		
		U.iron.push( withColor( new THREE.CylinderGeometry( .03, .036, .06, 14 ).translate( .5, .045, - .3 ), '#25252a' ) ) // tinteiro
		U.rope.push( withColor( new THREE.CylinderGeometry( .04, .04, .6, 12 ).rotateX( Math.PI / 2 ).translate( - .6, .055, - .02 ), '#d9d2b8' ) ) // planta enrolada
		flush( U, top ) }
	table.position.set( - 1.45, .02, - .25 ); const TROT = 2.83; table.rotation.y = TROT; table.scale.y = .76; reg( 'prancheta', 'Prancheta de desenho', table ) // baixa (tampo ~0,75 m): ele desenha sentado
	// prancheta virada para o fundo (baía) e ele sentado desse lado, de frente para quem passa pelo corredor; assento a 67 cm do centro, lado baixo do tampo; o banquinho fica embaixo
	const SEAT = [ table.position.x + .67 * Math.sin( TROT ), .02, table.position.z + .67 * Math.cos( TROT ) ]
	const seat = new THREE.Group(); seat.name = 'andre-assento'; seat.position.set( ...SEAT ); seat.rotation.y = TROT + Math.PI; room.add( seat ); if ( ! OBSERVE ) reg( 'andre', 'André Rebouças (assento)', seat )

	// --- trilhos de vagonete (dormentes + trilhos de ferro) correndo até a borda do cais
	const rails = new THREE.Group(); rails.name = 'trilhos'; room.add( rails )
	{ const L = mk(), z0 = ZF - .05, z1 = QZ + .35
		for ( let z = z1; z < z0; z += .55 ) L.wood.push( box( 1.15, .06, .16, [ 0, .03, z ], z % 1 < .5 ? '#7a5636' : '#6d4c30' ) )
		for ( const x of [ - .36, .36 ] ) { const len = z0 - z1, zc = ( z0 + z1 ) / 2 // trilho com perfil: patim, alma e boleto
			L.rust.push( box( .1, .016, len, [ x, .068, zc ], '#8f8a84' ), box( .024, .044, len, [ x, .098, zc ], '#8f8a84' ), box( .062, .03, len, [ x, .135, zc ], '#a39d95' ) )
			for ( let z = z1 + .1; z < z0; z += .55 ) L.rust.push( box( .15, .008, .11, [ x, .07, z ], '#6d6a66' ) ) } // placas de apoio nos dormentes
		flush( L, rails, false ) }
	rails.position.set( 1.55, .02, 0 ); reg( 'trilhos', 'Trilhos', rails )

	// --- borda do cais: meio-fio de pedra, cabeços de amarração, correntes e rolos de corda (limite de caminhada)
	const copingMat = mat( { map: polyTex( 'monastery_stone_floor', 'diff', 1.2, 1.2, 1.2, true ), normalMap: polyTex( 'monastery_stone_floor', 'nor_gl', 1.2, 1.2, 1.2 ), roughness: .85, vertexColors: true }, .07 ); mats.stone = copingMat // meio-fio de pedra com textura
	{ const L = mk(); L.stone.push( box( W * 2 + .6, .16, .55, [ 0, .08, QZ + .1 ], '#b9b3a6' ), box( W * 2 + .6, .5, .08, [ 0, - .2, QZ - .17 ], '#8f897c' ) ); 
		const prof = [ [ 0, 0 ], [ .11, 0 ], [ .1, .08 ], [ .06, .16 ], [ .06, .27 ], [ .095, .3 ], [ .12, .36 ], [ .1, .4 ], [ 0, .42 ] ].map( p => new THREE.Vector2( p[ 0 ], p[ 1 ] ) )
		const xs = [ - 2.0, 0, 2.0 ]
		for ( const x of xs ) L.rust.push( withColor( new THREE.LatheGeometry( prof, 28 ).scale( 1.5, 1.5, 1.5 ).translate( x, .16, QZ + .1 ), '#9a948c' ) )
		// corrente de amarração: elos alternados (um de frente, o seguinte de lado) pendurada em catenária entre os cabeços, apoiada no meio-fio
		for ( let i = 0; i < xs.length - 1; i ++ ) {
			const xa = xs[ i ], xb = xs[ i + 1 ], z = QZ + .1, y0 = .6, sag = .4, N = 240, P = []
			for ( let k = 0; k <= N; k ++ ) { const s = k / N; P.push( new THREE.Vector3( xa + ( xb - xa ) * s, Math.max( .2, y0 - sag * 4 * s * ( 1 - s ) ), z ) ) }
			let acc = 0, next = 0, n = 0; const step = .058
			for ( let k = 1; k <= N; k ++ ) { acc += P[ k ].distanceTo( P[ k - 1 ] ); if ( acc < next ) continue; next += step
				const t = P[ k ].clone().sub( P[ k - 1 ] ).normalize(), nn = new THREE.Vector3( - t.y, t.x, 0 ), b = new THREE.Vector3( 0, 0, 1 ), m = new THREE.Matrix4()
				if ( n ++ % 2 ) m.makeBasis( t, b, nn.clone().negate() ); else m.makeBasis( t, nn, b )
				const g = new THREE.TorusGeometry( .027, .0105, 6, 14 ); g.scale( 1.55, 1, 1 ); g.applyMatrix4( m ); g.translate( P[ k ].x, P[ k ].y, P[ k ].z ); L.rust.push( withColor( g, '#7d7872' ) ) } }
		{ // rolo de corda de cânhamo: 3 cordões torcidos em espiral achatada (3 voltas), em vez de anéis lisos
			const cx = 2.0, cz = QZ + .75, turns = 3.2, NS = 720, path = [], up = new THREE.Vector3( 0, 1, 0 )
			for ( let k = 0; k <= NS; k ++ ) { const s = k / NS, th = s * turns * TAU, r = .075 + s * .15; path.push( new THREE.Vector3( cx + Math.cos( th ) * r, .045 + s * .03, cz + Math.sin( th ) * r ) ) }
			const cols = [ '#bfa673', '#a98f5e', '#c9b283' ]
			for ( let j = 0; j < 3; j ++ ) { const pts = path.map( ( p, k ) => { const q = path[ Math.min( k + 1, NS ) ], o = path[ Math.max( k - 1, 0 ) ], t = q.clone().sub( o ).normalize(), nn = new THREE.Vector3().crossVectors( t, up ).normalize(), bb = new THREE.Vector3().crossVectors( t, nn ), a = j * TAU / 3 + k / NS * turns * TAU * 11
					return p.clone().addScaledVector( nn, Math.cos( a ) * .0125 ).addScaledVector( bb, Math.sin( a ) * .0125 ) } )
				L.rope.push( withColor( new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts ), NS, .0125, 6, false ), cols[ j ] ) ) } }
		flush( L, room ); L.stone.length = 0 }
	const edgeLight = new THREE.SpotLight( '#ffe2bf', 14, 14, .7, .8, 1.4 ); edgeLight.position.set( - 1.6, 4.0, QZ + 3.2 ); edgeLight.target.position.set( 0, .4, QZ ); room.add( edgeLight, edgeLight.target )

	// --- objetos (Poly Haven CC0): caixotes, barris, banco, lampião
	const items = [
		{ key: 'banco', label: 'Banco', id: 'wooden_stool_01', h: .25, pos: [ SEAT[ 0 ], .02, SEAT[ 2 ] - .03 ], rotY: TROT },
		{ key: 'lampiao', label: 'Lampião', id: 'Lantern_01', h: .42, pos: [ - 2.2, .02, .1 ], rotY: .3 },
		{ key: 'crate', label: 'Caixote', id: 'wooden_crate_02', h: .5, pos: [ 2.2, .02, - .7 ], rotY: .2 },
		{ key: 'crate2', label: 'Caixote (cima)', id: 'wooden_crate_01', h: .42, pos: [ 2.17, .52, - .72 ], rotY: - .3 },
		{ key: 'bau', label: 'Baú', id: 'treasure_chest', h: .5, pos: [ - 2.25, .02, - 1.1 ], rotY: .6 },
		{ key: 'mala', label: 'Mala de viagem', id: 'vintage_suitcase', h: .3, pos: [ .95, .02, .45 ], rotY: - .5 },
		{ key: 'barril1', label: 'Barril 1', id: 'wooden_barrels_01', only: 'barrel01', h: .9, pos: [ 1.9, .02, - 2.3 ], rotY: 0 },
		{ key: 'barril2', label: 'Barril 2', id: 'wooden_barrels_01', only: 'barrel02', h: .9, pos: [ 2.6, .02, - 2.0 ], rotY: 1.2 },
		{ parent: () => tableTop, id: 'seadogs_compass', h: .07, pos: [ .38, .03, - .15 ], rotY: .6 },
		{ parent: () => tableTop, id: 'vintage_binocular', h: .12, pos: [ - .38, .06, .02 ], rotY: 1.9 },
	]
	const mcache = new Map()
	const fix = src => { if ( mcache.has( src ) ) return mcache.get( src ); const m = new THREE.MeshStandardNodeMaterial( { color: src.color, map: src.map, normalMap: src.normalMap, normalScale: new THREE.Vector2( .6, .6 ), roughness: src.roughnessMap ? 1 : Math.max( .45, src.roughness ?? .7 ), roughnessMap: src.roughnessMap, metalness: src.metalness ?? 0, metalnessMap: src.metalnessMap, aoMap: src.aoMap, alphaMap: src.alphaMap, transparent: src.transparent, alphaTest: src.alphaTest, side: src.side, emissive: src.emissive, emissiveMap: src.emissiveMap } )
		if ( m.map ) m.emissiveNode = texture( m.map ).rgb.mul( warm ).mul( .08 ).mul( galleryBrightness ); mcache.set( src, m ); return m }
	const placed = {}
	for ( const it of items ) {
		if ( OBSERVE && it.key === 'banco' ) continue
		const src = await loadModel( it.id ); if ( ! src ) continue
		const obj = src.clone( true ); if ( it.only ) for ( const c of [ ...obj.children ] ) if ( ! c.name.includes( it.only ) ) obj.remove( c )
		obj.traverse( n => { if ( n.isMesh ) { n.material = fix( n.material ); n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false } } )
		obj.updateMatrixWorld( true ); const bb = new THREE.Box3().setFromObject( obj ), size = bb.getSize( new THREE.Vector3() ), ctr = bb.getCenter( new THREE.Vector3() )
		const s = it.h / size.y, holder = new THREE.Group()
		obj.position.set( - ctr.x, - bb.min.y, - ctr.z ); holder.add( obj ); holder.scale.setScalar( s ); holder.position.set( ...it.pos ); holder.rotation.y = it.rotY; ( it.parent ? it.parent() : room ).add( holder )
		if ( it.key ) reg( it.key, it.label, holder ); placed[ it.key || it.id ] = { size: size.toArray().map( v => +( v * s ).toFixed( 3 ) ), pos: it.pos }
	}

	// --- posições: painel, ajuste, salvar no navegador
	objs.corazul2 = { label: 'Céu · cor do azul sólido', grp: new THREE.Group(), base: 0, def: { x: 153, y: 20, z: 0, rot: 0 } } // x = B do azul de cima, y = B do azul de baixo (0–255)
	const LAYOUT_DEFAULT = {}
	for ( const k of Object.keys( LAYOUT_DEFAULT ) ) if ( objs[ k ] ) objs[ k ].def = { ...objs[ k ].def, ...LAYOUT_DEFAULT[ k ] }
	// ajuste fino das mãos do André (modo teodolito): deslocamento em cm no quadro dele, giro do punho e curvatura dos dedos; ReboucasObserving lê .val a cada quadro
	const HANDKEYS = OBSERVE ? [ 'mao_esq', 'mao_dir', 'dedos_esq', 'dedos_dir' ] : []
	for ( const [ key, label ] of [ [ 'mao_esq', 'André · mão esquerda' ], [ 'mao_dir', 'André · mão direita' ], [ 'dedos_esq', 'André · dedos esquerda' ], [ 'dedos_dir', 'André · dedos direita' ] ] ) if ( OBSERVE ) objs[ key ] = { label, grp: new THREE.Group(), base: 0, def: { x: 0, y: 0, z: 0, rot: 0, pitch: 0, yaw: 0 } }
	const hooks = { onHand: null }
	const LKEY = 'legado.layout.reboucas.v1', saved = ( () => { try { return JSON.parse( localStorage.getItem( LKEY ) ) || {} } catch { return {} } } )()
	const marker = new THREE.Mesh( new THREE.RingGeometry( .42, .47, 48 ).rotateX( - Math.PI / 2 ), new THREE.MeshBasicNodeMaterial( { color: '#ffd27a', transparent: true, opacity: .9, depthTest: false } ) ); marker.renderOrder = 20; marker.visible = false; room.add( marker )
	const order = [ 'teodolito', 'mao_esq', 'mao_dir', 'dedos_esq', 'dedos_dir', 'prancheta', 'andre', 'banco', 'lampiao', 'mala', 'bau', 'trilhos', 'crate', 'crate2', 'barril1', 'barril2', 'corazul2' ].filter( k => objs[ k ] )
	let current = order[ 0 ], markerOn = false
	const apply = k => { const o = objs[ k ]; if ( ! o ) return; const v = o.val; if ( k === 'corazul2' ) { blueU.value = v.x; blueBU.value = v.y; return } o.grp.position.set( v.x, v.y, v.z ); o.grp.rotation.y = o.base + v.rot * Math.PI / 180; if ( k === current && ! HANDKEYS.includes( k ) ) marker.position.set( v.x, v.y + .05, v.z ) }
	for ( const k of order ) { const o = objs[ k ]; o.val = { ...o.def, ...( saved[ k ] || {} ) }; apply( k ) }
	const desk = {
		meta: { override: k => HANDKEYS.includes( k ) ? ( k.startsWith( 'dedos' ) ? { x: { label: 'Curvatura dos dedos (%)', min: - 70, max: 70, step: 1, unit: '%' } } : { x: { label: 'Para fora (+) / dentro (−)', min: - 8, max: 8, step: .1, unit: 'cm' }, y: { label: 'Altura', min: - 8, max: 8, step: .1, unit: 'cm' }, z: { label: 'Frente (+) / trás (−)', min: - 8, max: 8, step: .1, unit: 'cm' }, rot: { label: 'Giro da mão (palma p/ cima ↔ baixo)', min: - 90, max: 90, step: 1, unit: '°' }, pitch: { label: 'Flexão do punho (dedos p/ cima ↔ baixo)', min: - 60, max: 60, step: 1, unit: '°' }, yaw: { label: 'Desvio do punho (dedos p/ os lados)', min: - 45, max: 45, step: 1, unit: '°' } } ) : k === 'corazul2' ? { x: { label: 'Azul de cima (B do RGB)', min: 0, max: 255, step: 1, unit: '' }, y: { label: 'Azul de baixo (B do RGB)', min: 0, max: 255, step: 1, unit: '' } } : { x: { label: 'Ao longo do corredor', min: - 2.5, max: 2.5, step: .01, unit: 'm' }, y: { label: 'Altura', min: - .5, max: 3, step: .01, unit: 'm' }, z: { label: 'Frente ↔ fundo', min: - 3.4, max: 1.3, step: .01, unit: 'm' }, rot: { label: 'Giro', min: - 180, max: 180, step: 1, unit: '°' } }, title: 'Cenário · posições', spec: [ [ 'x', 'Ao longo do corredor', - 2.5, 2.5, .01, 'm' ], [ 'y', 'Altura', - .5, 3, .01, 'm' ], [ 'z', 'Frente ↔ fundo', - 3.4, 1.3, .01, 'm' ], [ 'rot', 'Giro', - 180, 180, 1, '°' ], [ 'pitch', 'Flexão', - 60, 60, 1, '°' ], [ 'yaw', 'Desvio', - 45, 45, 1, '°' ] ] },
		keys: () => order, label: k => objs[ k ].label, get: k => ( { ...objs[ k ].val } ),
		set( k, prop, v ) { objs[ k ].val[ prop ] = Number( v ); apply( k ) },
		select( k ) { current = k; apply( k ); marker.visible = markerOn && ! HANDKEYS.includes( k ); hooks.onHand?.( HANDKEYS.includes( k ), k ) }, marker( on ) { markerOn = !! on; marker.visible = markerOn && ! HANDKEYS.includes( current ) },
		save() { try { const out = {}; for ( const k of order ) out[ k ] = { ...objs[ k ].val }; localStorage.setItem( LKEY, JSON.stringify( out ) ); return true } catch { return false } },
		reset( k ) { for ( const kk of k ? [ k ] : order ) { objs[ kk ].val = { ...objs[ kk ].def }; apply( kk ) } if ( ! k ) try { localStorage.removeItem( LKEY ) } catch {} },
		all() { const out = {}; for ( const k of order ) out[ k ] = { ...objs[ k ].val }; return out },
	}
	// limite de caminhada = a borda do cais (nicho a 6,25 do eixo do corredor)
	const walkMaxX = () => 6.25 - QZ - .35
	// luz: sol baixo e quente de trás (contraluz de aurora) + preenchimento frio e suave pela frente
	const sun = new THREE.SpotLight( '#ffcf99', 6, 9, .95, .9, 1.5 ); sun.position.set( 1.0, 4.4, ZB + .2 ); sun.target.position.set( - .1, 1.2, - .7 ); room.add( sun, sun.target )
	const fill = new THREE.SpotLight( '#dfe8ff', 8, 10, .8, .85, 1.5 ); fill.position.set( - 2.0, 4.4, ZF + .9 ); fill.target.position.set( - .3, 1.0, - .5 ); room.add( fill, fill.target )
	return { room, placed, sun, desk, walkMaxX, seat, theo, hands: OBSERVE ? { esq: objs.mao_esq, dir: objs.mao_dir, dedosEsq: objs.dedos_esq, dedosDir: objs.dedos_dir } : null, hooks, mode: OBSERVE ? 'teodolito' : 'desenho' }
}

















