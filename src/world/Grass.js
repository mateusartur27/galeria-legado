import * as THREE from 'three/webgpu'
import {
	Fn, uniform, attribute, vertexIndex, positionGeometry, positionWorld, texture, cameraPosition, time, vec2, vec3, float,
	mod, select, smoothstep, step, mix, varying, color, normalize, max, length, floor, cross, dot, pow, uniformArray, Loop, If
} from 'three/tsl'
import { createToonMaterial } from '../render/ToonMaterial.js'
import { rng } from '../core/utils.js'

const TRAIL = 14 // pontos de rastro (≈ 5 m de caminho)
const TRAIL_RECOVER = 4 // segundos até a grama levantar

// Grama "infinita" em 1 draw call (técnica do Bruno Simon 2025): N lâminas num quadrado que acompanha o jogador
// (mod/wrap no shader). Altura/máscara vêm das texturas do terreno; vento por textura de ruído; empurrada pelo jogador.
//
// shape: 'tri'   → 1 triângulo por lâmina virado para a câmera (estilizado, baratíssimo)
//        'blade' → lâmina realista: 7 vértices (3 segmentos + ponta), curvada, afinando, com orientação própria,
//                  normal arredondada que segue a curva, base escura (oclusão), ponta clara e CONTRALUZ (translucidez)
// variation (0..1): cada lâmina ganha tom e brilho próprios + algumas secas (0 = uniforme)
export class Grass {

	// patchiness (0..1): falhas por manchas (terra/folhas aparecem) · heightVariance (0..1): brotos curtos + hastes altas · dryAmount: fração seca
	constructor( { look, terrain, palette, noiseTexture, subdivisions = 240, size = 48, seed = 3, variation = 0, edgeStart = 0.82, shape = 'tri', patchiness = 0, heightVariance = 0, dryAmount = 0.1, lawnKeep = 0.22, field = null } ) {

		// campo: o quadrado fica PARADO cobrindo só o campo (não segue o jogador) → todas as lâminas caem nele.
		// field.density = lâminas por metro (por lado); a câmera baixa enxerga entre as lâminas, então precisa mais que o ink
		if ( field ) {

			size = field.r * 2.6 // a borda irregular (ruído) pode passar do raio
			subdivisions = Math.round( size * ( field.density ?? 9 ) )

		}
		this.fieldCenter = field ? new THREE.Vector2( field.x, field.z ) : null
		this.size = size
		const blade = shape === 'blade'
		const V = blade ? 7 : 3 // vértices por lâmina
		const count = subdivisions * subdivisions
		const random = rng( seed )
		const positions = new Float32Array( count * V * 3 )
		const rand = new Float32Array( count * V * 3 )
		const normals = new Float32Array( count * V * 3 )
		const cell = size / subdivisions

		for ( let ix = 0; ix < subdivisions; ix ++ ) {

			for ( let iz = 0; iz < subdivisions; iz ++ ) {

				const i = ix * subdivisions + iz
				const x = ( ix / subdivisions - 0.5 ) * size + ( random() ) * cell
				const z = ( iz / subdivisions - 0.5 ) * size + ( random() ) * cell
				const r1 = random(), r2 = random(), r3 = random()
				for ( let v = 0; v < V; v ++ ) {

					const k = ( i * V + v ) * 3
					positions[ k ] = x; positions[ k + 1 ] = 0; positions[ k + 2 ] = z
					rand[ k ] = r1; rand[ k + 1 ] = r2; rand[ k + 2 ] = r3
					normals[ k + 1 ] = 1

				}

			}

		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) )
		geometry.setAttribute( 'normal', new THREE.BufferAttribute( normals, 3 ) )
		geometry.setAttribute( 'aRand', new THREE.BufferAttribute( rand, 3 ) )
		if ( blade ) {

			// vértices: 0/1 base (esq/dir), 2/3 1º terço, 4/5 2º terço, 6 ponta → 5 triângulos
			const pattern = [ 0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6 ]
			const index = new Uint32Array( count * pattern.length )
			for ( let i = 0; i < count; i ++ ) for ( let j = 0; j < pattern.length; j ++ ) index[ i * pattern.length + j ] = i * V + pattern[ j ]
			geometry.setIndex( new THREE.BufferAttribute( index, 1 ) )

		}

		geometry.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e5 )

		this.center = uniform( new THREE.Vector2() )
		this.player = uniform( new THREE.Vector3( 0, - 100, 0 ) )
		this.bladeHeight = uniform( 0.55 )
		this.bladeWidth = uniform( 0.075 )
		this.wind = uniform( 0.35 )
		this.lean = uniform( 0.35 ) // curvatura natural das lâminas (modo 'blade')
		// clareira (x, z, raio): grama some em volta de um ponto (toco da lenha, fogueira, construção…)
		this.clearing = uniform( new THREE.Vector3( 1e5, 1e5, 1 ) ) // raio > 0 sempre (smoothstep exige a < b)
		this.field = uniform( new THREE.Vector3( field?.x ?? 0, field?.z ?? 0, field?.r ?? 1 ) ) // campo de grama alta (x, z, raio)
		// rastro de pisadas (x, z, força, ângulo) — anel circular atualizado em update()
		this.trailPoints = Array.from( { length: TRAIL }, () => new THREE.Vector4( 1e5, 1e5, 0, 0 ) )
		this.trailBorn = new Float32Array( TRAIL ).fill( - 1e5 )
		this.trailHead = 0
		this.lastStep = new THREE.Vector2( 1e5, 1e5 )
		this.trail = uniformArray( this.trailPoints, 'vec4' )

		const tip = varying( float( 0 ) ) // 0 na base … 1 na ponta
		const dry = varying( float( 0 ) )
		const bladeNormal = varying( vec3( 0, 1, 0 ) )
		const sizeU = float( size )

		const positionNode = Fn( () => {

			// quadrado de lado `size` centrado no jogador; cada lâmina "dá a volta" (wrap)
			const half = sizeU.mul( 0.5 )
			const rel = positionGeometry.xz.sub( this.center )
			const xz = mod( rel.add( half ), sizeU ).sub( half ).add( this.center ).toVar()

			const uv = terrain.worldToUV( xz )
			const groundY = texture( terrain.heightTexture, uv ).r
			const terrainData = texture( terrain.dataTexture, uv )
			const grassAmt = terrainData.r
			const lawn = terrainData.a // gramado aparado (Terrain.lawnAt): poucas lâminas, curtinhas
			const n = texture( noiseTexture, xz.mul( 0.035 ) )
			dry.assign( smoothstep( 0.42, 0.78, n.a ) )

			const r = attribute( 'aRand', 'vec3' )
			const edgeFade = float( 1 ).sub( smoothstep( half.mul( edgeStart ), half, length( xz.sub( this.center ) ) ) ) // some suave na borda do quadrado
			const clear = smoothstep( this.clearing.z.mul( 0.55 ), this.clearing.z, length( xz.sub( this.clearing.xy ) ) )
			// falhas naturais: manchas de 1–2 m onde a grama rareia (r.y decide quais lâminas somem → densidade gradual)
			const patch = smoothstep( 0.28, 0.66, texture( noiseTexture, xz.mul( 0.23 ).add( 7.1 ) ).b )
			const keep = float( 1 ).sub( smoothstep( patch.sub( 0.05 ), patch.add( 0.05 ), r.y ).mul( patchiness ) )
			// field (x, z, raio): grama alta SÓ dentro de um campo de borda irregular; fora dele nada (o resto do mapa é gramado/tufos)
			const inField = field
				? float( 1 ).sub( smoothstep( this.field.z.mul( 0.72 ), this.field.z, length( xz.sub( this.field.xy ) ).add( texture( noiseTexture, xz.mul( 0.06 ) ).r.sub( 0.5 ).mul( field.r * 0.5 ) ) ) )
				: float( 1 )
			const mowed = field ? step( 0.5, inField ) : float( 1 ).sub( step( r.y, lawn.mul( 1 - lawnKeep ) ) ) // no gramado sobra só a fração lawnKeep das lâminas
			// borda do campo: lâminas encurtam em vez de acabar num corte seco
			const amount = smoothstep( 0.35, 0.65, grassAmt ).mul( edgeFade ).mul( clear ).mul( keep ).mul( mowed ).mul( field ? smoothstep( 0.5, 1, inField ).mul( 0.7 ).add( 0.3 ) : 1 )
			// altura: distribuição longa (muitos brotos baixos, poucas hastes altas) quando heightVariance > 0
			const hVar = mix( float( 1 ), r.x.pow( 2 ).mul( 1.7 ).add( 0.25 ), heightVariance )
			const h = this.bladeHeight.mul( r.x.mul( 0.6 ).add( 0.5 ) ).mul( n.g.mul( 0.9 ).add( 0.45 ) ).mul( hVar ).mul( amount ).mul( mix( float( 1 ), float( 0.3 ), lawn ) )
			const w = this.bladeWidth.mul( r.y.mul( 0.5 ).add( 0.75 ) ).mul( amount )

			// vento: rajadas por ruído rolando + leve oscilação por lâmina
			const gust = texture( noiseTexture, xz.mul( 0.02 ).add( time.mul( vec2( 0.045, 0.02 ) ) ) ).rg.sub( 0.5 ).mul( 2 )
			const sway = vec2( time.mul( 2.1 ).add( r.z.mul( 6.28 ) ).sin(), 0 ).mul( 0.25 )
			const windDir = gust.add( sway ).mul( this.wind )

			// pisada: o pé abre a grama para fora (agora) e o RASTRO fica deitado no sentido da caminhada,
			// levantando aos poucos (Grass.update grava os pontos). `flat` 0..1 = quanto a lâmina está amassada.
			const away = xz.sub( this.player.xz )
			const onGround = float( 1 ).sub( smoothstep( 0.5, 2.5, this.player.y.sub( groundY ).abs() ) )
			const flat = float( 1 ).sub( smoothstep( 0.15, 0.85, length( away ) ) ).mul( onGround ).toVar()
			const pushDir = normalize( away.add( vec2( 0.0001 ) ) ).toVar()
			Loop( TRAIL, ( { i } ) => {

				const tp = this.trail.element( i ) // (x, z, força 0..1, ângulo do passo)
				const d = xz.sub( tp.xy )
				const wgt = float( 1 ).sub( smoothstep( 0.12, 0.62, length( d ) ) ).mul( tp.z )
				If( wgt.greaterThan( flat ), () => {

					flat.assign( wgt )
					// deita para frente (sentido do passo) e um pouco para fora do centro da pegada
					pushDir.assign( normalize( vec2( tp.w.cos(), tp.w.sin() ).mul( 0.75 ).add( normalize( d.add( vec2( 0.0001 ) ) ).mul( 0.45 ) ) ) )

				} )

			} )
			// cada lâmina cai num ângulo e com força próprios (±26°, 70–125%) → amassado irregular, não um leque perfeito
			const ang = r.z.sub( 0.5 ).mul( 0.9 )
			const ca = ang.cos(), sa = ang.sin()
			const push = vec2( pushDir.x.mul( ca ).sub( pushDir.y.mul( sa ) ), pushDir.x.mul( sa ).add( pushDir.y.mul( ca ) ) )
				.mul( flat ).mul( r.x.mul( 0.55 ).add( 0.7 ) ).mul( blade ? 0.5 : 1.15 ) // 'tri': em unidades da altura da lâmina
			const near = flat // nome antigo usado abaixo (afundamento)

			const p = vec3( xz.x, groundY, xz.y ).toVar()

			if ( ! blade ) {

				// forma: vértice 0 = ponta, 1 = esquerda, 2 = direita; billboard para a câmera
				const vid = vertexIndex.mod( 3 ).toFloat()
				const isTip = vid.lessThan( 0.5 )
				tip.assign( select( isTip, float( 1 ), float( 0 ) ) )
				const side = select( isTip, float( 0 ), select( vid.lessThan( 1.5 ), float( - 1 ), float( 1 ) ) )
				const toCam = normalize( cameraPosition.xz.sub( xz ) )
				const right = vec2( toCam.y, toCam.x.negate() )
				p.x.addAssign( right.x.mul( side ).mul( w ) )
				p.z.addAssign( right.y.mul( side ).mul( w ) )
				// a lâmina INCLINA (comprimento constante) em vez de esticar e deitar: o pé do jogador
				// abre a grama para fora sem virar tiras compridas
				// amassada, a lâmina quase não sente o vento
				const bend = windDir.mul( float( 1 ).sub( near.mul( 0.8 ) ) ).add( push ).mul( h )
				const lean = length( bend ).min( h.mul( 0.88 ) )
				const off = normalize( bend.add( vec2( 0.0001 ) ) ).mul( lean )
				const rise = h.mul( h ).sub( lean.mul( lean ) ).max( 0 ).sqrt().mul( float( 1 ).sub( near.mul( 0.3 ) ) )
				p.x.addAssign( off.x.mul( tip ) )
				p.z.addAssign( off.y.mul( tip ) )
				p.y.addAssign( rise.mul( tip ) )
				return p

			}

			// ---- lâmina realista
			const vid = vertexIndex.mod( 7 ).toFloat()
			const row = floor( vid.div( 2 ) ) // 0, 1, 2, 3 (=ponta)
			const t = row.div( 3 )
			tip.assign( t )
			const side = select( vid.greaterThan( 5.5 ), float( 0 ), select( vid.mod( 2 ).lessThan( 0.5 ), float( - 1 ), float( 1 ) ) )

			// orientação própria (natural) puxada 35% para a câmera → lâmina de perfil não some
			const yaw = r.z.mul( 6.2832 )
			const own = vec2( yaw.cos(), yaw.sin() )
			const toCam = normalize( cameraPosition.xz.sub( xz ) )
			const faceCam = vec2( toCam.y, toCam.x.negate() )
			const across = normalize( mix( own, faceCam, 0.35 ) ) // direção da largura
			const facing = vec2( across.y.negate(), across.x ) // para onde a lâmina "olha"

			// curva: inclina para frente + vento/empurrão, crescendo com t² (base firme, ponta solta)
			const lean = this.lean.mul( r.y.mul( 0.8 ).add( 0.6 ) )
			const bendVec = facing.mul( lean ).add( windDir ).add( push.mul( 2 ) )
			const bendLen = length( bendVec ).min( 1.2 )
			const bendDir = normalize( bendVec.add( vec2( 0.0001 ) ) ).mul( bendLen )
			const width = w.mul( float( 1 ).sub( t ).pow( 0.7 ) ).mul( side )
			const rise = h.mul( t ).mul( float( 1 ).sub( bendLen.mul( t ).mul( 0.45 ) ) ).sub( near.mul( h ).mul( 0.4 ).mul( t ) )
			p.x.addAssign( across.x.mul( width ).add( bendDir.x.mul( h ).mul( t ).mul( t ) ) )
			p.z.addAssign( across.y.mul( width ).add( bendDir.y.mul( h ).mul( t ).mul( t ) ) )
			p.y.addAssign( rise )

			// normal: perpendicular à largura e à tangente da curva, arredondada nas bordas, sempre do lado da câmera
			const tangent = normalize( vec3( bendDir.x.mul( t ).mul( 2 ).mul( h ), h.mul( float( 1 ).sub( bendLen.mul( t ).mul( 0.9 ) ) ).max( 0.001 ), bendDir.y.mul( t ).mul( 2 ).mul( h ) ) )
			const acrossW = vec3( across.x, 0, across.y )
			const nrm = normalize( cross( acrossW, tangent ) ).toVar()
			const toCam3 = cameraPosition.sub( p )
			nrm.assign( select( dot( nrm, toCam3 ).lessThan( 0 ), nrm.negate(), nrm ) )
			bladeNormal.assign( normalize( nrm.add( acrossW.mul( side ).mul( 0.45 ) ).add( vec3( 0, 0.25, 0 ) ) ) )
			return p

		} )()

		// campo pode ter cores próprias (palette.fieldGrass / fieldDry): pontas douradas como no estilo ink
		let grassCol = mix( color( field ? palette.fieldGrass ?? palette.grass : palette.grass ), color( field ? palette.fieldDry ?? palette.grassDry : palette.grassDry ), dry )
		if ( variation > 0 ) {

			const rv = attribute( 'aRand', 'vec3' ) // igual em todos os vértices = constante por lâmina
			const withered = smoothstep( 1 - dryAmount - 0.04, 1 - dryAmount + 0.04, rv.z ).mul( variation ) // fração seca (dryAmount)
			grassCol = mix( grassCol, color( palette.grassDry ).mul( 1.15 ), withered )
				.mul( rv.z.sub( 0.5 ).mul( variation * 0.7 ).add( 1 ) ) // brilho por lâmina
				.mul( vec3( rv.x.sub( 0.5 ).mul( variation * 0.12 ).add( 1 ), 1, 1 ) ) // leve variação de matiz

		}

		let normalNode
		if ( blade ) normalNode = bladeNormal
		else if ( variation > 0 ) normalNode = normalize( vec3( attribute( 'aRand', 'vec3' ).x.sub( 0.5 ).mul( 0.9 ), 1, attribute( 'aRand', 'vec3' ).y.sub( 0.5 ).mul( 0.9 ) ) )
		else normalNode = vec3( 0, 1, 0 )

		// base escura (oclusão entre lâminas) → ponta clara e levemente amarelada
		// sombra 'mult' (Bruno): a base não escurece na cor — ela entra na SOMBRA (shadeNode abaixo) e fica na cor da sombra
		const mult = look.shadowModel === 'mult' && ! blade
		const rootDark = blade ? 0.5 : mult ? 1 : ( variation > 0 ? 0.45 : 0.84 )
		const colorNode = mix( grassCol.mul( rootDark ), grassCol.mul( vec3( 1.08, 1.06, 0.92 ) ), blade ? pow( tip, 0.8 ) : tip )

		// contraluz: com o sol atrás da lâmina a luz atravessa a folha (mais na ponta, que é mais fina)
		let emissiveNode = null
		if ( blade ) {

			const viewDir = normalize( positionWorld.sub( cameraPosition ) )
			const back = pow( max( dot( viewDir, look.sunDir ), 0 ), 3 )
			emissiveNode = grassCol.mul( vec3( 1.1, 1.15, 0.6 ) ).mul( back ).mul( tip ).mul( 0.35 )

		}

		this.material = createToonMaterial( look, {
			colorNode,
			emissiveNode,
			normalNode,
			shadowNode: blade || mult ? null : float( 1 ).sub( tip ).mul( 0.22 ),
			shadeNode: mult ? float( 1 ).sub( tip ) : null,
			side: THREE.DoubleSide,
			roughness: 0.6,
			ink: 0,
			hatch: false,
			specular: false,
			// campo: sombra do estilo ink (azul-violeta e funda) em vez do turquesa claro do gramado
			shadowTint: field?.shadowTint ?? null,
			shadowValue: field?.shadowValue ?? null
		} )
		this.material.positionNode = positionNode

		this.mesh = new THREE.Mesh( geometry, this.material )
		this.mesh.frustumCulled = false
		this.mesh.receiveShadow = true

	}

	update( focus ) {

		if ( this.fieldCenter ) this.center.value.copy( this.fieldCenter )
		else this.center.value.set( focus.x, focus.z )
		this.player.value.copy( focus )

		// rastro: grava um ponto a cada ~35 cm andados; cada ponto perde força em TRAIL_RECOVER s (curva suave)
		const now = performance.now() / 1000
		const dx = focus.x - this.lastStep.x, dz = focus.z - this.lastStep.y
		if ( dx * dx + dz * dz > 0.35 * 0.35 ) {

			const p = this.trailPoints[ this.trailHead ]
			p.set( focus.x, focus.z, 1, Math.atan2( dz, dx ) )
			this.trailBorn[ this.trailHead ] = now
			this.trailHead = ( this.trailHead + 1 ) % TRAIL
			this.lastStep.set( focus.x, focus.z )

		}

		for ( let i = 0; i < TRAIL; i ++ ) {

			const age = ( now - this.trailBorn[ i ] ) / TRAIL_RECOVER
			const k = Math.min( Math.max( 1 - age, 0 ), 1 )
			this.trailPoints[ i ].z = k * k * ( 3 - 2 * k ) // fica deitada um tempo e levanta no fim

		}

	}

}
