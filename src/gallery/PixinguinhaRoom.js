import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { normalLocal, texture, vec2, vec3, vec4, float, mix, smoothstep, step, fract, floor, sin, dot, abs, min, max, length, vertexColor, positionLocal, positionWorld, cameraPosition, modelWorldMatrixInverse, select, uniform, normalize } from 'three/tsl';
import { ROOM, TAU, canvasTex, withColor, xf, tube, arcPts, wallPanel, box } from './PeriodRoom.js';

// ---------------------------------------------------------------------------------------------
// Pixinguinha (Alfredo da Rocha Vianna Filho, 1897 · 1973) — Lapa, Rio de Janeiro, noite de roda de choro.
// Rua de paralelepípedos sob um poste de ferro com bandeirinhas; ao fundo os Arcos da Lapa (com o bonde amarelo de
// Santa Teresa passando por cima), o morro com janelas acesas, lua e estrelas. Sem paredes: céu, chão e fundo calculados
// pelo raio do olhar (como o cais do Rebouças), então o nicho "não tem fim". Notas musicais sobem do personagem.
// Mesmo referencial do PeriodRoom: origem no centro do nicho, +Z = corredor.
// ---------------------------------------------------------------------------------------------

const rndFn = seed => { let s = seed; return () => ( s = ( Math.imul( s, 1664525 ) + 1013904223 ) >>> 0 ) / 4294967296 }
const hash2 = p => fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ).mul( 43758.5453 ) )
const hash22 = p => vec2( hash2( p ), hash2( p.add( vec2( 41.3, 17.7 ) ) ) )

// Medidas do fundo (m, coordenadas locais do nicho). Os Arcos ficam num plano vertical em z = -ARC.z.
export const LAPA = {
	arc: { z: 11, pitch: 2.4, half: .8, spring: 1.75, hl: 2.85, upPitch: 2.4, upHalf: .98, upSpring: 4.3, top: 5.75 }, // baixos o bastante para o bonde (topo + 1,4 m) caber no quadro
	hill: { z: 32 }, lamp: { x: - 1.55, z: - .55, h: 3.15 }, pole: { x: 2.3, z: - .25, h: 3.0 },
}

function sheetTexture() { // partitura: pauta + notas (choro em Sol maior, só desenho)
	return canvasTex( 512, 384, ( c, w, h ) => {
		c.fillStyle = '#efe6cd'; c.fillRect( 0, 0, w, h )
		const g = c.createRadialGradient( w / 2, h / 2, 40, w / 2, h / 2, w * .7 ); g.addColorStop( 0, 'rgba(255,248,220,.35)' ); g.addColorStop( 1, 'rgba(120,95,50,.35)' ); c.fillStyle = g; c.fillRect( 0, 0, w, h )
		c.strokeStyle = '#3a3226'; c.fillStyle = '#2a251c'; c.font = 'italic 20px Georgia'; c.textAlign = 'center'; c.fillText( 'Carinhoso', w / 2, 34 ); c.font = 'italic 12px Georgia'; c.fillText( 'choro · Pixinguinha', w / 2, 52 )
		const r = rndFn( 9 )
		for ( let s = 0; s < 4; s ++ ) {
			const y0 = 84 + s * 74; c.lineWidth = 1
			for ( let l = 0; l < 5; l ++ ) { c.beginPath(); c.moveTo( 24, y0 + l * 7 ); c.lineTo( w - 24, y0 + l * 7 ); c.stroke() }
			c.beginPath(); c.moveTo( 24, y0 ); c.lineTo( 24, y0 + 28 ); c.stroke(); c.beginPath(); c.moveTo( w - 24, y0 ); c.lineTo( w - 24, y0 + 28 ); c.stroke()
			for ( let x = 60; x < w - 40; x += 30 ) { const ny = y0 + Math.floor( r() * 9 ) * 3.5 - 4; c.beginPath(); c.ellipse( x, ny, 5, 3.6, - .35, 0, TAU ); c.fill(); c.lineWidth = 1.4; c.beginPath(); c.moveTo( x + 4.6, ny ); c.lineTo( x + 4.6, ny - 24 ); c.stroke() }
			for ( let x = 90; x < w - 60; x += 90 ) { c.lineWidth = 1; c.beginPath(); c.moveTo( x, y0 ); c.lineTo( x, y0 + 28 ); c.stroke() }
		}
	} )
}
function noteAtlas() { // 4 glifos musicais dourados com brilho
	return canvasTex( 256, 64, ( c, w, h ) => {
		c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '700 48px Georgia, serif';
		[ '♪', '♫', '♩', '♬' ].forEach( ( g, i ) => { c.shadowColor = '#ffb347'; c.shadowBlur = 10; c.fillStyle = '#ffe3a0'; c.fillText( g, 32 + i * 64, 34 ) } )
	} )
}
const noteTex = noteAtlas()

export async function buildPixinguinhaRoom( group, { galleryBrightness } ) {
	const { halfW: W, spring: SP, front: ZF } = ROOM, ZB = - .98, ZBS = - 40, D = ZF - ZB, A = LAPA.arc, HZ = LAPA.hill.z
	const room = new THREE.Group(); room.name = 'room-pixinguinha'; group.add( room )
	const add = ( g, m, { cast = false, recv = true, parent = null } = {} ) => { const mesh = new THREE.Mesh( g, m ); mesh.castShadow = cast; mesh.receiveShadow = recv; ( parent || room ).add( mesh ); return mesh }
	const warm = vec3( 1, .8, .55 ), time = uniform( Number( new URLSearchParams( location.search ).get( 'bonde' ) ) || 0 ) // ?bonde=<s> começa a animação nesse instante (teste)
	const hv = c => vec3( c.r, c.g, c.b ), col = h => hv( new THREE.Color( h ) )
	const HAZE = col( '#040309' ), MID = col( '#080a26' ), TOPC = col( '#05071c' ), STONE = col( '#716b78' ), STONE2 = col( '#5a6578' ), GAP = col( '#17141c' )
	const lampL = vec3( LAPA.lamp.x, 2.2, LAPA.lamp.z )

	// --- paralelepípedos: fiadas deslocadas, pedra a pedra com tom próprio; de longe vira a média (evita cintilar)
	const camL = modelWorldMatrixInverse.mul( vec4( cameraPosition, 1 ) ).xyz
	// bruma preta por distância (como a bruma azul dos outros sets): fachada, chão e bonde se diluem no preto
	// (sem bruma/sombra: removida a pedido)
	const sideShade = ( p, toRoom = v => v ) => float( 1 )
	// bruma azul nas laterais: nada é infinito; tudo se dilui num azul-noite com a distância ao longo do corredor (x), nos dois lados
	const MIST = col( '#020208' ), MIST0 = 4, MIST1 = 14
	const mistX = x => smoothstep( MIST0, MIST1, abs( x ) ), mistDir = d => smoothstep( .35, .95, abs( d.x ) ).mul( float( 1 ).sub( smoothstep( 0, .6, d.y.max( 0 ) ) ) ), withMist = ( c, f ) => mix( c, MIST, f )
	// máscara de abertura: o fundo é largo, então só aparece quando o raio do olhar passa pela abertura DESTE nicho (senão vazaria nos nichos vizinhos); câmera dentro do nicho vê tudo
	const openMask = ( p, cam ) => { const r = p.sub( cam ), t = float( ZF ).sub( cam.z ).div( r.z.min( - .0001 ) ), hx = cam.x.add( r.x.mul( t ) ), hy = cam.y.add( r.y.mul( t ) ); const inRect = step( length( vec2( hx, hy.sub( SP ).max( 0 ) ) ), W + .08 ).mul( step( - .1, hy ) ); return max( step( cam.z, ZF ), inRect ) }
	const gate = ( m, toRoom = v => v ) => { m.opacityNode = openMask( toRoom( positionLocal ), toRoom( camL ) ); m.alphaTest = .5; return m }
	const cobble = xz => {
		const SX = .24, SY = .17, s = xz.div( vec2( SX, SY ) ), row = floor( s.y ), sx = s.x.add( row.mod( 2 ).mul( .5 ) ), cell = vec2( floor( sx ), row ), f = vec2( fract( sx ), fract( s.y ) )
		const edge = min( min( f.x, float( 1 ).sub( f.x ) ).mul( SX ), min( f.y, float( 1 ).sub( f.y ) ).mul( SY ) )
		const gap = float( 1 ).sub( smoothstep( .007, .02, edge ) ), h1 = hash2( cell ), h2 = hash2( cell.add( 7.7 ) )
		const stone = mix( STONE, STONE2, h2 ).mul( h1.mul( .7 ).add( .6 ) ).mul( smoothstep( 0, .05, edge ).mul( .25 ).add( .85 ) ) // borda mais escura (pedra abaulada)
		const near = mix( stone, GAP, gap.mul( .85 ) )
		const avg = mix( STONE, STONE2, .5 ).mul( .85 )
		return mix( near, avg, smoothstep( 2.4, 6.5, xz.sub( camL.xz ).length() ) )
	}

	// --- céu: morro + céu estrelado + lua, pintados por raio (rayL) — devolve a cor de quem olha naquela direção
	const backdrop = rayL => {
		const rz = rayL.z.min( - .0005 ), dir = normalize( rayL )
		// morro de Santa Teresa (plano distante) com janelinhas acesas
		const tH = float( - HZ ).sub( camL.z ).div( rz ), hH = camL.add( rayL.mul( tH ) ), hx = hH.x, hy = hH.y
		const prof = float( 10 ).add( sin( hx.mul( .05 ).add( 1 ) ).mul( 3.2 ) ).add( sin( hx.mul( .13 ) ).mul( 2 ) ).add( sin( hx.mul( .31 ) ).mul( 1.1 ) )
		const wc = floor( vec2( hx, hy ).div( vec2( 1.1, .9 ) ) ), wf = fract( vec2( hx, hy ).div( vec2( 1.1, .9 ) ) ), winOn = step( .83, hash2( wc ) ).mul( step( hy, prof.sub( .9 ) ) ).mul( step( 1.5, hy ) ).mul( step( .3, wf.x ) ).mul( step( wf.x, .7 ) ).mul( step( .3, wf.y ) ).mul( step( wf.y, .7 ) )
		const hillC = mix( col( '#06050f' ), col( '#14102c' ), smoothstep( 0, 14, hy ) ).add( vec3( 1, .78, .4 ).mul( winOn ).mul( .9 ) )
		// céu: degradê + estrelas + lua
		const ay = dir.y.max( 0 ), sky0 = mix( mix( HAZE, MID, smoothstep( 0, .22, ay ) ), TOPC, smoothstep( .15, .85, ay ) )
		const sp = vec2( dir.x.div( dir.z.abs().max( .2 ) ), dir.y.div( dir.z.abs().max( .2 ) ) ).mul( 38 ), sc = floor( sp ), sf = fract( sp ).sub( .5 ), off = hash22( sc ).sub( .5 ).mul( .6 )
		const star = float( 1 ).sub( smoothstep( .04, .13, length( sf.sub( off ) ) ) ).mul( step( .9, hash2( sc.add( 3.1 ) ) ) ).mul( hash2( sc ).mul( .7 ).add( .3 ) ).mul( sin( time.mul( 1.7 ).add( hash2( sc ).mul( 30 ) ) ).mul( .25 ).add( .75 ) ).mul( smoothstep( .05, .3, dir.y ) ).mul( smoothstep( .28, .5, dir.z.abs() ) )
		const dM = normalize( vec3( - .28, .36, - 1 ) ), aM = dot( dir, dM )
		const moon = smoothstep( .99905, .99935, aM ), moonGlow = aM.max( 0 ).pow( 70 ).mul( .35 ).add( aM.max( 0 ).pow( 8 ).mul( .05 ) )
		const sky = sky0.add( vec3( .92, .9, .8 ).mul( star ) ).add( vec3( .5, .5, .65 ).mul( moonGlow ) ).add( vec3( 1, .96, .82 ).mul( moon ) )
		const bg = select( hy.lessThan( prof ).and( hy.greaterThan( - .5 ) ), hillC, sky )
		return { color: bg }
	}
	const groundAt = xz => { // chão sem luz do fundo (iluminação aproximada): paralelepípedo escuro com poça de luz do poste
		const lampPool = float( 1 ).sub( smoothstep( .4, 3.6, length( xz.sub( vec2( LAPA.lamp.x, LAPA.lamp.z ) ) ) ) )
		const c = cobble( xz ).mul( .62 ).mul( vec3( 1, .94, .88 ).mul( lampPool.mul( .75 ).add( .6 ) ).add( vec3( 1, .72, .4 ).mul( lampPool.mul( .25 ) ) ) )
		const dF = xz.y.add( A.z ), under = select( dF.lessThan( 0 ), float( .35 ), mix( float( .5 ), float( 1 ), smoothstep( 0, 3.8, dF ) ) ) // sombra da fachada no chão
		const lit = c.mul( mix( float( 1 ), under, float( 1 ).sub( smoothstep( 42, 45, abs( xz.x ) ) ) ) )
		return mix( lit, col( '#040309' ), smoothstep( 30, 60, xz.sub( camL.xz ).length() ) ).mul( sideShade( vec3( xz.x, 0, xz.y ) ) )
	}
	const FLOORY = .02
	// piso real (recebe luz do poste e da lua): nas bordas vira o piso "sem luz" do entorno, sem emenda
	const fadeToGround = m => { const p = positionLocal, e = float( W ).sub( p.x.abs() ).min( p.z.sub( ZB ) ).div( 1.2 ), f = float( 1 ).sub( smoothstep( 0, 1, e ) ), tgt = groundAt( p.xz ); const orig = m.setupOutput.bind( m ); m.setupOutput = ( b, lit ) => orig( b, vec4( mix( lit.rgb, tgt, f ), lit.a ) ); return m }
	const floorG = new THREE.PlaneGeometry( W * 2, D ); floorG.rotateX( - Math.PI / 2 ); floorG.translate( 0, FLOORY, ( ZF + ZB ) / 2 )
	const fm = new THREE.MeshStandardNodeMaterial( { roughness: .82, color: '#ffffff' } ); fm.colorNode = cobble( positionLocal.xz ).mul( vec3( 1, .96, .92 ) ); fm.emissiveNode = cobble( positionLocal.xz ).mul( warm ).mul( .1 ).mul( galleryBrightness )
	add( floorG, fadeToGround( fm ) )

	// --- mundo pintado pelo raio do olhar (como o Glória): túnel FECHADO de ZBS até ZF, só na largura do nicho. Nada de geometria larga fora dele,
	// então do corredor o set só existe pelo portal e nada vaza nos vizinhos. Arcos da Lapa, bonde, trilhos, fio, morro, lua e chão são pintados.
	const DECK = A.top, TZ = - A.z - .95, TRAM_S = .85
	const tramX = uniform( - 27 + ( ( time.value / 30 ) % 1 ) * 54 )
	const world = new THREE.MeshBasicNodeMaterial( { side: THREE.DoubleSide } ); world.fog = false
	{ const archMask = ( dx, y, w, y0, h ) => { const r = w / 2, yb = y0 + h - r, rect = step( abs( dx ), float( r ) ).mul( step( y0, y ) ).mul( step( y, float( yb ) ) ), circ = step( length( vec2( dx, y.sub( yb ) ) ), float( r ) ).mul( step( yb, y ) ); return max( rect, circ ) }
		const rayL = positionLocal.sub( camL ), dir = normalize( rayL ), dz = dir.z.min( - .0001 ), dyy = dir.y.min( - .0001 )
		const tF = float( - A.z ).sub( camL.z ).div( dz ), hx = camL.x.add( dir.x.mul( tF ) ), hy = camL.y.add( dir.y.mul( tF ) ), tG = float( FLOORY ).sub( camL.y ).div( dyy ), hitG = camL.add( dir.mul( tG ) )
		const down = dir.y.lessThan( - .0005 )
		const AX = 44.5
		const wallA = step( abs( hx ), float( AX ) ).mul( step( hy, float( A.top + .5 ) ) ).mul( step( - .5, hy ) )
		const low = archMask( hx.sub( floor( hx.div( A.pitch ).add( .5 ) ).mul( A.pitch ) ), hy, A.half * 2, 0, A.spring + A.half )
		const up = archMask( hx.sub( floor( hx.div( A.upPitch ).add( .5 ) ).mul( A.upPitch ) ), hy, A.upHalf * 2, A.hl + .45, A.upSpring + A.upHalf - ( A.hl + .45 ) )
		const stuccoL = col( '#e4d4ae' ).mul( hash2( floor( vec2( hx, hy ).div( .5 ) ) ).mul( .16 ).add( .88 ) ).mul( hash2( floor( vec2( hx, hy ).div( 1.7 ) ) ).mul( .2 ).add( .86 ) ).mul( hash2( floor( vec2( hx, hy ).div( .07 ) ) ).mul( .07 ).add( .96 ) )
		const litL = mix( float( 1 ), float( .22 ), smoothstep( 0, 7.5, hy ) ).mul( .8 ).add( .2 ), footL = mix( float( .6 ), float( 1 ), smoothstep( 0, 1.2, hy ) ), glowL = float( 1 ).sub( smoothstep( 2, 11, abs( hx.sub( LAPA.lamp.x ) ) ) ).mul( .25 ).add( .75 )
		// cornijas dos Arcos (faixas) e parapeito
		const ledge = step( abs( hy.sub( A.hl ) ), float( .09 ) ).max( step( abs( hy.sub( A.top - .1 ) ), float( .07 ) ) ).max( step( abs( hy.sub( A.top + .1 ) ), float( .11 ) ) )
		const arcCol = mix( stuccoL, stuccoL.mul( 1.12 ), ledge ).mul( .94 ).mul( litL ).mul( footL ).mul( glowL ).mul( warm.mul( .35 ).add( .65 ) )
		const bd = backdrop( rayL ).color
		// bonde de Santa Teresa pintado (2 carros amarelos abertos, teto vermelho, pilaretes, passageiros), trilhos e fio aéreo, no plano atrás dos Arcos
		const tT = float( TZ ).sub( camL.z ).div( dz ), tx = camL.x.add( dir.x.mul( tT ) ), ty = camL.y.add( dir.y.mul( tT ) )
		const u = tx.sub( tramX ).div( TRAM_S ), v = ty.sub( DECK + .05 ).div( TRAM_S )
		// dois carros de 4 m (centros u=0 e u=-4.55): chassi com rodas, lataria amarela com frisos, listra vermelha, lados abertos com pilaretes, bancos e passageiros, teto, trole e lanterna
		const carC = select( u.lessThan( - 2.28 ), float( - 4.55 ), float( 0 ) ), cu = u.sub( carC ), inCar = step( abs( cu ), float( 2.0 ) )
		const interiorM = inCar.mul( step( 1.18, v ) ).mul( step( v, 2.27 ) ) // lados fechados por dentro: o bonde nao e transparente
		const chassisM = inCar.mul( step( .45, v ) ).mul( step( v, .65 ) )
		const wheelM = max( step( length( vec2( cu.sub( - 1.3 ), v.sub( .28 ) ) ), float( .2 ) ), step( length( vec2( cu.sub( 1.3 ), v.sub( .28 ) ) ), float( .2 ) ) ).mul( step( abs( cu ), float( 2.2 ) ) )
		const hubM = max( step( length( vec2( cu.sub( - 1.3 ), v.sub( .28 ) ) ), float( .07 ) ), step( length( vec2( cu.sub( 1.3 ), v.sub( .28 ) ) ), float( .07 ) ) )
		const bodyM = inCar.mul( step( .65, v ) ).mul( step( v, 1.1 ) ), seam = step( fract( cu.mul( 1.7 ).add( .5 ) ), float( .045 ) )
		const stripeM = inCar.mul( step( 1.1, v ) ).mul( step( v, 1.18 ) )
		const edgeM = step( abs( cu ), float( 2.19 ) ).mul( step( 2.27, v ) ).mul( step( v, 2.34 ) ), topM = step( abs( cu ), float( 2.14 ) ).mul( step( 2.34, v ) ).mul( step( v, 2.44 ) )
		const pillarM = inCar.mul( step( 1.18, v ) ).mul( step( v, 2.27 ) ).mul( step( fract( cu.mul( 1.5 ).add( .5 ) ), float( .07 ) ) )
		const bi = floor( cu.add( 1.7 ).div( .85 ) ).clamp( 0, 3 ), bx = bi.mul( .85 ).sub( 1.3 ), bh = hash2( vec2( bi, carC ) ), pdx = cu.sub( bx )
		const seatM = inCar.mul( step( abs( pdx ), float( .03 ) ) ).mul( step( 1.1, v ) ).mul( step( v, 1.55 ) )
		const bodyP = inCar.mul( step( .35, bh ) ).mul( step( abs( pdx.sub( .13 ) ), float( .14 ) ) ).mul( step( 1.15, v ) ).mul( step( v, 1.5 ) )
		const headP = inCar.mul( step( .35, bh ) ).mul( step( length( vec2( pdx.sub( .13 ), v.sub( 1.64 ) ) ), float( .09 ) ) )
		const poleM = step( abs( cu ), float( .015 ) ).mul( step( 2.44, v ) ).mul( step( v, 3.0 ) )
		const lampM = step( length( vec2( u.sub( 2.07 ), v.sub( 1.15 ) ) ), float( .1 ) ), signM = step( abs( u.sub( 1.7 ) ), float( .28 ) ).mul( step( 1.95, v ) ).mul( step( v, 2.2 ) ).mul( step( .5, inCar ) )
		const wireM = step( abs( ty.sub( DECK + 3.0 ) ), float( .012 ) ).max( step( abs( ty.sub( DECK + .03 ) ), float( .035 ) ) ).max( step( abs( ty.sub( DECK + .09 ) ), float( .012 ) ) )
		const cloth = mix( mix( col( '#2f4a7a' ), col( '#8a2f2f' ), step( .5, hash2( vec2( bh, 3.1 ) ) ) ), mix( col( '#e8e2d0' ), col( '#3f6b3a' ), step( .5, hash2( vec2( bh, 7.7 ) ) ) ), step( .5, hash2( vec2( bh, 1.3 ) ) ) )
		const skinC = mix( col( '#d9a679' ), col( '#7a4a2e' ), step( .5, hash2( vec2( bh, 9.9 ) ) ) )
		const yel = mix( col( '#e8b230' ), col( '#c48f1c' ), seam.mul( .8 ) )
		let tramC = col( '#1b1b1f' )
		const winF = fract( cu.mul( 1.5 ).add( .5 ) ), winM = interiorM.mul( step( .14, winF ) ).mul( step( winF, .93 ) ).mul( step( 1.42, v ) ).mul( step( v, 2.06 ) )
		tramC = select( interiorM.greaterThan( .5 ), mix( col( '#e8b230' ), col( '#c48f1c' ), step( 1.3, v ).mul( .0 ) ), tramC )
		tramC = select( winM.greaterThan( .5 ), mix( col( '#ffe3a0' ), col( '#a8743a' ), step( v, 1.55 ) ), tramC )
		tramC = select( wireM.greaterThan( .5 ), col( '#1b1b1f' ), tramC )
		tramC = select( poleM.greaterThan( .5 ), col( '#222226' ), tramC )
		tramC = select( topM.greaterThan( .5 ), col( '#e6dcbc' ), tramC )
		tramC = select( edgeM.greaterThan( .5 ), col( '#b8331f' ), tramC )
		tramC = select( signM.greaterThan( .5 ), col( '#f1e3a8' ), tramC )
		// removido: seatM
		// tramC = select( seatM.greaterThan( .5 ), col( '#6b4a2e' ), tramC )
		// removido: bodyP
		// tramC = select( bodyP.greaterThan( .5 ), cloth, tramC )
		// removido: headP
		// tramC = select( headP.greaterThan( .5 ), skinC, tramC )
		tramC = select( pillarM.greaterThan( .5 ), col( '#3b2a1a' ), tramC )
		tramC = select( stripeM.greaterThan( .5 ), col( '#b8331f' ), tramC )
		tramC = select( bodyM.greaterThan( .5 ), mix( yel, col( '#5a3a1c' ), step( v, .7 ) ), tramC )
		tramC = select( chassisM.greaterThan( .5 ), col( '#2a2420' ), tramC )
		tramC = select( wheelM.greaterThan( .5 ), mix( col( '#1e1e22' ), col( '#6a6a70' ), hubM ), tramC )
		tramC = select( lampM.greaterThan( .5 ), col( '#fff4c8' ), tramC )
		const tramM = max( max( max( wireM, poleM ), max( topM, edgeM ) ), max( max( signM, pillarM ), max( max( stripeM, bodyM ), max( max( chassisM, wheelM ), max( lampM, interiorM ) ) ) ) ).mul( step( 0, tT ) ).mul( step( dz, float( - .0005 ) ) )
		const bgT = select( tramM.greaterThan( .5 ), tramC.mul( vec3( 1.05, 1, .9 ) ).mul( .95 ), bd )
		const hit = dir.z.lessThan( - .0005 ).and( tF.greaterThan( 0 ) ).and( wallA.greaterThan( .5 ) ).and( down.not().or( tF.lessThan( tG ) ) )
		world.colorNode = withMist( select( hit, mix( arcCol, mix( bgT.mul( .8 ), col( '#070a24' ), .55 ), max( low, up ) ), select( down, groundAt( hitG.xz ), bgT ) ).mul( .96 ), select( hit, mistX( hx ), select( down, mistX( hitG.x ), mistDir( dir ) ) ) )
		add( tube( [ [ - W, 0 ], [ - W, SP ] ], ZBS, ZF, 1 ), world, { recv: false } ); add( tube( [ [ W, 0 ], [ W, SP ] ], ZBS, ZF, 1 ), world, { recv: false } )
		add( tube( arcPts( 0, SP, W, Math.PI, 0, 40 ).reverse(), ZBS, ZF, 1 ), world, { recv: false } )
		add( wallPanel( [ [ - W, 0 ], [ W, 0 ], [ W, SP ], [ - W, SP ] ], ZBS, 1 ), world, { recv: false } )
		add( wallPanel( [ [ W, SP ], ...arcPts( 0, SP, W, 0, Math.PI, 40 ), [ - W, SP ] ], ZBS, 1 ), world, { recv: false } )
		{ const g = new THREE.PlaneGeometry( W * 2, ZB - ZBS ); g.rotateX( - Math.PI / 2 ); g.translate( 0, FLOORY, ( ZB + ZBS ) / 2 ); add( g, world, { recv: false } ) } }
	// --- materiais dos objetos
	const prop = ( o, glow = .12 ) => { const m = new THREE.MeshStandardNodeMaterial( { vertexColors: true, ...o } ); m.emissiveNode = vertexColor().rgb.mul( warm ).mul( glow ).mul( galleryBrightness ); return m }
	const ironMat = prop( { roughness: .45, metalness: .75 } ), woodMat = prop( { roughness: .7 } ), marbleMat = prop( { roughness: .35 }, .1 ), glassMat = prop( { roughness: .15, metalness: .1 }, .35 )
	const glowMat = new THREE.MeshBasicNodeMaterial( { vertexColors: true, side: THREE.DoubleSide } ); glowMat.colorNode = vertexColor().rgb
	const cyl = ( rt, rb, h, p, hex, seg = 14, r ) => withColor( xf( new THREE.CylinderGeometry( rt, rb, h, seg ), p, r ), hex )
	const flush = ( list, mat, parent, cast = true ) => { if ( list.length ) add( mergeGeometries( list.map( g => g.index ? g.toNonIndexed() : g ), false ), mat, { cast, parent } ) }


	// objetos posicionáveis (painel "Cenário · posições")
	const objs = {}, reg = ( key, label, grp ) => { objs[ key ] = { label, grp, base: grp.rotation.y, def: { x: grp.position.x, y: grp.position.y, z: grp.position.z, rot: 0 } } }
	const mkGroup = ( name, x, z, rot = 0 ) => { const g = new THREE.Group(); g.name = name; g.position.set( x, .02, z ); g.rotation.y = rot; room.add( g ); return g }

	// --- poste de ferro fundido (lampião a gás eletrificado), no estilo dos postes da Lapa
	const poste = mkGroup( 'poste', LAPA.lamp.x, LAPA.lamp.z ); reg( 'poste', 'Poste de ferro', poste )
	{ const I = [], G = [], H = LAPA.lamp.h, dk = '#1e2b27', gd = '#b8923e'
		I.push( cyl( .14, .18, .16, [ 0, .08, 0 ], dk, 8 ), cyl( .1, .14, .5, [ 0, .41, 0 ], dk, 8 ), cyl( .075, .09, .12, [ 0, .72, 0 ], gd, 10 ), cyl( .042, .06, H - .75, [ 0, ( H + .72 ) / 2 - .02, 0 ], dk, 10 ), cyl( .07, .07, .05, [ 0, 1.6, 0 ], gd, 10 ), cyl( .06, .06, .04, [ 0, H - .35, 0 ], gd, 10 ) )
		I.push( cyl( .026, .026, .55, [ .22, H - .12, 0 ], dk, 6, [ 0, 0, Math.PI / 2 ] ), withColor( xf( new THREE.TorusGeometry( .14, .016, 6, 14, Math.PI * .9 ), [ .12, H - .22, 0 ], [ 0, 0, Math.PI * .25 ] ), dk ) ) // braço
		const lx = .46, ly = H - .1 // lanterna pendurada na ponta do braço
		I.push( cyl( .15, .04, .14, [ lx, ly + .26, 0 ], dk, 8 ), cyl( .03, .03, .08, [ lx, ly + .36, 0 ], gd, 8 ), cyl( .1, .1, .04, [ lx, ly - .02, 0 ], dk, 8 ) )
		G.push( cyl( .12, .085, .26, [ lx, ly + .12, 0 ], '#ffc86a', 10 ) ) // vidro aceso
		for ( let i = 0; i < 4; i ++ ) { const a = i * Math.PI / 2 + Math.PI / 4; I.push( cyl( .007, .007, .27, [ lx + Math.cos( a ) * .1, ly + .12, Math.sin( a ) * .1 ], dk, 4 ) ) }
		flush( I, ironMat, poste ); flush( G, glowMat, poste, false )
		const halo = new THREE.Sprite( new THREE.SpriteMaterial( { map: canvasTex( 128, 128, ( c, w, h ) => { const g = c.createRadialGradient( 64, 64, 0, 64, 64, 64 ); g.addColorStop( 0, 'rgba(255,214,140,.95)' ); g.addColorStop( .25, 'rgba(255,190,110,.4)' ); g.addColorStop( 1, 'rgba(255,170,90,0)' ); c.fillStyle = g; c.fillRect( 0, 0, w, h ) } ), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false } ) )
		halo.scale.setScalar( 1.5 ); halo.position.set( lx, ly + .12, 0 ); poste.add( halo ) }


	// --- estante de partitura, mesa de boteco e cadeira
	const stand = mkGroup( 'estante', 1.28, .42, - .75 ); reg( 'estante', 'Estante de partitura', stand )
	{ const I = [ cyl( .012, .012, 1.0, [ 0, .5, 0 ], '#1c1c1f', 6 ), cyl( .2, .22, .03, [ 0, .015, 0 ], '#1c1c1f', 16 ), cyl( .05, .08, .1, [ 0, .08, 0 ], '#1c1c1f', 10 ) ] // haste termina abaixo do papel (não atravessa)
		I.push( box( .4, .03, .07, [ 0, 1.0, .03 ], '#1c1c1f' ) ); flush( I, ironMat, stand )
		const pt = new THREE.TextureLoader().load( '/textures/set/carinhoso-partitura.png' ); pt.colorSpace = THREE.SRGBColorSpace; pt.anisotropy = 8
		const desk = new THREE.Group(); desk.position.set( 0, 1.27, .02 ); desk.rotation.x = - .2; stand.add( desk )
		const board = new THREE.Mesh( new THREE.BoxGeometry( .38, .53, .012 ), new THREE.MeshBasicNodeMaterial( { color: '#1c1c1f' } ) ); board.position.z = - .008; desk.add( board )
		const sheet = new THREE.Mesh( new THREE.PlaneGeometry( .36, .51 ), new THREE.MeshBasicNodeMaterial( { map: pt } ) ); desk.add( sheet ) }
	const mesa = mkGroup( 'mesa', - .82, .98, .4 ); reg( 'mesa', 'Mesa de boteco', mesa )
	{ const I = [ cyl( .02, .02, .72, [ 0, .38, 0 ], '#23262b', 8 ), cyl( .17, .19, .035, [ 0, .02, 0 ], '#23262b', 12 ) ], M = [ cyl( .3, .3, .03, [ 0, .735, 0 ], '#e6e2d8', 24 ) ], Gl = [], B = []
		for ( const [ x, z ] of [ [ - .1, .05 ], [ .14, - .1 ] ] ) { Gl.push( cyl( .034, .028, .11, [ x, .805, z ], '#d99a2b', 10 ) ); B.push( cyl( .035, .035, .025, [ x, .875, z ], '#f6efe0', 10 ) ) }
		B.push( cyl( .04, .04, .17, [ 0, .82, - .16 ], '#3a2410', 12 ), cyl( .016, .022, .1, [ 0, .95, - .16 ], '#3a2410', 8 ), cyl( .0465, .0465, .07, [ 0, .84, - .16 ], '#d9c9a0', 12 ) ) // garrafa com rótulo
		B.push( cyl( .11, .11, .008, [ .06, .75, .12 ], '#c9b99a', 14 ), cyl( .06, .06, .05, [ .06, .78, .12 ], '#2b2018', 12 ) ) // pires com cafezinho
		flush( I, ironMat, mesa ); flush( M, marbleMat, mesa ); flush( Gl, glassMat, mesa ); flush( B, woodMat, mesa ) }
	const cadeira = mkGroup( 'cadeira', .38, .42, -.35 ); reg( 'cadeira', 'Cadeira de bar', cadeira )
	{ const Wd = [ cyl( .21, .21, .035, [ 0, .45, 0 ], '#6a3f22', 18 ) ]
		for ( const [ x, z ] of [ [ - .15, - .15 ], [ .15, - .15 ], [ - .15, .15 ], [ .15, .15 ] ] ) Wd.push( cyl( .016, .014, .45, [ x, .225, z ], '#4a2c18', 6 ) )
		Wd.push( box( .35, .36, .03, [ 0, .69, - .165 ], '#6a3f22' ), box( .4, .06, .045, [ 0, .9, - .165 ], '#4a2c18' ), cyl( .018, .016, .45, [ - .185, .68, - .165 ], '#4a2c18', 6 ), cyl( .018, .016, .45, [ .185, .68, - .165 ], '#4a2c18', 6 ) ); flush( Wd, woodMat, cadeira ) }

	// --- notas musicais subindo (sprites douradas)
	const notes = []; { const r = rndFn( 5 ); for ( let i = 0; i < 9; i ++ ) { const t = noteTex.clone(); t.repeat.set( .25, 1 ); t.offset.set( ( i % 4 ) * .25, 0 ); t.needsUpdate = true
		const s = new THREE.Sprite( new THREE.SpriteMaterial( { map: t, transparent: true, depthWrite: false, fog: false } ) ); s.scale.setScalar( .24 ); room.add( s ); notes.push( { s, ph: i / 9, sp: .13 + r() * .06, sw: .12 + r() * .12, drift: ( r() - .5 ) * 1.4, z: .5 + r() * .5 } ) } }
	const mouth = { x: 0.45, y: 1.85, z: .6 } // as notas nascem acima da cabeça (não cobrem o rosto)
	const animTick = dt => {
		if ( ! new URLSearchParams( location.search ).has( 'bonde' ) ) time.value += dt; tramX.value = - 27 + ( ( time.value / 30 ) % 1 ) * 54
		for ( const n of notes ) { n.ph = ( n.ph + dt * n.sp ) % 1; const k = n.ph; n.s.position.set( mouth.x + n.drift * k + Math.sin( k * 9 + n.sw * 40 ) * n.sw, mouth.y + k * 1.75, n.z ); n.s.material.opacity = Math.min( 1, k * 6 ) * Math.min( 1, ( 1 - k ) * 2.2 ); n.s.scale.setScalar( .18 + .12 * Math.min( 1, k * 2 ) ) }
	}

	// --- painel de posições
	const LKEY = 'legado.layout.pixinguinha.v1', saved = ( () => { try { return JSON.parse( localStorage.getItem( LKEY ) ) || {} } catch { return {} } } )()
	const marker = new THREE.Mesh( new THREE.RingGeometry( .32, .37, 48 ).rotateX( - Math.PI / 2 ), new THREE.MeshBasicNodeMaterial( { color: '#ffd27a', transparent: true, opacity: .9, depthTest: false } ) ); marker.renderOrder = 20; marker.visible = false; room.add( marker )
	const objectSpec = [ [ 'x', 'Ao longo do nicho', -2.5, 2.5, .01, 'm' ], [ 'y', 'Altura', -.5, 2, .01, 'm' ], [ 'z', 'Frente / fundo', -3, 3.5, .01, 'm' ], [ 'rot', 'Giro', -180, 180, 1, '°' ] ]
	const offsets = ( limit, labels ) => [ 'x', 'y', 'z' ].map( ( axis, i ) => [ axis, labels[ i ], -limit, limit, .005, 'm' ] )
	const rotation = [ 'rx', 'ry', 'rz' ].map( ( axis, i ) => [ axis, 'Giro ' + 'XYZ'[ i ], -180, 180, 1, '°' ] )
	const axes = [ 'Lado (X)', 'Altura (Y)', 'Frente / fundo (Z)' ]
	const handSpec = [ ...offsets( .35, axes ), ...rotation ]
	const armSpec = [ ...offsets( .15, [ 'Ombro X', 'Ombro Y', 'Ombro Z' ] ), [ 'swivel', 'Direção do cotovelo', -180, 180, 1, '°' ], [ 'bend', 'Ajuste da dobra', -120, 120, 1, '°' ] ]
	const saxSpec = [ ...offsets( .5, axes ), ...rotation, [ 'scale', 'Tamanho', 25, 175, 1, '%' ] ]
	const fields = Object.fromEntries( [ ...objectSpec, ...handSpec, ...armSpec, ...saxSpec ].map( field => [ field[ 0 ], field ] ) )
	const describe = spec => Object.fromEntries( spec.map( ( [ key, label, min, max, step, unit ] ) => [ key, { label, min, max, step, unit } ] ) )
	const order = Object.keys( objs )
	let current = order[ 0 ], pose, open = false
	const apply = k => {
		const o = objs[ k ], v = o.val
		if ( o.grp ) {
			o.grp.position.set( v.x, v.y, v.z )
			o.grp.rotation.y = o.base + v.rot * Math.PI / 180
			if ( k === current ) marker.position.set( v.x, v.y + .05, v.z )
		}
	}
	const load = k => {
		const o = objs[ k ]
		o.val = { ...o.def }
		for ( const key of Object.keys( o.def ) ) {
			const value = saved?.[ k ]?.[ key ]
			if ( Number.isFinite( value ) ) {
				const { min, max } = o.fields[ key ]
				o.val[ key ] = THREE.MathUtils.clamp( value, min, max )
			}
		}
		apply( k )
	}
	for ( const k of order ) { objs[ k ].fields = describe( objectSpec ); load( k ) }
	const refresh = () => {
		marker.visible = open && !!objs[ current ].grp
		pose?.setEditing( open && !!objs[ current ].pose )
	}
	const desk = {
		meta: { startClosed: true, closeOnSave: true, title: 'Pixinguinha · ajustes', savedMessage: 'Ajustes do Pixinguinha e do cenário salvos neste navegador', spec: Object.values( fields ), override: k => objs[ k ].fields },
		keys: () => order, label: k => objs[ k ].label, get: k => ( { ...objs[ k ].val } ),
		set( k, prop, v ) {
			const field = objs[ k ].fields[ prop ], value = Number( v )
			if ( !field || !Number.isFinite( value ) ) return
			objs[ k ].val[ prop ] = THREE.MathUtils.clamp( value, field.min, field.max )
			apply( k )
			pose?.update( 0 )
		},
		select( k ) { current = k; apply( k ); refresh() },
		marker( on ) { open = on; refresh() },
		save() { try { localStorage.setItem( LKEY, JSON.stringify( desk.all() ) ); return true } catch { return false } },
		reset( k ) {
			for ( const key of k ? [ k ] : order ) { objs[ key ].val = { ...objs[ key ].def }; apply( key ) }
			if ( !k ) try { localStorage.removeItem( LKEY ) } catch {}
			pose?.update( 0 )
		},
		all: () => Object.fromEntries( order.map( k => [ k, { ...objs[ k ].val } ] ) ),
	}
	const attachPose = character => {
		pose = character
		const addPose = ( key, label, spec, defaults ) => {
			objs[ key ] = { label, def: defaults ?? Object.fromEntries( spec.map( ( [ field ] ) => [ field, 0 ] ) ), fields: describe( spec ), pose: true }
			load( key )
		}
		reg( 'personagem', 'Pixinguinha · corpo', character.holder )
		objs.personagem.fields = describe( objectSpec )
		objs.personagem.pose = true
		load( 'personagem' )
		addPose( 'maoE', 'Mão esquerda', handSpec )
		addPose( 'maoD', 'Mão direita', handSpec )
		addPose( 'bracoE', 'Braço esquerdo', armSpec )
		addPose( 'bracoD', 'Braço direito', armSpec )
		addPose( 'sax', 'Saxofone', saxSpec, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 100 } )
		order.unshift( 'personagem', 'maoE', 'maoD', 'bracoE', 'bracoD', 'sax' )
		return key => objs[ key ].val
	}

	// luz: lua azulada de trás e o poste, quente, de frente/lado
	const moon = new THREE.SpotLight( '#a9b8ff', 5, 12, 1.1, .9, 1.4 ); moon.position.set( - .8, 5.4, ZB + .2 ); moon.target.position.set( .3, .6, .3 ); room.add( moon, moon.target )
	const lamp = new THREE.SpotLight( '#ffc27a', 22, 9, 1.0, .85, 1.5 ); lamp.position.set( LAPA.lamp.x + .46, LAPA.lamp.h - .05, LAPA.lamp.z ); lamp.target.position.set( .45, 1.0, .55 ); room.add( lamp, lamp.target )
	return { room, sun: moon, desk, attachPose, seatDefault: { ...objs.cadeira.def, yaw: objs.cadeira.base }, walkMaxX: () => 9.9, anim: { update: animTick, getStats: () => ( { t: +time.value.toFixed( 1 ) } ) } }
}
