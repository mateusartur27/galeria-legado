import * as THREE from 'three/webgpu'
import { Fn, texture, positionWorld, vec2, vec3, mix, smoothstep, step, fract, floor, abs, min, max, normalize, color, float, hash, fwidth, normalFlat, normalViewGeometry, atan, sin, length, normalWorld } from 'three/tsl'
import { createToonMaterial, bumpNormal } from '../render/ToonMaterial.js'
import { messengerRock } from '../render/RockLook.js'
import { createNoise2D, fbm, rng, smoothstep as ss, lerp } from '../core/utils.js'

// Ilha procedural. Uma única fonte de verdade (alturas) alimenta: malha, física, grama (textura de altura) e água (profundidade).
// Dados por vértice viram texturas (Bruno: terrain data RGB) → o shader pinta grama/areia/rocha com bordas orgânicas.
// world (do preset): terrace (degraus Kenney) · facets 0..1 (normal por face, Interland) · facetJitter (cor por triângulo)
//                    grid (linhas neon emissivas, synthwave) · bump (relevo procedural, photoreal)
export class Terrain {

	constructor( { look, palette, paletteTex = null, noiseTexture, seed = 7, world = {}, size = world.size ?? 180, segments = world.segments ?? 160, track = null } ) {

		this.size = size
		this.segments = segments
		this.res = segments + 1
		this.noise = createNoise2D( rng( seed ) )
		this.waterLevel = 0
		this.terrace = world.terrace ?? 0
		this.floating = world.floating ?? false
		this.track = track // pista: aplaina o chão ao longo dela (world/Track.js)
		this.relief = world.relief ?? 'island'
		this.field = world.field ?? null // { x, z, r }: campo grande e manso (relief 'meadow') com flores pintadas no chão
		this.sierra = world.sierra ?? null // { path: [[x, z]…], height, width }: serra alta (ver sierraAt)
		this.river = world.river ?? null // { spring: [x, z], mouth: [x, z], width: [w0, w1], depth, pull }: rio (ver buildRiver)
		this.rockHeight = world.rockHeight ?? [ 11, 14 ] // acima disso tudo vira rocha (serra: alto, só a inclinação faz rocha)
		// world.biomes: [{ kind, x, z, r }] → pedaços do mapa com outra cor de chão/tufo/árvore (até 3 tipos = canais r, g, b da
		// biomeTexture). Cores na paleta: <kind>Grass, <kind>Dry, <kind>Tuft, <kind>Trees [ ], <kind>Litter [ ] (folhas no chão, opcional)
		this.biomes = world.biomes ?? []
		this.biomeKinds = [ ...new Set( this.biomes.map( ( b ) => b.kind ) ) ].slice( 0, 3 )
		this.lawn = world.lawn ?? false // gramado (grama baixa + chão pintado) em volta da casa, do spawn e no caminho entre eles
		// áreas planas (casa): { x, z, r, h } — h = altura natural no centro
		this.pads = [ world.village, world.ancient ].filter( Boolean ) // vila e cidade antiga aplainam o chão
		for ( const pad of this.pads ) pad.h = this.reliefAt( pad.x, pad.z )
		if ( this.river ) this.buildRiver() // antes das alturas: o leito é cavado em heightAt

		this.buildHeights()
		this.buildGeometry()
		this.buildTextures()

		const half = this.size * 0.5
		const k = this.segments / this.res, o = 0.5 / this.res
		// mundo → UV no centro do texel do vértice correspondente
		this.worldToUV = ( xz ) => xz.add( half ).div( this.size ).mul( k ).add( o )

		const p = palette
		const strataScale = world.strataScale ?? 0.85 // faixas da rocha por metro (serra alta: 0.35, senão vira rabisco)
		const cGrass = color( p.grass ), cDry = color( p.grassDry ), cSand = color( p.sand ), cRock = color( p.rock ), cDirt = color( p.dirt )
		const dataTex = this.dataTexture

		this.rockMask = Fn( ( [ xz ] ) => {

			const d = texture( dataTex, this.worldToUV( xz ) )
			const n = texture( noiseTexture, xz.mul( 0.045 ) )
			// borda dura (world.crispRock, Messenger): rocha × grama como recorte de tinta, não degradê
			return world.crispRock ? smoothstep( 0.5, 0.515, d.b.add( n.r.sub( 0.5 ).mul( 0.5 ) ) ) : smoothstep( 0.45, 0.6, d.b.add( n.r.sub( 0.5 ).mul( 0.5 ) ) )

		} )

		this.colorNode = Fn( ( [ xz ] ) => {

			const d = texture( dataTex, this.worldToUV( xz ) )
			const n = texture( noiseTexture, xz.mul( 0.045 ) )
			const n2 = texture( noiseTexture, xz.mul( 0.21 ) )
			// crisp (Messenger): bordas de recorte (grama × terra × areia), não degradê
			const e0 = world.crispRock ? 0.5 : 0.42, e1 = world.crispRock ? 0.515 : 0.58
			const grassM = smoothstep( e0, e1, d.r.add( n.g.sub( 0.5 ).mul( 0.55 ) ) )
			const sandM = smoothstep( e0, e1, d.g.add( n.b.sub( 0.5 ).mul( 0.45 ) ) )
			const rockM = this.rockMask( xz )
			// estrias horizontais na rocha (Messenger): faixas pela altura, deformadas por ruído
			const strata = fract( positionWorld.y.mul( strataScale ).add( n.r.mul( 1.8 ) ) )
			const col = vec3( cDirt ).toVar()

			if ( paletteTex ) {

				// paleta em textura: manchas = troca de LINHA (base / clara / escura), borda dura como tinta chapada
				const patch = ( v ) => float( 0 ).add( step( 0.64, v ) ).add( step( v, 0.36 ).mul( 2 ) ) // 0 base · 1 clara · 2 escura
				// manchas grandes (ruído de 22 m) + borda recortada pelo ruído fino → "pincelada" em vez de camuflagem
				const big = ( ch ) => ch.add( n2.r.sub( 0.5 ).mul( 0.12 ) )
				// no gramado (d.a) a grama seca aparece bem menos: chão verde e uniforme, como aparado
				const dryMix = smoothstep( 0.42, 0.78, n.a ).mul( float( 1 ).sub( d.a.mul( 0.7 ) ) )
				const grassCol = mix( paletteTex.sample( 'grass', patch( big( n.g ) ) ), paletteTex.sample( 'grassDry', patch( big( n.b ) ) ), dryMix ).toVar()
				// biomas: troca a grama pela do bioma com borda RECORTADA (peso da textura + ruído, smoothstep estreito = tinta chapada)
				const biome = this.biomeKinds.length ? texture( this.biomeTexture, this.worldToUV( xz ) ) : null
				const biomeMask = []
				this.biomeKinds.forEach( ( kind, k ) => {

					const w = biome[ [ 'r', 'g', 'b' ][ k ] ]
					const m = smoothstep( 0.5, 0.515, w.add( n2.r.sub( 0.5 ).mul( 0.35 ) ) )
					biomeMask.push( { kind, m } )
					const bc = mix( paletteTex.sample( kind + 'Grass', patch( big( n.g ) ) ), paletteTex.sample( kind + 'Dry', patch( big( n.b ) ) ), dryMix )
					grassCol.assign( mix( grassCol, bc, m ) )

				} )
				// world.rockSlabLook (messenger): a rocha do terreno no mesmo desenho das pilhas de lajes (Rocks.js) — creme rockSlab,
				// faixas claras alternadas e manchas dessaturadas (não as manchas amareladas). Escorridos aqui viravam hachura diagonal
				// (a face do terreno é inclinada): ficam só nas lajes
				const slabLook = world.rockSlabLook && p.rockSlab
				// world.rockLook 'messenger': rocha desenhada como nos prints (RockLook.js: creme sem faixas, traços curtos quebrados,
				// escorridos, grama por cima) — no lugar das estrias contínuas
				const rockCol = ( world.rockLook === 'messenger'
					? messengerRock( { p: positionWorld, nW: normalWorld, base: paletteTex.sample( 'rockSlab' ), ink: paletteTex.sample( 'ink' ), grass: grassCol, noise: noiseTexture } )
					: slabLook
						? paletteTex.sample( 'rockSlab', step( 0.55, strata ).add( step( n2.r, 0.4 ).mul( 3 ) ).min( 3 ) )
						: paletteTex.sample( 'rock', step( 0.55, strata ).add( step( n2.r, 0.4 ).mul( 2 ) ).min( 2 ) ) ).toVar()
				// world.rockCracks (messenger): rachaduras finas e curtas na rocha (as falésias do jogo têm muitas; sem elas a rocha
				// grande vira uma mancha chapada com 3 faixas)
				if ( world.rockCracks ) {

					const pw = positionWorld
					const cA = texture( noiseTexture, pw.xz.mul( 0.13 ).add( pw.y.mul( vec2( 0.21, 0.09 ) ) ) ).r
					const cB = texture( noiseTexture, pw.zy.mul( 0.17 ).add( pw.x.mul( vec2( 0.11, 0.06 ) ) ) ).g
					const crack = ( v ) => float( 1 ).sub( smoothstep( fwidth( v ).mul( 0.5 ), fwidth( v ).mul( 1.3 ), v.sub( 0.5 ).abs() ) )
					const keep = smoothstep( 0.45, 0.52, texture( noiseTexture, pw.xz.mul( 0.3 ).add( 6.1 ) ).b )
					rockCol.assign( mix( rockCol, paletteTex.sample( 'ink' ), max( crack( cA ), crack( cB ) ).mul( keep ).mul( 0.75 ) ) )

				}
				col.assign( paletteTex.sample( 'dirt', patch( big( n.r ) ) ) )
				col.assign( mix( col, grassCol, grassM ) )
				col.assign( mix( col, paletteTex.sample( 'sand', patch( big( n.r ) ) ), sandM ) )
				col.assign( mix( col, rockCol, rockM ) )

				// world.bank (messenger): faixa de terra molhada em volta da água (rio: altura da lâmina na riverTexture; mar: 0), com
				// borda ondulada e um traço escuro na borda de cima — nos prints a água sempre tem esse "barro" contornando
				let bankM = float( 0 )
				if ( world.bank && p.bank ) {

					const pw = positionWorld
					const surf = this.riverTexture ? max( texture( this.riverTexture, this.worldToUV( xz ) ).r, float( this.waterLevel ) ) : float( this.waterLevel )
					const wob = n2.g.sub( 0.5 ).mul( 0.18 )
					const top = surf.add( world.bank.height ?? 0.32 ).add( wob )
					const hgt = pw.y
					const aaB = fwidth( hgt ).max( 1e-4 )
					bankM = float( 1 ).sub( smoothstep( top.sub( aaB ), top.add( aaB ), hgt ) ).mul( smoothstep( surf.sub( 0.6 ), surf.sub( 0.4 ), hgt ) ).mul( float( 1 ).sub( rockM ) )
					const edge = float( 1 ).sub( smoothstep( aaB.mul( 0.8 ), aaB.mul( 1.8 ), abs( hgt.sub( top ) ) ) ).mul( float( 1 ).sub( rockM ) ).mul( step( surf.sub( 0.4 ), hgt ) )
					col.assign( mix( col, paletteTex.sample( 'bank', patch( big( n.g ) ) ), bankM ) )
					col.assign( mix( col, paletteTex.sample( 'ink' ), edge.mul( 0.9 ) ) )

				}

				// gramado (Messenger): chão mais claro + "tiques" de pincel — folhinhas pintadas no chão em vez de geometria
				const lawn = d.a
				let onGrass = grassM.mul( float( 1 ).sub( rockM ) ).mul( float( 1 ).sub( bankM ) )
				col.assign( mix( col, paletteTex.sample( 'grass', 1 ), lawn.mul( onGrass ).mul( world.flecks ? 0.12 : 0.35 ) ) )

				// campo de grama alta (world.grassField, mesma borda do Grass): chão da cor da raiz das lâminas, como no estilo ink —
				// o verde saturado do gramado aparecendo entre as lâminas denuncia o "buraco"; sem pedrinhas/tiques lá dentro
				const field = world.grassField
				if ( field && p.fieldGrass ) {

					const fd = length( xz.sub( vec2( field.x, field.z ) ) ).add( texture( noiseTexture, xz.mul( 0.06 ) ).r.sub( 0.5 ).mul( field.r * 0.5 ) )
					const fieldM = float( 1 ).sub( smoothstep( field.r * 0.7, field.r * 0.95, fd ) ).mul( onGrass )
					const ground = mix( color( p.fieldGrass ), color( p.fieldDry ), smoothstep( 0.42, 0.78, texture( noiseTexture, xz.mul( 0.035 ) ).a ) ).mul( 0.84 )
					col.assign( mix( col, ground, fieldM ) )
					onGrass = onGrass.mul( float( 1 ).sub( fieldM ) )

				}

				// campo (world.field + palette.flowers): florzinhas pintadas no chão — pontos de 3 cores, 1 por célula de 0,55 m em
				// metade das células, só no gramado do campo e somem de longe (fwidth). Sem geometria
				const fieldCfg = world.field
				if ( fieldCfg && p.flowers ) {

					const fd = length( xz.sub( vec2( fieldCfg.x, fieldCfg.z ) ) ).add( texture( noiseTexture, xz.mul( 0.05 ) ).g.sub( 0.5 ).mul( fieldCfg.r * 0.5 ) )
					const inField = float( 1 ).sub( smoothstep( fieldCfg.r * 0.55, fieldCfg.r * 0.9, fd ) ).mul( onGrass )
					const S = 0.55
					const g = xz.div( S )
					const cell = floor( g )
					const h1 = hash( cell.x.mul( 1.7 ).add( cell.y.mul( 113.3 ) ).add( 31.1 ) )
					const h2 = hash( cell.x.mul( 5.3 ).add( cell.y.mul( 17.9 ) ).add( 2.9 ) )
					const q = fract( g ).sub( 0.5 ).sub( vec2( h1, h2 ).sub( 0.5 ).mul( 0.6 ) ).mul( vec2( 1, 1.4 ) )
					const aa = fwidth( g.x ).max( 1e-4 )
					const rad = mix( float( 0.09 ), float( 0.17 ), h2 )
					const dot = float( 1 ).sub( smoothstep( rad, rad.add( aa ), q.length() ) )
					// flores aparecem em manchas (ruído grande): campo com tufos de flor, não confete uniforme
					const patch = smoothstep( 0.4, 0.55, texture( noiseTexture, xz.mul( 0.08 ).add( 5.3 ) ).b )
					const present = step( 0.3, h1 ).mul( inField ).mul( patch ).mul( float( 1 ).sub( smoothstep( 0.1, 0.25, aa ) ) )
					const fc = mix( mix( paletteTex.sample( 'flowers0' ), paletteTex.sample( 'flowers1' ), step( 0.66, h2 ) ), paletteTex.sample( 'flowers2' ), step( 0.85, h1 ) )
					col.assign( mix( col, fc, dot.mul( present ) ) )

				}

				// folhas caídas do bioma (<kind>Litter0..2, ex.: bordo vermelho / laranja / ginkgo amarelo no outono): folha em elipse
				// girada, 1 por célula de 0,45 m, em manchas, somem de longe. Sem geometria
				for ( const { kind, m } of biomeMask ) {

					if ( ! p[ kind + 'Litter' ] ) continue
					const S = 0.45
					const g = xz.div( S ).add( 17.3 )
					const cell = floor( g )
					const h1 = hash( cell.x.mul( 2.3 ).add( cell.y.mul( 71.9 ) ).add( 4.1 ) )
					const h2 = hash( cell.x.mul( 9.1 ).add( cell.y.mul( 13.7 ) ).add( 8.8 ) )
					const q0 = fract( g ).sub( 0.5 ).sub( vec2( h1, h2 ).sub( 0.5 ).mul( 0.5 ) )
					const a = h1.mul( 6.2832 ), ca = a.cos(), sa = a.sin()
					const q = vec2( q0.x.mul( ca ).sub( q0.y.mul( sa ) ), q0.x.mul( sa ).add( q0.y.mul( ca ) ) ).mul( vec2( 1, 2.1 ) ) // folha comprida
					const aa = fwidth( g.x ).max( 1e-4 )
					const rad = mix( float( 0.1 ), float( 0.17 ), h2 )
					const leaf = float( 1 ).sub( smoothstep( rad, rad.add( aa ), q.length() ) )
					const patch = smoothstep( 0.3, 0.45, texture( noiseTexture, xz.mul( 0.1 ).add( 2.1 ) ).g )
					const present = step( 0.35, h2 ).mul( m ).mul( onGrass ).mul( patch ).mul( float( 1 ).sub( smoothstep( 0.1, 0.25, aa ) ) )
					const lc = mix( mix( paletteTex.sample( kind + 'Litter0' ), paletteTex.sample( kind + 'Litter1' ), step( 0.4, h1 ) ), paletteTex.sample( kind + 'Litter2' ), step( 0.75, h1 ) )
					col.assign( mix( col, lc, leaf.mul( present ) ) )

				}

				if ( world.flecks ) {

					// pedrinhas (Messenger): manchinhas creme irregulares com contorno de nanquim, espalhadas no verde
					const S = 0.9
					const g = xz.div( S )
					const cell = floor( g )
					const f = fract( g ).sub( 0.5 )
					const h1 = hash( cell.x.add( cell.y.mul( 157.13 ) ) )
					const h2 = hash( cell.x.mul( 3.71 ).add( cell.y.mul( 91.7 ) ).add( 11.3 ) )
					const h3 = hash( cell.x.mul( 7.3 ).add( cell.y.mul( 13.1 ) ).add( 5.7 ) )
					// elipse girada por hash (sem atan/sin: a borda ondulada por ângulo custava ~0,9 ms no chão inteiro) + leve
					// achatamento extra num eixo → pedrinha irregular, não bolinha
					const q0 = f.sub( vec2( h1, h2 ).sub( 0.5 ).mul( 0.6 ) )
					const ca = h1.sub( 0.5 ).mul( 2 ), sa = float( 1 ).sub( ca.mul( ca ) ).sqrt() // cos/sin de um ângulo do hash
					const q = vec2( q0.x.mul( ca ).sub( q0.y.mul( sa ) ), q0.x.mul( sa ).add( q0.y.mul( ca ) ) ).mul( vec2( 1, mix( float( 1.3 ), float( 1.9 ), h3 ) ) )
					const rad = mix( float( 0.035 ), float( 0.12 ), h2.mul( h2 ) )
					const dist = q.length()
					const aa = fwidth( g.x ).max( 1e-4 )
					const inside = float( 1 ).sub( smoothstep( rad, rad.add( aa ), dist ) )
					const ring = float( 1 ).sub( smoothstep( rad.add( aa.mul( 1.4 ) ), rad.add( aa.mul( 2.4 ) ), dist ) ).sub( inside ).max( 0 )
					const present = step( 0.5, h3 ).mul( onGrass ).mul( float( 1 ).sub( smoothstep( 0.12, 0.3, aa ) ) )
					col.assign( mix( col, paletteTex.sample( 'fleck', step( 0.5, h1 ).mul( 2 ) ), inside.mul( present ) ) )
					col.assign( mix( col, paletteTex.sample( 'ink' ), ring.mul( present ).mul( 0.9 ) ) )

				} else {

				const S = 0.35 // metros por célula de tique
				const g = xz.div( S )
				const cell = floor( g )
				const f = fract( g ).sub( 0.5 )
				const h1 = hash( cell.x.add( cell.y.mul( 157.13 ) ) )
				const h2 = hash( cell.x.mul( 3.71 ).add( cell.y.mul( 91.7 ) ).add( 11.3 ) )
				const h3 = hash( cell.x.mul( 7.3 ).add( cell.y.mul( 13.1 ) ).add( 5.7 ) )
				const q0 = f.sub( vec2( h1, h2 ).sub( 0.5 ).mul( 0.45 ) ) // tique fora do centro da célula (sem grade visível)
				const a = h1.sub( 0.5 ).mul( 1.1 ).add( 0.5 ) // quase alinhados: pincelada com direção
				const ca = a.cos(), sa = a.sin()
				const q = vec2( q0.x.mul( ca ).sub( q0.y.mul( sa ) ), q0.x.mul( sa ).add( q0.y.mul( ca ) ) )
				const along = q.y.div( 0.38 ) // tique ≈ 26 cm × 8 cm
				const halfW = float( 0.11 ).mul( float( 1 ).sub( along.abs().pow( 2 ) ) ) // folha: larga no meio, fina nas pontas
				const aa = fwidth( g.x ).mul( 1.2 ).max( 1e-4 )
				const tick = float( 1 ).sub( smoothstep( halfW, halfW.add( aa ), q.x.abs() ) ).mul( step( along.abs(), 1 ) ).mul( step( 0.35, h3 ) )
				const farFade = float( 1 ).sub( smoothstep( 0.3, 0.65, aa ) )
				const tickCol = paletteTex.sample( 'grass', float( 2 ).sub( step( 0.5, h2 ) ) ) // 1 clara · 2 escura
				col.assign( mix( col, tickCol.mul( mix( float( 1.08 ), float( 0.88 ), step( h2, 0.5 ) ) ), tick.mul( farFade ).mul( onGrass ).mul( mix( float( 0.5 ), float( 0.95 ), lawn ) ) ) )

				}

			} else {

				const rockCol = cRock.mul( mix( float( 0.86 ), float( 1.07 ), step( 0.55, strata ) ) ).mul( n2.r.mul( 0.2 ).add( 0.9 ) )
				col.assign( mix( col, mix( cGrass, cDry, smoothstep( 0.42, 0.78, n.a ) ), grassM ) )
				col.assign( mix( col, cSand, sandM ) )
				col.assign( mix( col, rockCol, rockM ) )
				col.mulAssign( n2.g.mul( 0.12 ).add( 0.94 ) )

			}

			// papercraft (Interland): cada triângulo da grade ganha um tom levemente diferente
			if ( world.facetJitter ) {

				const cell = xz.add( half ).div( this.size / this.segments )
				const f = fract( cell )
				const tri = step( 1, f.x.add( f.y ) ) // a diagonal da grade separa os 2 triângulos da célula
				const id = hash( floor( cell.x ).add( floor( cell.y ).mul( 409 ) ).add( tri.mul( 0.5 ) ) )
				col.mulAssign( id.sub( 0.5 ).mul( world.facetJitter * 2 ).add( 1 ) )

			}

			return col

		} )

		// traço "quebrado" no terreno (Messenger): só desenha onde o ruído deixa; rocha sempre tem traço
		const inkNode = smoothstep( 0.38, 0.52, texture( noiseTexture, positionWorld.xz.mul( 0.07 ) ).r ).max( this.rockMask( positionWorld.xz ) )

		// grade neon (synthwave): linhas antisserrilhadas por fwidth, somem onde ficam finas demais (longe = moiré)
		let emissiveNode = null
		if ( world.grid ) {

			const g = world.grid
			emissiveNode = Fn( () => {

				const coord = positionWorld.xz.div( g.spacing )
				const fw = fwidth( coord )
				const d = abs( fract( coord.sub( 0.5 ) ).sub( 0.5 ) ).div( fw.max( 1e-4 ) )
				const line = float( 1 ).sub( min( min( d.x, d.y ).div( g.width ), 1 ) )
				const farFade = float( 1 ).sub( smoothstep( 0.25, 0.6, max( fw.x, fw.y ) ) )
				const land = smoothstep( 0.05, 0.4, positionWorld.y )
				return color( g.color ).mul( line.mul( farFade ).mul( land ).mul( g.intensity ) )

			} )()

		}

		// ID de superfície por tipo de chão (grama / terra / rocha): o contorno desenha a borda das manchas (Messenger)
		let idNode = null
		if ( world.crispRock ) {

			const xz = positionWorld.xz
			const d = texture( dataTex, this.worldToUV( xz ) )
			const n = texture( noiseTexture, xz.mul( 0.045 ) )
			const isGrass = step( 0.5, d.r.add( n.g.sub( 0.5 ).mul( 0.55 ) ) )
			const isRock = step( 0.5, this.rockMask( xz ) )
			idNode = mix( mix( float( 0.2 ), float( 0.1 ), isGrass ), float( 0.3 ), isRock )
			// world.rockStrata 'id' (Messenger): a faixa clara das estrias (a mesma da cor) soma 0.05 ao ID → o contorno desenha as estrias
			if ( world.rockStrata === 'id' ) {

				const strata = fract( positionWorld.y.mul( strataScale ).add( n.r.mul( 1.8 ) ) )
				idNode = idNode.add( isRock.mul( step( 0.55, strata ) ).mul( 0.05 ) )

			}

		}

		this.material = createToonMaterial( look, {
			colorNode: this.colorNode( positionWorld.xz ),
			emissiveNode,
			ink: world.crispRock ? 1 : inkNode, // crisp: contorno do terreno vem do ID (bordas de mancha) + dobras
			id: idNode,
			specular: false, // brilho no chão inclinado vira mancha pálida (Messenger: terreno grande nem usa N·L)
			roughness: 0.95
		} )

		// rocha facetada (normal da face), resto suave → encostas viram "low-poly" legível em vez de borrão.
		// world.facets = 1 → tudo facetado (Interland, synthwave)
		// world.rockFacets false: rocha com normal suave (numa serra grande, cada triângulo facetado vira um rabisco de luz/sombra)
		const facet = world.rockFacets === false ? float( world.facets ?? 0 )
			: world.facets ? this.rockMask( positionWorld.xz ).max( world.facets ) : this.rockMask( positionWorld.xz )
		let normal = normalize( mix( normalViewGeometry, normalFlat, facet ) )

		// relevo fino (photoreal): torrões na terra/grama, estrias na rocha — sem textura nem UV
		if ( world.bump ) {

			const xz = positionWorld.xz
			const fine = texture( noiseTexture, xz.mul( 0.9 ) ).r.mul( 0.6 ).add( texture( noiseTexture, xz.mul( 3.1 ) ).g.mul( 0.4 ) )
			const strata = fract( positionWorld.y.mul( strataScale ).add( texture( noiseTexture, xz.mul( 0.045 ) ).r.mul( 1.8 ) ) )
			// degraus suaves: derivadas de tela de um degrau abrupto viram "pontilhado" nas bordas
			// (fract() salta de 1 → 0: usar onda triangular contínua)
			const ridge = float( 1 ).sub( abs( strata.mul( 2 ).sub( 1 ) ) )
			const height = mix( fine, smoothstep( 0.2, 0.8, ridge ).mul( 0.5 ).add( fine.mul( 0.5 ) ), this.rockMask( xz ) )
			normal = bumpNormal( height, float( world.bump * 1.4 ), normal )

		}

		this.material.normalNode = normal

		this.mesh = new THREE.Mesh( this.geometry, this.material )
		this.mesh.receiveShadow = true
		this.mesh.castShadow = true

		if ( this.floating ) this.buildFloating( look, palette )

	}

	// Interland: a ilha flutua no céu. O heightfield desce em penhasco na borda e é cortado abaixo de −16 m (maskNode);
	// por baixo entra um "cone" de rocha facetado e irregular. Mais algumas ilhotas no horizonte.
	buildFloating( look, palette ) {

		this.material.maskNode = positionWorld.y.greaterThan( - 16 )
		const random = rng( 21 )
		const jagged = ( geo, amount ) => {

			const p = geo.attributes.position, v = new THREE.Vector3()
			for ( let i = 0; i < p.count; i ++ ) {

				v.fromBufferAttribute( p, i )
				const k = 1 + ( this.noise( v.x * 0.08 + v.y * 0.05, v.z * 0.08 ) ) * amount
				p.setXYZ( i, v.x * k, v.y, v.z * k )

			}

			geo.computeVertexNormals()
			return geo

		}

		// rocha que escurece para a ponta + faixas largas (mesma linguagem das estrias do penhasco)
		const rockCol = Fn( () => {

			const y = positionWorld.y
			const bands = mix( float( 0.9 ), float( 1.05 ), step( 0.5, fract( y.mul( 0.12 ) ) ) )
			return mix( color( palette.rock ), color( '#a3a7ad' ), 0.6 ).mul( bands ) // mais cinza: a face de baixo vive na sombra colorida (que já satura).mul( mix( float( 0.55 ), float( 1 ), smoothstep( - 76, - 12, y ) ) )

		} )
		const R = this.size * 0.5 * 0.775
		const under = jagged( new THREE.ConeGeometry( R, 64, 22, 7, true ).rotateX( Math.PI ).translate( 0, - 12 - 32, 0 ), 0.18 )
		const parts = [ under ]
		const caps = []
		for ( let i = 0; i < 7; i ++ ) {

			const a = ( i / 7 ) * Math.PI * 2 + random() * 0.5, d = this.size * ( 0.62 + random() * 0.25 ), s = 4 + random() * 7
			const x = Math.cos( a ) * d, z = Math.sin( a ) * d, y = - 6 + random() * 22
			parts.push( jagged( new THREE.ConeGeometry( s, s * 2.2, 7, 2, true ).rotateX( Math.PI ).translate( x, y - s * 1.1 - 0.4, z ), 0.2 ) )
			caps.push( new THREE.CylinderGeometry( s * 1.02, s, 0.8, 7, 1 ).translate( x, y, z ) )

		}

		const merge = ( list ) => {

			const g = new THREE.BufferGeometry()
			const pos = [], nor = []
			for ( const geo of list ) {

				const gi = geo.index ? geo.toNonIndexed() : geo
				pos.push( ...gi.attributes.position.array )
				nor.push( ...gi.attributes.normal.array )

			}

			g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) )
			g.setAttribute( 'normal', new THREE.Float32BufferAttribute( nor, 3 ) )
			return g

		}

		this.underside = new THREE.Mesh( merge( parts ), createToonMaterial( look, { colorNode: rockCol(), flatShading: true } ) )
		this.islets = new THREE.Mesh( merge( caps ), createToonMaterial( look, { colorNode: color( palette.grass ), flatShading: true } ) )
		for ( const m of [ this.underside, this.islets ] ) { m.castShadow = true; m.receiveShadow = true; this.mesh.add( m ) }

	}

	heightAt( x, z ) {

		let h = this.baseHeight( x, z )
		// nascente (river.pool): bacia rasa com borda um pouco acima da lâmina; o canal do rio corta a borda logo abaixo
		const P = this.riverData?.pool
		let band = 3 // barranco do rio (m além da margem)
		if ( P ) {

			const d = Math.hypot( x - P.x, z - P.z )
			band = lerp( 0.5, 3, ss( P.r, P.r + 4, d ) ) // na saída da poça o canal é estreito (senão abre um rombo na borda)
			if ( d < P.r + 3 ) {

				const k = Math.min( 1, d / P.r )
				const bowl = P.surf - 0.9 * ( 1 - k * k )
				const rim = Math.max( h, P.surf + 0.3 )
				h = lerp( lerp( bowl, rim, ss( P.r - 0.8, P.r + 0.4, d ) ), h, ss( P.r + 0.4, P.r + 3, d ) )

			}

		}
		// leito do rio: fundo no meio, barranco até ~2,5 m da margem (nunca levanta o chão)
		const r = this.riverNear( x, z )
		if ( r && r.d < r.w + band ) h = Math.min( h, lerp( h, r.bed, ss( r.w + band, r.w * 0.45, r.d ) ) )
		for ( const p of this.pads ) if ( p.road ) h = this.roadHeight( p, x, z, h )
		return h

	}

	// pad.fall = largura da rampa até o platô (padrão 3,5 m) · perto da costa o platô some (senão um platô grande vira península)
	// pad.moat = { inner, width, bottom }: fosso quadrado (em coordenadas locais do pad, girado por pad.rotation) escavado abaixo do mar
	baseHeight( x, z ) {

		let h = this.reliefAt( x, z )
		const coast = this.relief === 'meadow' ? 1 - ss( 0.72, 0.9, Math.hypot( x, z ) / ( this.size * 0.5 ) ) : 1
		for ( const p of this.pads ) {

			h = lerp( h, p.h, ss( p.r + ( p.fall ?? 3.5 ), p.r, Math.hypot( x - p.x, z - p.z ) ) * coast )
			if ( p.moat ) {

				const c = Math.cos( p.rotation ), s = Math.sin( p.rotation )
				const dx = x - p.x, dz = z - p.z
				const m = Math.max( Math.abs( dx * c - dz * s ), Math.abs( dx * s + dz * c ) ) // distância "quadrada" ao centro
				const { inner, width, bottom = - 0.9 } = p.moat
				h = lerp( h, bottom, ss( inner - 2.5, inner, m ) * ss( inner + width + 2.5, inner + width, m ) ) // margem de 2,5 m

			}

		}
		return h

	}

	// 0..1: rocha do terreno no vértice mais próximo (canal b da dataTexture)
	rockAt( x, z ) {

		const { res, size, segments } = this
		const i = Math.round( THREE.MathUtils.clamp( ( x / size + 0.5 ) * segments, 0, segments ) )
		const j = Math.round( THREE.MathUtils.clamp( ( z / size + 0.5 ) * segments, 0, segments ) )
		return this.dataTexture.image.data[ ( j * res + i ) * 4 + 2 ] / 255

	}

	// peso de cada bioma (na ordem de biomeKinds) num ponto: borda ondulada por ruído grande (mancha orgânica, não círculo)
	biomeAt( x, z ) {

		const w = this.biomeKinds.map( () => 0 )
		for ( const b of this.biomes ) {

			const d = Math.hypot( x - b.x, z - b.z ) + this.noise( x * 0.02 + b.x, z * 0.02 - b.z ) * b.r * 0.35
			const k = this.biomeKinds.indexOf( b.kind )
			if ( k >= 0 ) w[ k ] = Math.max( w[ k ], ss( b.r, b.r * 0.7, d ) )

		}
		return w

	}

	// o bioma que "ganha" num ponto (> 0.5) ou null — tufos/árvores escolhem a cor por aqui
	biomeKindAt( x, z ) {

		const w = this.biomeAt( x, z )
		let best = null, bw = 0.5
		w.forEach( ( v, k ) => { if ( v > bw ) { bw = v; best = this.biomeKinds[ k ] } } )
		return best

	}

	// 0..1: dentro do fosso de algum pad (incluindo a margem)
	moatAt( x, z ) {

		let best = 0
		for ( const p of this.pads ) {

			if ( ! p.moat ) continue
			const c = Math.cos( p.rotation ), s = Math.sin( p.rotation ), dx = x - p.x, dz = z - p.z
			const m = Math.max( Math.abs( dx * c - dz * s ), Math.abs( dx * s + dz * c ) )
			const { inner, width } = p.moat
			best = Math.max( best, ss( inner - 3.5, inner - 2, m ) * ss( inner + width + 3.5, inner + width + 2, m ) )

		}
		return best

	}

	// distância (m) até a rua mais próxima das vilas (Infinity sem rua) — árvores/tufos/plantas evitam a rua
	roadDistance( x, z ) {

		let best = Infinity
		for ( const p of this.pads ) {

			if ( ! p.road ) continue
			const c = Math.cos( p.rotation ), s = Math.sin( p.rotation )
			const lx = ( x - p.x ) * c - ( z - p.z ) * s, lz = ( x - p.x ) * s + ( z - p.z ) * c
			for ( const [ ax, az, bx, bz ] of p.road ) {

				const vx = bx - ax, vz = bz - az
				const t = THREE.MathUtils.clamp( ( ( lx - ax ) * vx + ( lz - az ) * vz ) / ( vx * vx + vz * vz ), 0, 1 )
				best = Math.min( best, Math.hypot( lx - ( ax + vx * t ), lz - ( az + vz * t ) ) )

			}

		}
		return best

	}

	// ruas da vila (pad.road = segmentos [ax, az, bx, bz] em coordenadas LOCAIS da vila, girada por pad.rotation): o chão sob a rua
	// vira a média do chão ao longo dela (±4 m) → a rua sobe e desce o morro suave, sem calombo, e acompanha o resto do terreno
	roadHeight( p, x, z, h ) {

		const c = Math.cos( p.rotation ), s = Math.sin( p.rotation )
		const dx = x - p.x, dz = z - p.z
		const lx = dx * c - dz * s, lz = dx * s + dz * c
		const toWorld = ( ax, az ) => [ p.x + ax * c + az * s, p.z - ax * s + az * c ]
		const half = ( p.roadWidth ?? 3.4 ) / 2 + 1.2 // + calçada
		for ( const [ ax, az, bx, bz ] of p.road ) {

			const vx = bx - ax, vz = bz - az, len = Math.hypot( vx, vz )
			const t = THREE.MathUtils.clamp( ( ( lx - ax ) * vx + ( lz - az ) * vz ) / ( len * len ), 0, 1 )
			const d = Math.hypot( lx - ( ax + vx * t ), lz - ( az + vz * t ) )
			if ( d > half + 3 ) continue
			let avg = 0
			for ( let k = - 2; k <= 2; k ++ ) {

				const tt = THREE.MathUtils.clamp( t + k * 2 / len, 0, 1 )
				avg += this.baseHeight( ...toWorld( ax + vx * tt, az + vz * tt ) ) / 5

			}
			h = lerp( h, avg, ss( half + 3, half, d ) )

		}
		return h

	}

	reliefAt( x, z ) {

		if ( this.relief === 'meadow' ) return this.meadowHeight( x, z )
		return this.islandHeight( x, z )

	}

	// Campinho: morros curtos + calombos + cristas que viram rocha pela inclinação; mar em volta.
	meadowHeight( x, z ) {

		const n = this.noise
		const hills = fbm( n, x * 0.04, z * 0.04, 3 )
		const bumps = fbm( n, x * 0.12 + 100, z * 0.12 - 40, 2 )
		const mound = Math.max( 0, fbm( n, x * 0.05 + 50, z * 0.05 - 30, 2 ) ) // morrotes arredondados
		let h = 2.3 + hills * 1.8 + bumps * 0.4 + mound * mound * 5
		// world.field (campo grande): ondulação longa e mansa, sem morrote nem crista (vira gramado aberto); borda irregular
		const f = this.field
		if ( f ) {

			const d = Math.hypot( x - f.x, z - f.z ) + n( x * 0.05 + 7, z * 0.05 - 3 ) * f.r * 0.25
			h = lerp( h, 2.4 + hills * 0.9 + fbm( n, x * 0.015 - 20, z * 0.015 + 60, 2 ) * 1.2 + bumps * 0.12, ss( f.r, f.r * 0.6, d ) )

		}
		// world.sierra: serra alta ao longo de uma linha (crista com picos, esporões e rochedos) — as encostas íngremes viram rocha
		if ( this.sierra ) h += this.sierraAt( x, z )
		const r = Math.hypot( x, z ) / ( this.size * 0.5 )
		h = lerp( - 3, h, 1 - ss( 0.66, 0.95, r ) )
		// em volta do spawn o relevo fica mais manso (câmera livre), mas os calombos continuam
		return lerp( h, 2.2 + hills * 0.6 + bumps * 0.35, ss( 15, 5, Math.hypot( x, z ) ) )

	}

	// serra: altura extra num ponto. Distância à linha da crista com largura ondulada por ruído (esporões), perfil de "sino"
	// íngreme, altura variando ao longo da crista (picos e colos) + ruído em crista (1 − |fbm|)³ = rochedos e ravinas
	sierraAt( x, z ) {

		const { path, height = 40, width = 40 } = this.sierra
		const n = this.noise
		let best = Infinity, tBest = 0, acc = 0, total = 0
		for ( let i = 0; i < path.length - 1; i ++ ) total += Math.hypot( path[ i + 1 ][ 0 ] - path[ i ][ 0 ], path[ i + 1 ][ 1 ] - path[ i ][ 1 ] )
		for ( let i = 0; i < path.length - 1; i ++ ) {

			const [ ax, az ] = path[ i ], [ bx, bz ] = path[ i + 1 ]
			const vx = bx - ax, vz = bz - az, len = Math.hypot( vx, vz )
			const t = THREE.MathUtils.clamp( ( ( x - ax ) * vx + ( z - az ) * vz ) / ( len * len ), 0, 1 )
			const d = Math.hypot( x - ( ax + vx * t ), z - ( az + vz * t ) )
			if ( d < best ) { best = d; tBest = ( acc + t * len ) / total }
			acc += len

		}
		const W = width * ( 0.75 + 0.5 * ( n( x * 0.025 + 31, z * 0.025 - 17 ) * 0.5 + 0.5 ) )
		if ( best > W ) return 0
		const along = 0.55 + 0.45 * Math.sin( tBest * Math.PI ) // mais alta no meio
		const peaks = 0.7 + 0.3 * n( tBest * 6 + 3.1, 0.7 ) // picos e colos ao longo da crista
		const k = 1 - best / W
		const body = k * k * ( 3 - 2 * k ) // sino
		const crag = Math.pow( 1 - Math.abs( fbm( n, x * 0.06 + 9, z * 0.06 - 4, 3 ) ), 3 )
		return height * along * peaks * ( body * 0.85 + body * crag * 0.35 )

	}

	// rio (world.river): nasce no ponto mais alto perto de `spring`, desce pelo terreno (descida mais íngreme + inércia + puxão
	// para `mouth`) até abaixo do mar. Leito sempre descendo (mínimo acumulado), largura crescendo da nascente à foz
	buildRiver() {

		const R = this.river
		const H = ( x, z ) => this.baseHeight( x, z )
		// nascente: o ponto mais alto num raio de 12 m
		let [ sx, sz ] = R.spring, sh = H( sx, sz )
		for ( let a = 0; a < 48; a ++ ) for ( const rr of [ 3, 6, 9, 12 ] ) {

			const x = R.spring[ 0 ] + Math.cos( a / 48 * Math.PI * 2 ) * rr, z = R.spring[ 1 ] + Math.sin( a / 48 * Math.PI * 2 ) * rr
			const h = H( x, z )
			if ( h > sh ) { sh = h; sx = x; sz = z }

		}
		const pts = [ [ sx, sz ] ]
		let dx = R.mouth[ 0 ] - sx, dz = R.mouth[ 1 ] - sz
		let dl = Math.hypot( dx, dz ); dx /= dl; dz /= dl
		const e = 1.5, step = 2
		for ( let i = 0; i < 700; i ++ ) {

			const [ x, z ] = pts[ pts.length - 1 ]
			if ( H( x, z ) < - 1.5 ) break
			const gx = ( H( x + e, z ) - H( x - e, z ) ) / ( 2 * e ), gz = ( H( x, z + e ) - H( x, z - e ) ) / ( 2 * e )
			let mx = R.mouth[ 0 ] - x, mz = R.mouth[ 1 ] - z
			const ml = Math.hypot( mx, mz ) || 1; mx /= ml; mz /= ml
			const g = Math.hypot( gx, gz )
			const pull = R.pull ?? 0.35
			let nx = - gx / ( g + 0.05 ) + dx * 0.9 + mx * pull, nz = - gz / ( g + 0.05 ) + dz * 0.9 + mz * pull
			const nl = Math.hypot( nx, nz ) || 1; nx /= nl; nz /= nl
			dx = nx; dz = nz
			pts.push( [ x + dx * step, z + dz * step ] )

		}
		// suaviza o traçado (3 passadas de média) para não ter quinas
		for ( let p = 0; p < 3; p ++ ) for ( let i = 1; i < pts.length - 1; i ++ ) {

			pts[ i ] = [ ( pts[ i - 1 ][ 0 ] + pts[ i ][ 0 ] * 2 + pts[ i + 1 ][ 0 ] ) / 4, ( pts[ i - 1 ][ 1 ] + pts[ i ][ 1 ] * 2 + pts[ i + 1 ][ 1 ] ) / 4 ]

		}
		const [ w0, w1 ] = R.width ?? [ 1, 4.5 ]
		const depth = R.depth ?? 0.8
		const bed = [], width = []
		pts.forEach( ( [ x, z ], i ) => {

			const t = i / ( pts.length - 1 )
			width.push( w0 + ( w1 - w0 ) * Math.sqrt( t ) )
			const b = H( x, z ) - depth
			bed.push( i ? Math.min( b, bed[ i - 1 ] - 0.02 ) : b )

		} )
		bed[ bed.length - 1 ] = Math.min( bed[ bed.length - 1 ], - 1.5 )
		// cachoeiras em DEGRAUS (river.step = altura alvo de cada queda, 0 desliga): trecho íngreme vira penhasco curto quase
		// vertical + poço plano, como as quedas do Messenger (cortina caindo), em vez de uma rampa de água escorrendo na encosta.
		// Cada degrau fica na altura do FIM do seu trecho → o leito só desce (nunca fica acima do chão natural): o penhasco é
		// cavado na encosta (garganta), e a água sempre tem chão embaixo
		const stepH = R.step ?? 8
		if ( stepH ) for ( let i = 1; i < pts.length; i ++ ) {

			const steep = ( k ) => ( bed[ k - 1 ] - bed[ k ] ) / Math.max( 0.5, Math.hypot( pts[ k ][ 0 ] - pts[ k - 1 ][ 0 ], pts[ k ][ 1 ] - pts[ k - 1 ][ 1 ] ) ) > 0.5
			if ( ! steep( i ) ) continue
			let b = i
			while ( b + 1 < pts.length && steep( b + 1 ) ) b ++
			const drop = bed[ i - 1 ] - bed[ b ]
			// cada degrau precisa de poço de verdade embaixo (≥ 3 trechos ≈ 6 m): encosta curta e alta vira UMA queda alta, não uma
			// escadinha de cortinas empilhadas com poço de 2 m entre elas (parecia uma pilha de placas)
			const k = Math.max( 1, Math.min( Math.floor( ( b - i + 1 ) / 3 ), Math.round( drop / stepH ) ) )
			for ( let s = 0; s < k; s ++ ) {

				const g0 = i + Math.round( s * ( b - i + 1 ) / k ), g1 = i + Math.round( ( s + 1 ) * ( b - i + 1 ) / k ) - 1
				for ( let j = g0; j <= g1; j ++ ) bed[ j ] = bed[ g1 ] + ( g1 - j ) * 0.02

			}
			i = b

		}
		// grade de busca: segmentos por célula de 8 m (o carve roda em todos os vértices)
		const cell = 8, grid = new Map()
		for ( let i = 0; i < pts.length - 1; i ++ ) {

			const r = width[ i ] + 6
			const x0 = Math.min( pts[ i ][ 0 ], pts[ i + 1 ][ 0 ] ) - r, x1 = Math.max( pts[ i ][ 0 ], pts[ i + 1 ][ 0 ] ) + r
			const z0 = Math.min( pts[ i ][ 1 ], pts[ i + 1 ][ 1 ] ) - r, z1 = Math.max( pts[ i ][ 1 ], pts[ i + 1 ][ 1 ] ) + r
			for ( let cx = Math.floor( x0 / cell ); cx <= Math.floor( x1 / cell ); cx ++ ) for ( let cz = Math.floor( z0 / cell ); cz <= Math.floor( z1 / cell ); cz ++ ) {

				const k = cx + ',' + cz
				if ( ! grid.has( k ) ) grid.set( k, [] )
				grid.get( k ).push( i )

			}

		}
		// poça da nascente (river.pool = raio, 0 desliga): centro um pouco atrás do 1º ponto, lâmina = início do rio
		const pr = R.pool ?? 4
		const [ ax, az ] = pts[ 0 ], [ bx, bz ] = pts[ Math.min( 2, pts.length - 1 ) ]
		const bl = Math.hypot( bx - ax, bz - az ) || 1
		const pool = pr ? { x: ax - ( bx - ax ) / bl * pr * 0.5, z: az - ( bz - az ) / bl * pr * 0.5, r: pr, surf: bed[ 0 ] + depth * 0.7 } : null
		// o leito só começa a descer depois da borda da poça: a queda nasce na borda (senão o canal abre um rombo nela)
		if ( pool ) for ( let i = 1; i < pts.length && Math.hypot( pts[ i ][ 0 ] - pool.x, pts[ i ][ 1 ] - pool.z ) < pr + 1.5; i ++ ) bed[ i ] = bed[ 0 ]
		this.riverData = { pts, bed, width, depth, cell, grid, pool }

	}

	// água no ponto (mar, rio ou poça): { y: altura da lâmina, flow: [dx, dz] da correnteza (rio, m/s) ou null, kind }.
	// Só há água de verdade se o chão estiver abaixo de y (o plano do mar passa por baixo de toda a ilha)
	waterAt( x, z ) {

		const out = { y: this.waterLevel, flow: null, kind: 'sea' }
		const R = this.riverData
		if ( ! R ) return out
		const P = R.pool
		if ( P && Math.hypot( x - P.x, z - P.z ) < P.r + 0.5 && P.surf > out.y ) { out.y = P.surf; out.kind = 'pool' }
		const r = this.riverNear( x, z )
		if ( r && r.d < r.w * 1.05 ) {

			const s = r.bed + R.depth * 0.7
			if ( s > out.y ) {

				const [ ax, az ] = R.pts[ r.i ], [ bx, bz ] = R.pts[ r.i + 1 ]
				const l = Math.hypot( bx - ax, bz - az ) || 1
				const slope = ( R.bed[ r.i ] - R.bed[ r.i + 1 ] ) / l
				const v = 1.1 + Math.min( 3, slope * 6 ) // mais rápido onde desce
				out.y = s; out.kind = 'river'
				out.flow = [ ( bx - ax ) / l * v, ( bz - az ) / l * v ]

			}

		}
		return out

	}

	// rio mais próximo: { d, bed, w, i, t } ou null (fora da grade)
	riverNear( x, z ) {

		const R = this.riverData
		if ( ! R ) return null
		const list = R.grid.get( Math.floor( x / R.cell ) + ',' + Math.floor( z / R.cell ) )
		if ( ! list ) return null
		let best = null
		for ( const i of list ) {

			const [ ax, az ] = R.pts[ i ], [ bx, bz ] = R.pts[ i + 1 ]
			const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1
			const t = THREE.MathUtils.clamp( ( ( x - ax ) * vx + ( z - az ) * vz ) / l2, 0, 1 )
			const d = Math.hypot( x - ( ax + vx * t ), z - ( az + vz * t ) )
			// penhasco (degrau da cachoeira): a pedra cai quase toda logo na borda (o resto é chão do poço) → a parede recua
			// para trás da cortina de água, que desce reta em frente dela
			// penhasco só onde o River põe cortina (≥ 2,5 m); degrau baixo é rampa (corredeira)
			const cliff = ( R.bed[ i ] - R.bed[ i + 1 ] ) / Math.sqrt( l2 ) > 0.5 && R.bed[ i ] - R.bed[ i + 1 ] >= 2.5
			const tb = cliff ? ss( 0, 0.4, t ) : t
			if ( ! best || d < best.d ) best = { d, i, t, bed: lerp( R.bed[ i ], R.bed[ i + 1 ], tb ), w: lerp( R.width[ i ], R.width[ i + 1 ], t ) }

		}
		return best

	}

	riverDistance( x, z ) {

		const r = this.riverNear( x, z )
		return r ? r.d - r.w : Infinity

	}

	islandHeight( x, z ) {

		const n = this.noise
		const n1 = fbm( n, x * 0.010, z * 0.010, 5 )
		const n2 = fbm( n, x * 0.035 + 100, z * 0.035 - 40, 3 )
		const ridge = 1 - Math.abs( fbm( n, x * 0.018 + 50, z * 0.018 - 30, 4 ) )
		let h = 3 + n1 * 6 + n2 * 1.2 + Math.pow( ridge, 4 ) * 11 * ss( 0.45, 0.8, n1 * 0.5 + 0.5 )
		const r = Math.hypot( x, z ) / ( this.size * 0.5 )
		if ( this.floating ) h = lerp( - 40, Math.max( h, 1.6 ), 1 - ss( 0.74, 0.8, r ) ) // ilha flutuante: borda vira penhasco
		else h = lerp( - 6, h, 1 - ss( 0.6, 0.97, r ) ) // ilha cercada de mar
		h = lerp( h, 2.2, ss( 16, 5, Math.hypot( x, z ) ) ) // platô do spawn
		if ( this.terrace > 0 && h > 0 ) {

			// degraus (kit Kenney): platôs largos + rampas curtas e íngremes (viram rocha pela inclinação)
			const k = h / this.terrace, f = k - Math.floor( k )
			h = ( Math.floor( k ) + ss( 0.38, 0.62, f ) ) * this.terrace

		}

		return h

	}

	buildHeights() {

		const { res, size } = this
		this.heights = new Float32Array( res * res )
		const step = size / this.segments
		for ( let j = 0; j < res; j ++ ) {

			for ( let i = 0; i < res; i ++ ) {

				this.heights[ j * res + i ] = this.heightAt( - size / 2 + i * step, - size / 2 + j * step )

			}

		}

		if ( this.track ) this.track.flatten( this.heights, res, size, ( x, z ) => this.heightAt( x, z ) )

	}

	// Altura interpolada (bilinear) da grade — barata e idêntica à malha/física.
	sampleHeight( x, z ) {

		const { res, size, segments } = this
		const fx = THREE.MathUtils.clamp( ( x / size + 0.5 ) * segments, 0, segments - 1e-4 )
		const fz = THREE.MathUtils.clamp( ( z / size + 0.5 ) * segments, 0, segments - 1e-4 )
		const i = Math.floor( fx ), j = Math.floor( fz ), tx = fx - i, tz = fz - j
		const H = this.heights
		const a = H[ j * res + i ], b = H[ j * res + i + 1 ], c = H[ ( j + 1 ) * res + i ], d = H[ ( j + 1 ) * res + i + 1 ]
		return lerp( lerp( a, b, tx ), lerp( c, d, tx ), tz )

	}

	buildGeometry() {

		const { res, size, segments } = this
		const step = size / segments
		const positions = new Float32Array( res * res * 3 )
		for ( let j = 0; j < res; j ++ ) {

			for ( let i = 0; i < res; i ++ ) {

				const k = ( j * res + i ) * 3
				positions[ k ] = - size / 2 + i * step
				positions[ k + 1 ] = this.heights[ j * res + i ]
				positions[ k + 2 ] = - size / 2 + j * step

			}

		}

		const indices = new Uint32Array( segments * segments * 6 )
		let t = 0
		for ( let j = 0; j < segments; j ++ ) {

			for ( let i = 0; i < segments; i ++ ) {

				const a = j * res + i, b = a + 1, c = a + res, d = c + 1
				indices.set( [ a, c, b, b, c, d ], t )
				t += 6

			}

		}

		this.geometry = new THREE.BufferGeometry()
		this.geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) )
		this.geometry.setIndex( new THREE.BufferAttribute( indices, 1 ) )
		this.geometry.computeVertexNormals()
		this.geometry.computeBoundingSphere()
		this.positions = positions
		this.indices = indices

	}

	buildTextures() {

		const { res } = this
		const normals = this.geometry.attributes.normal.array
		const data = new Uint8Array( res * res * 4 )
		const heights16 = new Uint16Array( res * res )
		this.grassMask = new Float32Array( res * res )

		for ( let v = 0; v < res * res; v ++ ) {

			const h = this.heights[ v ], ny = normals[ v * 3 + 1 ]
			// margem do fosso: grama até perto da água, nunca rocha (a inclinação viraria "cânion" de pedra estriada)
			const moat = this.moatAt( - this.size / 2 + ( v % res ) * this.size / this.segments, - this.size / 2 + Math.floor( v / res ) * this.size / this.segments )
			const [ rh0, rh1 ] = this.rockHeight
			const grass = lerp( ss( 0.7, 1.5, h ) * ss( 0.72, 0.86, ny ) * ( 1 - ss( rh0 - 1, rh1 - 1, h ) ), ss( 0.3, 0.9, h ), moat )
			const sand = 1 - ss( 0.5, 1.3, h )
			const rock = Math.max( 1 - ss( 0.66, 0.8, ny ), ss( rh0, rh1, h ) ) * ( 1 - moat )
			data[ v * 4 ] = grass * 255
			data[ v * 4 + 1 ] = sand * 255
			data[ v * 4 + 2 ] = rock * 255
			data[ v * 4 + 3 ] = this.lawn ? this.lawnAt( - this.size / 2 + ( v % res ) * this.size / this.segments, - this.size / 2 + Math.floor( v / res ) * this.size / this.segments ) * 255 : 0
			heights16[ v ] = THREE.DataUtils.toHalfFloat( h )
			this.grassMask[ v ] = grass

		}

		// rio: altura da lâmina d'água por vértice (−100 longe do rio) → faixa de margem molhada no shader (world.bank)
		if ( this.riverData ) {

			const surf = new Uint16Array( res * res )
			const P = this.riverData.pool
			for ( let v = 0; v < res * res; v ++ ) {

				const x = - this.size / 2 + ( v % res ) * this.size / this.segments, z = - this.size / 2 + Math.floor( v / res ) * this.size / this.segments
				const r = this.riverNear( x, z )
				let s = r && r.d < r.w + 5 ? r.bed + this.riverData.depth * 0.7 : - 100
				if ( P && Math.hypot( x - P.x, z - P.z ) < P.r + 5 ) s = Math.max( s, P.surf )
				surf[ v ] = THREE.DataUtils.toHalfFloat( s )

			}
			this.riverTexture = new THREE.DataTexture( surf, res, res, THREE.RedFormat, THREE.HalfFloatType )
			this.riverTexture.magFilter = this.riverTexture.minFilter = THREE.NearestFilter // linear misturaria −100 com a lâmina
			this.riverTexture.needsUpdate = true

		}

		// biomas: peso de cada tipo por vértice (r, g, b) — mesma grade da dataTexture (worldToUV serve)
		if ( this.biomeKinds.length ) {

			const bio = new Uint8Array( res * res * 4 )
			for ( let v = 0; v < res * res; v ++ ) {

				const w = this.biomeAt( - this.size / 2 + ( v % res ) * this.size / this.segments, - this.size / 2 + Math.floor( v / res ) * this.size / this.segments )
				for ( let k = 0; k < 3; k ++ ) bio[ v * 4 + k ] = ( w[ k ] ?? 0 ) * 255
				bio[ v * 4 + 3 ] = 255

			}
			this.biomeTexture = new THREE.DataTexture( bio, res, res, THREE.RGBAFormat, THREE.UnsignedByteType )
			this.biomeTexture.magFilter = this.biomeTexture.minFilter = THREE.LinearFilter
			this.biomeTexture.needsUpdate = true

		}

		this.dataTexture = new THREE.DataTexture( data, res, res, THREE.RGBAFormat, THREE.UnsignedByteType )
		this.dataTexture.magFilter = this.dataTexture.minFilter = THREE.LinearFilter
		this.dataTexture.needsUpdate = true

		this.heightTexture = new THREE.DataTexture( heights16, res, res, THREE.RedFormat, THREE.HalfFloatType )
		this.heightTexture.magFilter = this.heightTexture.minFilter = THREE.LinearFilter
		this.heightTexture.needsUpdate = true

	}

	// 0..1: gramado aparado. Borda irregular por ruído (não é um círculo perfeito).
	lawnAt( x, z ) {

		const wobble = this.noise( x * 0.15 + 300, z * 0.15 ) * 1.6
		let m = ss( 8 + wobble, 5 + wobble, Math.hypot( x, z ) ) // spawn
		// 'wide' (Messenger): gramado em quase tudo; grama alta só em moitas (≈ 25% do mapa)
		if ( this.lawn === 'wide' ) m = Math.max( m, 1 - ss( 0.28, 0.42, this.noise( x * 0.07 + 40, z * 0.07 - 90 ) + wobble * 0.05 ) )
		for ( const p of this.pads ) {

			m = Math.max( m, ss( p.r + 6 + wobble, p.r + 3 + wobble, Math.hypot( x - p.x, z - p.z ) ) )
			// caminho spawn → casa (distância ao segmento), meio sinuoso
			const L = Math.hypot( p.x, p.z ), t = THREE.MathUtils.clamp( ( x * p.x + z * p.z ) / ( L * L ), 0, 1 )
			const bend = Math.sin( t * Math.PI ) * 1.6
			const cx = p.x * t - p.z / L * bend, cz = p.z * t + p.x / L * bend
			m = Math.max( m, ss( 2.6 + wobble * 0.5, 1.6 + wobble * 0.5, Math.hypot( x - cx, z - cz ) ) )

		}

		return m

	}

	grassAt( x, z ) {

		const { res, size, segments } = this
		const i = Math.round( THREE.MathUtils.clamp( ( x / size + 0.5 ) * segments, 0, segments ) )
		const j = Math.round( THREE.MathUtils.clamp( ( z / size + 0.5 ) * segments, 0, segments ) )
		return this.grassMask[ j * res + i ]

	}

	normalYAt( x, z ) {

		const e = 0.6
		const dx = this.sampleHeight( x + e, z ) - this.sampleHeight( x - e, z )
		const dz = this.sampleHeight( x, z + e ) - this.sampleHeight( x, z - e )
		return 2 * e / Math.hypot( dx, 2 * e, dz )

	}

	addToPhysics( physics ) {

		const { RAPIER, world } = physics
		const body = world.createRigidBody( RAPIER.RigidBodyDesc.fixed() )
		this.collider = world.createCollider( RAPIER.ColliderDesc.trimesh( this.positions, this.indices ).setFriction( 0.9 ), body )

	}

}
