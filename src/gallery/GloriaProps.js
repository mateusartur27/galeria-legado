import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU, withColor, xf, canvasTex } from './PeriodRoom.js';

// Adereços da orla de Copacabana, todos procedurais (geometria com cor por vértice, um merge por tipo).
const rndFn = seed => { let s = seed; return () => ( s = ( Math.imul( s, 1664525 ) + 1013904223 ) >>> 0 ) / 4294967296 }
const clean = g => { const o = g.index ? g.toNonIndexed() : g; for ( const k of Object.keys( o.attributes ) ) if ( ! [ 'position', 'normal', 'color' ].includes( k ) ) o.deleteAttribute( k ); if ( ! o.attributes.normal ) o.computeVertexNormals(); return o }
export const merge = list => mergeGeometries( list.map( clean ), false )
const V = ( x, y, z ) => new THREE.Vector3( x, y, z )
const Y = V( 0, 1, 0 )

// peça cilíndrica/cônica orientada de A até B
function limb( a, b, r0, r1, hex, seg = 10, open = false ) {
	const d = b.clone().sub( a ), len = d.length(), g = new THREE.CylinderGeometry( r1, r0, len, seg, 1, open )
	g.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( Y, d.normalize() ) ); const m = a.clone().add( b ).multiplyScalar( .5 ); g.translate( m.x, m.y, m.z ); return withColor( g, hex )
}
const lathe = ( prof, hex, seg = 20 ) => withColor( new THREE.LatheGeometry( prof.map( p => new THREE.Vector2( p[ 0 ], p[ 1 ] ) ), seg ), hex )

// ---------- poste de luz da orla: base com friso, fuste fino com anéis, dois braços em S e globos leitosos ----------
// retorna { body (geometria com cor por vértice), glass (globos) } — o vidro vai com material emissivo próprio
export function lampPost( { H = 3.7, green = '#1e2f2a', gold = '#b99a52' } = {} ) {
	const body = []
	body.push( lathe( [ [ 0, 0 ], [ .2, 0 ], [ .2, .05 ], [ .17, .09 ], [ .17, .14 ], [ .12, .2 ], [ .12, .55 ], [ .15, .6 ], [ .15, .66 ], [ .1, .72 ], [ .075, .8 ], [ .062, 1.0 ], [ .055, H - .35 ], [ .07, H - .3 ], [ .0, H - .3 ] ], green ) )
	for ( const y of [ .62, .9, 1.9 ] ) body.push( withColor( new THREE.TorusGeometry( .068 + ( y < 1 ? .035 : 0 ), .012, 8, 22 ).rotateX( Math.PI / 2 ).translate( 0, y, 0 ), gold ) ) // anéis dourados
	for ( let i = 0; i < 6; i ++ ) body.push( withColor( new THREE.BoxGeometry( .018, .34, .018 ).translate( Math.cos( i / 6 * TAU ) * .122, .37, Math.sin( i / 6 * TAU ) * .122 ), '#2a413a' ) ) // frisos do pedestal
	const glass = []
	const topY = H - .3
	body.push( withColor( new THREE.SphereGeometry( .06, 12, 10 ).translate( 0, topY + .05, 0 ), gold ) )
	for ( const s of [ - 1, 1 ] ) { // braço em S: sobe, abre e termina em suporte do globo
		const pts = [ V( 0, topY - .55, 0 ), V( s * .08, topY - .3, 0 ), V( s * .34, topY - .22, 0 ), V( s * .52, topY - .05, 0 ), V( s * .58, topY + .16, 0 ) ]
		body.push( withColor( new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts ), 24, .016, 8 ), green ) )
		body.push( withColor( new THREE.TorusGeometry( .06, .01, 8, 18 ).rotateX( Math.PI / 2 ).translate( s * .58, topY + .15, 0 ), gold ) )
		body.push( lathe( [ [ 0, 0 ], [ .075, .005 ], [ .05, .05 ], [ .028, .09 ], [ 0, .09 ] ], green, 14 ).translate( s * .58, topY + .08, 0 ) )
		glass.push( new THREE.SphereGeometry( .165, 22, 16 ).translate( s * .58, topY + .31, 0 ) )
		body.push( lathe( [ [ .14, 0 ], [ .17, .03 ], [ .1, .1 ], [ .035, .16 ], [ 0, .19 ] ], green, 16 ).translate( s * .58, topY + .43, 0 ) ) // chapéu
	}
	return { body: merge( body ), glass: merge( glass.map( g => withColor( g, '#fff3d2' ) ) ) }
}

// ---------- coqueiro: tronco anelado levemente curvo + copa de folhas pinadas caídas ----------
export function palm( seed, H = 7 ) {
	const r = rndFn( seed ), parts = [], lean = ( r() - .5 ) * .9, bend = ( r() - .5 ) * 1.1, seg = 46
	const P = []; for ( let i = 0; i <= seg; i ++ ) { const t = i / seg; P.push( V( lean * t + Math.sin( t * Math.PI * .6 ) * bend * .7, t * H, Math.sin( t * 4 ) * .08 ) ) }
	for ( let i = 0; i < seg; i ++ ) {
		const t = i / seg, rr0 = .23 - .1 * t + ( i < 4 ? .08 * ( 4 - i ) / 4 : 0 ), rr1 = .23 - .1 * ( t + 1 / seg ), ring = i % 2 ? '#8a7a64' : '#74664f'
		parts.push( limb( P[ i ], P[ i + 1 ], rr0 * 1.02, rr1 * 1.02, ring, 9, true ) )
	}
	const top = P[ seg ].clone(), pos = [], col = [], c1 = new THREE.Color( '#2d7a3a' ), c2 = new THREE.Color( '#58a24a' ), c3 = new THREE.Color( '#9bb04a' )
	const push = ( p, c ) => { pos.push( p.x, p.y, p.z ); col.push( c.r, c.g, c.b ) }
	const nF = 26
	for ( let f = 0; f < nF; f ++ ) {
		const yaw = f * 2.39996 + r() * .3, young = f > nF - 6, e0 = young ? .9 + r() * .3 : .35 - r() * .65, L = young ? 2.2 + r() * .5 : 3.0 + r() * .8
		const dirH = V( Math.cos( yaw ), 0, Math.sin( yaw ) ), side = V( - Math.sin( yaw ), 0, Math.cos( yaw ) ), spine = [], N = 12
		for ( let k = 0; k <= N; k ++ ) { const s = k / N; spine.push( top.clone().addScaledVector( dirH, s * L * Math.cos( e0 ) ).addScaledVector( Y, s * L * Math.sin( e0 ) - s * s * L * ( young ? .35 : 1.0 ) ) ) }
		for ( let k = 0; k < N; k ++ ) parts.push( limb( spine[ k ], spine[ k + 1 ], .028 * ( 1 - k / N ) + .006, .028 * ( 1 - ( k + 1 ) / N ) + .006, '#6f8a3e', 5 ) )
		for ( let k = 1; k <= N; k ++ ) {
			const s = k / N, p = spine[ k ], t = spine[ Math.min( k + 1, N ) ].clone().sub( spine[ k - 1 ] ).normalize(), ll = ( .3 + .95 * Math.sin( Math.PI * Math.min( s * 1.08, 1 ) ) ) * ( young ? .8 : 1 ) + .06
			for ( const sd of [ - 1, 1 ] ) for ( const dr of [ .55, .12 ] ) {
				const tip = p.clone().addScaledVector( side, sd * ll * .8 ).addScaledVector( Y, - ll * ( dr + .4 * s * dr ) ).addScaledVector( t, ll * .45 )
				const b0 = p.clone().addScaledVector( t, - .09 ), b1 = p.clone().addScaledVector( t, .17 )
				push( b0, c1 ); push( tip, k % 2 ? c2 : c3 ); push( b1, c1 )
			}
		}
	}
	const leaves = new THREE.BufferGeometry(); leaves.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) ); leaves.setAttribute( 'color', new THREE.Float32BufferAttribute( col, 3 ) ); leaves.computeVertexNormals()
	for ( let i = 0; i < 7; i ++ ) { const a = i / 7 * TAU + r(); parts.push( withColor( new THREE.SphereGeometry( .095, 8, 6 ).translate( top.x + Math.cos( a ) * .2, top.y - .18 - r() * .08, top.z + Math.sin( a ) * .2 ), '#7a8a3c' ) ) } // cacho de cocos
	return { trunk: merge( parts ), leaves }
}

// ---------- guarda-sol de praia (8 gomos, cor alternada com branco) ----------
export function umbrella( hex, { R = 1.15, tilt = .1 } = {} ) {
	const cone = new THREE.ConeGeometry( R, .34, 8, 1, true ).toNonIndexed(), n = cone.attributes.position.count, col = new Float32Array( n * 3 ), A = new THREE.Color( hex ), B = new THREE.Color( '#f4f1ea' )
	for ( let i = 0; i < n / 3; i ++ ) { const c = i % 2 ? A : B; for ( let k = 0; k < 3; k ++ ) { col[ ( i * 3 + k ) * 3 ] = c.r; col[ ( i * 3 + k ) * 3 + 1 ] = c.g; col[ ( i * 3 + k ) * 3 + 2 ] = c.b } }
	cone.setAttribute( 'color', new THREE.BufferAttribute( col, 3 ) ); cone.translate( 0, 2.05, 0 )
	const pole = withColor( new THREE.CylinderGeometry( .02, .02, 2.2, 8 ).translate( 0, 1.1, 0 ), '#dedcd6' ), tip = withColor( new THREE.SphereGeometry( .035, 8, 6 ).translate( 0, 2.24, 0 ), '#dedcd6' )
	return merge( [ cone, pole, tip ].map( g => xf( g, [ 0, 0, 0 ], [ tilt, 0, tilt * .5 ] ) ) )
}

// ---------- cadeira de praia: estrutura de alumínio + lona listrada ----------
export function beachChair( hex ) {
	const parts = [], al = '#c9ced4'
	parts.push( withColor( xf( new THREE.BoxGeometry( .5, .03, .42 ), [ 0, .2, 0 ] ), hex ), withColor( xf( new THREE.BoxGeometry( .5, .46, .03 ), [ 0, .42, - .26 ], [ - .35, 0, 0 ] ), hex ) )
	for ( const x of [ - .24, .24 ] ) { parts.push( limb( V( x, .2, .2 ), V( x, 0, .28 ), .012, .012, al, 6 ), limb( V( x, .2, - .2 ), V( x, 0, - .3 ), .012, .012, al, 6 ), limb( V( x, .2, .2 ), V( x, .2, - .2 ), .012, .012, al, 6 ), limb( V( x, .2, - .2 ), V( x, .66, - .4 ), .012, .012, al, 6 ) )
	}
	return merge( parts )
}

// ---------- quiosque de praia: balcão branco, cobertura de palha em quatro águas, placa ----------
export function kiosk() {
	const body = [], thatch = [], W = 2.1, D = 1.2, H = 2.2
	body.push( withColor( xf( new THREE.BoxGeometry( W, 1.0, D ), [ 0, .5, 0 ] ), '#f1ece0' ), withColor( xf( new THREE.BoxGeometry( W + .12, .06, D + .12 ), [ 0, 1.03, 0 ] ), '#8a5a35' ), withColor( xf( new THREE.BoxGeometry( W + .1, .1, D + .1 ), [ 0, .05, 0 ] ), '#cfc9bb' ) )
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) body.push( limb( V( sx * ( W / 2 - .04 ), 1.0, sz * ( D / 2 - .04 ) ), V( sx * ( W / 2 - .04 ), H, sz * ( D / 2 - .04 ) ), .045, .045, '#7a5638', 8 ) )
	for ( let i = 0; i < 5; i ++ ) body.push( withColor( xf( new THREE.BoxGeometry( .3, .5, .02 ), [ - .8 + i * .4, .55, D / 2 + .005 ] ), [ '#d6483a', '#2f78c4', '#e8b93a', '#33a57a', '#d6483a' ][ i ] ) ) // faixas coloridas do balcão
	const roof = new THREE.ConeGeometry( 1.75, .85, 4, 1, true ).rotateY( Math.PI / 4 ).scale( 1, 1, D / W * 1.05 ).translate( 0, H + .42, 0 )
	thatch.push( withColor( roof, '#b9965a' ) )
	for ( let i = 0; i < 4; i ++ ) thatch.push( withColor( xf( new THREE.CylinderGeometry( .012, .012, 1.2, 5 ), [ Math.cos( i * Math.PI / 2 + Math.PI / 4 ) * .75, H + .42, Math.sin( i * Math.PI / 2 + Math.PI / 4 ) * .5 ] ), '#8a6a3c' ) )
	return { body: merge( body ), thatch: merge( thatch ), signW: W, signH: H }
}

export function signTexture( text, sub ) {
	return canvasTex( 512, 128, ( c, w, h ) => {
		c.fillStyle = '#f6efe0'; c.fillRect( 0, 0, w, h ); c.fillStyle = '#d6483a'; c.fillRect( 0, 0, w, 14 ); c.fillRect( 0, h - 14, w, 14 )
		c.textAlign = 'center'; c.fillStyle = '#1f4f8f'; c.font = 'bold 54px Georgia'; c.fillText( text, w / 2, 64 ); c.fillStyle = '#6a4a2a'; c.font = 'italic 28px Georgia'; c.fillText( sub, w / 2, 100 )
	} )
}
