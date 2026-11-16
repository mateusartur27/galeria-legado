import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texture, vec3, float, mix, vertexColor, positionLocal, dot, sin } from 'three/tsl';
import { canvasTex, withColor, xf } from './PeriodRoom.js';

// Pernas giradas 60°: uma fica sob a objetiva (-Z) e as outras duas atrás, deixando o vão central livre para o observador em +Z.
// Teodolito de bronze do século XIX sobre tripé de madeira. Origem = chão sob o prumo; luneta apontada para -Z (ocular em +Z).
// O eixo da luneta fica em HY + .33. Pontos de pega do André (ver Apoio/Scripts/andre_observando.py):
//   anel de foco da luneta em z = .14, botão do parafuso tangente vertical em x = .115, y = eixo - .13, z = .03.
const TAU = Math.PI * 2

// escala graduada gravada em prata (círculo): traços a cada grau, mais longos de 5 em 5 e de 10 em 10, números de 30 em 30
function scaleTexture( { numbers = true } = {} ) {
	return canvasTex( 1024, 1024, ( c, w, h ) => {
		const cx = w / 2, R = w / 2
		c.fillStyle = '#d9d4c0'; c.fillRect( 0, 0, w, h )
		const g = c.createRadialGradient( cx, cx, R * .5, cx, cx, R ); g.addColorStop( 0, 'rgba(255,255,240,.25)' ); g.addColorStop( 1, 'rgba(120,100,60,.28)' ); c.fillStyle = g; c.fillRect( 0, 0, w, h )
		c.strokeStyle = '#2a2418'; c.fillStyle = '#2a2418'; c.lineCap = 'butt'
		c.lineWidth = 3; c.beginPath(); c.arc( cx, cx, R * .985, 0, TAU ); c.stroke(); c.beginPath(); c.arc( cx, cx, R * .66, 0, TAU ); c.stroke()
		for ( let d = 0; d < 360; d ++ ) {
			const a = d * Math.PI / 180, len = d % 10 === 0 ? .17 : d % 5 === 0 ? .12 : .075
			c.lineWidth = d % 10 === 0 ? 3 : 1.6; c.beginPath(); c.moveTo( cx + Math.sin( a ) * R * .985, cx - Math.cos( a ) * R * .985 ); c.lineTo( cx + Math.sin( a ) * R * ( .985 - len ), cx - Math.cos( a ) * R * ( .985 - len ) ); c.stroke()
		}
		if ( numbers ) { c.font = 'bold 34px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'
			for ( let d = 0; d < 360; d += 30 ) { const a = d * Math.PI / 180; c.save(); c.translate( cx + Math.sin( a ) * R * .78, cx - Math.cos( a ) * R * .78 ); c.rotate( a ); c.fillText( String( d ), 0, 0 ); c.restore() } }
	} )
}
function plateTexture( text ) {
	return canvasTex( 512, 160, ( c, w, h ) => {
		c.fillStyle = '#cfc9b2'; c.fillRect( 0, 0, w, h ); c.strokeStyle = '#2a2418'; c.lineWidth = 4; c.strokeRect( 8, 8, w - 16, h - 16 )
		c.fillStyle = '#2a2418'; c.font = 'italic bold 44px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText( text[ 0 ], w / 2, h * .36 ); c.font = 'italic 30px Georgia'; c.fillText( text[ 1 ], w / 2, h * .70 )
	} )
}

export function buildTheodolite( { HY = 1.23, add, room, woodMat, ironMat, tri, galleryBrightness, warm } ) {
	const AY = HY + .33
	const theo = new THREE.Group(); theo.name = 'teodolito'; room.add( theo )
	// --- materiais
	const k = dot( tri( 5 ), vec3( .3, .6, .1 ) ).mul( 1.6 ).clamp( 0, 1 ) // variação de pátina
	const brass = new THREE.MeshStandardNodeMaterial( { color: '#ffffff', roughness: .3, metalness: .85, vertexColors: true } )
	{ const vc = vertexColor().rgb, brushed = sin( positionLocal.y.mul( 520 ).add( positionLocal.x.mul( 60 ) ).add( positionLocal.z.mul( 40 ) ) ).mul( .05 ).add( 1 ), col = vc.mul( mix( float( .8 ), float( 1.14 ), k ) ).mul( brushed )
		brass.colorNode = col; brass.roughnessNode = mix( float( .24 ), float( .5 ), k ); brass.emissiveNode = col.mul( warm ).mul( .26 ).mul( galleryBrightness ) }
	const silver = ( map, rough = .38 ) => { const m = new THREE.MeshStandardNodeMaterial( { map, roughness: rough, metalness: .55, polygonOffset: true, polygonOffsetFactor: - 4, polygonOffsetUnits: - 4 } ); m.emissiveNode = texture( map ).rgb.mul( warm ).mul( .3 ).mul( galleryBrightness ); return m }
	const glass = new THREE.MeshStandardNodeMaterial( { color: '#a9d6cb', roughness: .08, metalness: 0, transparent: true, opacity: .55 } ); glass.emissiveNode = vec3( .1, .22, .2 ).mul( galleryBrightness )
	const L = { wood: [], brass: [], iron: [] }
	const mats = { wood: woodMat, brass, iron: ironMat }
	const put = ( list, g, hex ) => { L[ list ].push( withColor( g, hex ) ) }
	const cyl = ( list, hex, rt, rb, h, seg, p, r = [ 0, 0, 0 ] ) => put( list, xf( new THREE.CylinderGeometry( rt, rb, h, seg ), p, r ), hex )
	const bx = ( list, hex, w, h, d, p, r = [ 0, 0, 0 ] ) => put( list, xf( new THREE.BoxGeometry( w, h, d ), p, r ), hex )
	const tor = ( list, hex, R, r, p, r3 = [ 0, 0, 0 ] ) => put( list, xf( new THREE.TorusGeometry( R, r, 8, 36 ), p, r3 ), hex )
	const BR = '#c79a4a', BRL = '#dcb465', BRD = '#9a7437', IR = '#2b2a28', DK = '#1b1a18'
	const limb = ( list, a, b, r0, r1, hex ) => { const A = new THREE.Vector3( ...a ), B = new THREE.Vector3( ...b ), d = B.clone().sub( A ), len = d.length(), mid = A.clone().add( B ).multiplyScalar( .5 )
		const g = new THREE.CylinderGeometry( r1, r0, len, 12 ); g.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), d.normalize() ) ); g.translate( mid.x, mid.y, mid.z ); put( list, g, hex ); return { A, B, q: new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), d ) } }

	// --- tripé: pernas afuniladas de nogueira, cintas e sapatas de ferro
	for ( let i = 0; i < 3; i ++ ) {
		const a = Math.PI / 2 + Math.PI / 3 + i * TAU / 3, fx = Math.cos( a ) * .66, fz = Math.sin( a ) * .66, hx = Math.cos( a ) * .075, hz = Math.sin( a ) * .075
		const l = limb( 'wood', [ fx, .045, fz ], [ hx, HY - .02, hz ], .019, .029, i % 2 ? '#6d4527' : '#74492a' )
		cyl( 'iron', IR, .008, .024, .075, 10, [ fx, .035, fz ] ); put( 'iron', new THREE.ConeGeometry( .008, .05, 8 ).rotateX( Math.PI ).translate( fx, .0, fz ), IR ) // sapata + ponta
		bx( 'iron', IR, .045, .012, .045, [ fx * 1.0, .075, fz * 1.0 ], [ 0, - a, 0 ] )
		for ( const [ t, h, r ] of [ [ .1, .04, .03 ], [ .5, .012, .027 ], [ .9, .05, .031 ] ] ) { const P = l.A.clone().lerp( l.B, t ); put( 'brass', new THREE.CylinderGeometry( r, r, h, 14 ).applyQuaternion( l.q ).translate( P.x, P.y, P.z ), t === .5 ? BRD : BR ) }
		bx( 'brass', BR, .055, .1, .028, [ hx * 1.12, HY - .035, hz * 1.12 ], [ 0, - a, 0 ] ) // dobradiça de latão
		cyl( 'iron', IR, .0075, .0075, .06, 8, [ hx * 1.12, HY - .035, hz * 1.12 ], [ 0, 0, Math.PI / 2 ] )
	}
	put( 'wood', new THREE.CylinderGeometry( .13, .13, .032, 3 ).rotateY( Math.PI / 2 + Math.PI / 3 ).translate( 0, HY - .005, 0 ), '#5a3820' ) // placa triangular do tripé
	tor( 'brass', BRD, .1, .006, [ 0, HY + .012, 0 ], [ Math.PI / 2, 0, 0 ] )
	put( 'iron', new THREE.CylinderGeometry( .0035, .0035, .24, 5 ).translate( 0, HY - .14, 0 ), '#8a8478' ) // fio de prumo
	put( 'brass', new THREE.ConeGeometry( .022, .06, 14 ).rotateX( Math.PI ).translate( 0, HY - .29, 0 ), BRL )
	tor( 'brass', BR, .007, .0025, [ 0, HY - .0, 0 ], [ Math.PI / 2, 0, 0 ] )

	// --- trivé com três parafusos de nivelamento
	for ( let i = 0; i < 3; i ++ ) { const a = i * TAU / 3 + .5, c = Math.cos( a ), s = Math.sin( a )
		bx( 'brass', BR, .13, .012, .028, [ c * .062, HY + .024, s * .062 ], [ 0, - a, 0 ] ) // braço do trivé
		cyl( 'brass', BRD, .006, .006, .036, 8, [ c * .118, HY + .028, s * .118 ] ) // haste
		cyl( 'brass', BRL, .021, .021, .016, 14, [ c * .118, HY + .034, s * .118 ] ); tor( 'brass', BRD, .021, .003, [ c * .118, HY + .034, s * .118 ], [ Math.PI / 2, 0, 0 ] ) // botão serrilhado
		put( 'brass', new THREE.ConeGeometry( .013, .016, 10 ).rotateX( Math.PI ).translate( c * .118, HY + .012, s * .118 ), BR ) }

	// --- limbo horizontal (círculo graduado de prata em aro de latão) e alidade
	cyl( 'brass', BR, .118, .122, .026, 48, [ 0, HY + .048, 0 ] )
	cyl( 'brass', BRD, .05, .06, .024, 32, [ 0, HY + .072, 0 ] )
	cyl( 'brass', BRL, .102, .102, .02, 48, [ 0, HY + .082, 0 ] ) // alidade
	for ( const sg of [ - 1, 1 ] ) { bx( 'brass', BRD, .034, .008, .022, [ sg * .104, HY + .093, 0 ] ); bx( 'iron', DK, .018, .003, .008, [ sg * .104, HY + .098, 0 ] ) } // verniers
	{ // nível de bolha
		bx( 'brass', BR, .105, .016, .024, [ 0, HY + .1, - .045 ] ); put( 'brass', xf( new THREE.CylinderGeometry( .0095, .0095, .09, 14 ), [ 0, HY + .113, - .045 ], [ 0, 0, Math.PI / 2 ] ), '#d8cba0' ) }
	cyl( 'brass', BRL, .016, .016, .026, 14, [ - .098, HY + .09, .04 ], [ 0, 0, Math.PI / 2 ] ); cyl( 'brass', BRD, .008, .008, .03, 8, [ - .12, HY + .09, .04 ], [ 0, 0, Math.PI / 2 ] ) // parafuso de pressão + tangente do limbo
	tor( 'brass', BRD, .1175, .004, [ 0, HY + .058, 0 ], [ Math.PI / 2, 0, 0 ] )

	// --- pedestal e colunas (suportes em A) com mancais no eixo horizontal
	cyl( 'brass', BR, .04, .058, .1, 28, [ 0, HY + .13, 0 ] ); tor( 'brass', BRD, .058, .006, [ 0, HY + .082, 0 ], [ Math.PI / 2, 0, 0 ] ); tor( 'brass', BRD, .042, .005, [ 0, HY + .18, 0 ], [ Math.PI / 2, 0, 0 ] )
	bx( 'brass', BR, .22, .02, .06, [ 0, HY + .19, 0 ] ) // travessa
	for ( const s of [ - 1, 1 ] ) {
		bx( 'brass', BR, .03, .13, .066, [ s * .085, HY + .27, 0 ] ); bx( 'brass', BRL, .026, .16, .05, [ s * .085, HY + .38, 0 ] ) // coluna com afunilamento
		cyl( 'brass', BRL, .033, .033, .03, 24, [ s * .085, AY, 0 ], [ 0, 0, Math.PI / 2 ] ) // mancal
		cyl( 'brass', BRD, .022, .022, .008, 20, [ s * .104, AY, 0 ], [ 0, 0, Math.PI / 2 ] )
		cyl( 'brass', BRL, .014, .018, .014, 16, [ s * .118, AY, 0 ], [ 0, 0, Math.PI / 2 ] ) }
	cyl( 'iron', IR, .0155, .0155, .24, 14, [ 0, AY, 0 ], [ 0, 0, Math.PI / 2 ] ) // eixo horizontal
	// parafuso tangente vertical: braço pendurado na coluna direita + botão onde o André põe a mão
	bx( 'brass', BRD, .01, .1, .02, [ .1, AY - .085, .03 ] ); bx( 'brass', BR, .02, .014, .026, [ .098, AY - .135, .03 ] )
	cyl( 'brass', BRD, .006, .006, .03, 8, [ .108, AY - .13, .03 ], [ 0, 0, Math.PI / 2 ] )
	cyl( 'brass', BRL, .021, .021, .02, 20, [ .125, AY - .13, .03 ], [ 0, 0, Math.PI / 2 ] ); tor( 'brass', BRD, .021, .0035, [ .125, AY - .13, .03 ], [ 0, Math.PI / 2, 0 ] ); cyl( 'brass', BR, .012, .012, .008, 12, [ .137, AY - .13, .03 ], [ 0, 0, Math.PI / 2 ] ) // botão serrilhado
	// parafuso de aperto na coluna esquerda
	cyl( 'brass', BRL, .016, .016, .02, 16, [ - .113, AY - .07, - .02 ], [ 0, 0, Math.PI / 2 ] ); cyl( 'brass', BRD, .007, .007, .02, 8, [ - .1, AY - .07, - .02 ], [ 0, 0, Math.PI / 2 ] )

	// --- luneta (grupo que gira no eixo)
	const tel = new THREE.Group(); tel.position.set( 0, AY, 0 ); tel.rotation.x = .03; theo.add( tel )
	const T = { brass: [], iron: [] }
	const tp = ( list, g, hex ) => T[ list ].push( withColor( g, hex ) )
	const tcyl = ( list, hex, rt, rb, h, seg, z, ox = 0, oy = 0 ) => tp( list, new THREE.CylinderGeometry( rt, rb, h, seg ).rotateX( Math.PI / 2 ).translate( ox, oy, z ), hex ) // eixo ao longo de Z (rt para +Z, a ocular)
	const ttor = ( hex, R, r, z, oy = 0 ) => tp( 'brass', new THREE.TorusGeometry( R, r, 8, 36 ).translate( 0, oy, z ), hex )
	tcyl( 'brass', '#c9a052', .028, .034, .46, 32, 0 ) // tubo afunilado
	tcyl( 'brass', BRL, .041, .047, .1, 32, - .27 ); ttor( BRD, .0475, .004, - .32 ); ttor( BRD, .042, .004, - .22 ) // guarda-sol da objetiva
	tp( 'iron', new THREE.CircleGeometry( .04, 28 ).translate( 0, 0, - .31 ), '#1a2a30' ) // lente
	tcyl( 'brass', '#8f6d33', .038, .038, .055, 36, .14 ) // anel de foco
	for ( let i = 0; i < 20; i ++ ) { const a = i * TAU / 20; tp( 'brass', xf( new THREE.BoxGeometry( .007, .0045, .052 ), [ Math.cos( a ) * .0395, Math.sin( a ) * .0395, .14 ], [ 0, 0, a + Math.PI / 2 ] ), BRD ) }
	ttor( BR, .0285, .004, .105 ); ttor( BR, .0285, .004, .175 ); ttor( BR, .0325, .0035, - .12 ); ttor( BR, .0325, .0035, - .18 )
	tcyl( 'brass', BRL, .015, .019, .1, 20, .265 ) // tubo da ocular
	tcyl( 'iron', DK, .0225, .018, .045, 24, .31 ); ttor( BRD, .0215, .004, .292 ) // copa de ebonite
	tp( 'iron', new THREE.CircleGeometry( .0155, 20 ).translate( 0, 0, .3335 ), '#0b0b0b' )
	tcyl( 'brass', BR, .0075, .0075, .24, 10, - .02, 0, .055 ); tp( 'brass', xf( new THREE.BoxGeometry( .01, .03, .012 ), [ 0, .04, .075 ] ), BRD ); tp( 'brass', xf( new THREE.BoxGeometry( .01, .03, .012 ), [ 0, .04, - .12 ] ), BRD ) // buscador
	tcyl( 'brass', BRL, .011, .011, .01, 14, - .145, 0, .055 ); tcyl( 'iron', DK, .0095, .0095, .012, 14, .105, 0, .055 )
	// círculo vertical (lado direito do André = +X do teodolito): disco de latão + aro de prata graduado + raios
	const VX = .1175
	tel.add( ( () => { const g = withColor( xf( new THREE.CylinderGeometry( .079, .079, .01, 56 ), [ VX - .006, 0, 0 ], [ 0, 0, Math.PI / 2 ] ), BR ), m = new THREE.Mesh( g, brass ); m.castShadow = true; return m } )() )
	const ring = new THREE.RingGeometry( .046, .076, 96 ); ring.rotateY( Math.PI / 2 ); ring.translate( VX + .0018, 0, 0 )
	{ const m = new THREE.Mesh( ring, silver( scaleTexture() ) ); m.receiveShadow = true; tel.add( m ) }
	for ( let i = 0; i < 4; i ++ ) { const a = i * Math.PI / 2 + .4; tp( 'brass', xf( new THREE.BoxGeometry( .008, .05, .012 ), [ VX - .004, Math.cos( a ) * .025, Math.sin( a ) * .025 ], [ a, 0, 0 ] ), BRD ) } // raios
	tcyl( 'brass', BRL, .02, .02, .01, 18, 0 ) // cubo no tubo
	tp( 'brass', xf( new THREE.CylinderGeometry( .02, .02, .028, 18 ), [ VX - .006, 0, 0 ], [ 0, 0, Math.PI / 2 ] ), BRL )
	tp( 'brass', xf( new THREE.CylinderGeometry( .01, .01, .12, 12 ), [ .06, 0, 0 ], [ 0, 0, Math.PI / 2 ] ), BRD )
	for ( const key of Object.keys( T ) ) if ( T[ key ].length ) { const m = new THREE.Mesh( mergeGeometries( T[ key ].map( g => g.index ? g.toNonIndexed() : g ), false ), mats[ key ] ); m.castShadow = true; m.receiveShadow = true; tel.add( m ) }

	// --- limbo horizontal graduado (aro de prata) e placa do fabricante
	{ const g = new THREE.RingGeometry( .082, .114, 96 ); g.rotateX( - Math.PI / 2 ); g.translate( 0, HY + .0628, 0 ); const m = new THREE.Mesh( g, silver( scaleTexture() ) ); m.receiveShadow = true; theo.add( m ) }
	{ const g = new THREE.PlaneGeometry( .074, .023 ); g.rotateY( - Math.PI / 2 ); g.translate( - .1026, AY - .105, 0 ); const m = new THREE.Mesh( g, silver( plateTexture( [ 'LONDON', 'N.º 1871' ] ), .45 ) ); theo.add( m ) }
	// bolha do nível: vidro por cima do tubo de latão
	{ const vial = new THREE.Mesh( new THREE.CylinderGeometry( .0075, .0075, .088, 14 ).rotateZ( Math.PI / 2 ), glass ); vial.position.set( 0, HY + .113, - .045 ); theo.add( vial )
	  const bubble = new THREE.Mesh( new THREE.SphereGeometry( .0055, 10, 8 ).scale( 2.4, 1, 1 ), new THREE.MeshBasicNodeMaterial( { color: '#f4f1d0' } ) ); bubble.position.set( .004, HY + .1135, - .045 ); theo.add( bubble ) }

	for ( const key of Object.keys( L ) ) if ( L[ key ].length ) add( mergeGeometries( L[ key ].map( g => g.index ? g.toNonIndexed() : g ), false ), mats[ key ], { cast: true, parent: theo } )
	return theo
}
