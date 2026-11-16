import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texture, vec2, vec3, vec4, float, mix, smoothstep, step, fract, min, vertexColor, positionLocal, positionWorld, cameraPosition, modelWorldMatrixInverse, select } from 'three/tsl';
import { ROOM, TAU, canvasTex, withColor, xf, tube, arcPts, wallPanel, box, texLoader, texCache } from './PeriodRoom.js';

// ---------------------------------------------------------------------------------------------
// Adhemar Ferreira da Silva — pista de salto triplo (ouro em Helsinque 1952 e Melbourne 1956).
// Mesma atmosfera do Aleijadinho (azul "sem fim", bruma, brilho controlado), mas o chão é uma PISTA AZUL de borracha
// com raias brancas, tábua de impulsão e a caixa de areia. A corrida é ao longo do eixo X do nicho (esquerda → direita);
// o salto cai na areia à direita. Chão e fundo usam a MESMA função de cor (pista/areia), então a emenda some na bruma.
// Mesmo referencial do PeriodRoom (ROOM): origem no centro do nicho, +Z = corredor.
// ---------------------------------------------------------------------------------------------

const rndFn = seed => { let s = seed; return () => ( s = ( Math.imul( s, 1664525 ) + 1013904223 ) >>> 0 ) / 4294967296 }

// Medidas da pista (todas em metros, coordenadas locais do nicho)
export const TRACK = { laneW: 1.22, laneZ0: - .26, board: .62, pit: 1.2, pitZ0: - .42, pitZ1: 1.12, startX: - 2.35 }

function sandTexture() {
	return canvasTex( 512, 512, ( c, w, h ) => {
		const r = rndFn( 77 ); c.fillStyle = '#d9bd8a'; c.fillRect( 0, 0, w, h )
		for ( let i = 0; i < 9000; i ++ ) { const l = r(); c.fillStyle = l < .5 ? `rgba(120,86,40,${.05 + r() * .12})` : `rgba(255,240,205,${.05 + r() * .14})`; c.fillRect( r() * w, r() * h, 1 + r() * 2.2, 1 + r() * 1.4 ) }
		c.strokeStyle = 'rgba(120,86,40,.10)'; c.lineWidth = 3 // ondulações do ancinho
		for ( let y = 6; y < h; y += 14 ) { c.beginPath(); c.moveTo( 0, y ); for ( let x = 0; x <= w; x += 32 ) c.lineTo( x, y + Math.sin( x * .05 + y ) * 2 ); c.stroke() }
	}, { repeat: true } )
}
function rubberTexture() { // grão fino da borracha da pista (só luminosidade; a cor vem do shader)
	return canvasTex( 512, 512, ( c, w, h ) => {
		const r = rndFn( 5 ); c.fillStyle = '#9a9a9a'; c.fillRect( 0, 0, w, h )
		for ( let i = 0; i < 26000; i ++ ) { const v = 110 + r() * 110 | 0; c.fillStyle = `rgba(${v},${v},${v},${.25 + r() * .3})`; c.beginPath(); c.arc( r() * w, r() * h, .6 + r() * 1.1, 0, TAU ); c.fill() }
	}, { repeat: true, srgb: false } )
}
function hoardingTexture( text, sub ) { // painel de publicidade/placar do estádio
	return canvasTex( 1024, 128, ( c, w, h ) => {
		c.fillStyle = '#f3f6fb'; c.fillRect( 0, 0, w, h ); c.fillStyle = '#1b4fa8'; c.fillRect( 0, 0, w, 14 ); c.fillRect( 0, h - 14, w, 14 )
		c.fillStyle = '#10346f'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 54px "Trebuchet MS", Arial'; c.fillText( text, w / 2, h / 2 - 8 )
		c.fillStyle = '#e0a100'; c.font = '600 26px "Trebuchet MS", Arial'; c.fillText( sub, w / 2, h / 2 + 34 )
	} )
}

export async function buildAdhemarRoom( group, { galleryBrightness } ) {
	const { halfW: W, spring: SP, front: ZF } = ROOM, ZB = -.98, ZBS = -40, D = ZF - ZB, T = TRACK
	const room = new THREE.Group(); room.name = 'room-adhemar'; group.add( room )
	const add = ( g, m, { cast = false, recv = true, parent = null } = {} ) => { const mesh = new THREE.Mesh( g, m ); mesh.castShadow = cast; mesh.receiveShadow = recv; ( parent || room ).add( mesh ); return mesh }
	const warm = vec3( 1, .9, .75 )

	// --- função de cor do chão (pista azul + raias brancas + tábua + caixa de areia), usada no piso real E no fundo infinito
	const rub = rubberTexture(), sand = sandTexture(); rub.anisotropy = sand.anisotropy = 8
	const hv = c => vec3( c.r, c.g, c.b ), HAZE = hv( new THREE.Color( '#a8cdf3' ) ), MID = hv( new THREE.Color( '#5a9ce8' ) ), TOPC = hv( new THREE.Color( '#2c74d2' ) )
	const BLUE = hv( new THREE.Color( '#1f5fd0' ) ), WHITE = hv( new THREE.Color( '#f4f6fa' ) ), CURB = hv( new THREE.Color( '#e6e8ec' ) )
	const trackAt = xz => {
		const x = xz.x, z = xz.y
		const grain = texture( rub, xz.div( .55 ) ).r.mul( .5 ).add( .75 ) // .75–1.25
		const lane = z.sub( T.laneZ0 ).div( T.laneW ), d = min( fract( lane ), float( 1 ).sub( fract( lane ) ) ).mul( T.laneW ) // distância até a linha da raia (m)
		const line = float( 1 ).sub( smoothstep( .022, .036, d ) ) // linhas brancas de 5 cm
		const inLane0 = step( 0, lane ).mul( step( lane, 1 ) ) // raia da corrida (a do salto)
		const board = smoothstep( T.board - .004, T.board + .004, x ).mul( float( 1 ).sub( smoothstep( T.board + .2 - .004, T.board + .2 + .004, x ) ) ).mul( inLane0 ) // tábua de impulsão (20 cm)
		const mark = smoothstep( .018, .03, x.sub( T.startX ).abs() ).oneMinus().mul( inLane0 ) // marca de partida
		let col = mix( BLUE.mul( grain ), WHITE, line.max( board ).max( mark ).mul( .96 ) )
		const inPit = step( T.pit, x ).mul( step( T.pitZ0, z ) ).mul( step( z, T.pitZ1 ) )
		const curb = step( T.pit - .09, x ).mul( step( x, T.pit ) ).mul( step( T.pitZ0 - .09, z ) ).mul( step( z, T.pitZ1 + .09 ) ) // meio-fio de concreto antes da areia
		const curbS = step( T.pitZ0 - .09, z ).mul( step( z, T.pitZ0 ) ).add( step( T.pitZ1, z ).mul( step( z, T.pitZ1 + .09 ) ) ).mul( step( T.pit - .09, x ) ) // laterais
		const sandC = texture( sand, xz.div( 1.4 ) ).rgb.mul( 1.12 )
		col = mix( col, CURB.mul( grain ), curb.max( curbS ).mul( .98 ) )
		return mix( col, sandC, inPit )
	}
	const camL = modelWorldMatrixInverse.mul( vec4( cameraPosition, 1 ) ).xyz
	const hazeGround = xz => mix( trackAt( xz ), HAZE, smoothstep( 3.5, 12.0, xz.sub( camL.xz ).length() ) )

	// --- CÉU + CHÃO INFINITOS (idêntico ao do Aleijadinho, trocando só o chão)
	{ const FLOORY = .02, rayL = positionLocal.sub( camL ), ry = rayL.y.min( - .0005 )
		const t = float( FLOORY ).sub( camL.y ).div( ry ), hit = camL.add( rayL.mul( t ) )
		const ground = hazeGround( hit.xz )
		const dy = positionWorld.sub( cameraPosition ).normalize().y.max( 0 )
		const skyC = mix( mix( HAZE, MID, smoothstep( 0, .2, dy ) ), TOPC, smoothstep( .15, .8, dy ) )
		const sky = new THREE.MeshBasicNodeMaterial( { side: THREE.DoubleSide } ); sky.fog = false
		sky.colorNode = select( rayL.y.lessThan( - .0005 ), ground, skyC ).mul( .96 )
		add( tube( [ [ - W, 0 ], [ - W, SP ] ], ZBS, ZF, 1 ), sky, { recv: false } ); add( tube( [ [ W, 0 ], [ W, SP ] ], ZBS, ZF, 1 ), sky, { recv: false } )
		add( tube( arcPts( 0, SP, W, Math.PI, 0, 40 ).reverse(), ZBS, ZF, 1 ), sky, { recv: false } )
		add( wallPanel( [ [ - W, 0 ], [ W, 0 ], [ W, SP ], [ - W, SP ] ], ZBS, 1 ), sky, { recv: false } )
		add( wallPanel( [ [ W, SP ], ...arcPts( 0, SP, W, 0, Math.PI, 40 ), [ - W, SP ] ], ZBS, 1 ), sky, { recv: false } )
		// piso real (recebe luz e sombra do corredor): nos últimos 1,2 m antes das bordas vira o piso "sem luz" do fundo
		const fadeToGround = m => { const p = positionLocal, e = float( W ).sub( p.x.abs() ).min( p.z.sub( ZB ) ).div( 1.2 ), f = float( 1 ).sub( smoothstep( 0, 1, e ) ), tgt = hazeGround( p.xz ); const orig = m.setupOutput.bind( m ); m.setupOutput = ( b, lit ) => orig( b, vec4( mix( lit.rgb, tgt, f ), lit.a ) ); return m }
		const floorG = new THREE.PlaneGeometry( W * 2, D ); floorG.rotateX( - Math.PI / 2 ); floorG.translate( 0, FLOORY, ( ZF + ZB ) / 2 )
		const fm = new THREE.MeshStandardNodeMaterial( { roughness: .78, color: '#ffffff' } ); fm.colorNode = trackAt( positionLocal.xz ); fm.emissiveNode = trackAt( positionLocal.xz ).mul( warm ).mul( .14 ).mul( galleryBrightness )
		add( floorG, fadeToGround( fm ) )
		const g = new THREE.PlaneGeometry( W * 2, ZB - ZBS ); g.rotateX( - Math.PI / 2 ); g.translate( 0, FLOORY, ( ZB + ZBS ) / 2 ); const m = new THREE.MeshBasicNodeMaterial(); m.fog = false; m.colorNode = hazeGround( positionLocal.xz ).mul( .96 ); add( g, m, { recv: false } ) }

	// --- caixa de areia com relevo real (montinho levemente afundado + meio-fio) para a sombra e os passos poderem "marcar"
	const mergeInto = ( arr, material, opts = {} ) => { if ( arr.length ) add( mergeGeometries( arr.map( g => g.index ? g.toNonIndexed() : g ), false ), material, opts ) }
	const concrete = new THREE.MeshStandardNodeMaterial( { vertexColors: true, roughness: .9 } ); concrete.emissiveNode = vertexColor().mul( .1 ).mul( galleryBrightness )
	{ const c = [ '#e6e8ec', '#dcdfe5' ], pw = T.pitZ1 - T.pitZ0, cz = ( T.pitZ0 + T.pitZ1 ) / 2, h = .07
		mergeInto( [ box( .09, h, pw + .18, [ T.pit - .045, h / 2, cz ], c[ 0 ] ), box( 3.4, h, .09, [ T.pit + 1.7, h / 2, T.pitZ0 - .045 ], c[ 1 ] ), box( 3.4, h, .09, [ T.pit + 1.7, h / 2, T.pitZ1 + .045 ], c[ 1 ] ) ], concrete, { cast: true } ) }

	// --- painéis do estádio ao fundo (limite de caminhada), na mesma bruma azul do chão
	const hoard = new THREE.Group(); hoard.position.set( 0, 0, - 4.0 ); room.add( hoard )
	{ const hm = [ [ 'ADHEMAR DA SILVA', 'SALTO TRIPLO · OURO 1952 · 1956' ], [ 'BRASIL', 'HELSINQUE · MELBOURNE' ] ].map( ( [ a, b ], i ) => { const m = new THREE.MeshStandardNodeMaterial( { map: hoardingTexture( a, b ), roughness: .6 } ); m.emissiveNode = texture( m.map ).rgb.mul( .5 ).mul( galleryBrightness ); const haze = smoothstep( 7.0, 20.0, positionLocal.xz.sub( camL.xz ).length() ).mul( .6 ), o = m.setupOutput.bind( m ); m.setupOutput = ( bb, lit ) => o( bb, vec4( mix( lit.rgb, HAZE, haze ), lit.a ) ); return m } )
		for ( let i = 0; i < 5; i ++ ) { const mesh = new THREE.Mesh( new THREE.BoxGeometry( 2.2, .5, .06 ), hm[ i % 2 ] ); mesh.position.set( - 4.4 + i * 2.2, .52, 0 ); mesh.castShadow = true; hoard.add( mesh ) }
		const base = new THREE.MeshStandardNodeMaterial( { color: '#1b4fa8', roughness: .7 } ); const bm = new THREE.Mesh( new THREE.BoxGeometry( 11.2, .27, .12 ), base ); bm.position.set( 0, .135, 0 ); hoard.add( bm )
		for ( let i = - 2; i <= 2; i ++ ) { const post = new THREE.Mesh( new THREE.BoxGeometry( .06, 1.0, .06 ), base ); post.position.set( i * 2.2 + .0, .5, .0 ); hoard.add( post ) } }

	// --- bandeirinha de medição e rastelo ao lado da caixa de areia
	const prop = []
	prop.push( withColor( xf( new THREE.CylinderGeometry( .012, .012, 1.2, 8 ), [ T.pit + 1.0, .6, T.pitZ1 + .35 ] ), '#e8eaee' ), box( .22, .14, .01, [ T.pit + 1.11, 1.1, T.pitZ1 + .35 ], '#ffcf33' ) )
	prop.push( withColor( xf( new THREE.CylinderGeometry( .011, .011, 1.4, 8 ), [ T.pit + 2.2, .7, T.pitZ0 - .4 ], [ 0, 0, .28 ] ), '#8a6d4b' ), box( .4, .03, .05, [ T.pit + 2.05, .1, T.pitZ0 - .4 ], '#5a5f66' ) ) // rastelo encostado
	mergeInto( prop, concrete, { cast: true } )

	// --- registro de objetos posicionáveis (painel "Cenário · posições")
	const objs = {}
	const reg = ( key, label, grp ) => { objs[ key ] = { label, grp, base: grp.rotation.y, def: { x: grp.position.x, y: grp.position.y, z: grp.position.z, rot: 0 } } }
	reg( 'hoarding', 'Painéis do estádio (limite de caminhada)', hoard )
	const runner = new THREE.Group(); runner.name = 'adhemar-onde-corre'; runner.position.set( T.startX, .02, ( T.laneZ0 + T.laneW / 2 ) ); room.add( runner ); reg( 'adhemar', 'Adhemar (ponto de partida da corrida)', runner )
	const LKEY = 'legado.layout.adhemar.v1', saved = ( () => { try { return JSON.parse( localStorage.getItem( LKEY ) ) || {} } catch { return {} } } )()
	const marker = new THREE.Mesh( new THREE.RingGeometry( .32, .37, 48 ).rotateX( - Math.PI / 2 ), new THREE.MeshBasicNodeMaterial( { color: '#ffd27a', transparent: true, opacity: .9, depthTest: false } ) ); marker.renderOrder = 20; marker.visible = false; room.add( marker )
	const order = [ 'adhemar', 'hoarding' ]; let current = order[ 0 ]
	const apply = k => { const o = objs[ k ]; if ( ! o ) return; const v = o.val; o.grp.position.set( v.x, v.y, v.z ); o.grp.rotation.y = o.base + v.rot * Math.PI / 180; if ( k === current ) marker.position.set( v.x, v.y + .05, v.z ) }
	for ( const k of order ) { objs[ k ].val = { ...objs[ k ].def, ...( saved[ k ] || {} ) }; apply( k ) }
	const desk = {
		meta: { title: 'Cenário · posições', spec: [ [ 'x', 'Ao longo da pista', - 2.5, 2.5, .01, 'm' ], [ 'y', 'Altura', - .5, 3, .01, 'm' ], [ 'z', 'Frente ↔ fundo', - 8, 1.3, .01, 'm' ], [ 'rot', 'Giro', - 180, 180, 1, '°' ] ] },
		keys: () => order, label: k => objs[ k ].label, get: k => ( { ...objs[ k ].val } ),
		set( k, prop, v ) { objs[ k ].val[ prop ] = Number( v ); apply( k ) },
		select( k ) { current = k; apply( k ) }, marker( on ) { marker.visible = !! on },
		save() { try { localStorage.setItem( LKEY, JSON.stringify( desk.all() ) ); return true } catch { return false } },
		reset( k ) { for ( const kk of k ? [ k ] : order ) { objs[ kk ].val = { ...objs[ kk ].def }; apply( kk ) } if ( ! k ) try { localStorage.removeItem( LKEY ) } catch { } },
		all() { const out = {}; for ( const k of order ) out[ k ] = { ...objs[ k ].val }; return out },
	}
	const walkMaxX = () => 6.25 - objs.hoarding.val.z - .3

	// luz: sol frio do fundo (contraluz, mais alto e aberto que o do Aleijadinho: é uma pista ao ar livre) e preenchimento quente da frente
	const sun = new THREE.SpotLight( '#cfe0ff', 6, 12, 1.05, .9, 1.4 ); sun.position.set( - .4, 5.2, ZB + .2 ); sun.target.position.set( 0, .5, .2 ); room.add( sun, sun.target )
	const fill = new THREE.SpotLight( '#fff0d8', 9, 11, .95, .85, 1.4 ); fill.position.set( - 1.6, 4.4, ZF + .9 ); fill.target.position.set( 0, .6, .1 ); room.add( fill, fill.target )
	const hoardLight = new THREE.SpotLight( '#fff0d8', 12, 14, .7, .8, 1.4 ); hoardLight.position.set( - 1.6, 4.0, hoard.position.z + 3.2 ); hoardLight.target.position.set( 0, .6, hoard.position.z ); room.add( hoardLight, hoardLight.target )
	return { room, sun, desk, walkMaxX, runner, track: T }
}
