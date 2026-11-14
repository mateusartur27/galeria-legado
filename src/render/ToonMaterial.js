import * as THREE from 'three/webgpu'
import {
	Fn, uniform, color, float, vec2, vec3, vec4, mix, smoothstep, step, max, dot, fract, normalize, pow, clamp,
	normalView, normalViewGeometry, positionView, positionWorld, cameraPosition, cameraViewMatrix, transpose, screenUV, screenCoordinate,
	hue, saturation, luminance, diffuseColor, output, mrt, packNormalToRGB, transformNormalToView, texture, faceDirection,
	abs, fwidth, select, reflect
} from 'three/tsl'
import { createMatcapTexture } from './Textures.js'

// "Look" = uniforms compartilhados por TODOS os materiais (sol, sombra, ambiente, névoa).
// Mudar um uniform muda o mundo inteiro sem recompilar shaders (ciclo dia/noite, clima…).
export function createLook( style ) {

	const c = ( hex ) => uniform( new THREE.Color( hex ) )
	const look = {
		mode: style.shading,
		sunLight: null,
		sunDir: uniform( new THREE.Vector3( 0.5, 1, 0.3 ).normalize() ), // mundo (céu/água usam)
		sunColor: c( style.sun.color ),
		sunIntensity: uniform( style.sun.intensity ),
		shadowTint: c( style.shadowTint ?? '#808080' ),
		shadowHue: uniform( style.shadowHue ?? 0 ),
		shadowSat: uniform( style.shadowSat ?? 1 ),
		shadowValue: uniform( style.shadowValue ?? 0.6 ),
		// 'tint' (padrão): matiz/saturação/tinta normalizada · 'hsv' (Messenger): a própria cor com matiz − shadowHueShift (fração de volta)
		// e valor × shadowValue. Material com shadowTint próprio continua no modo tint.
		shadowModel: style.shadowModel ?? 'tint',
		shadowHueShift: uniform( style.shadowHueShift ?? 0.02 ),
		bandEdge: uniform( style.bandEdge ?? 0 ),
		bandSoft: uniform( style.bandSoft ?? 0.1 ),
		ambient: uniform( style.ambient ?? 0.2 ),
		skyColor: c( style.sky.zenith ),
		groundColor: c( style.palette.grass ),
		rim: uniform( style.rim ?? 0 ),
		bounce: uniform( style.bounce ?? 0 ),
		fogColor: c( style.fog.color ),
		fogNear: uniform( style.fog.near ),
		fogFar: uniform( style.fog.far ),
		fogHsv: style.fog.hsv === true,
		// brilho especular chapado (Messenger): style.specular = { amount: 0.075, shininess: 30 } · null = sem
		specular: style.specular ? { amount: uniform( style.specular.amount ?? 0.075 ), shininess: float( style.specular.shininess ?? 30 ) } : null,
		debugView: style.debugView ?? null,
		// "ver através" (Bruno) — atualizados por frame com a posição do jogador na tela
		occluderUV: uniform( new THREE.Vector2( - 10, - 10 ) ),
		occluderDepth: uniform( 0 ),
		occluderRadius: uniform( 0.2 ),
		aspect: uniform( 1 ),
		// matcap-toy: esfera pintada gerada por código (luz "assada", custo de 1 textura)
		matcapTexture: style.shading === 'matcap' ? createMatcapTexture( style.matcap ?? {} ) : null
	}

	// Dither (screen-door) em vez de transparência: sem ordenação, sem custo de blending.
	// Some perto da câmera (Messenger) e num círculo em volta do jogador quando o objeto está NA FRENTE dele.
	look.fadeMask = Fn( () => {

		const dist = positionView.z.negate()
		const nearCam = float( 1 ).sub( smoothstep( 1.0, 3.2, dist ) )
		let fade = nearCam
		// style.seeThrough === false: sem o círculo (a câmera encosta nos objetos — CameraRig collideAll)
		if ( style.seeThrough !== false ) {

			const d = screenUV.sub( look.occluderUV ).mul( vec2( look.aspect, 1 ) ).length()
			const inFront = step( dist, look.occluderDepth.sub( 1.0 ) )
			fade = max( nearCam, float( 1 ).sub( smoothstep( look.occluderRadius.mul( 0.55 ), look.occluderRadius, d ) ).mul( inFront ) )

		}
		const ign = fract( fract( dot( screenCoordinate.xy, vec2( 0.06711056, 0.00583715 ) ) ).mul( 52.9829189 ) ) // interleaved gradient noise
		return ign.greaterThanEqual( fade )

	} )

	// Pressão da caneta (Messenger: ruído quebrando o traço). Ruído PRESO AO MUNDO → o traço não "escorrega" com a câmera.
	// Vai no alfa do MRT "normal": 0 = falha no traço, 1 = traço cheio, > ~0.75 = traço grosso (Pipeline).
	look.pen = style.pen ? {
		scale: uniform( style.pen.scale ),
		gaps: uniform( style.pen.gaps )
	} : null
	// look.noiseTexture é definido em main.js antes de criar materiais (textura em vez de Perlin por pixel: ~4 ms mais barato numa iGPU)
	look.penNode = look.pen ? Fn( () => {

		// noise3 ≈ 0.32 (p5) … 0.49 (mediana) … 0.68 (p95). gaps = fração aproximada de falhas (0.1 → ~10% do traço some);
		// pressão alta (> ~0.62 → traço grosso) nos ~25% mais altos
		const n = look.noise3( positionWorld.mul( look.pen.scale ) )
		return smoothstep( look.pen.gaps.mul( 0.5 ).add( 0.3 ), float( 0.62 ), n )

	} ) : null

	// ruído "3D" barato: 2 leituras da textura 2D, deslocadas pela altura → varia no chão e nas paredes
	look.noise3 = ( p ) => {

		const a = texture( look.noiseTexture, p.xz.add( p.y.mul( vec2( 0.37, 0.61 ) ) ) ).r
		const b = texture( look.noiseTexture, p.zy.mul( 2.3 ).add( p.x.mul( vec2( 0.53, 0.29 ) ) ) ).g
		return a.mul( 0.7 ).add( b.mul( 0.3 ) )

	}

	// Hachura nas sombras (traços de nanquim presos às superfícies, projeção triplanar)
	look.hatch = style.hatch ? {
		color: c( style.hatch.color ),
		spacing: uniform( style.hatch.spacing ),
		width: uniform( style.hatch.width ),
		strength: uniform( style.hatch.strength ),
		cross: uniform( style.hatch.cross )
	} : null

	const _v = new THREE.Vector3()
	look.updateOccluder = ( camera, targetPosition ) => {

		_v.copy( targetPosition ).setY( targetPosition.y + 0.9 ).project( camera )
		look.occluderUV.value.set( _v.x * 0.5 + 0.5, 0.5 - _v.y * 0.5 )
		look.occluderDepth.value = - _v.copy( targetPosition ).applyMatrix4( camera.matrixWorldInverse ).z
		look.aspect.value = camera.aspect

	}

	// Névoa global (scene.fogNode): aplicada pelo three no fim de TODO material com fog=true.
	// Mais densa perto do chão; modo HSV (Summer Afternoon) dessatura antes → longe fica "lavado", não cinza.
	// style.fog.mode 'exp2' (Messenger): f = 1 − exp(−(densidade·dist)²), cor perto → longe por smoothstep(0, 0.8, f); sem fade por altura
	look.fogExp2 = style.fog.mode === 'exp2' ? {
		density: uniform( style.fog.density ?? 0.011 ),
		farColor: c( style.fog.farColor ?? style.fog.color )
	} : null
	// style.fog.mode 'radial' (Bruno 2025): névoa por distância (smoothstep near → far) cuja COR é um degradê na tela, de colorA
	// (fog.color) no ponto `center` (UV de tela, 0,0 = canto de cima à esquerda) a colorB na distância `end`. O céu ('radial')
	// pinta o mesmo degradê → o mundo derrete no fundo sem horizonte. Ciclo do dia anima as duas cores (render/DayCycle.js)
	look.fogRadial = style.fog.mode === 'radial' ? {
		colorB: c( style.fog.colorB ?? style.fog.color ),
		center: uniform( new THREE.Vector2( ...( style.fog.center ?? [ 0, 0 ] ) ) ),
		start: uniform( style.fog.start ?? 0 ),
		end: uniform( style.fog.end ?? 1 )
	} : null
	look.fogRadialColor = () => {

		const r = look.fogRadial
		return mix( look.fogColor, r.colorB, smoothstep( r.start, r.end, screenUV.sub( r.center ).length() ) )

	}
	look.fogNode = look.fogRadial ? Fn( () => {

		const f = smoothstep( look.fogNear, look.fogFar, positionView.z.negate() )
		return vec4( mix( output.rgb, look.fogRadialColor(), f ), output.a )

	} ) : look.fogExp2 ? Fn( () => {

		const e = look.fogExp2
		const x = positionView.z.negate().mul( e.density )
		const f = float( 1 ).sub( x.mul( x ).negate().exp() )
		return vec4( mix( output.rgb, mix( look.fogColor, e.farColor, smoothstep( 0, 0.8, f ) ), f ), output.a )

	} ) : Fn( () => {

		const dist = positionView.z.negate()
		const heightFade = clamp( positionWorld.y.mul( - 0.015 ).add( 1.0 ), 0.45, 1.0 )
		const f = smoothstep( look.fogNear, look.fogFar, dist ).mul( heightFade )
		const base = look.fogHsv ? saturation( output.rgb, mix( float( 1 ), float( 0.35 ), f ) ) : output.rgb
		return vec4( mix( base, look.fogColor, f.mul( look.fogHsv ? 0.85 : 1.0 ) ), output.a )

	} )

	look.install = ( scene, sunLight ) => {

		look.sunLight = sunLight
		scene.fogNode = look.fogNode()

	}

	return look

}

// Máscara de contorno por material (canal alfa do MRT "normal"): 0 = sem traço (grama, água, céu).
// idNode (opcional): ID de superfície (Messenger) → o contorno desenha onde o ID muda, mesmo entre peças coladas (porta na parede)
// outlineDepth (opcional, precisa de outline.ids): distância de visão que o CONTORNO usa no lugar da real (copa em cartões grava a do
// centro da árvore → contorno só na silhueta) · outlineNormal (opcional): normal de visão gravada para o contorno (constante = sem dobras)
// noFade (opcional): id.b = 1 → o traço de ID deste pixel não some com a distância (céu: nuvens contornadas lá no fundo)
export const inkMRT = ( inkNode, idNode = null, outlineDepth = null, outlineNormal = null, noFade = null ) => mrt( {
	normal: vec4( packNormalToRGB( outlineNormal ?? normalView ), float( inkNode ) ),
	...( idNode || outlineDepth || noFade ? { id: vec4( idNode ?? 0, outlineDepth ?? 0, noFade ?? 0, 1 ) } : {} )
} )

/**
 * Relevo procedural (bump) a partir de QUALQUER nó de altura — sem textura, sem UV.
 * (O `bumpMap()` do three exige textura; este usa derivadas de tela da própria altura — Mikkelsen 2010.)
 * Use em material.normalNode. height: float (metros ou 0..1) · scale: força · base: normal em espaço de visão.
 */
export const bumpNormal = Fn( ( [ height, scale, base ] ) => {

	const dHx = height.dFdx().mul( scale )
	const dHy = height.dFdy().mul( scale )
	const sx = positionView.dFdx().normalize()
	const sy = positionView.dFdy().normalize()
	const N = vec3( base )
	const R1 = sy.cross( N )
	const R2 = N.cross( sx )
	const det = sx.dot( R1 ).mul( faceDirection )
	const grad = det.sign().mul( dHx.mul( R1 ).add( dHy.mul( R2 ) ) )
	return det.abs().mul( N ).sub( grad ).normalize()

} )

/**
 * Modelo de iluminação estilizado (o jeito oficial de customizar luz no three r18x).
 * O three entrega a luz do sol com a SOMBRA já multiplicada em `lightColor` e cuida da ordem dos passes.
 * Combina: 2 tons do Messenger · core shadow suave do Bruno · rampa do Summer Afternoon · sombra colorida.
 */
// Listras antisserrilhadas (fwidth): 1 no centro do risco. Somem quando ficam mais finas que ~2 px (longe = moiré).
const hatchLines = ( coord, width ) => {

	const fw = fwidth( coord ).max( 1e-4 )
	const dist = float( 1 ).sub( abs( fract( coord ).sub( 0.5 ) ).mul( 2 ) ) // 0 no centro do risco
	const line = float( 1 ).sub( smoothstep( width, width.add( fw.mul( 2 ) ), dist ) )
	return line.mul( float( 1 ).sub( smoothstep( 0.25, 0.55, fw ) ) )

}

class StylizedLightingModel extends THREE.LightingModel {

	constructor( look, mode, hatch = true, shadowTint = null, shadowValue = null, specular = true, shadowCut = null, shade = null ) {

		super()
		this.look = look
		this.shade = shade // nó 0..1: sombra extra que entra NA LUZ (Bruno: base da lâmina de grama na cor da sombra)
		this.mode = mode
		this.specular = specular // false = sem brilho (grama, folhas)
		this.shadowCut = shadowCut // [a, b]: corte duro smoothstep(a, b, N·L × sombra) no lugar das faixas (personagem do Messenger: 0.1–0.15)
		this.shadowValue = shadowValue // por material (ex.: grama do campo com a sombra funda do estilo ink)
		this.shadowTint = shadowTint // por material (ex.: pedra creme → sombra bege, não o turquesa do gramado)
		this.hatch = hatch && !! look.hatch && ( mode === 'bands' || mode === 'soft' )

	}

	// hachura: diagonal onde está na sombra (projetada ou de forma), cruzada na sombra profunda (face de costas pro sol)
	hatchAmount( Nw, NdotL, darkness ) {

		const h = this.look.hatch
		const a = abs( Nw )
		const pw = positionWorld
		// triplanar pelo eixo dominante da normal: chão usa xz, paredes usam zy / xy
		const uv = select( a.y.greaterThan( max( a.x, a.z ) ), pw.xz, select( a.x.greaterThan( a.z ), pw.zy, pw.xy ) )
		const width = h.width.mul( smoothstep( 0.22, 0.62, texture( this.look.noiseTexture, pw.xz.add( pw.y.mul( 0.7 ) ).mul( 0.28 ) ).b ) ) // riscos falham em manchas
		const diag = hatchLines( uv.x.add( uv.y ).div( h.spacing ), width )
		const cross = hatchLines( uv.x.sub( uv.y ).div( h.spacing.mul( 1.15 ) ), width )
		const deep = float( 1 ).sub( smoothstep( h.cross.negate().sub( 0.3 ), h.cross.negate(), NdotL ) )
		return max( diag, cross.mul( deep ) ).mul( darkness ).mul( h.strength )

	}

	direct( { lightDirection, lightColor, lightNode, reflectedLight } ) {

		const look = this.look
		const N = normalView
		const NdotL = dot( N, lightDirection )

		// luzes secundárias (lanternas, fogueira…): lambert simples colorido
		if ( lightNode.light !== look.sunLight ) {

			reflectedLight.directDiffuse.addAssign( diffuseColor.rgb.mul( lightColor ).mul( NdotL.max( 0 ) ) )
			return

		}

		const base = diffuseColor.rgb
		const V = normalize( positionView.negate() )
		const Nw = normalize( transpose( cameraViewMatrix ).mul( vec4( N, 0 ) ).xyz ) // normal em mundo (p/ céu/chão)

		// sol é branco/1 nos estilos toon → lightColor.r = fator de sombra; só vale com a face virada pro sol
		const shadow = lightColor.r.mul( smoothstep( - 0.05, 0.1, NdotL ) )

		if ( look.debugView === 'shadow' ) { reflectedLight.directDiffuse.addAssign( vec3( lightColor.r ) ); return }
		if ( look.debugView === 'light' ) { reflectedLight.directDiffuse.addAssign( vec3( NdotL.max( 0 ).mul( shadow ) ) ); return }

		// cor de sombra: matiz deslocado + saturação + tinta (luminância normalizada) + preenchimento do céu → nunca preto
		// (Messenger usa valor×0.5; Bruno usa base×shadowColor). O ambiente entra SÓ no lado da sombra:
		// somar ambiente no lado iluminado estoura o tone mapping e "apaga" o contraste.
		const tintColor = this.shadowTint ?? look.shadowTint
		const tint = mix( vec3( 1 ), tintColor.div( max( luminance( tintColor ), 0.001 ) ), 0.75 )
		const skyFill = base.mul( mix( look.groundColor, look.skyColor, Nw.y.mul( 0.5 ).add( 0.5 ) ) ).mul( look.ambient )
		// Messenger (HSV): valor × k com a mesma saturação = rgb × k; só o matiz gira (−0,02 de volta ≈ −7°)
		// Bruno 2025 ('mult'): sombra = cor × cor da sombra, crua (#6d3fff de dia → roxo; o ciclo do dia troca a cor)
		const shadowCol = look.shadowModel === 'mult' && ! this.shadowTint
			? base.mul( look.shadowTint ).add( skyFill )
			: look.shadowModel === 'hsv' && ! this.shadowTint
				? hue( base, look.shadowHueShift.mul( - Math.PI * 2 ) ).mul( this.shadowValue ?? look.shadowValue ).add( skyFill )
				: hue( saturation( base, look.shadowSat ), look.shadowHue ).mul( tint ).mul( this.shadowValue ?? look.shadowValue ).add( skyFill )
		const litCol = base.mul( look.sunColor ).mul( look.sunIntensity )
		if ( look.debugView === 'shadowcol' ) { reflectedLight.directDiffuse.addAssign( shadowCol ); return }
		if ( look.debugView === 'litcol' ) { reflectedLight.directDiffuse.addAssign( litCol ); return }
		const outCol = vec3( 0 ).toVar()

		if ( this.mode === 'matcap' ) {

			// Bruno 2019: cor = base × matcap(normal em espaço de visão). Sem N·L — a "luz" está pintada na esfera.
			// Só a sombra (se houver shadow map) e a luz rebatida do chão (abaixo) entram por cima.
			const mc = texture( look.matcapTexture, N.xy.mul( 0.49 ).add( 0.5 ) ).rgb
			outCol.assign( mix( shadowCol, base.mul( mc ).mul( look.sunIntensity ), lightColor.r ) )

		} else if ( this.mode === 'ramp' ) {

			// rampa procedural de 4 paradas: sombra fria → faixa de transição → base → realce quente
			const l = NdotL.mul( 0.5 ).add( 0.5 ).mul( shadow )
			const band = mix( shadowCol, base.mul( 0.9 ), 0.55 )
			const highlight = litCol.mul( vec3( 1.12, 1.06, 0.96 ) )
			outCol.assign( mix( shadowCol, band, smoothstep( 0.3, 0.42, l ) ) )
			outCol.assign( mix( outCol, litCol, smoothstep( 0.46, 0.6, l ) ) )
			outCol.assign( mix( outCol, highlight, smoothstep( 0.82, 0.98, l ) ) )

		} else {

			// 'bands' = corte quase duro (Messenger) · 'soft' = core shadow suave (Bruno)
			// 'mult' (Bruno): sombra de forma e projetada combinam por MÁXIMO (min da luz), sem o corte extra no terminador →
			// a borda de forma fica larguíssima (smoothstep(−0,25, 1, N·L))
			const light = this.shadowCut
				? smoothstep( this.shadowCut[ 0 ], this.shadowCut[ 1 ], NdotL.max( 0 ).mul( lightColor.r ) )
				: look.shadowModel === 'mult'
					? smoothstep( look.bandEdge.sub( look.bandSoft ), look.bandEdge.add( look.bandSoft ), NdotL ).min( lightColor.r )
					: smoothstep( look.bandEdge.sub( look.bandSoft ), look.bandEdge.add( look.bandSoft ), NdotL ).mul( shadow )
			outCol.assign( mix( shadowCol, litCol, this.shade ? light.mul( float( 1 ).sub( this.shade ) ) : light ) )
			// brilho chapado (Messenger): recorte duro do Phong, fraco e só em faces não horizontais (paredes, laterais de pedra)
			if ( look.specular && this.specular ) {

				const R = reflect( lightDirection.negate(), N )
				const phong = pow( max( dot( R, V ), 0 ), look.specular.shininess )
				const notFlat = float( 0.95 ).sub( Nw.y ).div( 0.05 ).clamp( 0, 1 )
				outCol.addAssign( look.sunColor.mul( smoothstep( 0.01, 0.011, phong ).mul( look.specular.amount ).mul( notFlat ).mul( light ) ) )

			}
			if ( this.hatch ) outCol.assign( mix( outCol, look.hatch.color, this.hatchAmount( Nw, NdotL, float( 1 ).sub( light ) ) ) )

		}

		// luz rebatida do chão nas faces viradas para baixo
		outCol.assign( mix( outCol, base.mul( look.groundColor ).mul( 1.6 ), float( 1 ).sub( smoothstep( - 0.8, 0.0, Nw.y ) ).mul( look.bounce ) ) )

		// rim no lado iluminado
		const rim = pow( float( 1 ).sub( max( dot( N, V ), 0 ) ), 3 ).mul( look.rim ).mul( shadow.mul( 0.7 ).add( 0.3 ) )
		outCol.addAssign( look.sunColor.mul( rim ) )

		reflectedLight.directDiffuse.addAssign( outCol )

	}

	indirect() { /* ambiente já está no direct do sol */ }

}

class ToonNodeMaterial extends THREE.MeshLambertNodeMaterial {

	constructor( look, mode, params, hatch = true, shadowTint = null, shadowValue = null, specular = true, shadowCut = null, shade = null ) {

		super( params )
		this.shade = shade
		this.look = look
		this.mode = mode
		this.hatch = hatch
		this.shadowTint = shadowTint
		this.shadowValue = shadowValue
		this.specular = specular
		this.shadowCut = shadowCut

	}

	setupLightingModel() {

		return new StylizedLightingModel( this.look, this.mode, this.hatch, this.shadowTint, this.shadowValue, this.specular, this.shadowCut, this.shade )

	}

}

/**
 * Material do jogo. Mesma interface para todos os estilos (toon/ramp/pbr).
 * opts.colorNode    cor base (linear): color('#hex'), attribute('color'), texture(paleta, uv()), instancedBufferAttribute(...)
 * opts.normalNode   normal em ESPAÇO DE MUNDO (ex.: vec3(0,1,0) na grama)
 * opts.shadowNode   escurecimento extra 0..1 (ex.: base da lâmina de grama)
 * opts.emissiveNode cor HDR somada (> 1 = bloom)
 * opts.ink          máscara de contorno (número ou nó)
 * opts.bump         { height: nó float, scale } → relevo procedural (madeira, casca, rocha)
 * opts.roughnessNode rugosidade por pixel (só PBR)
 */
export function createToonMaterial( look, opts = {} ) {

	const {
		colorNode = color( '#ffffff' ), normalNode = null, shadowNode = null, emissiveNode = null,
		alphaNode = null, alphaTest = 0.5, ink = 1, side = THREE.FrontSide, transparent = false,
		flatShading = false, roughness = 0.85, metalness = 0, mode = look.mode, bump = null, roughnessNode = null,
		fade = false, // true = some perto da câmera e na frente do jogador (árvores, pedras, paredes)
		hatch = true, // false = sem hachura (grama, água, partículas: riscos em peças minúsculas viram ruído)
		id = null, // nó float > 0: ID de superfície para o contorno (ex.: célula da paleta)
		shadowTint = null, // '#hex': tinta da sombra só deste material (padrão: look.shadowTint)
		shadowValue = null, // número: valor (brilho) da sombra só deste material (padrão: look.shadowValue)
		outlineDepth = null, outlineNormal = null, // ver inkMRT (copa em cartões)
		penFloor = 0, // tinta mínima com caneta (0..1): 0 = falhas normais · 0.6 = traço nunca falha, só engrossa onde a pressão sobe
		specular = true, // brilho chapado (se look.specular): false em grama/folhas
		shadowCut = null, // [a, b] → corte de sombra duro (ver StylizedLightingModel)
		pen = true, // false = ignora a caneta do mundo (o material traz a própria quebra de traço em `ink`)
		shadeNode = null // nó 0..1: sombra extra aplicada na LUZ (vira a cor da sombra, não só escurece) — grama do Bruno
	} = opts

	let material
	if ( mode === 'pbr' ) {

		material = new THREE.MeshStandardNodeMaterial( { side, transparent, flatShading, roughness, metalness } )

	} else {

		material = new ToonNodeMaterial( look, mode, { side, transparent, flatShading }, hatch, shadowTint ? color( shadowTint ) : null, shadowValue != null ? float( shadowValue ) : null, specular, shadowCut, shadeNode )

	}

	material.colorNode = shadowNode ? vec3( colorNode ).mul( float( 1 ).sub( shadowNode ) ) : colorNode
	if ( normalNode ) material.normalNode = transformNormalToView( normalNode )
	// relevo só no PBR: em toon (2 tons/rampa) cada microvariação vira salpico duro de luz/sombra
	if ( bump && mode === 'pbr' ) material.normalNode = bumpNormal( bump.height, float( bump.scale ?? 1 ), material.normalNode ?? normalViewGeometry )
	if ( roughnessNode && mode === 'pbr' ) material.roughnessNode = roughnessNode
	if ( emissiveNode ) material.emissiveNode = emissiveNode
	if ( alphaNode ) { material.opacityNode = alphaNode; material.alphaTest = alphaTest }
	// pressão da caneta multiplica a máscara de tinta (ink 0 continua 0: grama, água)
	if ( look.penNode && pen && ink !== 0 ) material.mrtNode = inkMRT( float( ink ).mul( penFloor ? mix( float( penFloor ), float( 1 ), look.penNode() ) : look.penNode() ), id, outlineDepth, outlineNormal )
	else if ( ink !== 1 || id || outlineDepth || outlineNormal ) material.mrtNode = inkMRT( ink, id, outlineDepth, outlineNormal )
	if ( fade ) material.maskNode = look.fadeMask()
	return material

}
