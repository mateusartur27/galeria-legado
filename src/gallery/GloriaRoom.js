import * as THREE from 'three/webgpu';
import { texture, vec2, vec3, vec4, float, mix, smoothstep, step, fract, sin, positionLocal, cameraPosition, modelWorldMatrixInverse, select, atan, vertexColor } from 'three/tsl';
import { ROOM, TAU, canvasTex, tube, arcPts, wallPanel, box, loadModel } from './PeriodRoom.js';
import { lampPost, palm, umbrella, beachChair, kiosk, signTexture, merge } from './GloriaProps.js';

// ---------------------------------------------------------------------------------------------
// Glória Maria — repórter de rua, ao vivo, no calçadão de Copacabana (Rio de Janeiro), tarde de céu aberto.
// Sem paredes: panorama pintado em canvas (céu, mar, Pão de Açúcar, orla) numa cúpula de 150°, e o chão calculado pelo raio do olhar:
// calçadão de ondas (pedra portuguesa, pedrinha por pedrinha, com relevo) → meio-fio de granito → areia (faixa molhada, espuma) → mar.
// Na orla: meio-fio de granito (quiosque, postes, coqueiros, guarda-sóis e cadeiras foram removidos a pedido; os construtores seguem em GloriaProps.js). Mesmo referencial do PeriodRoom.
// ---------------------------------------------------------------------------------------------

const rndFn = seed => { let s = seed; return () => ( s = ( Math.imul( s, 1664525 ) + 1013904223 ) >>> 0 ) / 4294967296 }

// panorama 2048×1024: horizonte em y = 512, cobre 150° de azimute e ±40° de altura
function panoCanvas() {
	return canvasTex( 2048, 1024, ( c, w, h ) => {
		const r = rndFn( 11 ), hz = h / 2
		let g = c.createLinearGradient( 0, 0, 0, hz ); g.addColorStop( 0, '#1d63c4' ); g.addColorStop( .55, '#4a9be0' ); g.addColorStop( 1, '#cfe9f7' ); c.fillStyle = g; c.fillRect( 0, 0, w, hz )
		g = c.createRadialGradient( w * .62, hz - 40, 10, w * .62, hz - 40, 420 ); g.addColorStop( 0, 'rgba(255,248,220,.75)' ); g.addColorStop( 1, 'rgba(255,248,220,0)' ); c.fillStyle = g; c.fillRect( 0, 0, w, hz )
		for ( let i = 0; i < 46; i ++ ) { // nuvens: aglomerados de bolhas brancas, mais achatados perto do horizonte
			const cx = r() * w, cy = 40 + r() * ( hz - 130 ), sc = 40 + r() * 90, flat = .35 + .25 * ( cy / hz ), n = 7 + ( r() * 8 | 0 )
			for ( let k = 0; k < n; k ++ ) { const x = cx + ( r() - .5 ) * sc * 3, y = cy + ( r() - .5 ) * sc * .6, rad = sc * ( .35 + r() * .5 ); const gg = c.createRadialGradient( x, y, 0, x, y, rad ); gg.addColorStop( 0, 'rgba(255,255,255,.55)' ); gg.addColorStop( 1, 'rgba(255,255,255,0)' ); c.save(); c.translate( x, y ); c.scale( 1, flat ); c.translate( - x, - y ); c.fillStyle = gg; c.beginPath(); c.arc( x, y, rad, 0, TAU ); c.fill(); c.restore() }
		}
		g = c.createLinearGradient( 0, hz, 0, h ); g.addColorStop( 0, '#9fd2e6' ); g.addColorStop( .08, '#3fa5c4' ); g.addColorStop( .5, '#1a7fa6' ); g.addColorStop( 1, '#0f6a92' ); c.fillStyle = g; c.fillRect( 0, hz, w, hz )
		for ( let i = 0; i < 2600; i ++ ) { const y = hz + 3 + Math.pow( r(), 1.7 ) * ( hz - 3 ), x = r() * w, len = 10 + r() * 40 * ( 1 + ( y - hz ) / 120 ); c.fillStyle = r() < .55 ? 'rgba(255,255,255,.16)' : 'rgba(10,60,95,.18)'; c.fillRect( x, y, len, 1 + ( y - hz ) / 160 ) }
		c.save(); c.translate( w * .62, hz ); c.scale( .28, 1 ); g = c.createRadialGradient( 0, 0, 0, 0, 0, 170 ); g.addColorStop( 0, 'rgba(255,252,235,.5)' ); g.addColorStop( 1, 'rgba(255,252,235,0)' ); c.fillStyle = g; c.fillRect( - 600, 0, 1200, 170 ); c.restore()
		const ridge = ( y0, amp, col, seed, x0 = 0, x1 = w ) => { const rr = rndFn( seed ); c.fillStyle = col; c.beginPath(); c.moveTo( x0, hz ); let y = y0; for ( let x = x0; x <= x1; x += 24 ) { y = y0 - ( Math.sin( x * .006 + seed ) * .5 + .5 ) * amp - rr() * amp * .15; c.lineTo( x, y ) } c.lineTo( x1, hz ); c.closePath(); c.fill() }
		ridge( hz - 8, 30, 'rgba(120,150,190,.55)', 3 ); ridge( hz - 4, 22, 'rgba(95,125,165,.7)', 8, 0, w * .35 ); ridge( hz - 4, 26, 'rgba(95,125,165,.7)', 5, w * .78, w )
		{ const px = w * .68, base = hz + 2 // Pão de Açúcar e o morro da Urca
			c.fillStyle = '#6d7f98'; c.beginPath(); c.moveTo( px - 150, base ); c.bezierCurveTo( px - 120, base - 70, px - 60, base - 96, px - 40, base - 112 ); c.bezierCurveTo( px - 10, base - 150, px + 30, base - 136, px + 44, base - 90 ); c.bezierCurveTo( px + 60, base - 48, px + 100, base - 30, px + 150, base ); c.closePath(); c.fill()
			c.fillStyle = '#4f6a58'; c.beginPath(); c.moveTo( px + 40, base ); c.bezierCurveTo( px + 80, base - 52, px + 150, base - 60, px + 210, base - 24 ); c.lineTo( px + 250, base ); c.closePath(); c.fill()
			g = c.createLinearGradient( 0, base - 150, 0, base ); g.addColorStop( 0, 'rgba(255,255,255,0)' ); g.addColorStop( 1, 'rgba(210,230,245,.5)' ); c.fillStyle = g; c.fillRect( px - 160, base - 150, 420, 150 ) }
		const skyline = ( x0, x1, hmax, seed ) => { const rr = rndFn( seed ); let x = x0; while ( x < x1 ) { const bw = 20 + rr() * 38, bh = hmax * ( .35 + rr() * .65 ), tone = 215 + ( rr() * 30 | 0 ), warmT = rr() < .3
				c.fillStyle = warmT ? `rgb(${ tone },${ tone - 18 },${ tone - 40 })` : `rgb(${ tone - 10 },${ tone - 6 },${ tone })`; c.fillRect( x, hz - bh, bw, bh )
				c.fillStyle = 'rgba(40,70,100,.35)'; for ( let yy = hz - bh + 6; yy < hz - 5; yy += 9 ) for ( let xx = x + 4; xx < x + bw - 4; xx += 8 ) c.fillRect( xx, yy, 4, 4 )
				x += bw + rr() * 3 }
			g = c.createLinearGradient( 0, hz - hmax, 0, hz ); g.addColorStop( 0, 'rgba(190,220,240,.15)' ); g.addColorStop( 1, 'rgba(190,220,240,.6)' ); c.fillStyle = g; c.fillRect( x0, hz - hmax, x1 - x0, hmax ) }
		skyline( 0, w * .3, 190, 21 ); skyline( w * .86, w, 150, 34 )
		g = c.createLinearGradient( 0, hz, 0, hz + 10 ); g.addColorStop( 0, 'rgba(240,225,190,.85)' ); g.addColorStop( 1, 'rgba(240,225,190,0)' ); c.fillStyle = g; c.fillRect( 0, hz, w * .3, 10 ); c.fillRect( w * .86, hz, w * .14, 10 )
	}, { srgb: true } )
}

// pedra portuguesa: ladrilho de 1 m = ~1080 pedrinhas de ~3,3 cm em fileiras alternadas, com junta escura. Devolve { color (luminosidade), normal } repetíveis.
function stoneMaps() {
	const N = 1024, mk = () => { const c = document.createElement( 'canvas' ); c.width = c.height = N; return c }, cc = mk(), hc = mk(), c = cc.getContext( '2d' ), hh = hc.getContext( '2d' ), r = rndFn( 90 )
	c.fillStyle = '#3c3c3c'; c.fillRect( 0, 0, N, N ); hh.fillStyle = '#000'; hh.fillRect( 0, 0, N, N )
	const cols = 30, rows = 36, sx = N / cols, sy = N / rows
	for ( let row = 0; row < rows; row ++ ) for ( let col = 0; col < cols; col ++ ) {
		const cx0 = ( col + ( row & 1 ? .5 : 0 ) ) * sx + sx / 2 + ( r() - .5 ) * 4, cy0 = row * sy + sy / 2 + ( r() - .5 ) * 3, rx = sx * .5 * ( .8 + r() * .13 ), ry = sy * .5 * ( .86 + r() * .12 ), rot = ( r() - .5 ) * .9, v = 150 + r() * 65 | 0
		for ( const dx of [ - N, 0, N ] ) for ( const dy of [ - N, 0, N ] ) {
			const cx = cx0 + dx, cy = cy0 + dy; if ( cx < - 40 || cx > N + 40 || cy < - 40 || cy > N + 40 ) continue
			let g = c.createRadialGradient( cx - rx * .25, cy - ry * .3, 1, cx, cy, rx * 1.05 ); g.addColorStop( 0, `rgb(${ v + 28 },${ v + 28 },${ v + 28 })` ); g.addColorStop( .75, `rgb(${ v },${ v },${ v })` ); g.addColorStop( 1, `rgb(${ v - 55 },${ v - 55 },${ v - 55 })` )
			c.fillStyle = g; c.beginPath(); c.ellipse( cx, cy, rx, ry, rot, 0, TAU ); c.fill()
			g = hh.createRadialGradient( cx, cy, 0, cx, cy, rx * 1.05 ); g.addColorStop( 0, '#fff' ); g.addColorStop( .6, '#d0d0d0' ); g.addColorStop( 1, '#000' ); hh.fillStyle = g; hh.beginPath(); hh.ellipse( cx, cy, rx, ry, rot, 0, TAU ); hh.fill()
		}
	}
	// mapa de normais a partir da altura (diferenças finitas com repetição); canvas tem y para baixo e v para cima
	const hd = hh.getImageData( 0, 0, N, N ).data, nrm = mk(), nc = nrm.getContext( '2d' ), out = nc.createImageData( N, N ), S = 5, H = ( x, y ) => hd[ ( ( ( y + N ) % N ) * N + ( ( x + N ) % N ) ) * 4 ] / 255
	for ( let y = 0; y < N; y ++ ) for ( let x = 0; x < N; x ++ ) {
		const dx = ( H( x + 1, y ) - H( x - 1, y ) ) * S, dy = ( H( x, y + 1 ) - H( x, y - 1 ) ) * S, l = Math.hypot( dx, dy, 1 ), i = ( y * N + x ) * 4
		out.data[ i ] = ( - dx / l * .5 + .5 ) * 255; out.data[ i + 1 ] = ( dy / l * .5 + .5 ) * 255; out.data[ i + 2 ] = ( 1 / l * .5 + .5 ) * 255; out.data[ i + 3 ] = 255
	}
	nc.putImageData( out, 0, 0 )
	const tex = ( cv, srgb ) => { const t = new THREE.CanvasTexture( cv ); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if ( srgb ) t.colorSpace = THREE.SRGBColorSpace; return t }
	return { color: tex( cc, false ), normal: tex( nrm, false ) }
}

// areia: grão fino + manchas largas + marcas de pegadas/vento, só luminosidade
function sandTexture() {
	return canvasTex( 512, 512, ( c, w, h ) => {
		const r = rndFn( 4 ); c.fillStyle = '#9a9a9a'; c.fillRect( 0, 0, w, h )
		for ( let i = 0; i < 50; i ++ ) { const x = r() * w, y = r() * h, s = 30 + r() * 90, g = c.createRadialGradient( x, y, 0, x, y, s ); g.addColorStop( 0, r() < .5 ? 'rgba(60,60,60,.1)' : 'rgba(255,255,255,.12)' ); g.addColorStop( 1, 'rgba(0,0,0,0)' ); c.fillStyle = g; c.fillRect( x - s, y - s, s * 2, s * 2 ) }
		for ( let i = 0; i < 26000; i ++ ) { const v = 100 + r() * 130 | 0; c.fillStyle = `rgba(${ v },${ v },${ v },${ .2 + r() * .4 })`; const s = .7 + r() * 1.4; c.fillRect( r() * w, r() * h, s, s ) }
		c.lineWidth = 2; for ( let y = 10; y < h; y += 26 ) { c.strokeStyle = 'rgba(80,80,80,.12)'; c.beginPath(); c.moveTo( 0, y ); for ( let x = 0; x <= w; x += 16 ) c.lineTo( x, y + Math.sin( x * .05 + y ) * 3 ); c.stroke() }
	}, { repeat: true, srgb: false } )
}

export const GLORIA = { stand: { x: 0, z: .1 }, quayZ: - 4.6 }

export async function buildGloriaRoom( group, { galleryBrightness } ) {
	const { halfW: W, spring: SP, front: ZF } = ROOM, ZB = -.98, ZBS = -40, D = ZF - ZB, QZ = GLORIA.quayZ
	const room = new THREE.Group(); room.name = 'room-gloria'; group.add( room )
	const add = ( g, m, { cast = false, recv = true, parent = null } = {} ) => { const mesh = new THREE.Mesh( g, m ); mesh.castShadow = cast; mesh.receiveShadow = recv; ( parent || room ).add( mesh ); return mesh }
	const warm = vec3( 1, .94, .82 )
	const pano = panoCanvas(); pano.wrapS = pano.wrapT = THREE.ClampToEdgeWrapping; pano.anisotropy = 8
	const { color: stone, normal: stoneN } = stoneMaps(), sand = sandTexture()
	const camL = modelWorldMatrixInverse.mul( vec4( cameraPosition, 1 ) ).xyz
	const hv = c => vec3( c.r, c.g, c.b ), BLACK = hv( new THREE.Color( '#34343a' ) ), WHITE = hv( new THREE.Color( '#e8e4d8' ) ), SAND = hv( new THREE.Color( '#ead9ab' ) ), WET = hv( new THREE.Color( '#a99772' ) ), GRANITE = hv( new THREE.Color( '#b2aea6' ) )
	const WATERZ = QZ - 13.2 // linha d'água (espuma); daqui para trás é o mar do panorama

	// --- calçadão de Copacabana: ondas largas (preto e branco) ao longo do eixo X; junta entre as faixas irregular, como de pedrinha
	const walkAt = xz => {
		const P = 1.0, A = .5, K = 1.7
		const jitter = texture( stone, xz.mul( 2.3 ) ).g.sub( .5 ).mul( .06 )
		const v = xz.y.add( sin( xz.x.mul( K ) ).mul( A ) ).add( sin( xz.x.mul( .55 ).add( 1.3 ) ).mul( .25 ) ).add( jitter ), f = fract( v.div( P ) ), band = step( .5, f )
		const lum = texture( stone, xz ).r.mul( 1.35 ).add( .12 )
		const paved = mix( BLACK, WHITE, band ).mul( lum )
		// faixa de granito junto ao meio-fio (lajes de 1 m com junta)
		const gz = xz.y.sub( QZ ), inGr = float( 1 ).sub( smoothstep( .9, 1.0, gz ) ), slab = fract( xz.x.div( 1.0 ) ), seam = float( 1 ).sub( smoothstep( 0, .012, slab.min( float( 1 ).sub( slab ) ) ).mul( smoothstep( .0, .012, fract( gz.div( .9 ) ).min( float( 1 ).sub( fract( gz.div( .9 ) ) ) ) ) ) )
		const granite = GRANITE.mul( texture( sand, xz.mul( 3 ) ).r.mul( .5 ).add( .75 ) ).mul( float( 1 ).sub( seam.mul( .35 ) ) )
		return mix( paved, granite, inGr.mul( step( 0, gz ) ) )
	}
	const beachAt = xz => {
		const z = xz.y, g = texture( sand, xz.div( 1.6 ) ).r.mul( .4 ).add( .8 ), macro = texture( sand, xz.div( 7 ) ).r.mul( .3 ).add( .85 )
		const dry = SAND.mul( g ).mul( macro )
		const wet = smoothstep( WATERZ + 3.2, WATERZ + .9, z ) // areia molhada, mais escura, perto da água
		const base = mix( dry, WET.mul( g ), wet.mul( .85 ) )
		const foamEdge = float( WATERZ + .45 ).add( sin( xz.x.mul( 2.1 ) ).mul( .12 ) ).add( sin( xz.x.mul( 6.3 ) ).mul( .04 ) )
		const foam = smoothstep( foamEdge.sub( .22 ), foamEdge, z ).mul( float( 1 ).sub( smoothstep( foamEdge, foamEdge.add( .05 ), z ) ) ).mul( texture( sand, xz.mul( 4 ) ).r.mul( .7 ).add( .5 ) )
		return select( z.greaterThan( WATERZ ), mix( base, vec3( .96, .98, .98 ), foam.min( 1 ) ), vec3( .27, .66, .76 ) )
	}
	const groundAt = xz => select( xz.y.greaterThan( QZ ), walkAt( xz ), select( xz.y.greaterThan( QZ - .3 ), GRANITE.mul( .82 ), beachAt( xz ) ) )
	const FLOORY = .02
	// o panorama só cobre 150° de azimute; fora dele (laterais do corredor) não pode aparecer mar: vira bruma azul-clara no horizonte e azul de céu em cima
	const SKYHAZE = vec3( .80, .90, .96 ), SKYTOP = vec3( .24, .56, .88 )
	const panoAt = dir => {
		const SPAN = 150 * Math.PI / 180, u0 = atan( dir.x, dir.z.negate() ).div( SPAN ).add( .5 ), v = float( .5 ).sub( dir.y.asin().div( 1.4 ) )
		const raw = texture( pano, vec2( u0.clamp( 0, 1 ), float( 1 ).sub( v.clamp( 0, 1 ) ) ) ).rgb
		const side = smoothstep( .45, .9, u0.sub( .5 ).abs().mul( 2 ) ), sky = mix( SKYHAZE, SKYTOP, smoothstep( 0, .55, dir.y.max( 0 ) ) )
		return mix( raw, sky, side )
	}
	const hazeGround = xz => { const dir = vec3( xz.x, FLOORY, xz.y ).sub( camL ).normalize(), f = smoothstep( 14, 30, xz.sub( camL.xz ).length() ); return mix( groundAt( xz ), panoAt( dir ), f ) }
	const world = new THREE.MeshBasicNodeMaterial( { side: THREE.DoubleSide } ); world.fog = false
	{ const rayL = positionLocal.sub( camL ), dir = rayL.normalize(), ry = rayL.y.min( - .0005 )
		const hit = camL.add( rayL.mul( float( FLOORY ).sub( camL.y ).div( ry ) ) )
		world.colorNode = select( rayL.y.lessThan( - .0005 ).and( hit.z.greaterThan( WATERZ - .25 ) ), hazeGround( hit.xz ), panoAt( dir ) ).mul( .98 )
		add( tube( [ [ - W, 0 ], [ - W, SP ] ], ZBS, ZF, 1 ), world, { recv: false } ); add( tube( [ [ W, 0 ], [ W, SP ] ], ZBS, ZF, 1 ), world, { recv: false } )
		add( tube( arcPts( 0, SP, W, Math.PI, 0, 40 ).reverse(), ZBS, ZF, 1 ), world, { recv: false } )
		add( wallPanel( [ [ - W, 0 ], [ W, 0 ], [ W, SP ], [ - W, SP ] ], ZBS, 1 ), world, { recv: false } )
		add( wallPanel( [ [ W, SP ], ...arcPts( 0, SP, W, 0, Math.PI, 40 ), [ - W, SP ] ], ZBS, 1 ), world, { recv: false } ) }
	// piso real (recebe luz e sombra, com relevo de pedrinha) → nas bordas vira o piso do raio, sem emenda
	const fadeToGround = m => { const p = positionLocal, e = float( W ).sub( p.x.abs() ).min( p.z.sub( ZB ) ).div( 1.2 ), f = float( 1 ).sub( smoothstep( 0, 1, e ) ), tgt = hazeGround( p.xz ); const orig = m.setupOutput.bind( m ); m.setupOutput = ( b, lit ) => orig( b, vec4( mix( lit.rgb, tgt, f ), lit.a ) ); return m }
	const floorG = new THREE.PlaneGeometry( W * 2, D ); floorG.rotateX( - Math.PI / 2 ); floorG.translate( 0, FLOORY, ( ZF + ZB ) / 2 )
	{ const pos = floorG.attributes.position, uv = floorG.attributes.uv; for ( let i = 0; i < pos.count; i ++ ) uv.setXY( i, pos.getX( i ), pos.getZ( i ) ) }
	const fm = new THREE.MeshStandardNodeMaterial( { roughness: .62, color: '#ffffff', normalMap: stoneN, normalScale: new THREE.Vector2( .9, .9 ) } ); fm.colorNode = walkAt( positionLocal.xz ); fm.emissiveNode = walkAt( positionLocal.xz ).mul( warm ).mul( .13 ).mul( galleryBrightness )
	add( floorG, fadeToGround( fm ) )
	{ const g = new THREE.PlaneGeometry( W * 2, ZB - ZBS ); g.rotateX( - Math.PI / 2 ); g.translate( 0, FLOORY, ( ZB + ZBS ) / 2 ); add( g, world, { recv: false } ) }

	// --- adereços (um merge e um material por tipo)
	const propMat = ( rough = .6, metal = .1, glow = .16 ) => { const m = new THREE.MeshStandardNodeMaterial( { vertexColors: true, roughness: rough, metalness: metal, side: THREE.DoubleSide } ); m.emissiveNode = vertexColor().mul( warm ).mul( glow ).mul( galleryBrightness ); return m }
	const ironMat = propMat( .45, .55, .12 ), clothMat = propMat( .85, 0, .2 ), woodMat = propMat( .8, 0, .16 ), leafMat = propMat( .75, 0, .22 ), trunkMat = propMat( .9, 0, .16 )
	const glassMat = new THREE.MeshBasicNodeMaterial( { vertexColors: true } ); glassMat.fog = false
	const place = ( g, m, x, y, z, ry = 0, s = 1, cast = true ) => { const o = add( g, m, { cast } ); o.position.set( x, y, z ); o.rotation.y = ry; o.scale.setScalar( s ); return o }
	// meio-fio de granito com degrau para a areia (a mureta da orla)
	const curbMat = propMat( .8, 0, .14 )
	add( merge( [ box( W * 2 + .6, .2, .34, [ 0, .1, QZ + .05 ], '#aaa69e' ), box( W * 2 + .6, .06, .4, [ 0, .21, QZ + .05 ], '#c4c0b7' ), box( W * 2 + .6, .5, .08, [ 0, - .18, QZ - .14 ], '#8d897f' ) ] ), curbMat, { cast: true } )

	// --- registro de objetos posicionáveis (painel "Cenário · posições")
	const objs = {}
	const reg = ( key, label, grp ) => { objs[ key ] = { label, grp, base: grp.rotation.y, def: { x: grp.position.x, y: grp.position.y, z: grp.position.z, rot: 0 } } }
	const spot = new THREE.Group(); spot.name = 'gloria-onde-fica'; spot.position.set( GLORIA.stand.x, .02, GLORIA.stand.z ); room.add( spot ); reg( 'gloria', 'Glória Maria (posição)', spot )
	const LKEY = 'legado.layout.gloria.v1', saved = ( () => { try { return JSON.parse( localStorage.getItem( LKEY ) ) || {} } catch { return {} } } )()
	const marker = new THREE.Mesh( new THREE.RingGeometry( .32, .37, 48 ).rotateX( - Math.PI / 2 ), new THREE.MeshBasicNodeMaterial( { color: '#ffd27a', transparent: true, opacity: .9, depthTest: false } ) ); marker.renderOrder = 20; marker.visible = false; room.add( marker )
	const order = [ 'gloria' ]; let current = order[ 0 ]
	const apply = k => { const o = objs[ k ]; if ( ! o ) return; const v = o.val; o.grp.position.set( v.x, v.y, v.z ); o.grp.rotation.y = o.base + v.rot * Math.PI / 180; if ( k === current ) marker.position.set( v.x, v.y + .05, v.z ) }
	for ( const k of order ) { objs[ k ].val = { ...objs[ k ].def, ...( saved[ k ] || {} ) }; apply( k ) }
	const desk = {
		meta: { title: 'Cenário · posições', spec: [ [ 'x', 'Ao longo do corredor', - 2.5, 2.5, .01, 'm' ], [ 'y', 'Altura', - .5, 3, .01, 'm' ], [ 'z', 'Frente ↔ fundo', - 4, 1.3, .01, 'm' ], [ 'rot', 'Giro', - 180, 180, 1, '°' ] ] },
		keys: () => order, label: k => objs[ k ].label, get: k => ( { ...objs[ k ].val } ),
		set( k, prop, v ) { objs[ k ].val[ prop ] = Number( v ); apply( k ) },
		select( k ) { current = k; apply( k ) }, marker( on ) { marker.visible = !! on },
		save() { try { localStorage.setItem( LKEY, JSON.stringify( desk.all() ) ); return true } catch { return false } },
		reset( k ) { for ( const kk of k ? [ k ] : order ) { objs[ kk ].val = { ...objs[ kk ].def }; apply( kk ) } if ( ! k ) try { localStorage.removeItem( LKEY ) } catch { } },
		all() { const out = {}; for ( const k of order ) out[ k ] = { ...objs[ k ].val }; return out },
	}
	const walkMaxX = () => 6.25 - QZ - 3.4 // não passa da mureta da orla

	// luz: sol alto de tarde, de trás (contraluz suave) + preenchimento claro pela frente (é uma repórter: o rosto precisa estar iluminado)
	const sun = new THREE.SpotLight( '#fff0d0', 4, 14, 1.1, .9, 1.4 ); sun.position.set( 1.2, 5.0, ZB + .3 ); sun.target.position.set( 0, .9, - 2 ); room.add( sun, sun.target )
	const fill = new THREE.SpotLight( '#f4f8ff', 5.5, 11, .9, .85, 1.4 ); fill.position.set( - 1.4, 3.8, ZF + .9 ); fill.target.position.set( 0, 1.3, .1 ); room.add( fill, fill.target )
	return { room, sun, desk, walkMaxX, spot }
}
