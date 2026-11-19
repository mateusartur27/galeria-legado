import * as THREE from 'three/webgpu';
import { texture, vec2, vec3, vec4, float, mix, smoothstep, step, fract, min, positionLocal, positionWorld, cameraPosition, modelWorldMatrixInverse, select, uniform } from 'three/tsl';
import { ROOM, TAU, canvasTex, tube, arcPts, wallPanel, texLoader } from './PeriodRoom.js';

// ---------------------------------------------------------------------------------------------
// Adhemar Ferreira da Silva — pista de salto triplo (ouro em Helsinque 1952 e Melbourne 1956).
// Mesma atmosfera do Aleijadinho (azul "sem fim", bruma, brilho controlado), mas o chão é uma PISTA VERMELHA de borracha
// com raias brancas, tábua de impulsão e a caixa de areia. A corrida é ao longo do eixo X do nicho (esquerda → direita);
// o salto cai na areia à direita. Chão e fundo usam a MESMA função de cor (pista/areia), então a emenda some na bruma.
// Mesmo referencial do PeriodRoom (ROOM): origem no centro do nicho, +Z = corredor.
// ---------------------------------------------------------------------------------------------

const rndFn = seed => { let s = seed; return () => ( s = ( Math.imul( s, 1664525 ) + 1013904223 ) >>> 0 ) / 4294967296 }

// Medidas da pista (todas em metros, coordenadas locais do nicho)
// A pista ROLA (o Adhemar fica parado): o padrão repete a cada `period` m; `lo` é o início do período (coordenada de pista).
export const TRACK = { laneW: 1.22, laneZ0: - .76, board: - 1.35, pit: 3.6, pitEnd: 10.6, pitZ0: - 1.525, pitZ1: 1.225, period: 19.2, lo: - 5.5 }

function sandTexture() { // areia limpa: tom uniforme, grão fino e marcas de ancinho suaves
	return canvasTex( 1024, 1024, ( c, w, h ) => {
		const r = rndFn( 77 ); c.fillStyle = '#d6b27a'; c.fillRect( 0, 0, w, h )
		for ( let i = 0; i < 40; i ++ ) { const x = r() * w, y = r() * h, s = 80 + r() * 180, g = c.createRadialGradient( x, y, 0, x, y, s ); g.addColorStop( 0, r() < .5 ? 'rgba(190,150,96,.07)' : 'rgba(255,240,208,.08)' ); g.addColorStop( 1, 'rgba(0,0,0,0)' ); c.fillStyle = g; c.fillRect( x - s, y - s, s * 2, s * 2 ) }
		for ( let i = 0; i < 30000; i ++ ) { c.fillStyle = r() < .5 ? `rgba(170,130,80,${.04 + r() * .07})` : `rgba(255,246,222,${.05 + r() * .1})`; const s = .8 + r() * 1.6; c.fillRect( r() * w, r() * h, s, s ) }
		c.lineWidth = 3
		for ( let y = 8; y < h; y += 22 ) { c.strokeStyle = 'rgba(170,130,80,.07)'; c.beginPath(); c.moveTo( 0, y ); for ( let x = 0; x <= w; x += 32 ) c.lineTo( x, y + Math.sin( x * .04 + y ) * 2 ); c.stroke() }
	}, { repeat: true } )
}function rubberTexture() { // borracha da pista: grão fino + pontinhos (granulado EPDM) + variação suave; só luminosidade
	return canvasTex( 1024, 1024, ( c, w, h ) => {
		const r = rndFn( 5 ); c.fillStyle = '#9a9a9a'; c.fillRect( 0, 0, w, h )
		for ( let i = 0; i < 70; i ++ ) { const x = r() * w, y = r() * h, s = 60 + r() * 160, g = c.createRadialGradient( x, y, 0, x, y, s ); g.addColorStop( 0, r() < .5 ? 'rgba(60,60,60,.12)' : 'rgba(230,230,230,.12)' ); g.addColorStop( 1, 'rgba(0,0,0,0)' ); c.fillStyle = g; c.fillRect( x - s, y - s, s * 2, s * 2 ) }
		for ( let i = 0; i < 80000; i ++ ) { const v = 100 + r() * 130 | 0; c.fillStyle = `rgba(${v},${v},${v},${.25 + r() * .35})`; c.beginPath(); c.arc( r() * w, r() * h, .5 + r() * 1.3, 0, TAU ); c.fill() }
		for ( let i = 0; i < 2500; i ++ ) { c.fillStyle = r() < .5 ? 'rgba(40,40,40,.55)' : 'rgba(255,255,255,.5)'; c.fillRect( r() * w, r() * h, 1.5, 1.5 ) }
	}, { repeat: true, srgb: false } )
}

export async function buildAdhemarRoom( group, { galleryBrightness } ) {
	const T = TRACK
	// --- função de cor do chão (pista azul + raias brancas + tábua + caixa de areia), usada no piso real E no fundo infinito
	const rub = rubberTexture(), sand = sandTexture(); rub.anisotropy = sand.anisotropy = 8
	const hv = c => vec3( c.r, c.g, c.b )
	const RED = hv( new THREE.Color( '#c2402c' ) ), WHITE = hv( new THREE.Color( '#f4f6fa' ) )
	const scroll = uniform( 0 ) // deslocamento da pista (m): coordenada de pista = x do mundo + scroll
	const trackAt = xz => {
		const z = xz.y, u = xz.x.add( scroll ), x = u.sub( float( T.period ).mul( u.sub( T.lo ).div( T.period ).floor() ) ) // x dentro do período
		const uv = vec2( u, z )
		const grain = texture( rub, uv.div( .8 ) ).r.mul( .5 ).add( .75 ), macro = texture( rub, uv.div( 3.2 ) ).r.mul( .3 ).add( .85 ) // grão + variação em manchas
		const lane = z.sub( T.laneZ0 ).div( T.laneW ), d = min( fract( lane ), float( 1 ).sub( fract( lane ) ) ).mul( T.laneW )
		const line = float( 1 ).sub( smoothstep( .022, .036, d ) ).mul( texture( rub, uv.div( .4 ) ).r.mul( .4 ).add( .75 ) ) // linha levemente gasta
		const inLane0 = step( 0, lane ).mul( step( lane, 1 ) )
		const board = smoothstep( T.board - .004, T.board + .004, x ).mul( float( 1 ).sub( smoothstep( T.board + .2 - .004, T.board + .2 + .004, x ) ) ).mul( inLane0 )
		const col = mix( RED.mul( grain ).mul( macro ), WHITE.mul( grain.mul( .25 ).add( .78 ) ), line.max( board ).mul( .92 ).min( 1 ) )
		// caixa de areia: e = distância (m) até a borda, positiva dentro e negativa fora
		const e = min( min( x.sub( T.pit ), float( T.pitEnd ).sub( x ) ), min( z.sub( T.pitZ0 ), float( T.pitZ1 ).sub( z ) ) )
		const inPit = step( 0, e )
		const rim = step( - .08, e ).mul( step( e, 0 ) ) // moldura de concreto de 8 cm em volta
		const edgeShade = mix( .86, 1, smoothstep( 0, .2, e ) ) // areia mais escura/"afundada" junto da borda
		const sandBase = texture( sand, uv.div( 1.6 ) ).rgb, sandMacro = texture( sand, uv.div( 4.8 ) ).rgb
		const sandC = sandBase.mul( sandMacro.mul( .12 ).add( .92 ) ).mul( edgeShade ).mul( 1.0 )
		const concrete = vec3( .93, .93, .92 ).mul( grain.mul( .2 ).add( .85 ) )
		return mix( mix( col, concrete, rim ), sandC, inPit )
	}
	const exterior = buildOutdoorNiche( group, galleryBrightness, 'adhemar', trackAt, [ '#3b86dc', '#2a6fd0', '#1a47a8' ] )
	const { room } = exterior
	// --- registro de objetos posicionáveis (painel "Cenário · posições")
	const objs = {}
	const reg = ( key, label, grp ) => { objs[ key ] = { label, grp, base: grp.rotation.y, def: { x: grp.position.x, y: grp.position.y, z: grp.position.z, rot: 0 } } }
	const runner = new THREE.Group(); runner.name = 'adhemar-onde-corre'; runner.position.set( 0, .02, ( T.laneZ0 + T.laneW / 2 ) ); room.add( runner ); reg( 'adhemar', 'Adhemar (ponto de partida da corrida)', runner )
	const LKEY = 'legado.layout.adhemar.v3', saved = ( () => { try { return JSON.parse( localStorage.getItem( LKEY ) ) || {} } catch { return {} } } )()
	const marker = new THREE.Mesh( new THREE.RingGeometry( .32, .37, 48 ).rotateX( - Math.PI / 2 ), new THREE.MeshBasicNodeMaterial( { color: '#ffd27a', transparent: true, opacity: .9, depthTest: false } ) ); marker.renderOrder = 20; marker.visible = false; room.add( marker )
	const order = [ 'adhemar' ]; let current = order[ 0 ]
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
	return { ...exterior, desk, runner, track: T, scroll }
}

export async function buildPeleRoom( group, { galleryBrightness } ) {
	const grass = await texLoader.loadAsync( '/textures/set/pele/leafy-grass.jpg' )
	grass.colorSpace = THREE.SRGBColorSpace
	grass.wrapS = grass.wrapT = THREE.RepeatWrapping
	grass.anisotropy = 8

	const scroll = uniform( 0 )
	const period = 110.4 // 69 repetições do detalhe e 16 da variação, sem emenda ao voltar a zero.
	const grassAt = xz => {
		const shifted = vec2( xz.x.add( scroll ), xz.y )
		const bladeColor = texture( grass, shifted.div( period / 69 ) ).rgb
		const variation = texture( grass, shifted.yx.div( period / 16 ) ).g
		return bladeColor.mul( vec3( .45, .87, .52 ) ).mul( variation.mul( .65 ).add( .88 ) )
	}
	return { ...buildOutdoorNiche( group, galleryBrightness, 'pele', grassAt, [ '#000000', '#000000', '#000000' ] ), scroll, period }
}

function buildOutdoorNiche( group, galleryBrightness, id, groundAt, skyColors ) {
	const { halfW: W, spring: SP, front: ZF } = ROOM, ZB = -.98, ZBS = -40, D = ZF - ZB
	const room = new THREE.Group(); room.name = `room-${id}`; group.add( room )
	const add = ( geometry, material, receiveShadow = true ) => {
		const mesh = new THREE.Mesh( geometry, material )
		mesh.receiveShadow = receiveShadow
		room.add( mesh )
	}
	const warm = vec3( 1, .9, .75 )
	const [ HAZE, MID, TOPC ] = skyColors.map( hex => {
		const color = new THREE.Color( hex )
		return vec3( color.r, color.g, color.b )
	} )
	const camL = modelWorldMatrixInverse.mul( vec4( cameraPosition, 1 ) ).xyz
	const hazeGround = xz => mix( groundAt( xz ), HAZE, smoothstep( 4.2, 10, xz.sub( camL.xz ).length() ) )

	// --- CÉU + CHÃO INFINITOS (idêntico ao do Aleijadinho, trocando só o chão)
	{ const FLOORY = .02, rayL = positionLocal.sub( camL ), ry = rayL.y.min( - .0005 )
		const t = float( FLOORY ).sub( camL.y ).div( ry ), hit = camL.add( rayL.mul( t ) )
		const ground = hazeGround( hit.xz )
		const dy = positionWorld.sub( cameraPosition ).normalize().y.max( 0 )
		const skyC = mix( mix( HAZE, MID, smoothstep( 0, .2, dy ) ), TOPC, smoothstep( .15, .8, dy ) )
		const sky = new THREE.MeshBasicNodeMaterial( { side: THREE.DoubleSide } ); sky.fog = false
		sky.colorNode = select( rayL.y.lessThan( - .0005 ), ground, skyC ).mul( .96 )
		add( tube( [ [ - W, 0 ], [ - W, SP ] ], ZBS, ZF, 1 ), sky, false ); add( tube( [ [ W, 0 ], [ W, SP ] ], ZBS, ZF, 1 ), sky, false )
		add( tube( arcPts( 0, SP, W, Math.PI, 0, 40 ).reverse(), ZBS, ZF, 1 ), sky, false )
		add( wallPanel( [ [ - W, 0 ], [ W, 0 ], [ W, SP ], [ - W, SP ] ], ZBS, 1 ), sky, false )
		add( wallPanel( [ [ W, SP ], ...arcPts( 0, SP, W, 0, Math.PI, 40 ), [ - W, SP ] ], ZBS, 1 ), sky, false )
		// piso real (recebe luz e sombra do corredor): nos últimos 1,2 m antes das bordas vira o piso "sem luz" do fundo
		const fadeToGround = m => { const p = positionLocal, e = float( W ).sub( p.x.abs() ).min( p.z.sub( ZB ) ).div( 1.2 ), f = float( 1 ).sub( smoothstep( 0, 1, e ) ), tgt = hazeGround( p.xz ); const orig = m.setupOutput.bind( m ); m.setupOutput = ( b, lit ) => orig( b, vec4( mix( lit.rgb, tgt, f ), lit.a ) ); return m }
		const floorG = new THREE.PlaneGeometry( W * 2, D ); floorG.rotateX( - Math.PI / 2 ); floorG.translate( 0, FLOORY, ( ZF + ZB ) / 2 )
		const fm = new THREE.MeshStandardNodeMaterial( { roughness: .78, color: '#ffffff' } ); fm.colorNode = groundAt( positionLocal.xz ); fm.emissiveNode = groundAt( positionLocal.xz ).mul( warm ).mul( .14 ).mul( galleryBrightness )
		add( floorG, fadeToGround( fm ) )
		const g = new THREE.PlaneGeometry( W * 2, ZB - ZBS ); g.rotateX( - Math.PI / 2 ); g.translate( 0, FLOORY, ( ZB + ZBS ) / 2 ); const m = new THREE.MeshBasicNodeMaterial(); m.fog = false; m.colorNode = hazeGround( positionLocal.xz ).mul( .96 ); add( g, m, false ) }

	// luz: sol frio do fundo (contraluz, mais alto e aberto que o do Aleijadinho: é uma pista ao ar livre) e preenchimento quente da frente
	const sun = new THREE.SpotLight( '#cfe0ff', 6, 12, 1.05, .9, 1.4 ); sun.position.set( - .4, 5.2, ZB + .2 ); sun.target.position.set( 0, .5, .2 ); room.add( sun, sun.target )
	const fill = new THREE.SpotLight( '#fff0d8', 9, 11, .95, .85, 1.4 ); fill.position.set( - 1.6, 4.4, ZF + .9 ); fill.target.position.set( 0, .6, .1 ); room.add( fill, fill.target )
	return { room, sun, walkMaxX: () => 9.9 }
}
