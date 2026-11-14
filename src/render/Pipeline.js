import * as THREE from 'three/webgpu'
import {
	Fn, pass, mrt, output, normalView, packNormalToRGB, unpackRGBToNormal, vec2, vec3, vec4, float, uniform,
	screenUV, screenSize, perspectiveDepthToViewZ, reference, smoothstep, step, max, min, dot, mix, select, abs,
	renderOutput, texture3D, convertToTexture, hash, time, sample, floor
} from 'three/tsl'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js'
import { fxaa } from 'three/addons/tsl/display/FXAANode.js'
import { smaa } from 'three/addons/tsl/display/SMAANode.js'
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js'
import { createGradeLUT } from './Textures.js'

/**
 * Cadeia de pós (ordem importa):
 *   cena (MRT: cor + normal/tinta + profundidade)
 *   → contorno (Messenger) → × oclusão GTAO (opcional) → + bloom (linear/HDR)
 *   → renderOutput (tone mapping + sRGB)
 *   → tilt-shift (Bruno) → LUT de grading → vinheta + grão → FXAA/SMAA
 */
export class Pipeline {

	constructor( renderer, scene, camera, style, quality ) {

		this.renderer = renderer
		this.pipeline = new THREE.RenderPipeline( renderer )
		this.pipeline.outputColorTransform = false // controlamos a ordem com renderOutput()

		const scenePass = pass( scene, camera )
		const useIds = !! style.outline?.ids // ID de superfície (Messenger): material grava em `id`, padrão 0 = sem ID
		scenePass.setMRT( mrt( {
			output,
			normal: vec4( packNormalToRGB( normalView ), float( 1 ) ), // alfa = máscara de tinta (material.mrtNode pode mudar)
			...( useIds ? { id: vec4( 0, 0, 0, 1 ) } : {} )
		} ) )
		scenePass.getTexture( 'normal' ).type = THREE.UnsignedByteType // economiza banda
		if ( useIds ) scenePass.getTexture( 'id' ).type = THREE.HalfFloatType
		this.scenePass = scenePass

		const colorTex = scenePass.getTextureNode( 'output' )
		const normalTex = scenePass.getTextureNode( 'normal' )
		const depthTex = scenePass.getTextureNode( 'depth' )
		const idTex = useIds ? scenePass.getTextureNode( 'id' ) : null

		let hdr = colorTex.rgb

		// ---------- Contorno (depth + normal, traço de quem está na frente, fade por distância)
		const o = style.outline
		this.outline = null
		if ( o && o.enabled ) {

			const u = {
				color: uniform( new THREE.Color( o.color ) ),
				thickness: uniform( o.thickness ),
				depth: uniform( o.depth ),
				normal: uniform( o.normal ),
				fadeStart: uniform( o.fadeStart ),
				fadeEnd: uniform( o.fadeEnd )
			}
			this.outline = u

			const near = reference( 'near', 'float', camera )
			const far = reference( 'far', 'float', camera )
			const realDist = ( uv ) => perspectiveDepthToViewZ( depthTex.sample( uv ).r, near, far ).negate()
			// profundidade do CONTORNO: o MRT `id`.g pode sobrescrever a real (copa em cartões grava a do centro da árvore → a copa
			// vira uma bola só para o traço: contorno na silhueta, nada entre cartões). 0 = usa a real. Texel exato (sem misturar vizinhos).
			const texelUV = ( uv ) => floor( uv.mul( screenSize ) ).add( 0.5 ).div( screenSize )
			const viewDist = idTex
				? ( uv ) => { const o = idTex.sample( texelUV( uv ) ).g; return select( o.greaterThan( 0 ), o, realDist( uv ) ) }
				: realDist

			// raio do traço: 1 = fino; style.pen.thick = traço grosso onde a "caneta aperta" (pressão alta no alfa do MRT)
			const edgeAt = ( radius, diagonals = false, ids = idTex ) => Fn( () => {

				// espessura em pixels físicos, compensando resolução (traço igual em 1080p e 4K)
				const resScale = min( screenSize.y.div( 1080 ), float( 2 ) ).max( 0.75 )
				const px = vec2( u.thickness.mul( resScale ).mul( radius ) ).div( screenSize )
				const uv0 = screenUV
				const uvs = [ uv0.add( vec2( px.x, 0 ) ), uv0.sub( vec2( px.x, 0 ) ), uv0.add( vec2( 0, px.y ) ), uv0.sub( vec2( 0, px.y ) ) ]
				// raio grande só em cruz deixa "+" e contas nos cantos → 8 direções
				if ( diagonals ) {

					const dx = px.mul( 0.7071 )
					uvs.push( uv0.add( dx ), uv0.sub( dx ), uv0.add( vec2( dx.x, dx.y.negate() ) ), uv0.add( vec2( dx.x.negate(), dx.y ) ) )

				}

				const d0 = viewDist( uv0 ).toVar()
				const s0 = normalTex.sample( uv0 )
				const n0 = unpackRGBToNormal( s0.rgb )

				const nearestD = d0.toVar()
				const nearestInk = s0.a.toVar()
				const depthEdge = float( 0 ).toVar()
				const normalEdge = float( 0 ).toVar()
				const idEdge = float( 0 ).toVar()
				// ID lido no texel exato: o filtro bilinear mistura lâmina (ID 0) com chão e inventa um ID no meio → contorno em cada lâmina
				const texel = texelUV
				const id0 = ids ? ids.sample( texel( uv0 ) ).r : null

				// superfícies rasantes pedem limiar maior (senão o chão inclinado vira rabisco)
				const grazing = float( 1 ).sub( abs( n0.z ) ).mul( 3 ).add( 1 )
				const depthThr = u.depth.mul( grazing )

				for ( const uv of uvs ) {

					const d = viewDist( uv )
					const s = normalTex.sample( uv )
					const rel = d0.sub( d ).div( d0 )
					// vizinho mais perto da câmera = "dono" do traço (evita contornar grama/água por trás)
					nearestInk.assign( select( d.lessThan( nearestD ), s.a, nearestInk ) )
					nearestD.assign( min( nearestD, d ) )
					depthEdge.assign( max( depthEdge, rel ) )
					// dobra (normal) só conta na MESMA superfície (profundidade parecida) e se o vizinho também tem tinta
					const sameSurface = float( 1 ).sub( smoothstep( depthThr.mul( 0.5 ), depthThr, abs( rel ) ) )
					normalEdge.assign( max( normalEdge, float( 1 ).sub( dot( n0, unpackRGBToNormal( s.rgb ) ) ).mul( sameSurface ).mul( s.a ) ) )
					if ( ids ) {

						// ID diferente na mesma superfície (os dois com ID > 0): porta × parede, telha × telha, tábua × tábua
						const id = ids.sample( texel( uv ) ).r
						// vizinho sem tinta (base do tufo, falha da caneta) não vira linha: senão o pé de cada tufo risca o chão
						const inkN = normalTex.sample( texel( uv ) ).a
						idEdge.assign( max( idEdge, step( 0.002, abs( id.sub( id0 ) ) ).mul( step( 0.0001, min( id, id0 ) ) ).mul( sameSurface ).mul( step( 0.02, inkN ) ) ) )

					}

				}

				const de = smoothstep( depthThr, depthThr.mul( 2 ), depthEdge )
				const ne = smoothstep( u.normal, u.normal.add( 0.25 ), normalEdge )
				const fade = float( 1 ).sub( smoothstep( u.fadeStart, u.fadeEnd, nearestD ) )
				// sem caneta: tinta é máscara linear (como antes) · com caneta: pressão baixa = falha, alta = cheio
				const inkDepth = style.pen ? smoothstep( 0.06, 0.3, nearestInk ) : nearestInk
				const inkNormal = style.pen ? smoothstep( 0.06, 0.3, s0.a ) : s0.a
				return vec2( max( max( de.mul( inkDepth ), ne.mul( inkNormal ) ), idEdge.mul( inkNormal ) ).mul( fade ), nearestInk )

			} )()

			// Messenger: diferença CENTRAL em cruz (esq − dir, baixo − cima) → linha centrada na borda e mais fina que o "máximo dos
			// vizinhos". Cada variação passa por fit duplo: fit(fit(v, faixa) , limiar, limiar + 0.2). Profundidade relativa (÷ d0) com
			// limiar + 1 − |normal.z| (chão rasante pede mais). outline.central = { depth: [a, b, limiar], normal: [...], id: [...] }
			const c = o.central ?? {}
			const fit = ( v, a, b ) => v.sub( a ).div( b - a ).clamp( 0, 1 )
			const fit2 = ( v, [ a, b, t ], extra = 0 ) => smoothstep( 0, 1, fit( v, a, b ).sub( float( t ).add( extra ) ).div( 0.2 ).clamp( 0, 1 ) )
			const cDepth = c.depth ?? [ 0, 0.05, 0.25 ], cNormal = c.normal ?? [ 1.0, 1.4, 0.3 ], cId = c.id ?? [ 0.001, 0.002, 0.1 ]
			const centralAt = ( radius, ids = idTex ) => Fn( () => {

				// outline.resScale 'fixed' (Messenger, medido em DPR 1 e 2): deslocamento em pixels físicos constante → a faixa da diferença
				// central (2 × deslocamento) fica ~2,3 px em 720p e em 1440p. O padrão cresce com a altura (traço grosso em telas HiDPI)
				const resScale = o.resScale === 'fixed' ? float( 1 ) : min( screenSize.y.div( 1080 ), float( 2 ) ).max( 0.75 )
				const px = vec2( u.thickness.mul( resScale ).mul( radius ) ).div( screenSize )
				const uv0 = screenUV
				const uvs = [ uv0.sub( vec2( px.x, 0 ) ), uv0.add( vec2( px.x, 0 ) ), uv0.sub( vec2( 0, px.y ) ), uv0.add( vec2( 0, px.y ) ) ] // esq, dir, baixo, cima
				const d0 = viewDist( uv0 )
				const s0 = normalTex.sample( uv0 )
				const n0 = unpackRGBToNormal( s0.rgb )
				const ds = uvs.map( ( uv ) => viewDist( uv ).toVar() )
				const ss = uvs.map( ( uv ) => normalTex.sample( uv ) )
				const ns = ss.map( ( s ) => unpackRGBToNormal( s.rgb ) )

				const nearestD = d0.toVar()
				const nearestInk = s0.a.toVar()
				for ( let i = 0; i < 4; i ++ ) {

					nearestInk.assign( select( ds[ i ].lessThan( nearestD ), ss[ i ].a, nearestInk ) )
					nearestD.assign( min( nearestD, ds[ i ] ) )

				}

				// profundidade: vetor (esq − dir, baixo − cima) relativo à distância do centro
				const depthVar = vec2( ds[ 0 ].sub( ds[ 1 ] ), ds[ 2 ].sub( ds[ 3 ] ) ).length().div( d0 )
				const de = fit2( depthVar, cDepth, float( 1 ).sub( abs( n0.z ) ) )
				// dobra: só entre vizinhos da mesma superfície e com tinta (senão a silhueta conta 2 vezes)
				const same = ( i, j ) => float( 1 ).sub( smoothstep( 0.5, 1, abs( ds[ i ].sub( ds[ j ] ) ).div( d0 ).div( cDepth[ 1 ] ) ) ).mul( step( 0.02, min( ss[ i ].a, ss[ j ].a ) ) )
				const normalVar = vec2( ns[ 0 ].sub( ns[ 1 ] ).length().mul( same( 0, 1 ) ), ns[ 2 ].sub( ns[ 3 ] ).length().mul( same( 2, 3 ) ) ).length()
				const ne = fit2( normalVar, cNormal )
				let ie = float( 0 )
				if ( ids ) {

					// ID 0 = "sem ID" e vizinho sem tinta (base do tufo) não entram: o eixo inteiro é ignorado
					const id = uvs.map( ( uv ) => ids.sample( texelUV( uv ) ).r )
					const ink = uvs.map( ( uv ) => normalTex.sample( texelUV( uv ) ).a )
					const ok = ( i, j ) => step( 0.0001, min( id[ i ], id[ j ] ) ).mul( step( 0.02, min( ink[ i ], ink[ j ] ) ) ).mul( same( i, j ) )
					const idVar = vec2( id[ 0 ].sub( id[ 1 ] ).mul( ok( 0, 1 ) ), id[ 2 ].sub( id[ 3 ] ).mul( ok( 2, 3 ) ) ).length()
					ie = fit2( idVar, cId )

				}

				const fade = float( 1 ).sub( smoothstep( u.fadeStart, u.fadeEnd, nearestD ) )
				const inkDepth = style.pen ? smoothstep( 0.06, 0.3, nearestInk ) : nearestInk
				const inkSelf = style.pen ? smoothstep( 0.06, 0.3, s0.a ) : s0.a
				// id.b = 1 (céu): o traço de ID não some com a distância → nuvens contornadas
				const idFade = ids ? max( fade, ids.sample( texelUV( uv0 ) ).b ) : fade
				return vec2( de.mul( inkDepth ).add( ne.mul( inkSelf ) ).mul( fade ).add( ie.mul( inkSelf ).mul( idFade ) ).min( 1 ), nearestInk )

			} )()

			let edge
			if ( o.mode === 'central' ) {

				const thin = centralAt( 1 )
				// pen.thick ≤ 1 = só falhas, espessura constante (sem o 2º passe)
				edge = style.pen?.thick > 1 ? max( thin.x, centralAt( style.pen.thick, null ).x.mul( smoothstep( 0.62, 0.85, thin.y ) ) ) : thin.x

			} else if ( style.pen ) {

				const thin = edgeAt( 1 )
				const thick = edgeAt( style.pen.thick, true, null ) // ID só no traço fino (economiza 9 leituras por pixel)
				// traço grosso só onde a pressão é alta → espessura varia ao longo da linha (pincel/nanquim)
				edge = max( thin.x, thick.x.mul( smoothstep( 0.62, 0.85, thick.y ) ) )

			} else edge = edgeAt( 1 ).x

			hdr = mix( hdr, u.color, edge )

		}

		// ---------- Oclusão de ambiente (GTAO) — "assenta" objetos: base do toco, peças na grama, vãos, contatos.
		// Reaproveita profundidade + normal do MRT (sem pré-passe), meia resolução com blur. style.ao = { radius, intensity, scale }
		const a = style.ao
		if ( a ) {

			const normalSample = sample( ( uv ) => unpackRGBToNormal( normalTex.sample( uv ).rgb ) )
			const aoPass = ao( depthTex, normalSample, camera )
			aoPass.resolutionScale = a.scale ?? 0.5
			aoPass.radius.value = a.radius ?? 0.5
			aoPass.thickness.value = a.thickness ?? 1
			aoPass.samples.value = a.samples ?? 8 // 16 (padrão) custa ~2× numa iGPU; 8 + blur já basta
			this.ao = aoPass
			this.aoIntensity = uniform( a.intensity ?? 1 )
			const occ = aoPass.getTextureNode().sample( screenUV ).r
			hdr = hdr.mul( mix( float( 1 ), occ, this.aoIntensity ) )

		}

		// ---------- Bloom (só o que passa do limiar: emissivos HDR)
		const b = style.bloom
		if ( b ) {

			const bloomPass = bloom( colorTex, b.strength, b.radius, b.threshold )
			bloomPass._nMips = quality.bloomMips
			hdr = hdr.add( bloomPass.rgb )
			this.bloom = bloomPass

		}

		// ---------- Saída (tone mapping + sRGB do renderer)
		let ldr = renderOutput( vec4( hdr, 1 ) )

		// ---------- Tilt-shift barato (blur por faixa vertical)
		const t = style.tilt
		if ( t ) {

			const tex = convertToTexture( ldr )
			const strength = smoothstep( t.start, t.end, screenUV.y.sub( 0.5 ).abs() )
			ldr = mix( tex, hashBlur( tex, strength.mul( t.amount ), { repeats: float( 20 ), premultipliedAlpha: true } ), strength )

		}

		// ---------- LUT de grading gerada por código
		if ( style.grade ) {

			this.lutTexture = createGradeLUT( style.grade, 32 )
			this.lutIntensity = uniform( 1 )
			ldr = lut3D( ldr, texture3D( this.lutTexture ), 32, this.lutIntensity )

		}

		// ---------- Vinheta + grão (grão quebra banding do céu)
		const finalNode = Fn( () => {

			const c = vec4( ldr ).toVar()
			const d = screenUV.sub( 0.5 ).mul( vec2( screenSize.x.div( screenSize.y ), 1 ) ).length()
			c.rgb.mulAssign( mix( 1, 1 - ( style.vignette ?? 0.18 ), smoothstep( 0.45, 1.05, d ) ) )
			const p = screenUV.mul( screenSize ).floor()
			const grain = hash( p.x.add( p.y.mul( 8192 ) ).add( time.mul( 60 ).floor().mul( 7919 ) ) ).sub( 0.5 ).mul( 1.5 / 255 )
			if ( style.grain !== false ) c.rgb.addAssign( vec3( grain ) )
			return c

		} )()

		// ---------- Anti-aliasing em pós (MSAA não combina com MRT barato)
		const aaNode = quality.aa === 'smaa' ? smaa( finalNode ) : fxaa( finalNode )
		this.pipeline.outputNode = aaNode

	}

	render() {

		this.pipeline.render()

	}

	dispose() {

		this.pipeline.dispose()
		this.lutTexture?.dispose()

	}

}
