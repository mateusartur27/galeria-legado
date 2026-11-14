import * as THREE from 'three/webgpu'
import { Fn, uniform, vec2, vec3, vec4, mix, smoothstep, step, pow, max, dot, normalize, positionLocal, float, fract, floor, hash, time, sin, atan, asin, PI, texture, fwidth } from 'three/tsl'
import { inkMRT } from './ToonMaterial.js'

// Domo de céu. style.sky.style:
//   'gradient'  horizonte → zênite + brilho e disco do sol HDR (Shopify/Bruno/Messenger)
//   'synthwave' 3 paradas (horizonte quente → roxo → noite), sol GRANDE com listras, estrelas piscando (Horizon Drive)
//   'flat'      cor única = névoa (Kenney, Bruno 2019): o mundo "flutua" num fundo limpo
//   'painted'   turquesa + nuvens em pinceladas de 2 tons com borda recortada (Messenger); usa look.noiseTexture
export class Sky {

	constructor( look, style ) {

		const s = style.sky
		this.zenith = uniform( new THREE.Color( s.zenith ) )
		this.horizon = uniform( new THREE.Color( s.horizon ) )
		this.glow = uniform( new THREE.Color( s.sunGlow ) )

		const material = new THREE.MeshBasicNodeMaterial( { side: THREE.BackSide, depthWrite: false, fog: false } )

		if ( s.style === 'flat' ) {

			material.colorNode = vec4( look.fogColor, 1 )

		} else if ( s.style === 'radial' ) {

			// Bruno 2025: sem céu — o fundo é o mesmo degradê de tela da névoa radial (fog.mode 'radial')
			material.colorNode = vec4( look.fogRadialColor(), 1 )

		} else if ( s.style === 'painted' ) {

			// Messenger: turquesa chapado + nuvens em PINCELADAS compridas, 2 tons, bordas recortadas (sem degradê macio)
			const cloud = uniform( new THREE.Color( s.cloud ) ), cloudShade = uniform( new THREE.Color( s.cloudShade ) )
			const noise = look.noiseTexture
			this.cloudDrift = uniform( new THREE.Vector2( 0.0035, 0.0012 ) )
			// ruído das nuvens (0 fora … ~1 dentro) e altura: a cor e o ID (s.outline) leem o mesmo
			const cloudNoise = ( p ) => texture( noise, p ).r.mul( 0.62 )
				.add( texture( noise, p.mul( 3.3 ).add( 7.1 ) ).g.mul( 0.26 ) )
				.add( texture( noise, p.mul( 9.7 ).add( 3.3 ) ).b.mul( 0.12 ) ) // detalhe fino = borda "rasgada" de pincel
			const cloudP = Fn( () => {

				const dir = normalize( positionLocal )
				// plano de nuvens: perspectiva natural (afinam e se juntam no horizonte)
				const plane = dir.xz.div( dir.y.max( 0.035 ) ).mul( 0.5 )
				const a = float( 0.6 ), ca = a.cos(), sa = a.sin()
				const r = vec2( plane.x.mul( ca ).sub( plane.y.mul( sa ) ), plane.x.mul( sa ).add( plane.y.mul( ca ) ) )
				return r.mul( vec2( 0.028, 0.1 ) ).add( time.mul( this.cloudDrift ) ) // esticada e larga → faixas compridas

			} )()
			const cloudAt = vec2( cloudNoise( cloudP ), normalize( positionLocal ).y )

			material.colorNode = Fn( () => {

				const dir = normalize( positionLocal )
				const col = mix( this.horizon, this.zenith, smoothstep( - 0.02, 0.6, dir.y ) ).toVar()
				const n = cloudAt.x
				const fade = smoothstep( 0.015, 0.12, dir.y )
				const aa = fwidth( n ).max( 1e-4 )
				col.assign( mix( col, cloudShade, smoothstep( 0.5, aa.add( 0.5 ), n ).mul( fade ) ) )
				col.assign( mix( col, cloud, smoothstep( 0.545, aa.add( 0.545 ), n ).mul( fade ) ) )
				col.assign( mix( look.fogColor, col, smoothstep( - 0.25, 0.02, dir.y ) ) )
				return vec4( col, float( 1 ) )

			} )()

			// s.outline (Messenger): o céu grava ID 0.01 (fundo) / 1 (nuvem) com tinta → o contorno desenha a borda das nuvens.
			// A tinta some perto do horizonte (lá as nuvens viram fiapos e o traço vira rabisco); id.b = 1 → sem fade por distância
			if ( s.outline ) {

				// 3 tons (fundo, sombra da nuvem, nuvem) = 3 IDs: no alto o céu é quase todo nuvem e a borda visível é sombra × nuvem
				// (testado: mediana vertical de 3 amostras para tirar fiapos do ID → pontilhado, pior)
				const above = step( 0.04, cloudAt.y )
				const cloudId = float( 0.01 ).add( step( 0.5, cloudAt.x ).mul( 0.49 ).add( step( 0.545, cloudAt.x ).mul( 0.5 ) ).mul( above ) )
				this.inkMRT = inkMRT( smoothstep( 0.13, 0.22, cloudAt.y ), cloudId, null, null, float( 1 ) )

			}

		} else if ( s.style === 'blobs' ) {

			// Messenger (medido nos prints): fundo chapado + nuvens em MASSAS largas de 1 tom, borda recortada e "rasgada" por um
			// ruído fino, ilhotas soltas perto da borda. Sem degradê, sem contorno de tinta (as nuvens do jogo não têm traço)
			const cloud = uniform( new THREE.Color( s.cloud ) )
			const noise = look.noiseTexture
			this.cloudDrift = uniform( new THREE.Vector2( 0.002, 0.0008 ) )
			material.colorNode = Fn( () => {

				const dir = normalize( positionLocal )
				// pintado no DOMO (ângulo em volta × altura), não num plano: o plano estica em colunas no horizonte e esvazia o céu
				// que a câmera baixa vê. 5 voltas da textura em 360° (repete sem costura), achatado na altura → massas largas
				const p = vec2( atan( dir.z, dir.x ).mul( 5 / ( Math.PI * 2 ) ), dir.y.mul( 1.6 ) ).add( time.mul( this.cloudDrift ) )
				const n = texture( noise, p ).r.mul( 0.7 )
					.add( texture( noise, p.mul( 3 ).add( 4.3 ) ).g.mul( 0.2 ) ) // escalas inteiras: sem costura no atan
					.add( texture( noise, p.mul( 11 ).add( 1.7 ) ).b.mul( 0.1 ) ) // borda rasgada + ilhotas
				const aa = fwidth( n ).max( 1e-4 )
				// perto do horizonte o limiar sobe: as nuvens rareiam até sumir (cortar em dir.y fixo deixava uma linha reta sobre o mar)
				const thr = float( s.coverage ?? 0.5 ).add( float( 1 ).sub( smoothstep( 0.0, 0.14, dir.y ) ).mul( 0.3 ) )
				const mask = smoothstep( thr, aa.add( thr ), n )
				const col = mix( this.zenith, cloud, mask ).toVar()
				col.assign( mix( look.fogColor, col, smoothstep( - 0.2, 0.02, dir.y ) ) )
				return vec4( col, float( 1 ) )

			} )()

		} else if ( s.style === 'synthwave' ) {

			const mid = uniform( new THREE.Color( s.mid ) )
			const sunTop = uniform( new THREE.Color( s.sunTop ) ), sunBottom = uniform( new THREE.Color( s.sunBottom ) )
			const sunSize = float( s.sunSize ?? 0.12 )

			material.colorNode = Fn( () => {

				const dir = normalize( positionLocal )
				const col = mix( this.horizon, mid, smoothstep( 0.0, 0.22, dir.y ) ).toVar()
				col.assign( mix( col, this.zenith, smoothstep( 0.18, 0.7, dir.y ) ) )
				col.assign( mix( look.fogColor, col, smoothstep( - 0.2, 0.01, dir.y ) ) )

				// sol: coordenadas angulares em volta da direção do sol
				const sd = look.sunDir
				const s2 = max( dot( dir, sd ), 0 )
				col.addAssign( this.glow.mul( pow( s2, 8 ).mul( 0.55 ).add( pow( s2, 64 ).mul( 0.6 ) ) ) )
				const ang = float( 1 ).sub( s2 ).mul( 2 ).sqrt() // ~ ângulo até o centro do sol
				const disc = float( 1 ).sub( smoothstep( sunSize.mul( 0.97 ), sunSize, ang ) )
				// altura relativa dentro do disco (−1 base … +1 topo)
				const v = dir.y.sub( sd.y ).div( sunSize ).clamp( - 1, 1 )
				// listras horizontais que engrossam para baixo (só na metade de baixo)
				const stripeCoord = v.mul( - 7 )
				const stripeWidth = float( 1 ).sub( smoothstep( - 1.0, 0.1, v ) ).mul( 0.55 ) // smoothstep só com a < b
				const stripes = smoothstep( stripeWidth.sub( 0.04 ), stripeWidth, fract( stripeCoord ) ).max( step01( v ) )
				const sunCol = mix( sunBottom, sunTop, v.mul( 0.5 ).add( 0.5 ) ).mul( 2.6 ) // HDR → bloom
				col.assign( mix( col, sunCol, disc.mul( stripes ) ) )

				// estrelas: grade em coordenadas esféricas, 1 estrela por célula com brilho piscante
				if ( s.stars ) {

					const sph = vec2( atan( dir.z, dir.x ), asin( dir.y.clamp( - 1, 1 ) ) ).mul( vec2( 90, 90 ).div( PI ) )
					const cell = floor( sph )
					const h = hash( cell.x.add( cell.y.mul( 517 ) ) )
					const pos = fract( sph ).sub( vec2( hash( cell.x.mul( 3 ).add( cell.y.mul( 91 ) ) ), hash( cell.y.mul( 13 ).add( cell.x.mul( 7 ) ) ) ).mul( 0.6 ).add( 0.2 ) )
					const star = float( 1 ).sub( smoothstep( 0.0, 0.07, pos.length() ) ).mul( step01( h.sub( 0.86 ) ) )
					const twinkle = sin( time.mul( h.mul( 4 ).add( 1 ) ).add( h.mul( 40 ) ) ).mul( 0.35 ).add( 0.65 )
					col.addAssign( vec3( star.mul( twinkle ).mul( smoothstep( 0.12, 0.5, dir.y ) ).mul( 1.6 ) ) )

				}

				return vec4( col, float( 1 ) )

			} )()

		} else {

			material.colorNode = Fn( () => {

				const dir = normalize( positionLocal )
				const t = smoothstep( - 0.02, 0.55, dir.y )
				const col = mix( this.horizon, this.zenith, pow( t, 0.75 ) ).toVar()
				// abaixo do horizonte: puxa para a névoa (o mundo "some" sem linha dura)
				col.assign( mix( look.fogColor, col, smoothstep( - 0.25, 0.02, dir.y ) ) )
				const s2 = max( dot( dir, look.sunDir ), 0 )
				col.addAssign( this.glow.mul( pow( s2, 6 ).mul( 0.18 ).add( pow( s2, 48 ).mul( 0.45 ) ) ) )
				col.addAssign( this.glow.mul( smoothstep( 0.9993, 0.9997, s2 ).mul( 6 ) ) ) // disco HDR
				return vec4( col, float( 1 ) )

			} )()

		}

		material.mrtNode = this.inkMRT ?? inkMRT( 0 )

		this.mesh = new THREE.Mesh( new THREE.SphereGeometry( 450, 32, 16 ), material )
		this.mesh.frustumCulled = false
		this.mesh.renderOrder = 1000 // depois dos opacos: só pinta pixels vazios (early-z)

	}

	update( camera ) {

		this.mesh.position.copy( camera.position )

	}

}

// degrau 0/1 (x > 0) sem depender de step() com argumentos invertidos
const step01 = ( x ) => float( x ).greaterThan( 0 ).select( float( 1 ), float( 0 ) )
