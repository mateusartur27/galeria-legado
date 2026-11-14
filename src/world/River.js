import * as THREE from 'three/webgpu'
import { Fn, attribute, uv, texture, time, positionWorld, vec2, vec4, float, color, mix, smoothstep, step, fract, abs, fwidth, min, max, length, atan, sin, normalize, pow } from 'three/tsl'
import { inkMRT, createToonMaterial } from '../render/ToonMaterial.js'
import { seaBands } from './Water.js'

// Água do rio (Terrain.riverData), cores medidas nos prints do Messenger, técnica reescrita por nós:
//   traçado   — centro do rio passado por Catmull-Rom (3 subdivisões por trecho): a água faz CURVA na borda de cada queda
//               (sai da borda arredondada e desce), sem quinas
//   corrente  — petróleo #206468 com manchas #307878 e claras #68c0c0 esticadas na corrente, risquinhos brancos,
//               degrau mais claro no raso (pela altura do chão), espuma de margem onde a lâmina encosta no chão
//   entrada   — `lip`: alguns metros antes de cada queda a água acelera e embranquece (espuma nas bordas e no meio)
//   cachoeira — lâmina clara com LISTRAS finas descendo rápido, duas faixas de brilho, sombra mais escura no pé,
//               bordas brancas recortadas (e furadas: a lâmina não tem borda reta) — `fallV` = 1 no topo, 0 no pé
//   impacto   — no pé de cada queda grande, coroa de espuma (disco com anéis que abrem e espuma rendada que se espalha)
//               + poucas bolhas toon; logo depois, espuma rendada rio abaixo (`foam`)
//   nascente  — poça redonda (riverData.pool) com anéis saindo do olho d'água e um borbulho branco
//   foz       — a fita abre em leque e passa a pintar a MESMA água do mar (seaBands): termina sem emenda
export class River {

	constructor( { look, terrain, palette, noiseTexture, sky } ) {

		const R = terrain.riverData
		const { pts, bed, width, depth } = R
		const sea = terrain.waterLevel
		const n = pts.length
		const seg = ( i ) => Math.max( 0.5, Math.hypot( pts[ i ][ 0 ] - pts[ i - 1 ][ 0 ], pts[ i ][ 1 ] - pts[ i - 1 ][ 1 ] ) )
		const sm = THREE.MathUtils.smoothstep
		// queda por metro de cada TRECHO (i-1 → i). O Terrain transforma as quedas em degraus (river.step): penhasco curto
		// quase vertical + poço plano — aqui cada trecho com queda > 0,5 m/m vira uma cortina
		const drop = pts.map( ( p, i ) => i ? ( bed[ i - 1 ] - bed[ i ] ) / seg( i ) : 0 )
		// degrau baixo (< 2,5 m) não vira cortina (de perto parecia um barril/caixa): é CORREDEIRA, rampa curta toda espumada
		const steep = ( i ) => i > 0 && i < n && drop[ i ] > 0.5
		const cliff = ( i ) => steep( i ) && bed[ i - 1 ] - bed[ i ] >= 2.5
		const rapid = ( i ) => steep( i ) && ! cliff( i )
		const surfY = bed.map( ( b ) => b + depth * 0.7 )
		let coast = surfY.findIndex( ( s ) => s < sea + 0.25 )
		if ( coast < 1 ) coast = n
		const P = R.pool
		const fromPool = ( i ) => P ? Math.hypot( pts[ i ][ 0 ] - P.x, pts[ i ][ 1 ] - P.z ) - P.r : Infinity

		// ---- valores por ponto do traçado grosso
		const Y = [], Wd = [], mouth = [], foam = [], lip = new Array( n ).fill( 0 ), bases = []
		let along = 0, coastAlong = 0, lastFoot = - 1e9, lastH = 0
		for ( let i = 0; i < n; i ++ ) {

			if ( i ) along += seg( i )
			if ( i === coast ) coastAlong = along
			const m = i < coast ? 0 : Math.min( 1, ( along - coastAlong ) / 16 )
			Y.push( Math.max( surfY[ i ], sea + 0.03 ) ) // rente ao mar na foz (por cima), nunca afunda nele
			Wd.push( fromPool( i ) < - 0.8 ? 0 : width[ i ] * 1.05 * ( 1 + m * 1.4 ) ) // dentro da poça some · leque na foz
			mouth.push( m )
			if ( cliff( i ) ) { lastFoot = along; lastH = bed[ i - 1 ] - bed[ i ] }
			// espuma rendada: forte logo depois de um penhasco, some em ~10 m (mais alto = mais espuma)
			foam.push( rapid( i ) || rapid( i + 1 ) ? 0.6 :cliff( i ) || cliff( i + 1 ) ? 0 : Math.min( 1, lastH / 4 ) * Math.max( 0, 1 - ( along - lastFoot ) / 10 ) )

		}
		for ( let i = 1; i < n; i ++ ) {

			if ( ! cliff( i ) ) continue
			// entrada: a água embranquece nos ~5 m antes da borda
			for ( let k = i - 1, d = 0; k >= 0 && d < 5 && ! cliff( k ); d += k ? seg( k ) : 5, k -- ) lip[ k ] = Math.max( lip[ k ], 1 - d / 5 )
			// pé (coroa de espuma, som) — quedas de verdade, antes do mar
			const h = Y[ i - 1 ] - Y[ i ]
			if ( h > 1.2 && i < coast && ! cliff( i + 1 ) ) {

				const a = pts[ i - 1 ], c = pts[ i ]
				const l = Math.hypot( c[ 0 ] - a[ 0 ], c[ 1 ] - a[ 1 ] ) || 1
				bases.push( { x: c[ 0 ], z: c[ 1 ], y: Y[ i ], dx: ( c[ 0 ] - a[ 0 ] ) / l, dz: ( c[ 1 ] - a[ 1 ] ) / l, w: width[ i ], power: Math.min( 1, h / 8 ) } )

			}

		}
		this.falls = bases // som (WaterFx)

		// ---- traçado fino. O caminho no CHÃO (xz) é uma Catmull-Rom centrípeta só em 2D; a altura é desenhada à parte:
		// em trecho plano, linear; no penhasco, arco de JATO (xz anda reto, y cai com s²) → a água sai na horizontal pela borda,
		// curva e despenca, sempre na frente da pedra (o carve do penhasco, ss(0,0.4,t), desce antes da água). Spline 3D
		// com 17 m de queda em 2 m de chão passava do ponto: a cortina torcia de lado e afundava no poço
		const SUB = 4, CSUB = 14 // subdivisões por trecho plano / por cortina
		const curve = new THREE.CatmullRomCurve3( pts.map( ( p ) => new THREE.Vector3( p[ 0 ], 0, p[ 1 ] ) ), false, 'centripetal' )
		const lerpAt = ( arr, f ) => { const i = Math.min( n - 2, Math.floor( f ) ), s = f - i; return arr[ i ] + ( arr[ i + 1 ] - arr[ i ] ) * s }
		const S = [ { i: 1, s: 0 } ] // amostras: trecho i (i-1 → i) e posição s nele
		for ( let i = 1; i < n; i ++ ) { const m = cliff( i ) ? CSUB : SUB; for ( let j = 1; j <= m; j ++ ) S.push( { i, s: j / m } ) }
		const C = S.map( ( { i, s } ) => {

			const p = curve.getPoint( ( i - 1 + s ) / ( n - 1 ) ) // t no ÍNDICE do ponto (getPoint não usa comprimento de arco)
			const top = Y[ i - 1 ], foot = Y[ i ]
			const onCliff = cliff( i ) && s > 0
			const q = Math.pow( s, 1.5 ) // s² fazia a curva da borda larga demais (de perto parecia um barril)
			p.y = onCliff ? top - ( top - foot ) * q : top + ( foot - top ) * s
			p.fv = onCliff ? 1 - q : 0.5
			p.cl = onCliff
			p.fa = onCliff ? Math.min( 1, s / 0.2 ) : 0 // rio → cortina nos 20% de cima (recortado por ruído no shader)
			p.f = i - 1 + s
			return p

		} )
		const N = C.length

		const pos = [], uvs = [], aFall = [], aFallV = [], aLip = [], aFoam = [], aMouth = [], index = []
		let dist = 0
		for ( let k = 0; k < N; k ++ ) {

			const a = C[ Math.max( 0, k - 1 ) ], b = C[ Math.min( N - 1, k + 1 ) ], c = C[ k ]
			let tx = b.x - a.x, tz = b.z - a.z
			const tl = Math.hypot( tx, tz ) || 1; tx /= tl; tz /= tl
			if ( k ) dist += c.distanceTo( C[ k - 1 ] ) // conta a altura: na cortina a textura não estica
			// a cortina abre um pouco descendo
			const w = lerpAt( Wd, c.f ) * ( c.cl ? 1 + ( 1 - c.fv ) * 0.2 : 1 )
			for ( const s of [ - 1, 1 ] ) {

				pos.push( c.x - tz * w * s, c.y, c.z + tx * w * s )
				uvs.push( s < 0 ? 0 : 1, dist )
				aFall.push( c.fa )
				aFallV.push( c.fv )
				aLip.push( lerpAt( lip, c.f ) )
				aFoam.push( lerpAt( foam, c.f ) )
				aMouth.push( lerpAt( mouth, c.f ) )

			}
			if ( k < N - 1 ) { const j = k * 2; index.push( j, j + 2, j + 1, j + 1, j + 2, j + 3 ) }

		}

		const geo = new THREE.BufferGeometry()
		geo.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) )
		geo.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) )
		geo.setAttribute( 'fall', new THREE.Float32BufferAttribute( aFall, 1 ) )
		geo.setAttribute( 'fallV', new THREE.Float32BufferAttribute( aFallV, 1 ) )
		geo.setAttribute( 'lip', new THREE.Float32BufferAttribute( aLip, 1 ) )
		geo.setAttribute( 'foam', new THREE.Float32BufferAttribute( aFoam, 1 ) )
		geo.setAttribute( 'mouth', new THREE.Float32BufferAttribute( aMouth, 1 ) )
		geo.setIndex( index )
		geo.computeVertexNormals()

		const W = palette.riverColors ?? {}
		const deep = color( W.deep ?? '#206468' ), mid = color( W.mid ?? '#307878' ), light = color( W.light ?? '#68c0c0' )
		const fallDark = color( W.fallDark ?? '#086868' ), fallMid = color( W.fallMid ?? '#50b0b0' ), white = color( W.foam ?? '#f0f8e8' )
		const pale = color( W.shine ?? '#b4e4e4' ) // brilho da lâmina
		const tex = ( q ) => texture( noiseTexture, q )
		const aa = ( v ) => fwidth( v ).max( 1e-4 )
		const over = ( v, t ) => smoothstep( t, aa( v ).add( t ), v ) // 1 onde v > t, borda nítida sem serrilhado
		const ground = () => texture( terrain.heightTexture, terrain.worldToUV( positionWorld.xz ) ).r
		const waterDepth = () => positionWorld.y.sub( ground() ) // profundidade de verdade sob a lâmina
		// espuma de margem: onde a lâmina encosta no chão, recortada por ruído (mesma regra na poça)
		const shoreFoam = ( dW, t ) => {

			const nb = tex( positionWorld.xz.mul( 0.21 ).add( t.mul( 0.02 ) ) ).g
			return float( 1 ).sub( over( dW.add( nb.sub( 0.5 ).mul( 0.14 ) ), float( 0.07 ) ) )

		}

		const material = new THREE.MeshBasicNodeMaterial( { side: THREE.DoubleSide } )
		material.alphaTest = 0.5
		// rio → cortina nos 20% de cima da queda (atributo em rampa). Testado recortar com ruído: +0,7 ms (vai no opacityNode
		// também) e quase não aparece — fica a rampa
		const fallM = smoothstep( 0.4, 0.6, attribute( 'fall', 'float' ) )
		const fv = attribute( 'fallV', 'float' )
		const mouthM = attribute( 'mouth', 'float' )
		material.colorNode = Fn( () => {

			const u = uv().x, v = uv().y
			const across = abs( u.sub( 0.5 ) ).mul( 2 ) // 0 meio · 1 margem
			const t = time
			const dW = waterDepth()
			// ---- corrente: manchas médias grandes e claras compridas, recortadas, andando rio abaixo (v cresce rio abaixo)
			const flowUV = vec2( u.mul( 0.35 ), v.mul( 0.05 ).sub( t.mul( 0.05 ) ) )
			const m1 = tex( flowUV ).r.add( tex( flowUV.mul( 2.7 ).add( 3.1 ) ).g.mul( 0.35 ) )
			const m2 = tex( vec2( u.mul( 1.1 ), v.mul( 0.016 ).sub( t.mul( 0.022 ) ) ).add( 7.7 ) ).b.add( tex( vec2( u.mul( 2.6 ), v.mul( 0.05 ).sub( t.mul( 0.05 ) ) ).add( 1.1 ) ).r.mul( 0.25 ) )
			const water = mix( deep, mid, over( m1, float( 0.82 ) ) ).toVar()
			water.assign( mix( water, mid, float( 1 ).sub( over( dW.add( m1.sub( 0.6 ).mul( 0.25 ) ), float( 0.32 ) ) ) ) ) // raso
			water.assign( mix( water, light, over( m2, float( 0.88 ) ).mul( 0.85 ) ) )
			// risquinhos brancos: traços curtos ao longo da corrente, perto das margens
			const sv = v.mul( 0.5 ).sub( t.mul( 0.35 ) )
			const dashN = tex( vec2( u.mul( 3.1 ), sv.mul( 0.11 ) ).add( 1.3 ) ).g
			const lane = fract( u.mul( 7 ) ), aaL = aa( u.mul( 7 ) )
			const thin = float( 1 ).sub( smoothstep( aaL.mul( 0.8 ), aaL.mul( 1.6 ), abs( lane.sub( 0.5 ) ) ) )
			water.assign( mix( water, white, smoothstep( 0.66, 0.7, dashN ).mul( thin ).mul( smoothstep( 0.35, 0.7, across ) ) ) )
			// ---- entrada da queda: a água acelera e embranquece (espuma nas bordas e manchas no meio, cada vez mais perto da borda)
			const lp = attribute( 'lip', 'float' )
			const lf = tex( vec2( u.mul( 0.8 ), v.mul( 0.22 ).sub( t.mul( 0.6 ) ) ).add( 8.1 ) ).r.add( across.mul( 0.35 ) )
			water.assign( mix( water, white, over( lf.add( lp.mul( 0.55 ) ), float( 1.18 ) ).mul( step( 0.01, lp ) ) ) )
			// ---- cortina (estudo do print do Messenger, pintura nossa): corpo claro em cima que escurece até o pé, "chamas" claras
			// penduradas da borda (compridas em v, terminam em ponta mais cedo embaixo), 1–2 fios finos, bordas brancas
			// CONTÍNUAS (linha, não furos), luz na curva da borda de cima e espuma lisa no pé
			const nF = tex( vec2( u.mul( 2.2 ).add( t.mul( 0.004 ) ), v.mul( 0.022 ).sub( t.mul( 0.3 ) ) ).add( 4.2 ) ).r
			const body = mix( fallDark, fallMid, smoothstep( 0.05, 0.8, fv.add( nF.sub( 0.5 ).mul( 0.2 ) ) ) )
			const flame = over( nF.add( fv.sub( 0.55 ).mul( 0.7 ) ), float( 0.58 ) )
			const sheet = mix( body, pale, flame.mul( 0.9 ) ).toVar()
			const n1 = tex( vec2( u.mul( 1.3 ).add( t.mul( 0.01 ) ), v.mul( 0.03 ).sub( t.mul( 0.55 ) ) ) ).r
			const streak = over( pow( float( 1 ).sub( abs( n1.sub( 0.5 ) ).mul( 2 ) ), 3 ), float( 0.93 ) )
			const e = float( 1 ).sub( across ).add( tex( vec2( u.mul( 0.3 ), v.mul( 0.06 ).sub( t.mul( 0.4 ) ) ).add( 3.3 ) ).r.sub( 0.5 ).mul( 0.05 ) )
			sheet.assign( mix( sheet, white, max( streak, float( 1 ).sub( over( e, float( 0.12 ) ) ) ) ) )
			sheet.assign( mix( sheet, pale.mul( 1.08 ), over( fv.add( nF.sub( 0.5 ).mul( 0.02 ) ), float( 0.985 ) ).mul( 0.7 ) ) ) // luz fina na curva de cima
			sheet.assign( mix( sheet, white, float( 1 ).sub( over( fv.add( n1.mul( 0.05 ) ), float( 0.06 ) ) ) ) ) // espuma no pé
			const col = mix( water, sheet, fallM ).toVar()
			// ---- depois da queda: espuma rendada que se abre rio abaixo
			const fo = attribute( 'foam', 'float' )
			const fn = tex( vec2( u.mul( 0.9 ), v.mul( 0.16 ).sub( t.mul( 0.12 ) ) ).add( 2.2 ) ).r.add( tex( vec2( u.mul( 2.3 ), v.mul( 0.4 ) ).add( 9.1 ) ).g.mul( 0.3 ) )
			const froth = smoothstep( float( 1.25 ).sub( fo ), float( 1.25 ).sub( fo ).add( aa( fn ) ), fn )
			col.assign( mix( col, white, min( float( 1 ), froth ).mul( float( 1 ).sub( fallM ) ) ) )
			// ---- margem
			col.assign( mix( col, white, shoreFoam( dW, t ).mul( float( 1 ).sub( fallM ) ).mul( float( 1 ).sub( mouthM ) ) ) )
			// ---- foz: vira a água do mar (mesma função, mesma profundidade) → a ponta da fita some no mar
			const seaCol = seaBands( { depth: float( sea ).sub( ground() ).max( 0 ), palette, noiseTexture, sky } )
			col.assign( mix( col, seaCol, smoothstep( 0.0, 0.8, mouthM ) ) )
			return vec4( col, 1 )

		} )()
		// fita que ficou no AR (curva do traçado cortando a margem, chão bem abaixo da lâmina fora de cortina/foz): corta
		material.opacityNode = float( 1 ).sub( float( 1 ).sub( fallM ).mul( float( 1 ).sub( mouthM ) ).mul( step( 1.5, waterDepth() ) ) )
		material.mrtNode = inkMRT( 0 )

		this.group = new THREE.Group()
		this.mesh = new THREE.Mesh( geo, material )
		this.mesh.receiveShadow = false
		this.group.add( this.mesh )

		// ---- nascente: disco na altura da lâmina, do tamanho da bacia (a borda de chão, +0,3 m, recorta o contorno)
		if ( P ) {

			const poolMat = new THREE.MeshBasicNodeMaterial()
			const c = vec2( P.x, P.z )
			poolMat.colorNode = Fn( () => {

				const t = time
				const xz = positionWorld.xz
				const d = length( xz.sub( c ) )
				const dW = waterDepth()
				const nA = tex( xz.mul( 0.16 ).add( t.mul( 0.015 ) ) )
				const col = mix( deep, mid, float( 1 ).sub( over( dW.add( nA.r.sub( 0.5 ).mul( 0.3 ) ), float( 0.45 ) ) ) ).toVar()
				// anéis saindo do olho d'água, quebrados pelo ângulo, somem perto da borda
				const ang = atan( xz.y.sub( c.y ), xz.x.sub( c.x ) )
				const ringP = d.mul( 0.85 ).sub( t.mul( 0.55 ) )
				const ring = float( 1 ).sub( smoothstep( aa( ringP ).mul( 0.9 ), aa( ringP ).mul( 2 ), abs( fract( ringP ).sub( 0.5 ) ) ) )
				const brk = tex( vec2( ang.mul( 0.48 ), ringP.floor().mul( 0.37 ) ) ).g
				col.assign( mix( col, light, ring.mul( step( 0.45, brk ) ).mul( float( 1 ).sub( smoothstep( P.r * 0.35, P.r * 0.8, d ) ) ) ) )
				// borbulho: mancha branca recortada que pulsa no meio
				const boil = tex( xz.mul( 0.9 ).add( vec2( t.mul( 0.3 ), t.mul( - 0.2 ) ) ) ).b
				const r0 = sin( t.mul( 3.1 ) ).mul( 0.12 ).add( 0.55 ).add( boil.sub( 0.5 ).mul( 0.5 ) )
				col.assign( mix( col, white, float( 1 ).sub( smoothstep( r0.sub( aa( d ) ), r0.add( aa( d ) ), d ) ) ) )
				col.assign( mix( col, white, shoreFoam( dW, t ) ) )
				return vec4( col, 1 )

			} )()
			// fora da bacia (encosta caindo) o disco ficaria no ar: corta onde o chão está bem abaixo do fundo da poça
			poolMat.alphaTest = 0.5
			poolMat.opacityNode = step( waterDepth(), float( 1.0 ) )
			poolMat.mrtNode = inkMRT( 0 )
			this.pool = new THREE.Mesh( new THREE.CircleGeometry( P.r + 0.25, 48 ).rotateX( - Math.PI / 2 ), poolMat )
			this.pool.position.set( P.x, P.surf, P.z )
			this.group.add( this.pool )

		}

		// ---- impacto: coroa de espuma no pé de cada queda (elipse: estreita no través, comprida rio abaixo), 1 draw para todas
		if ( bases.length ) {

			const cp = [], cl = [], ci = []
			for ( const b of bases ) {

				const ra = b.w * 1.15, rl = Math.max( 2.2, b.w * 2.4 ) // través · ao longo
				const cx = b.x + b.dx * rl * 0.3, cz = b.z + b.dz * rl * 0.3
				const o = cp.length / 3, S = 40
				cp.push( cx, b.y + 0.05, cz ); cl.push( 0, 0 )
				for ( let s = 0; s <= S; s ++ ) {

					const a = s / S * Math.PI * 2, ca = Math.cos( a ), sa = Math.sin( a )
					cp.push( cx - b.dz * ra * ca + b.dx * rl * sa, b.y + 0.05, cz + b.dx * ra * ca + b.dz * rl * sa )
					cl.push( ca, sa )
					if ( s ) ci.push( o, o + s, o + s + 1 )

				}

			}
			const cg = new THREE.BufferGeometry()
			cg.setAttribute( 'position', new THREE.Float32BufferAttribute( cp, 3 ) )
			cg.setAttribute( 'local', new THREE.Float32BufferAttribute( cl, 2 ) )
			cg.setIndex( ci )
			const crownMat = new THREE.MeshBasicNodeMaterial()
			crownMat.alphaTest = 0.5
			crownMat.colorNode = vec4( white, 1 )
			crownMat.opacityNode = Fn( () => {

				const L = attribute( 'local', 'vec2' )
				const r = length( L )
				// ruído amostrado na DIREÇÃO (não no ângulo → sem costura em ±π) e empurrado para fora com o tempo
				const dir = normalize( L.add( vec2( 1e-4, 0 ) ) )
				const nn = tex( dir.mul( r.mul( 1.4 ).sub( time.mul( 0.32 ) ) ).add( 0.37 ) ).r
					.add( tex( L.mul( 2.3 ).add( time.mul( vec2( 0.05, - 0.03 ) ) ).add( 5.1 ) ).g.mul( 0.25 ) )
				const rings = pow( sin( r.mul( 22 ).sub( time.mul( 4.5 ) ) ).mul( 0.5 ).add( 0.5 ), 14 )
				const f = nn.mul( 0.62 ).add( rings.mul( 0.3 ) ).add( pow( float( 1 ).sub( r ), 4 ).mul( 0.6 ) )
				return step( 0.6, f.mul( float( 1 ).sub( pow( smoothstep( 0.15, 1, r ), 2 ) ) ) )

			} )()
			crownMat.mrtNode = inkMRT( 0 )
			this.crown = new THREE.Mesh( cg, crownMat )
			this.group.add( this.crown )

		}

		// (bolhas toon no pé foram tiradas: esferas brancas pareciam bolas soltas — a coroa chapada é o que o print pede)

	}

	update() {}

}
