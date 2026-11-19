import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texture, vec2, vec3, vec4, float, mix, smoothstep, step, fract, floor, sin, length, max, positionLocal, cameraPosition, modelWorldMatrixInverse, select, atan, uniform, mx_noise_float } from 'three/tsl';
import { ROOM, TAU, canvasTex, withColor, xf, tube, arcPts, wallPanel, box, loadModel, texLoader, texCache, polyTex } from './PeriodRoom.js';

// ---------------------------------------------------------------------------------------------
// Luiz Gama — frente do sobrado de seu escritório de rábula, Largo de São Francisco, São Paulo, noite de c. 1870.
// Ele aprendeu a ler aos 17 anos, virou advogado sem diploma (rábula) e libertou mais de 500 pessoas escravizadas nos tribunais,
// com a Lei de 7 de novembro de 1831 na mão. Cena: calçada de pedra sob o lampião a gás, fachada caiada com janelas acesas
// (as luzes de dentro eram as das noites de estudo), a placa do escritório e o edital da Lei de 1831 afixado na parede.
// A rua é contínua: casas vizinhas de cores e alturas diferentes prolongam a parede dos dois lados; acima dos telhados, só o céu.
// Sem paredes de nicho: céu e chão calculados pelo raio do olhar; só as fachadas são geometria de verdade.
// Mesmo referencial do PeriodRoom: origem no centro do nicho, +Z = corredor.
// ---------------------------------------------------------------------------------------------

const rndFn = seed => { let s = seed; return () => ( s = ( Math.imul( s, 1664525 ) + 1013904223 ) >>> 0 ) / 4294967296 }
const DEG = Math.PI / 180

// Céu do crepúsculo por direção do olhar: azimute ±SPAN/2 (0 = fundo do nicho), elevação 0–ELEV. Estrelas, lua e silhuetas da igreja.
const SKY_SPAN = 140, SKY_ELEV = 60
function skyTexture() {
	return canvasTex( 2048, 1024, ( c, w, h ) => {
		const r = rndFn( 1871 ), X = a => ( a / SKY_SPAN + .5 ) * w, Y = e => ( 1 - e / SKY_ELEV ) * h
		const g = c.createLinearGradient( 0, h, 0, 0 ) // do horizonte (embaixo) ao zênite
		g.addColorStop( 0, '#3a3a84' ); g.addColorStop( .10, '#33357e' ); g.addColorStop( .24, '#2b3076' ); g.addColorStop( .45, '#232a6c' ); g.addColorStop( .75, '#1b2261' ); g.addColorStop( 1, '#10164a' )
		c.fillStyle = g; c.fillRect( 0, 0, w, h )
		// brilho quente de poente atrás da igreja
		const gl = c.createRadialGradient( X( 8 ), Y( 0 ), 0, X( 8 ), Y( 0 ), 420 ); gl.addColorStop( 0, 'rgba(255,170,110,.38)' ); gl.addColorStop( 1, 'rgba(255,170,110,0)' ); c.fillStyle = gl; c.fillRect( 0, 0, w, h )
		// estrelas (somem nas bordas laterais para não esticar com o clamp)
		for ( let i = 0; i < 520; i ++ ) { const x = 80 + r() * ( w - 160 ), y = r() * h * .8, k = 1 - y / h; c.fillStyle = `rgba(255,248,230,${( .25 + r() * .6 ) * ( .35 + k )})`; c.beginPath(); c.arc( x, y, .6 + r() * 1.3, 0, TAU ); c.fill() }
		// lua crescente
		{ const mx = X( - 33 ), my = Y( 43 ), R = 16
			const mg = c.createRadialGradient( mx, my, R * .6, mx, my, R * 2.6 ); mg.addColorStop( 0, 'rgba(255,240,200,.10)' ); mg.addColorStop( 1, 'rgba(255,240,200,0)' ); c.fillStyle = mg; c.fillRect( mx - R * 5, my - R * 5, R * 10, R * 10 )
			c.save(); c.beginPath(); c.arc( mx, my, R, 0, TAU ); c.clip(); c.fillStyle = '#fff3d2'; c.fillRect( mx - R, my - R, R * 2, R * 2 )
			c.fillStyle = '#26307a'; c.beginPath(); c.arc( mx + R * .55, my - R * .12, R * .95, 0, TAU ); c.fill(); c.restore() }
	}, { srgb: true } )
}

function signTexture() { // placa do escritório, pintada à mão sobre madeira
	return canvasTex( 1024, 320, ( c, w, h ) => {
		c.fillStyle = '#1f2a22'; c.fillRect( 0, 0, w, h )
		const r = rndFn( 4 ); for ( let i = 0; i < 1800; i ++ ) { c.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '0,0,0'},${.02 + r() * .05})`; c.fillRect( r() * w, r() * h, 1 + r() * 40, 1 ) }
		c.strokeStyle = '#d9c28a'; c.lineWidth = 6; c.strokeRect( 16, 16, w - 32, h - 32 ); c.lineWidth = 2; c.strokeRect( 30, 30, w - 60, h - 60 )
		c.fillStyle = '#e6d29b'; c.textAlign = 'center'; c.font = '700 96px Georgia'; c.fillText( 'LUIZ GAMA', w / 2, 154 )
		c.font = 'italic 46px Georgia'; c.fillText( 'Rábula  ·  Advocacia e consultas', w / 2, 224 )
		c.fillStyle = '#b79c5f'; c.fillRect( w / 2 - 90, 246, 180, 3 )
	} )
}

function edictTexture() { // edital da Lei de 7 de novembro de 1831 (art. 1º), cartaz impresso em papel envelhecido
	return canvasTex( 512, 720, ( c, w, h ) => {
		c.fillStyle = '#d9cfae'; c.fillRect( 0, 0, w, h )
		const r = rndFn( 31 ); for ( let i = 0; i < 90; i ++ ) { const x = r() * w, y = r() * h, s = 30 + r() * 120, g = c.createRadialGradient( x, y, 0, x, y, s ); g.addColorStop( 0, r() < .5 ? 'rgba(120,92,50,.10)' : 'rgba(255,248,220,.12)' ); g.addColorStop( 1, 'rgba(0,0,0,0)' ); c.fillStyle = g; c.fillRect( x - s, y - s, s * 2, s * 2 ) }
		c.strokeStyle = '#2a2420'; c.fillStyle = '#2a2420'; c.lineWidth = 5; c.strokeRect( 22, 22, w - 44, h - 44 ); c.lineWidth = 1.5; c.strokeRect( 32, 32, w - 64, h - 64 )
		c.textAlign = 'center'; c.font = '700 40px Georgia'; c.fillText( 'LEI', w / 2, 102 ); c.font = '600 25px Georgia'; c.fillText( 'DE 7 DE NOVEMBRO DE 1831', w / 2, 142 )
		c.fillRect( w / 2 - 70, 160, 140, 2 )
		c.textAlign = 'left'; c.font = '21px Georgia'
		const lines = [ 'Art. 1º  Todos os escravos, que', 'entrarem no território ou portos do', 'Brasil, vindos de fora, ficam livres.' ]
		lines.forEach( ( t, i ) => c.fillText( t, 56, 214 + i * 30 ) )
		c.fillStyle = 'rgba(42,36,32,.55)'; for ( let y = 330; y < 640; y += 15 ) c.fillRect( 56, y, w - 112 - ( r() < .2 ? 90 : r() * 40 ), 3.4 ) // texto miúdo
		c.fillStyle = '#7a2a22'; c.beginPath(); c.arc( w / 2, 668, 17, 0, TAU ); c.fill() // lacre
	} )
}

export async function buildLuizGamaRoom( group, { galleryBrightness } ) {
	await Promise.all( [ 'monastery_stone_floor', 'dark_wood', 'white_plaster_rough_01' ].flatMap( n => [ 'diff', 'nor_gl' ].map( async k => { const key = `${n}-${k}`; if ( ! texCache.has( key ) ) texCache.set( key, await texLoader.loadAsync( `/textures/set/${key}.webp` ) ) } ) ) )
	const skyTex = skyTexture(); skyTex.wrapS = skyTex.wrapT = THREE.ClampToEdgeWrapping; skyTex.anisotropy = 8; skyTex.needsUpdate = true
	const warm = vec3( 1, .8, .56 )
	// escurece rumo às pontas da rua: a fachada acaba na sombra, sem parecer infinita
	const DARK = vec3( .03, .03, .09 )
	const fadeEnds = m => { const f = smoothstep( 5.2, 11.6, positionLocal.x.abs() ).mul( .94 ), orig = m.setupOutput.bind( m ); m.setupOutput = ( b, lit ) => orig( b, vec4( mix( lit.rgb, DARK, f ), lit.a ) ); return m }
	const mat = ( opts, glow = .1 ) => { const m = fadeEnds( new THREE.MeshStandardNodeMaterial( opts ) ); m.emissiveNode = ( m.map ? texture( m.map ).rgb : vec3( m.color.r, m.color.g, m.color.b ) ).mul( warm ).mul( glow ).mul( galleryBrightness ); return m }
	const { halfW: W, spring: SP, front: ZF } = ROOM, ZB = - .98, ZBS = - 40, D = ZF - ZB
	const FZ = - 2.5, FT = .45, FH = 4.6, FW = W, FZF = FZ + FT / 2 // plano da fachada, espessura, altura, meia largura, face da frente
	const room = new THREE.Group(); room.name = 'room-luizgama'; group.add( room )
	const add = ( g, m, { cast = false, recv = true, parent = null } = {} ) => { const mesh = new THREE.Mesh( g, m ); mesh.castShadow = cast; mesh.receiveShadow = recv; ( parent || room ).add( mesh ); return mesh }

	// --- CÉU + RUA: tudo pelo raio do olhar (laterais, teto e fundo do vão); a fachada é geometria de verdade na frente disso
	const stoneTex = k => { const t = texCache.get( `monastery_stone_floor-${k}` ).clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if ( k === 'diff' ) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t }
	const TILE = 1.5, stoneDiff = stoneTex( 'diff' ), stoneNor = stoneTex( 'nor_gl' )
	const hv = c => vec3( c.r, c.g, c.b ), TINT = hv( new THREE.Color( '#9a93aa' ) ), FAR = hv( new THREE.Color( '#3a3a84' ) )
	const FLOORY = .02, groundAt = xz => texture( stoneDiff, xz.div( TILE ) ).rgb.mul( TINT ).mul( 1.25 )
	const camL = modelWorldMatrixInverse.mul( vec4( cameraPosition, 1 ) ).xyz
	const skyAt = dir => { const az = atan( dir.x, dir.z.negate() ).div( SKY_SPAN * DEG ).add( .5 ), el = dir.y.asin().div( SKY_ELEV * DEG ); return texture( skyTex, vec2( az.clamp( 0, 1 ), el.clamp( 0, 1 ) ) ).rgb }
	const hazeGround = xz => groundAt( xz )
	// casas vizinhas PINTADAS pelo raio do olhar no plano da fachada (z = FZF): a rua continua depois do sobrado sem nenhuma geometria fora do nicho
	const CELLW = 4.4, hash1 = x => fract( sin( x.mul( 12.9898 ).add( 78.233 ) ).mul( 43758.5453 ) ), hash2d = p => fract( sin( p.x.mul( 12.9898 ).add( p.y.mul( 78.233 ) ) ).mul( 43758.5453 ) )
	const archMask = ( dx, y, w, y0, h ) => { const r = w / 2, yb = y0 + h - r // vão com topo em arco: 1 dentro, 0 fora
		const rect = step( dx.abs(), float( r ) ).mul( step( y0, y ) ).mul( step( y, float( yb ) ) ), circ = step( length( vec2( dx, y.sub( yb ) ) ), float( r ) ).mul( step( yb, y ) ); return max( rect, circ ) }
	const WALLS = [ '#e4cd96', '#bfd0da', '#e7c4be', '#efe5cc' ].map( c => hv( new THREE.Color( c ) ) ), FRAMEC = hv( new THREE.Color( '#dcd2b6' ) ), DOORC = hv( new THREE.Color( '#2f4a3c' ) ), STONEB = hv( new THREE.Color( '#8f897c' ) ), FARC = hv( new THREE.Color( '#8a6a92' ) )
	const facadeAt = ( hx, hy, t ) => {
		const ax = hx.abs().sub( FW ), id = floor( ax.div( CELLW ) ).add( step( 0, hx ).mul( 13 ) ).add( 3.7 ), cu = fract( ax.div( CELLW ) ).mul( CELLW )
		const h1 = hash1( id ), h2 = hash1( id.add( 11.3 ) ), h3 = hash1( id.add( 23.7 ) ), H = h1.mul( .9 ).add( 4.2 ), doorHere = step( .55, h3 )
		let wall = WALLS[ 0 ]; for ( let k = 1; k < 4; k ++ ) wall = mix( wall, WALLS[ k ], step( k * .25, h2 ) )
		let col = wall.mul( hash2d( floor( vec2( hx, hy ).div( .5 ) ) ).mul( .14 ).add( .9 ) )
		for ( const [ cx, y0, h, w, k ] of [ [ 1.1, .95, 1.6, .9, 1 ], [ 3.3, .95, 1.6, .9, 2 ], [ 1.1, 2.95, 1.2, .9, 3 ], [ 3.3, 2.95, 1.2, .9, 4 ] ] ) { // janelas (a de baixo à esquerda vira porta quando há porta)
			const keep = k === 1 ? float( 1 ).sub( doorHere ) : float( 1 ), open = archMask( cu.sub( cx ), hy, w, y0, h ), frame = archMask( cu.sub( cx ), hy, w + .24, y0 - .06, h + .12 )
			const glass = mix( vec3( .15, .16, .28 ), vec3( 1, .72, .38 ), step( .28, hash1( id.add( k * 3.1 ) ) ) )
			col = mix( col, FRAMEC, frame.mul( keep ) ); col = mix( col, glass, open.mul( keep ) ) }
		col = mix( col, FRAMEC, archMask( cu.sub( 1.1 ), hy, 1.44, .02, 2.72 ).mul( doorHere ) ); col = mix( col, DOORC, archMask( cu.sub( 1.1 ), hy, 1.2, .02, 2.6 ).mul( doorHere ) )
		col = mix( col, STONEB, step( hy, .62 ) ) // embasamento de pedra
		col = mix( col, vec3( .35, .24, .17 ), step( H.sub( .16 ), hy ).mul( step( hy, H ) ) ) // cornija
		col = mix( col, mix( vec3( .55, .27, .17 ), vec3( .63, .3, .2 ), step( .5, fract( hx.mul( 7.7 ) ) ) ), step( H, hy ) ) // beiral de telhas
		return vec4( col.mul( vec3( .5, .46, .56 ) ), step( hy, H.add( .38 ) ).mul( step( 0, hy ) ) ) }
	const world = new THREE.MeshBasicNodeMaterial( { side: THREE.DoubleSide } ); world.fog = false
	{ const rayL = positionLocal.sub( camL ), dir = rayL.normalize(), dz = dir.z.min( - .0001 ), dyy = dir.y.min( - .0001 )
		const tF = float( FZF ).sub( camL.z ).div( dz ), hx = camL.x.add( dir.x.mul( tF ) ), hy = camL.y.add( dir.y.mul( tF ) )
		const tG = float( FLOORY ).sub( camL.y ).div( dyy ), hitG = camL.add( dir.mul( tG ) ), down = dir.y.lessThan( - .0005 ), fac = facadeAt( hx, hy, tF )
		const seen = dir.z.lessThan( - .0005 ).and( tF.greaterThan( 0 ) ).and( fac.a.greaterThan( .5 ) ).and( down.not().or( tF.lessThan( tG ) ) )
		// bruma azul nas laterais: a rua se dilui num azul-noite com a distância ao longo do corredor (x), nos dois lados, e não parece infinita

		world.colorNode = select( seen, fac.rgb, select( down, hazeGround( hitG.xz ), skyAt( dir ) ) ).mul( .96 ) }
	// Divide o arco acima das telhas para manter o céu visível sobre a névoa.
	const fogTop = 5.08
	const arch = arcPts( 0, SP, W, 0, Math.PI, 40 )
	const firstAboveRoof = arch.findIndex( ( [ , y ] ) => y > fogTop )
	const [ x0, y0 ] = arch[ firstAboveRoof - 1 ], [ x1, y1 ] = arch[ firstAboveRoof ]
	const cutX = THREE.MathUtils.lerp( x0, x1, ( fogTop - y0 ) / ( y1 - y0 ) )
	const rightCut = [ cutX, fogTop ], leftCut = [ - cutX, fogTop ]
	const skyArch = arch.slice( firstAboveRoof, - firstAboveRoof )
	add( tube( [ rightCut, ...skyArch, leftCut ], ZBS, ZF, 1 ), world, { recv: false } )
	add( wallPanel( [ [ - W, 0 ], [ W, 0 ], [ W, SP ], [ - W, SP ] ], ZBS, 1 ), world, { recv: false } )
	add( wallPanel( [ [ W, SP ], ...arcPts( 0, SP, W, 0, Math.PI, 40 ), [ - W, SP ] ], ZBS, 1 ), world, { recv: false } )
	// piso real (iluminado): nas bordas vira o mesmo piso do raio, sem emenda
	const fadeToGround = m => { const p = positionLocal, e = float( W ).sub( p.x.abs() ).div( 1.2 ), f = float( 1 ).sub( smoothstep( 0, 1, e ) ), tgt = hazeGround( p.xz ); const orig = m.setupOutput.bind( m ); m.setupOutput = ( b, lit ) => orig( b, vec4( mix( lit.rgb, tgt, f ), lit.a ) ); return m }
	const floorG = new THREE.PlaneGeometry( W * 2, ZF - FZF ); floorG.rotateX( - Math.PI / 2 ); floorG.translate( 0, FLOORY, ( ZF + FZF ) / 2 )
	{ const pos = floorG.attributes.position, uv = floorG.attributes.uv; for ( let i = 0; i < pos.count; i ++ ) uv.setXY( i, pos.getX( i ) / TILE, pos.getZ( i ) / TILE ) }
	add( floorG, fadeToGround( mat( { map: stoneDiff, normalMap: stoneNor, roughness: .55, color: '#9d95ad' }, .12 ) ) )

	// --- materiais
	const plaster = mat( { map: polyTex( 'white_plaster_rough_01', 'diff', 1.6, 1, 1, true ), normalMap: polyTex( 'white_plaster_rough_01', 'nor_gl', 1.6, 1, 1 ), roughness: .95, color: '#ffffff', side: THREE.DoubleSide }, .34 )
	// A densidade usa coordenadas do próprio set, então o contorno fica fixo ao mover a câmera.
	const sideFog = new THREE.MeshBasicNodeMaterial( { side: THREE.DoubleSide } ); sideFog.fog = false
	const clouds = mx_noise_float( positionLocal.mul( vec3( 1.1, 1.4, .75 ) ) )
	const wisps = mx_noise_float( positionLocal.mul( 3.2 ) )
	const fogSpec = [
		[ 'x', 'X · Laterais → centro do set', 0, W, .01, 'm' ],
		[ 'y', 'Y · Topo → base', - 1.5, 3, .01, 'm' ],
		[ 'base', 'Y · Base → topo', 0, 3, .01, 'm' ],
		[ 'z', 'Z · Entrada → fachada', 0, 3.4, .01, 'm' ],
	]
	const fogDefaults = { x: 0, y: 0, z: 0, base: 0 }
	const fogY = uniform( 0 ), fogZ = uniform( 0 ), fogBase = uniform( 0 )
	const fade = smoothstep( .08, fogY.add( 1.6 ), float( fogTop ).sub( positionLocal.y ) )
	const frontFade = smoothstep( 0, fogZ.max( .001 ), float( ZF ).sub( positionLocal.z ) )
	const baseFade = smoothstep( 0, fogBase.max( .001 ), positionLocal.y )
	const density = mix( fade.mul( fade ), fade, clouds.mul( .45 ).add( .55 ).clamp( 0, 1 ) ).mul( select( fogZ.greaterThan( 0 ), frontFade, float( 1 ) ) ).mul( select( fogBase.greaterThan( 0 ), baseFade, float( 1 ) ) )
	const fogShade = clouds.mul( .18 ).add( wisps.mul( .06 ) ).add( .9 )
	const fogColor = mix( hv( new THREE.Color( '#030306' ) ), hv( new THREE.Color( '#0b1748' ) ), smoothstep( .2, fogTop, positionLocal.y ) ).mul( fogShade )
	sideFog.colorNode = mix( world.colorNode, fogColor, density )
	const fogLayers = []
	for ( const profile of [ [ [ W, 0 ], ...arch.slice( 0, firstAboveRoof ), rightCut ], [ leftCut, ...arch.slice( - firstAboveRoof ), [ - W, 0 ] ] ] ) {
		const geometry = tube( profile, ZBS, ZF, 1 )
		add( geometry, sideFog, { recv: false } )
		for ( let i = 1; i <= 8; i ++ ) {
			const offset = i / 9
			const material = new THREE.MeshBasicNodeMaterial( { side: THREE.DoubleSide, transparent: true, depthWrite: false, forceSinglePass: true } )
			material.fog = false
			material.colorNode = fogColor
			material.opacityNode = density.mul( .4 * ( 1 - offset ) )
			const mesh = add( geometry, material, { recv: false } )
			fogLayers.push( { mesh, offset } )
		}
	}
	const woodMat = mat( { map: polyTex( 'dark_wood', 'diff', 1.2, 1.2, 1.2, true ), normalMap: polyTex( 'dark_wood', 'nor_gl', 1.2, 1.2, 1.2 ), roughness: .6, vertexColors: true, side: THREE.DoubleSide }, .1 )
	const stoneMat = mat( { map: polyTex( 'monastery_stone_floor', 'diff', 1.2, 1.2, 1.2, true ), normalMap: polyTex( 'monastery_stone_floor', 'nor_gl', 1.2, 1.2, 1.2 ), roughness: .85, vertexColors: true }, .08 )
	const ironMat = mat( { color: '#ffffff', roughness: .5, metalness: .8, vertexColors: true }, .08 )
	const tileMat = mat( { color: '#ffffff', roughness: .8, vertexColors: true }, .1 )
	const paperMat = mat( { color: '#ffffff', roughness: .9, vertexColors: true }, .14 )
	const glowMat = fadeEnds( new THREE.MeshBasicNodeMaterial( { vertexColors: true } ) ); glowMat.fog = false
	const mats = { wood: woodMat, stone: stoneMat, iron: ironMat, tile: tileMat, paper: paperMat, glow: glowMat }
	const mk = () => ( { wood: [], stone: [], iron: [], tile: [], paper: [], glow: [] } )
	const flush = ( L, parent, cast = true ) => { for ( const k of Object.keys( L ) ) if ( L[ k ].length ) add( mergeGeometries( L[ k ].map( g => g.index ? g.toNonIndexed() : g ), false ), mats[ k ], { cast: cast && k !== 'glow', parent } ) }
	const objs = {}
	const reg = ( key, label, grp ) => { objs[ key ] = { label, grp, base: grp.rotation.y, def: { x: grp.position.x, y: grp.position.y, z: grp.position.z, rot: 0 } } }

	// --- FACHADAS: o sobrado do escritório no centro e casas vizinhas dos dois lados, formando uma rua contínua (sem fundo: só céu sobre os telhados)
	const F = new THREE.Group(); F.name = 'fachada'; room.add( F )
	const DOOR = { x: 0, y0: .02, w: 1.3, h: 2.75 }
	const WL = [ - 2.0, 2.0 ].map( x => ( { x, y0: .95, w: .9, h: 1.6 } ) ), WU = [ - 1.55, 1.55 ].map( x => ( { x, y0: 2.95, w: .9, h: 1.2 } ) )
	const OPEN = [ DOOR, ...WL, ...WU ]
	const plasterVar = col => { const m = mat( { map: plaster.map, normalMap: plaster.normalMap, roughness: .95, color: col, side: THREE.DoubleSide }, .34 ), c = new THREE.Color( col ); m.emissiveNode = texture( m.map ).rgb.mul( vec3( c.r, c.g, c.b ) ).mul( warm ).mul( .34 ).mul( galleryBrightness ); return m }
	// parede com vãos em arco (extrusão): x0..x1, altura H, plano central em zc
	const block = ( x0, x1, H, m, opens, zc ) => {
		const sh = new THREE.Shape(); sh.moveTo( x0, 0 ); sh.lineTo( x1, 0 ); sh.lineTo( x1, H ); sh.lineTo( x0, H ); sh.closePath()
		for ( const o of opens ) { const p = new THREE.Path(), r = o.w / 2, yb = o.y0 + o.h - r; p.moveTo( o.x - r, o.y0 ); p.lineTo( o.x + r, o.y0 ); p.lineTo( o.x + r, yb ); p.absarc( o.x, yb, r, 0, Math.PI, false ); p.lineTo( o.x - r, o.y0 ); sh.holes.push( p ) }
		const g = new THREE.ExtrudeGeometry( sh, { depth: FT, bevelEnabled: false, curveSegments: 16 } ); g.translate( 0, 0, zc - FT / 2 ); add( g, m, { cast: true, parent: F } ) }
	const WCOL = '#2e1f17', FCOL = '#4a3426'
	// janela: vidro aceso/escuro (só nas vizinhas), caixilhos, moldura, peitoril, grade e veneziana (shut = lado da folha)
	const winDeco = ( L, o, zc, { shut = 0, glass = false, grille = false } = {} ) => {
		const r = o.w / 2, yb = o.y0 + o.h - r, zz = zc + .05, zF = zc + FT / 2 + .02
		if ( glass ) L.glow.push( box( o.w + .12, o.h + .12, .02, [ o.x, o.y0 + o.h / 2, zc - FT / 2 + .05 ], o.lit === false ? '#262a48' : '#f0b564' ) )
		L.wood.push( box( .05, o.h - r + .02, .05, [ o.x, o.y0 + ( o.h - r ) / 2, zz ], WCOL ), box( o.w, .045, .05, [ o.x, o.y0 + ( o.h - r ) * .5, zz ], WCOL ), box( o.w, .045, .05, [ o.x, yb, zz ], WCOL ) )
		for ( const a of [ - 1.05, - .52, 0, .52, 1.05 ] ) L.wood.push( withColor( xf( new THREE.BoxGeometry( .03, r * .96, .05 ), [ o.x - Math.sin( a ) * r * .48, yb + Math.cos( a ) * r * .48, zz ], [ 0, 0, a ] ), WCOL ) )
		L.wood.push( box( .07, o.h - r, .06, [ o.x - r - .035, o.y0 + ( o.h - r ) / 2, zF ], FCOL ), box( .07, o.h - r, .06, [ o.x + r + .035, o.y0 + ( o.h - r ) / 2, zF ], FCOL ) )
		const ring = new THREE.RingGeometry( r, r + .07, 28, 1, 0, Math.PI ); ring.translate( o.x, yb, zF + .03 ); L.wood.push( withColor( ring.toNonIndexed(), FCOL ) )
		L.stone.push( box( o.w + .26, .06, .16, [ o.x, o.y0 - .03, zF + .06 ], '#bdb7a8' ) )
		if ( grille ) for ( let i = - 3; i <= 3; i ++ ) L.iron.push( box( .018, o.h - r + .1, .02, [ o.x + i * ( o.w - .08 ) / 6, o.y0 + ( o.h - r ) / 2, zc + .12 ], '#1a1a1d' ) )
		if ( shut ) { const sw = r - .02, sx = o.x + shut * ( r + sw / 2 + .05 ), sh = o.h - r, y0 = o.y0
			L.wood.push( box( sw, sh, .045, [ sx, y0 + sh / 2, zF + .035 ], '#2f5a4a' ), box( .05, sh, .06, [ sx - sw / 2, y0 + sh / 2, zF + .04 ], '#244a3b' ), box( .05, sh, .06, [ sx + sw / 2, y0 + sh / 2, zF + .04 ], '#244a3b' ) )
			for ( let y = y0 + .08; y < y0 + sh - .04; y += .075 ) L.wood.push( withColor( xf( new THREE.BoxGeometry( sw - .06, .012, .03 ), [ sx, y, zF + .07 ], [ - .6, 0, 0 ] ), '#3f7562' ) ) } }
	// porta de duas folhas fechada, com almofadas, puxadores de latão e bandeira em arco (luz de dentro por cima)
	const doorDeco = ( L, o, zc, { glass = false, col = '#3b291e' } = {} ) => {
		const r = o.w / 2, yb = o.y0 + o.h - r, zF = zc + FT / 2 + .02, zl = zc + .02
		if ( glass ) L.glow.push( box( o.w + .12, o.h + .12, .02, [ o.x, o.y0 + o.h / 2, zc - FT / 2 + .05 ], '#f0b564' ) )
		L.wood.push( box( .12, yb, .16, [ o.x - r - .06, yb / 2, zF + .04 ], '#3b291e' ), box( .12, yb, .16, [ o.x + r + .06, yb / 2, zF + .04 ], '#3b291e' ) )
		const ring = new THREE.RingGeometry( r, r + .12, 34, 1, 0, Math.PI ); ring.translate( o.x, yb, zF + .05 ); L.wood.push( withColor( ring.toNonIndexed(), '#3b291e' ) )
		for ( let k = - 4; k <= 4; k ++ ) L.stone.push( withColor( xf( new THREE.BoxGeometry( .14, .22, .1 ), [ o.x + Math.sin( k * .36 ) * ( r + .2 ), yb + Math.cos( k * .36 ) * ( r + .2 ), zF + .02 ], [ 0, 0, - k * .36 ] ), '#b9b3a6' ) ) // aduelas do arco
		const hL = yb - o.y0 - .1, lw = r - .012
		for ( const s of [ - 1, 1 ] ) { const cx = o.x + s * ( lw / 2 + .006 )
			L.wood.push( box( lw, hL, .06, [ cx, o.y0 + hL / 2, zl ], col ), box( lw - .2, hL * .34, .025, [ cx, o.y0 + hL * .24, zl + .04 ], '#2a1b13' ), box( lw - .2, hL * .3, .025, [ cx, o.y0 + hL * .72, zl + .04 ], '#2a1b13' ) )
			L.iron.push( box( .025, .13, .03, [ o.x + s * .07, o.y0 + hL * .5, zl + .06 ], '#c9a24b' ) ) }
		L.wood.push( box( o.w, .1, .07, [ o.x, yb - .05, zl ], col ) )
		for ( const a of [ - 1.05, - .52, 0, .52, 1.05 ] ) L.wood.push( withColor( xf( new THREE.BoxGeometry( .03, r * .96, .05 ), [ o.x - Math.sin( a ) * r * .48, yb + Math.cos( a ) * r * .48, zl + .03 ], [ 0, 0, a ] ), '#2e1f17' ) ) }
	// embasamento de pedra (interrompido pelas portas), cornija com beiral de telhas e cantoneiras
	const baseStone = ( L, x0, x1, zc, doors ) => { const zF = zc + FT / 2 + .02, seg = ( a, b ) => { const cx = ( a + b ) / 2, w = b - a; L.stone.push( box( w, .62, .1, [ cx, .31, zF + .03 ], '#a8a295' ), box( w, .06, .13, [ cx, .65, zF + .04 ], '#bcb5a5' ) ) }
		let a = x0; for ( const d of [ ...doors ].sort( ( p, q ) => p.x - q.x ) ) { const b = d.x - d.w / 2 - .2; if ( b > a ) seg( a, b ); a = d.x + d.w / 2 + .2 } if ( x1 > a ) seg( a, x1 ) }
	const crown = ( L, x0, x1, H, zc ) => { const zF = zc + FT / 2 + .02, cx = ( x0 + x1 ) / 2, w = x1 - x0
		L.wood.push( box( w + .06, .16, .34, [ cx, H - .08, zF + .1 ], '#5a3d2b' ), box( w + .06, .1, .5, [ cx, H + .03, zF + .12 ], '#4a3222' ) )
		for ( let x = x0 + .06, i = 0; x < x1; x += .13, i ++ ) L.tile.push( withColor( xf( new THREE.CylinderGeometry( .06, .06, .5, 8, 1, false, 0, Math.PI ), [ x, H + .13, zF + .12 ], [ Math.PI / 2, 0, Math.PI / 2 ] ), i % 2 ? '#a14d32' : '#8f4029' ) )
		L.paper.push( box( .2, H, .12, [ x0 + .1, H / 2, zF + .03 ], '#8a8470' ), box( .2, H, .12, [ x1 - .1, H / 2, zF + .03 ], '#8a8470' ) ) }
	// interior aceso atrás dos vãos do sobrado (luz de vela e lampiões): painel com brilho por abertura
	{ const tex = canvasTex( 1536, 1140, ( c, w, h ) => {
			const X = x => ( x + FW ) / ( 2 * FW ) * w, Y = y => ( 1 - y / FH ) * h
			c.fillStyle = '#3a2216'; c.fillRect( 0, 0, w, h )
			for ( const o of OPEN ) { const cx = X( o.x ), cy = Y( o.y0 + o.h * .45 ), g = c.createRadialGradient( cx, cy, 4, cx, cy, ( X( o.w ) - X( 0 ) ) * 1.5 + 30 ); g.addColorStop( 0, '#ffd694' ); g.addColorStop( .5, '#e0974c' ); g.addColorStop( 1, '#7a4423' ); c.fillStyle = g; c.fillRect( X( o.x - o.w / 2 ) - 4, Y( o.y0 + o.h ) - 4, X( o.w ) - X( 0 ) + 8, Y( o.y0 ) - Y( o.y0 + o.h ) + 8 ) }
			c.fillStyle = 'rgba(40,22,12,.55)'; c.fillRect( X( - 2.3 ), Y( 1.55 ), X( .6 ) - X( 0 ), Y( 1.0 ) - Y( 1.55 ) ) // estante vista pela janela da esquerda
		} )
		const g = new THREE.PlaneGeometry( FW * 2, FH ); g.translate( 0, FH / 2, FZ - FT / 2 - .18 )
		const m = fadeEnds( new THREE.MeshBasicNodeMaterial( { map: tex } ) ); m.fog = false; add( g, m, { recv: false, parent: F } ) }
	{ const L = mk(), zF = FZF + .02
		// sobrado do Luiz Gama (centro)
		block( - FW, FW, FH, plaster, OPEN, FZ )
		for ( const o of WL ) winDeco( L, o, FZ, { shut: Math.sign( o.x ), grille: true } )
		for ( const o of WU ) winDeco( L, o, FZ, { shut: Math.sign( o.x ) } )
		doorDeco( L, DOOR, FZ ); baseStone( L, - FW, FW, FZ, [ DOOR ] ); crown( L, - FW, FW, FH, FZ )
		L.stone.push( box( 1.9, .08, .5, [ 0, .04, zF + .26 ], '#c4bdae' ), box( 1.6, .08, .5, [ 0, .12, zF + .22 ], '#c8c1b2' ) ) // degraus de pedra
		for ( const x of [ - .72, .72 ] ) L.iron.push( box( .025, .3, .025, [ x, 3.34, zF + .1 ], '#1a1a1d' ) ) // ganchos da placa
		flush( L, F ) }
	{ const g = new THREE.PlaneGeometry( 1.55, .49 ); const m = new THREE.Mesh( g, mat( { map: signTexture(), roughness: .7 }, .22 ) ); m.position.set( 0, 3.55, FZF + .118 ); m.castShadow = false; F.add( m )
		const frame = new THREE.Mesh( new THREE.BoxGeometry( 1.65, .59, .05 ), woodMat ); withColor( frame.geometry, '#3b291e' ); frame.position.set( 0, 3.55, FZF + .092 ); F.add( frame ) }
	{ const g = new THREE.PlaneGeometry( .44, .62 ), m = new THREE.Mesh( g, mat( { map: edictTexture(), roughness: .9, side: THREE.DoubleSide }, .22 ) ); m.position.set( - 1.12, 1.6, FZF + .06 ); m.rotation.z = .02; F.add( m ) }

	// --- lampião a gás de ferro fundido, à esquerda: coluna torneada, braço, lanterna de vidro acesa e brilho
	const lamp = new THREE.Group(); lamp.name = 'lampiao-gas'; room.add( lamp )
	{ const L = mk(), prof = [ [ 0, 0 ], [ .15, 0 ], [ .15, .06 ], [ .11, .12 ], [ .085, .28 ], [ .06, .36 ], [ .05, .5 ], [ .045, 2.6 ], [ .07, 2.68 ], [ .05, 2.74 ], [ .05, 2.8 ], [ 0, 2.8 ] ].map( p => new THREE.Vector2( p[ 0 ], p[ 1 ] ) )
		L.iron.push( withColor( new THREE.LatheGeometry( prof, 16 ), '#1e2224' ) )
		L.iron.push( withColor( new THREE.CylinderGeometry( .13, .13, .02, 16 ).translate( 0, .72, 0 ), '#1e2224' ), withColor( new THREE.CylinderGeometry( .07, .07, .1, 12 ).translate( 0, .88, 0 ), '#1e2224' ) )
		// lanterna: 4 hastes, vidro troncocônico aceso, tampa e cata-vento
		const LY = 3.02; L.glow.push( withColor( new THREE.CylinderGeometry( .17, .115, .4, 4, 1 ).rotateY( Math.PI / 4 ).translate( 0, LY, 0 ), '#ffdf9c' ) )
		for ( const [ sx, sz ] of [ [ 1, 1 ], [ - 1, 1 ], [ 1, - 1 ], [ - 1, - 1 ] ] ) L.iron.push( withColor( xf( new THREE.BoxGeometry( .02, .42, .02 ), [ sx * .1, LY, sz * .1 ], [ sz * .09, 0, - sx * .09 ] ), '#1e2224' ) )
		L.iron.push( withColor( new THREE.CylinderGeometry( .02, .23, .18, 4 ).rotateY( Math.PI / 4 ).translate( 0, LY + .3, 0 ), '#1e2224' ), withColor( new THREE.BoxGeometry( .28, .03, .28 ).translate( 0, LY + .2, 0 ), '#1e2224' ), withColor( new THREE.BoxGeometry( .24, .03, .24 ).translate( 0, LY - .21, 0 ), '#1e2224' ), withColor( new THREE.SphereGeometry( .03, 8, 6 ).translate( 0, LY + .42, 0 ), '#1e2224' ) )
		// braço de escada (travessa) onde o acendedor apoiava a escada
		L.iron.push( box( .5, .025, .025, [ .0, 2.45, 0 ], '#1e2224' ) )
		flush( L, lamp ) }
	{ const c = document.createElement( 'canvas' ); c.width = c.height = 128; const x = c.getContext( '2d' ), g = x.createRadialGradient( 64, 64, 2, 64, 64, 64 ); g.addColorStop( 0, 'rgba(255,214,140,.9)' ); g.addColorStop( .12, 'rgba(255,196,110,.42)' ); g.addColorStop( .4, 'rgba(255,180,95,.1)' ); g.addColorStop( 1, 'rgba(255,170,80,0)' ); x.fillStyle = g; x.fillRect( 0, 0, 128, 128 )
		const t = new THREE.CanvasTexture( c ); t.colorSpace = THREE.SRGBColorSpace
		const sm = new THREE.SpriteNodeMaterial( { map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } ); sm.fog = false
		const s = new THREE.Sprite( sm ); s.scale.set( 1.3, 1.3, 1 ); s.position.set( 0, 3.02, 0 ); lamp.add( s ) }
	lamp.position.set( - 2.2, .02, - .5 ); reg( 'lampiao', 'Lampião a gás', lamp )
	// --- banco de madeira e ferro, encostado na fachada: onde o Luiz Gama se senta para ler o jornal (frente = +Z)
	const seatHeight = .46 + .035 / 2; const bench = new THREE.Group(); bench.name = 'banco'; room.add( bench )
	{ const L = mk(), BW = 1.7, SH = .46, SD = .46, WD = '#6b4a30', IR = '#1b1b1e'
		for ( let i = 0; i < 4; i ++ ) L.wood.push( box( BW, .035, .1, [ 0, SH, - SD / 2 + .07 + i * .12 ], WD ) ) // assento em ripas
		for ( let j = 0; j < 3; j ++ ) L.wood.push( withColor( xf( new THREE.BoxGeometry( BW, .11, .03 ), [ 0, SH + .2 + j * .15, - SD / 2 - .04 - j * .035 ], [ - .2, 0, 0 ] ), WD ) ) // encosto inclinado
		for ( const s of [ - 1, 1 ] ) { const x = s * ( BW / 2 - .07 )
			L.iron.push( box( .045, SH, .045, [ x, SH / 2, SD / 2 - .05 ], IR ), box( .045, SH, .045, [ x, SH / 2, - SD / 2 + .05 ], IR ), box( .045, .045, SD + .06, [ x, .66, 0 ], IR ), box( .045, .045, SD, [ x, .12, 0 ], IR ), withColor( xf( new THREE.BoxGeometry( .045, .62, .045 ), [ x, SH + .28, - SD / 2 - .06 ], [ - .2, 0, 0 ] ), IR ), box( .045, .2, .045, [ x, .56, SD / 2 - .05 ], IR ) ) }
		flush( L, bench ) }
	bench.position.set( 1.25, .02, - 1.9 ); reg( 'banco', 'Banco', bench )

	// --- objetos (Poly Haven CC0) + autos/papéis procedurais
	const items = [
	]
	const mcache = new Map()
	const fix = src => { if ( mcache.has( src ) ) return mcache.get( src ); const m = new THREE.MeshStandardNodeMaterial( { color: src.color, map: src.map, normalMap: src.normalMap, normalScale: new THREE.Vector2( .6, .6 ), roughness: src.roughnessMap ? 1 : Math.max( .45, src.roughness ?? .7 ), roughnessMap: src.roughnessMap, metalness: src.metalness ?? 0, metalnessMap: src.metalnessMap, aoMap: src.aoMap, alphaMap: src.alphaMap, transparent: src.transparent, alphaTest: src.alphaTest, side: src.side, emissive: src.emissive, emissiveMap: src.emissiveMap } )
		if ( m.map ) m.emissiveNode = texture( m.map ).rgb.mul( warm ).mul( .09 ).mul( galleryBrightness ); mcache.set( src, m ); return m }
	const placed = {}
	for ( const it of items ) {
		const src = await loadModel( it.id ); if ( ! src ) continue
		const obj = src.clone( true ); if ( it.only ) for ( const c of [ ...obj.children ] ) if ( ! c.name.includes( it.only ) ) obj.remove( c )
		obj.traverse( n => { if ( n.isMesh ) { n.material = fix( n.material ); n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false } } )
		obj.updateMatrixWorld( true ); const bb = new THREE.Box3().setFromObject( obj ), size = bb.getSize( new THREE.Vector3() ), ctr = bb.getCenter( new THREE.Vector3() )
		const s = it.h / size.y, holder = new THREE.Group()
		obj.position.set( - ctr.x, - bb.min.y, - ctr.z ); holder.add( obj ); holder.scale.setScalar( s ); holder.position.set( ...it.pos ); holder.rotation.y = it.rotY; room.add( holder )
		reg( it.key, it.label, holder ); placed[ it.key ] = { size: size.toArray().map( v => +( v * s ).toFixed( 3 ) ), pos: it.pos }
	}

	// --- posições: painel de ajuste (mesma interface dos outros sets)
	const LAYOUT_DEFAULT = {}
	for ( const k of Object.keys( LAYOUT_DEFAULT ) ) if ( objs[ k ] ) objs[ k ].def = { ...objs[ k ].def, ...LAYOUT_DEFAULT[ k ] }
	const LKEY = 'legado.layout.luizgama.v3', saved = ( () => { try { return JSON.parse( localStorage.getItem( LKEY ) ) || {} } catch { return {} } } )()
	const marker = new THREE.Mesh( new THREE.RingGeometry( .42, .47, 48 ).rotateX( - Math.PI / 2 ), new THREE.MeshBasicNodeMaterial( { color: '#ffd27a', transparent: true, opacity: .9, depthTest: false } ) ); marker.renderOrder = 20; marker.visible = false; room.add( marker )
	const positionSpec = [ [ 'x', 'Ao longo do corredor', - 2.5, 2.5, .01, 'm' ], [ 'y', 'Altura', - .5, 3, .01, 'm' ], [ 'z', 'Frente ↔ fundo', - 2.3, 1.3, .01, 'm' ], [ 'rot', 'Giro', - 180, 180, 1, '°' ] ]
	const controls = spec => Object.fromEntries( spec.map( ( [ key, label, min, max, step, unit ] ) => [ key, { label, min, max, step, unit } ] ) )
	const fogControls = controls( fogSpec ), positionControls = controls( positionSpec )
	objs.fog = { label: 'Névoa lateral', def: fogDefaults }
	const order = [ ...[ 'lampiao', 'banco' ].filter( k => objs[ k ] ), 'fog' ]
	let current = order[ 0 ], markerOn = false
	const apply = k => { const o = objs[ k ]; if ( ! o ) return; const v = o.val; if ( o.apply ) { o.apply( v ); return }
		if ( k === 'fog' ) {
			fogY.value = v.y; fogZ.value = v.z; fogBase.value = v.base
			for ( const { mesh, offset } of fogLayers ) { mesh.visible = v.x > 0; mesh.scale.x = 1 - offset * v.x / W }
			return
		}
		o.grp.position.set( v.x, v.y, v.z ); o.grp.rotation.y = o.base + v.rot * Math.PI / 180; if ( k === current ) marker.position.set( v.x, v.y + .05, v.z ) }
	for ( const k of order ) { const o = objs[ k ]; o.val = Object.fromEntries( Object.entries( o.def ).map( ( [ key, value ] ) => [ key, saved[ k ]?.[ key ] ?? value ] ) ); apply( k ) }
	const desk = {
		meta: { title: 'Cenário · ajustes', spec: [ ...positionSpec, fogSpec.find( ( [ key ] ) => key === 'base' ) ], override: k => objs[ k ].controls ?? ( k === 'fog' ? fogControls : positionControls ), savedMessage: 'Ajustes do cenário salvos neste navegador' },
		keys: () => order, label: k => objs[ k ].label, get: k => ( { ...objs[ k ].val } ),
		set( k, prop, v ) { objs[ k ].val[ prop ] = Number( v ); apply( k ) },
		select( k ) { current = k; apply( k ); marker.visible = markerOn && !! objs[ current ]?.grp }, marker( on ) { markerOn = !! on; marker.visible = markerOn && !! objs[ current ]?.grp },
		save() { try { localStorage.setItem( LKEY, JSON.stringify( desk.all() ) ); return true } catch { return false } },
		reset( k ) { for ( const kk of k ? [ k ] : order ) { objs[ kk ].val = { ...objs[ kk ].def }; apply( kk ) } if ( ! k ) try { localStorage.removeItem( LKEY ) } catch { } },
		all() { const out = {}; for ( const k of order ) out[ k ] = { ...objs[ k ].val }; return out },
	}
	const addReadingControl = ( key, label, spec, def, applyValue ) => {
		const ranges = controls( spec )
		const val = Object.fromEntries( spec.map( ( [ prop, , min, max ] ) => {
			const value = saved[ key ]?.[ prop ]
			return [ prop, Number.isFinite( value ) ? THREE.MathUtils.clamp( value, min, max ) : def[ prop ] ]
		} ) )
		objs[ key ] = { label, def, val, controls: ranges, apply: applyValue }
		order.push( key )
		for ( const field of spec ) if ( ! desk.meta.spec.some( ( [ prop ] ) => prop === field[ 0 ] ) ) desk.meta.spec.push( field )
		apply( key )
	}
	// limite de caminhada: a calçada termina na fachada (nicho a 6,25 do eixo do corredor)
	const walkMaxX = () => 6.25 - FZF - .35

	// luz: lampião quente (principal) + luar frio de trás e preenchimento suave pela frente
	const lampLight = new THREE.SpotLight( '#ffc983', 16, 9, 1.15, .9, 1.4 ); lampLight.position.set( - 2.85, 3.0, - .3 ); lampLight.target.position.set( .2, .5, .35 ); room.add( lampLight, lampLight.target )
	const sun = new THREE.SpotLight( '#a9b9ff', 5, 10, 1.0, .9, 1.4 ); sun.position.set( .6, 4.3, FZF + .2 ); sun.target.position.set( .1, 1.0, .1 ); room.add( sun, sun.target )
	const fill = new THREE.SpotLight( '#ffe3c4', 7, 10, .85, .85, 1.4 ); fill.position.set( - 1.4, 4.2, ZF + .9 ); fill.target.position.set( .2, .9, .2 ); room.add( fill, fill.target )
	return { room, placed, sun, desk, walkMaxX, lamp, bench, seatHeight, addReadingControl }
}
