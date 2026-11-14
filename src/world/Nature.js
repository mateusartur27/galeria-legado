import * as THREE from 'three/webgpu'
import {
	Fn, texture, uv, positionWorld, positionLocal, positionGeometry, instanceIndex, instancedBufferAttribute, time, hash,
	vec2, vec3, vec4, float, color, mix, max, smoothstep, fwidth, normalize, step, fract, cross, dot, atan, sin, cos,
	cameraPosition, cameraViewMatrix, uniform, normalWorld
} from 'three/tsl'
import { createToonMaterial } from '../render/ToonMaterial.js'
import { rng } from '../core/utils.js'
import { RockPiles } from './Rocks.js'
import { messengerRock } from '../render/RockLook.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Natureza com modelos CC0 (Quaternius Stylized Nature MegaKit → tools/nature/build_nature.py → public/models/nature.glb)
// no estilo Messenger: a forma vem do asset, a COR vem da paleta (chapada) e o traço/hachura do pós.
//   Leaf_* → recorte pela textura (alfa), cor da paleta com variação por árvore + pintas, normal "fofa" (centro da copa)
//   Bark   → cor chapada do tronco · Rock → creme com rachaduras desenhadas
// Distribuição: a mesma do Props (layout.trees / layout.rocks) + arbustos/plantas perto deles.
// 1 InstancedMesh por (modelo × material).
export class Nature {

	constructor( { look, terrain, palette, gltf, layout, config, camera = null, seed = 23 } ) {

		this.group = new THREE.Group()
		// cartões da copa olham para a câmera do JOGADOR também no passe de sombra (cameraPosition lá = câmera da luz):
		// senão a sombra que a copa projeta nela mesma sai de cartões em outra orientação → cortes retos na folhagem.
		// uniform com a referência de camera.position → atualiza sozinho a cada frame
		this.viewPos = camera ? uniform( camera.position ) : cameraPosition
		this.colliders = []
		const random = rng( seed )
		this.look = look
		this.palette = palette
		this.terrain = terrain
		// bioma → cores de folha (<kind>Trees na paleta); sem bioma = palette.leaves
		this.leafColsAt = ( x, z ) => {

			const kind = terrain.biomeKinds?.length ? terrain.biomeKindAt( x, z ) : null
			const list = ( kind && palette[ kind + 'Trees' ] ) || palette.leaves
			return list.map( ( h ) => new THREE.Color( h ) )

		}
		this.rockGrass = !! config.rockGrass // Messenger: manchas de grama no topo das pedras (ver material Rock)
		this.rockLook = config.rockLook ?? null // 'messenger' = desenho de render/RockLook.js

		// modelo → lista de { geometry, material(nome) } + medidas
		const models = {}
		gltf.scene.updateMatrixWorld( true )
		gltf.scene.traverse( ( o ) => {

			if ( ! o.isMesh ) return
			const name = o.parent && o.parent !== gltf.scene && ! o.parent.isScene ? o.parent.name : o.name
			const geo = o.geometry.clone()
			// meshopt/KHR_mesh_quantization: atributos em inteiros normalizados → converte para float ANTES de transformar
			// (applyMatrix4 em Int16 trunca: normais e tamanhos saem errados)
			for ( const [ key, a ] of Object.entries( geo.attributes ) ) {

				if ( a.array instanceof Float32Array && ! a.isInterleavedBufferAttribute ) continue
				const f = new Float32Array( a.count * a.itemSize )
				const get = [ 'getX', 'getY', 'getZ', 'getW' ]
				for ( let i = 0; i < a.count; i ++ ) for ( let c = 0; c < a.itemSize; c ++ ) f[ i * a.itemSize + c ] = a[ get[ c ] ]( i )
				geo.setAttribute( key, new THREE.BufferAttribute( f, a.itemSize ) )

			}

			// matriz do nó SEM a posição: traz a escala da quantização (meshopt), esteja ela no nó ou no pai
			geo.applyMatrix4( o.matrixWorld.clone().setPosition( 0, 0, 0 ) )
			geo.computeVertexNormals() // folhas: normal fofa vem do shader; casca/pedra: normais limpas após a escala não uniforme
			const entry = models[ name ] ??= { parts: [], box: new THREE.Box3() }
			entry.parts.push( { geometry: geo, material: o.material } )
			geo.computeBoundingBox()
			entry.box.union( geo.boundingBox )

		} )
		// origem no pé e centrada em xz (o build deixou os modelos lado a lado)
		for ( const m of Object.values( models ) ) {

			const c = m.box.getCenter( new THREE.Vector3() )
			for ( const p of m.parts ) { p.geometry.translate( - c.x, - m.box.min.y, - c.z ); p.geometry.computeBoundingBox() }
			m.size = m.box.getSize( new THREE.Vector3() )

		}

		this.models = models

		// ---- árvores: escala pela altura-alvo
		const placeT = layout.trees.map( ( t ) => {

			const model = config.trees[ Math.floor( random() * config.trees.length ) ]
			const [ h0, h1 ] = config.treeHeight
			const h = h0 + random() * ( h1 - h0 )
			return { model, x: t.x, y: t.y, z: t.z, s: h / models[ model ].size.y, r: t.r }

		} )
		for ( const t of placeT ) this.colliders.push( { type: 'cyl', x: t.x, y: t.y, z: t.z, r: 0.28, h: 2.4 } )

		// ---- pedras: escala pelo tamanho do layout (largura ~ s · rockWidth)
		// rochedos ficam no gramado (Messenger), não na praia/água
		const placeR = layout.rocks.filter( ( r ) => terrain.grassAt( r.x, r.z ) > 0.3 && r.y > 0.6 ).map( ( r ) => {

			const model = config.rocks[ Math.floor( random() * config.rocks.length ) ]
			const m = models[ model ]
			const s = r.s * config.rockWidth / Math.max( m.size.x, m.size.z )
			return { model, x: r.x, y: r.y - r.s * 0.15, z: r.z, s, r: r.r, rs: r.s }

		} )
		for ( const r of placeR ) if ( r.rs > 0.5 ) this.colliders.push( { type: 'ball', x: r.x, y: r.y + r.rs * 0.3, z: r.z, r: r.rs * 0.6 } )

		// ---- arbustos/plantas: em volta de árvores e pedras (onde a natureza "junta") + alguns soltos
		const placeB = []
		const anchors = [ ...placeT, ...placeR ]
		for ( let i = 0; i < config.bushes; i ++ ) {

			const a = anchors[ Math.floor( random() * anchors.length ) ]
			const ang = random() * Math.PI * 2, d = 1.2 + random() * 2.5
			const x = a.x + Math.cos( ang ) * d, z = a.z + Math.sin( ang ) * d
			if ( terrain.grassAt( x, z ) < 0.5 || terrain.normalYAt( x, z ) < 0.8 ) continue
			if ( config.avoid?.some( ( v ) => v.test ? v.test( x, z ) : Math.hypot( x - v.x, z - v.z ) < v.r ) ) continue
			const model = config.plants[ Math.floor( random() * config.plants.length ) ]
			placeB.push( { model, x, y: terrain.sampleHeight( x, z ) - 0.05, z, s: 0.7 + random() * 0.7, r: random() * Math.PI * 2 } )

		}

		// copa: 'model' = folhas do asset (recorte alfa) · 'cards' (Messenger) = cartões desenhados por nós nos pontos da copa do asset,
		// todos gravando a profundidade do CENTRO da árvore para o contorno → traço só na silhueta (+ cartões de detalhe com ID próprio)
		this.canopy = config.canopy ?? 'model'
		this.cards = [] // { model, tree } para montar a copa em cartões depois

		// árvores em BLOCOS espaciais (config.chunk m, padrão: mapa em 3×3): um InstancedMesh cobrindo o mapa inteiro nunca é recortado
		// — tronco e copa eram desenhados inteiros na tela e de novo no passe de sombra. Por bloco, a sombra (frustum de 56 m) só pega
		// 1–4 blocos. Pedras/plantas são leves e ficam num mesh por modelo
		const chunk = config.chunk ?? terrain.size / 3
		const cellOf = ( p ) => `${ Math.floor( p.x / chunk ) },${ Math.floor( p.z / chunk ) }`
		this.cellOf = cellOf
		this.trunkBins = config.canopy === 'cards' ? {} : null // troncos assados por bloco (ver instance)
		const byModel = {}
		for ( const p of placeT ) ( byModel[ p.model + '|' + cellOf( p ) ] ??= [] ).push( p )
		// config.rockStyle 'slabs' (messenger): pedras viram pilhas de lajes geradas em código (world/Rocks.js), não o modelo
		const slabs = config.rockStyle === 'slabs'
		if ( slabs ) {

			const rocks = placeR.map( ( r ) => ( { x: r.x, y: r.y + r.rs * 0.05, z: r.z, w: r.rs * config.rockWidth * 0.9, r: r.r } ) )
			// config.cliffSlabs: na rocha grande do TERRENO (encostas íngremes), lajes saindo da encosta em degraus — base no ponto mais
			// baixo da célula, virada para a descida (o lado de cima fica enterrado no morro)
			if ( config.cliffSlabs ) {

				const S = config.cliffSlabs.cell ?? 5, half = terrain.size / 2
				for ( let x = - half; x < half; x += S ) for ( let z = - half; z < half; z += S ) {

					let rock = 0, lo = Infinity, hi = - Infinity, lx = x, lz = z
					for ( let a = 0; a < 3; a ++ ) for ( let b = 0; b < 3; b ++ ) {

						const sx = x + ( a + 0.5 ) * S / 3, sz = z + ( b + 0.5 ) * S / 3
						rock += terrain.rockAt( sx, sz ) / 9
						const h = terrain.sampleHeight( sx, sz )
						if ( h < lo ) { lo = h; lx = sx; lz = sz }
						hi = Math.max( hi, h )

					}
					if ( rock < 0.3 || lo < 0.4 || random() > ( config.cliffSlabs.density ?? 0.7 ) ) continue
					const cx = x + S / 2, cz = z + S / 2
					// encosta pode chegar perto da rua (o avoid de 9 m é para árvore); só não sobre ela nem dentro das vilas
					if ( terrain.roadDistance?.( cx, cz ) < 4.5 || config.avoid?.some( ( v ) => ! v.test && Math.hypot( cx - v.x, cz - v.z ) < v.r ) ) continue
					// rumo: o bloco "recua" para o lado de cima → gira para a descida (do centro para o ponto mais baixo)
					const down = Math.atan2( lz - cz, lx - cx )
					// rotateY(r) leva o +x local para o ângulo −r no plano xz → r = −(subida) põe o recuo (back 0) morro acima
					rocks.push( { x: ( cx + lx ) / 2, y: lo - 0.2, z: ( cz + lz ) / 2, w: S * ( 0.9 + random() * 0.4 ) + ( hi - lo ) * 0.3, r: - ( down + Math.PI ) + ( random() - 0.5 ) * 0.3, back: 0 } )

				}

			}
			this.cliffCount = rocks.length - placeR.length
			this.rockPiles = new RockPiles( { look, terrain, palette, chunk, rocks } )
			this.group.add( this.rockPiles.group )

		}
		for ( const p of [ ...( slabs ? [] : placeR ), ...placeB ] ) ( byModel[ p.model ] ??= [] ).push( p )
		for ( const [ key, list ] of Object.entries( byModel ) ) this.instance( key.split( '|' )[ 0 ], list, random )
		if ( this.trunkBins && this.trunkPart ) {

			const bark = this.material( this.trunkPart.material.name, this.trunkPart.material, null, null )
			for ( const list of Object.values( this.trunkBins ) ) {

				const mesh = new THREE.Mesh( mergeGeometries( list ), bark )
				mesh.castShadow = true
				mesh.receiveShadow = true
				this.group.add( mesh )

			}

		}
		if ( this.cards.length ) {

			const byCell = {}
			for ( const card of this.cards ) ( byCell[ cellOf( card.t ) ] ??= [] ).push( card )
			let first = 0
			for ( const cards of Object.values( byCell ) ) { this.buildCanopyCards( cards, random, first ); first += cards.length }

		}

	}

	// pontos da copa de um modelo (local): vértices das folhas reduzidos a 1 por célula de voxel → cartões espalhados por igual
	canopyPoints( model ) {

		if ( model.canopy ) return model.canopy
		const box = new THREE.Box3()
		const leaves = model.parts.filter( ( p ) => p.material.name.startsWith( 'Leaf' ) )
		for ( const p of leaves ) box.union( p.geometry.boundingBox )
		const center = box.getCenter( new THREE.Vector3() )
		const size = box.getSize( new THREE.Vector3() )
		const radius = Math.max( size.x, size.z, size.y ) * 0.5
		const cell = radius * 0.38
		const seen = new Map()
		const v = new THREE.Vector3()
		for ( const p of leaves ) {

			const pos = p.geometry.attributes.position
			for ( let i = 0; i < pos.count; i ++ ) {

				v.fromBufferAttribute( pos, i )
				const key = `${ Math.floor( v.x / cell ) },${ Math.floor( v.y / cell ) },${ Math.floor( v.z / cell ) }`
				const acc = seen.get( key )
				if ( acc ) { acc.sum.add( v ); acc.n ++ } else seen.set( key, { sum: v.clone(), n: 1 } )

			}

		}

		const points = [ ...seen.values() ].map( ( a ) => a.sum.divideScalar( a.n ) )
		model.canopy = { points, center, radius }
		return model.canopy

	}

	// cards = árvores DESTE bloco · first = índice global da 1ª árvore (o ID por árvore não repete entre blocos vizinhos)
	buildCanopyCards( cards, random, first = 0 ) {

		const look = this.look
		const pos = [], tree = [], nrm = [], tint = []
		const q = new THREE.Quaternion(), v = new THREE.Vector3(), c = new THREE.Vector3(), up = THREE.Object3D.DEFAULT_UP
		const bounds = new THREE.Box3()
		cards.forEach( ( { model, t }, i ) => {

			const treeIndex = first + i
			const { points, center, radius } = this.canopyPoints( model )
			q.setFromAxisAngle( up, t.r )
			c.copy( center ).applyQuaternion( q ).multiplyScalar( t.s ).add( v.set( t.x, t.y, t.z ) )
			const R = radius * t.s
			const treeId = 0.35 + ( ( treeIndex * 0.6180339 ) % 1 ) * 0.1 // por árvore (longe do terreno 0.1–0.3 e dos tufos 0.5+)
			const cols = this.leafColsAt( t.x, t.z ) // bioma (ex.: outono = bordo vermelho/laranja, ginkgo amarelo)
			const base = cols[ Math.floor( random() * cols.length ) ].clone().offsetHSL( ( random() - 0.5 ) * 0.03, 0, ( random() - 0.5 ) * 0.06 )
			for ( const lp of points ) {

				const w = lp.clone().applyQuaternion( q ).multiplyScalar( t.s ).add( v.set( t.x, t.y, t.z ) )
				const out = w.clone().sub( c )
				const dist = out.length() / R
				const n = out.normalize().lerp( up, 0.35 ).normalize() // normal achatada por cartão (copa = volume)
				const detail = dist > 0.6 && random() < 0.22
				// corpo: cartão grande · detalhe: menor, empurrado para fora, aponta para fora da copa na tela
				const size = detail ? R * ( 0.26 + random() * 0.1 ) : R * ( 0.42 + random() * 0.2 )
				if ( detail ) w.addScaledVector( n, R * 0.12 )
				const shape = ( detail ? 4 : 0 ) + Math.floor( random() * 4 ) + ( random() < 0.5 ? 0 : 0.5 )
				const col = base.clone().offsetHSL( 0, 0, [ - 0.035, 0, 0.035 ][ Math.floor( random() * 3 ) ] )
				pos.push( w.x, w.y, w.z, size )
				bounds.expandByPoint( w )
				tree.push( c.x, c.y, c.z, detail ? treeId + 0.2 + random() * 0.15 : treeId )
				nrm.push( n.x, n.y, n.z, shape )
				tint.push( col.r, col.g, col.b, random() )

			}

		} )

		const count = pos.length / 4
		const attr = ( a ) => instancedBufferAttribute( new THREE.InstancedBufferAttribute( new Float32Array( a ), 4 ) )
		const aPos = attr( pos ), aTree = attr( tree ), aNrm = attr( nrm ), aTint = attr( tint )
		const atlas = makeCanopyAtlas( 1234 )
		const CELLS = 8

		const isDetail = step( 3.9, aNrm.w )
		const atlasUV = Fn( () => {

			const mirror = step( 0.25, fract( aNrm.w ) )
			const u = mix( uv().x, float( 1 ).sub( uv().x ), mirror )
			return vec2( u.add( aNrm.w.floor() ).div( CELLS ), uv().y )

		} )

		const material = createToonMaterial( look, {
			colorNode: aTint.xyz,
			normalNode: aNrm.xyz,
			alphaNode: texture( atlas, atlasUV() ).a,
			alphaTest: 0.5,
			side: THREE.DoubleSide,
			fade: true,
			hatch: false,
			specular: false,
			penFloor: 0.6, // silhueta da copa sem falhas grandes da caneta (traço grosso onde a pressão sobe)
			id: aTree.w,
			// contorno: distância do centro da árvore (detalhe 0,25 m à frente → ganha traço em volta) e normal constante (sem dobras)
			outlineDepth: cameraViewMatrix.mul( vec4( aTree.xyz, 1 ) ).z.negate().sub( isDetail.mul( 0.25 ) ),
			outlineNormal: vec3( 0, 0, 1 )
		} )

		material.positionNode = Fn( () => {

			const cen = aPos.xyz
			const toCam = normalize( this.viewPos.sub( cen ) )
			const right = normalize( cross( vec3( 0, 1, 0 ), toCam ).add( vec3( 0.0001, 0, 0 ) ) )
			const upV = cross( toCam, right )
			// detalhe aponta para fora da copa (na tela) · corpo gira ao acaso · todos balançam um pouco
			const out = cen.sub( aTree.xyz )
			const outAngle = atan( dot( out, upV ), dot( out, right ) ).sub( Math.PI / 2 )
			const sway = sin( time.mul( 0.9 ).add( aTint.w.mul( 6.28 ) ) ).mul( 0.07 )
			const ang = mix( aTint.w.mul( 6.2832 ), outAngle, isDetail ).add( sway )
			const x = positionGeometry.x, y = positionGeometry.y
			const ca = cos( ang ), sa = sin( ang )
			const lx = x.mul( ca ).sub( y.mul( sa ) ), ly = x.mul( sa ).add( y.mul( ca ) )
			const wobble = vec3( sin( time.mul( 1.1 ).add( cen.x.add( cen.y ).mul( 2 ) ) ), 0, sin( time.mul( 0.55 ).add( cen.z.add( cen.y ).mul( 2 ) ) ) ).mul( 0.03 )
			return cen.add( right.mul( lx.mul( aPos.w ) ) ).add( upV.mul( ly.mul( aPos.w ) ) ).add( wobble )

		} )()

		const mesh = new THREE.InstancedMesh( new THREE.PlaneGeometry( 1, 1 ), material, count )
		// posições vêm do shader → esfera de recorte manual: centros dos cartões + o maior cartão + balanço
		mesh.boundingSphere = bounds.getBoundingSphere( new THREE.Sphere() )
		mesh.boundingSphere.radius += 4
		mesh.castShadow = true
		mesh.receiveShadow = true
		this.group.add( mesh )
		this.canopyMesh = mesh

	}

	// tintAttr/centerAttr: atributos de instância DESTE modelo. Passados como parâmetro (não this.*): o corpo de um Fn()
	// só roda quando o shader compila — ler this.* lá dentro pegaria o atributo do último modelo (buffer menor → erro de GPU)
	material( name, sample, tintAttr, centerAttr ) {

		const look = this.look, palette = this.palette
		const ink = color( palette.ink ?? '#22302c' )
		let mat

		if ( name.startsWith( 'Leaf' ) ) {

			// cor por instância (atributo) + pintas presas ao mundo; recorte = alfa da textura original
			const map = sample.map
			mat = createToonMaterial( look, {
				colorNode: Fn( () => {

					const tint = vec3( instancedBufferAttribute( tintAttr, 'vec3' ) )
					const p = positionWorld
					const a = texture( look.noiseTexture, p.xz.mul( 0.9 ).add( p.y.mul( vec2( 0.53, 0.31 ) ) ) ).r
					const b = texture( look.noiseTexture, p.zy.mul( 2.6 ).add( p.x.mul( vec2( 0.41, 0.77 ) ) ) ).g
					const darker = smoothstep( 0.6, 0.62, a )
					const speck = smoothstep( 0.71, 0.72, b )
					return mix( mix( tint, tint.mul( 0.74 ), darker ), ink, speck.mul( 0.8 ) )

				} )(),
				// normal "fofa": do centro da copa para fora → copa iluminada como um volume, não cartões soltos
				normalNode: normalize( positionWorld.sub( vec3( instancedBufferAttribute( centerAttr, 'vec3' ) ) ) ),
				alphaNode: map ? texture( map, uv() ).a : null,
				alphaTest: 0.45,
				side: THREE.DoubleSide,
				fade: true,
				hatch: false,
				specular: false
			} )

		} else if ( name === 'Rock' && this.rockGrass ) {

			// pedra do Messenger (prints: rocha #9b9886 cinza-oliva, grama verde por cima): o que olha para cima vira grama, com borda
			// recortada por ruído preso ao mundo (aastep) e ID próprio → o contorno desenha a mancha. Sem rachaduras pintadas.
			const grassTop = Fn( () => {

				const p = positionWorld
				// só ruído grande: com o fino (1.3) a borda ficava picotada e o contorno enchia de manchas pretas
				const n = texture( look.noiseTexture, p.xz.mul( 0.22 ).add( p.y.mul( vec2( 0.17, 0.11 ) ) ) ).r
				// limiar baixo + ruído forte: a grama desce pelas faces inclinadas em línguas (só a tira do topo parecia fita)
				const v = normalWorld.y.add( n.sub( 0.5 ).mul( 1.2 ) )
				const aa = fwidth( v ).max( 1e-4 )
				return smoothstep( float( 0.35 ).sub( aa ), float( 0.35 ).add( aa ), v )

			} )
			mat = createToonMaterial( look, {
				colorNode: Fn( () => {

					const base = vec3( instancedBufferAttribute( tintAttr, 'vec3' ) )
					// grama do topo na cor do bioma onde a pedra está (outono = capim dourado, pinheiral = verde frio)
					const grassCol = vec3( color( palette.grass ) ).toVar()
					const t = this.terrain
					if ( t.biomeKinds?.length ) {

						const w = texture( t.biomeTexture, t.worldToUV( positionWorld.xz ) )
						t.biomeKinds.forEach( ( kind, k ) => {

							if ( palette[ kind + 'Grass' ] ) grassCol.assign( mix( grassCol, color( palette[ kind + 'Grass' ] ), step( 0.5, w[ [ 'r', 'g', 'b' ][ k ] ] ) ) )

						} )

					}
					// config.rockLook 'messenger': o desenho de RockLook.js (traços curtos, escorridos, grama recortada com pintinhas)
					if ( this.rockLook === 'messenger' ) return messengerRock( { p: positionWorld, nW: normalWorld, base: color( palette.rockSlab ?? palette.rock ), ink: color( palette.ink ?? '#373f42' ), grass: grassCol, noise: look.noiseTexture } )
					// rachaduras finas e curtas (as falésias do Messenger têm várias): curvas de nível de 2 ruídos, ~metade sobrevive
					const p = positionWorld
					const nA = texture( look.noiseTexture, p.xz.mul( 0.16 ).add( p.y.mul( vec2( 0.19, 0.11 ) ) ) ).r
					const nB = texture( look.noiseTexture, p.zy.mul( 0.2 ).add( p.x.mul( vec2( 0.13, 0.07 ) ) ) ).g
					const crack = ( n ) => float( 1 ).sub( smoothstep( fwidth( n ).mul( 0.5 ), fwidth( n ).mul( 1.3 ), n.sub( 0.5 ).abs() ) )
					const keep = smoothstep( 0.45, 0.52, texture( look.noiseTexture, p.xz.mul( 0.35 ).add( 3.7 ) ).b )
					const rock = mix( base, color( palette.ink ?? '#373f42' ), max( crack( nA ), crack( nB ) ).mul( keep ).mul( 0.8 ) )
					return mix( rock, grassCol, grassTop() )

				} )(),
				id: this.rockLook === 'messenger' ? float( 0.4 ) : grassTop().mul( 0.1 ).add( 0.4 ),
				flatShading: this.rockLook !== 'messenger', // facetado + traços = rabisco; o desenho já dá o volume
				fade: true,
				shadowTint: palette.rockShadow ?? null
			} )

		} else if ( name === 'Rock' ) {

			mat = createToonMaterial( look, {
				colorNode: Fn( () => {

					const base = vec3( instancedBufferAttribute( tintAttr, 'vec3' ) )
					const p = positionWorld
					// poucas rachaduras longas (Messenger): ruído de baixa frequência + só ~1/3 delas sobrevive
					const nA = texture( look.noiseTexture, p.xz.mul( 0.09 ).add( p.y.mul( vec2( 0.13, 0.07 ) ) ) ).r
					const nB = texture( look.noiseTexture, p.zy.mul( 0.1 ).add( p.x.mul( vec2( 0.09, 0.05 ) ) ) ).g
					const crack = ( n ) => float( 1 ).sub( smoothstep( fwidth( n ).mul( 0.6 ), fwidth( n ).mul( 1.6 ), n.sub( 0.5 ).abs() ) )
					const keep = smoothstep( 0.56, 0.62, texture( look.noiseTexture, p.xz.mul( 0.2 ).add( 9.1 ) ).b )
					return mix( base, ink, max( crack( nA ), crack( nB ) ).mul( keep ).mul( 0.85 ) )

				} )(),
				flatShading: true,
				fade: true,
				shadowTint: palette.rockShadow ?? null // sombra bege na pedra creme (referência), não o turquesa do gramado
			} )

		} else {

			mat = createToonMaterial( look, { colorNode: color( palette.trunk ), fade: true } )

		}

		return mat

	}

	instance( name, list, random ) {

		const model = this.models[ name ]
		if ( ! model ) return
		const isTree = list[ 0 ] && model.size.y > 3
		const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()

		// atributos por instância: cor (folha/pedra) e centro da copa em mundo (normal fofa)
		const tints = new Float32Array( list.length * 3 )
		const centers = new Float32Array( list.length * 3 )
		const rockCol = new THREE.Color( this.palette.rock )
		const leafBox = new THREE.Box3()
		for ( const part of model.parts ) if ( part.material.name.startsWith( 'Leaf' ) ) leafBox.union( part.geometry.boundingBox )
		const cy = leafBox.isEmpty() ? model.size.y * 0.6 : ( leafBox.min.y + leafBox.max.y ) / 2

		list.forEach( ( t, i ) => {

			const cols = this.leafColsAt( t.x, t.z )
			const c = ( model.parts.some( ( pp ) => pp.material.name === 'Rock' ) ? rockCol : cols[ Math.floor( random() * cols.length ) ] )
				.clone().offsetHSL( ( random() - 0.5 ) * 0.03, 0, ( random() - 0.5 ) * 0.07 )
			tints.set( [ c.r, c.g, c.b ], i * 3 )
			centers.set( [ t.x, t.y + cy * t.s, t.z ], i * 3 )

		} )

		const tintAttr = new THREE.InstancedBufferAttribute( tints, 3 )
		const centerAttr = new THREE.InstancedBufferAttribute( centers, 3 )
		const cardCanopy = isTree && this.canopy === 'cards'
		if ( cardCanopy ) for ( const t of list ) this.cards.push( { model, t } )

		for ( const part of model.parts ) {

			// material por modelo × parte (os atributos de instância são deste modelo)
			const key = part.material.name
			if ( cardCanopy && key.startsWith( 'Leaf' ) ) continue // folhas viram cartões (buildCanopyCards)
			// tronco (copa em cartões): ASSA a geometria no lugar e junta por bloco — 1 malha por bloco em vez de 1 por modelo × bloco.
			// O frame estava limitado pela CPU (~25 µs por desenho no WebGPU do three) e eram 45 malhas de tronco
			if ( cardCanopy && this.trunkBins ) {

				for ( const t of list ) {

					const g = new THREE.BufferGeometry()
					g.setAttribute( 'position', part.geometry.attributes.position.clone() )
					g.setAttribute( 'normal', part.geometry.attributes.normal.clone() )
					if ( part.geometry.index ) g.setIndex( part.geometry.index.clone() )
					q.setFromAxisAngle( THREE.Object3D.DEFAULT_UP, t.r )
					g.applyMatrix4( m.compose( p.set( t.x, t.y, t.z ), q, s.setScalar( t.s ) ) )
					;( this.trunkBins[ this.cellOf( t ) ] ??= [] ).push( g )

				}
				this.trunkPart ??= part
				continue

			}
			const material = this.material( key, part.material, tintAttr, centerAttr )
			const mesh = new THREE.InstancedMesh( part.geometry, material, list.length )
			list.forEach( ( t, i ) => {

				q.setFromAxisAngle( THREE.Object3D.DEFAULT_UP, t.r )
				m.compose( p.set( t.x, t.y, t.z ), q, s.setScalar( t.s ) )
				mesh.setMatrixAt( i, m )

			} )

			// balanço suave das copas (peso pela altura no modelo)
			if ( key.startsWith( 'Leaf' ) && isTree ) {

				material.positionNode = Fn( () => {

					const phase = hash( instanceIndex ).mul( 6.28 )
					const k = max( positionGeometry.y.sub( cy * 0.5 ), 0 ).mul( 0.012 )
					return positionLocal.add( vec3( time.mul( 1.2 ).add( phase ).sin(), 0, time.mul( 0.9 ).add( phase ).cos() ).mul( k ) )

				} )()

			}

			// planta pequena não projeta sombra (custa shadow pass com recorte alfa e quase não aparece)
			mesh.castShadow = isTree || key === 'Rock'
			mesh.receiveShadow = true
			mesh.computeBoundingSphere()
			this.group.add( mesh )

		}

	}

	addToPhysics( physics ) {

		const { RAPIER, world } = physics
		const body = world.createRigidBody( RAPIER.RigidBodyDesc.fixed() )
		for ( const c of this.colliders ) {

			const desc = c.type === 'cyl'
				? RAPIER.ColliderDesc.cylinder( c.h / 2, c.r ).setTranslation( c.x, c.y + c.h / 2, c.z )
				: RAPIER.ColliderDesc.ball( c.r ).setTranslation( c.x, c.y, c.z )
			world.createCollider( desc, body )

		}

	}

}

// Atlas da copa desenhado por código (nosso): 8 células quadradas, branco no alfa.
// 0–3 corpo: bolo de "lóbulos" (círculos sobrepostos) com pontas de folha na borda → massa de folhagem recortada.
// 4–7 detalhe: leque de 3–5 folhas pontudas saindo da base → aponta para fora da copa (shader gira).
function makeCanopyAtlas( seed ) {

	const random = rng( seed )
	const S = 128, CELLS = 8
	const canvas = document.createElement( 'canvas' )
	canvas.width = S * CELLS; canvas.height = S
	const ctx = canvas.getContext( '2d' )
	ctx.fillStyle = '#fff'
	const leaf = ( x, y, ang, len, wid ) => {

		// folha em lente: base (x, y) → ponta, largura máxima no meio
		const tx = x + Math.cos( ang ) * len, ty = y + Math.sin( ang ) * len
		const mx = ( x + tx ) / 2, my = ( y + ty ) / 2
		const nx = - Math.sin( ang ) * wid, ny = Math.cos( ang ) * wid
		ctx.beginPath()
		ctx.moveTo( x, y )
		ctx.quadraticCurveTo( mx + nx, my + ny, tx, ty )
		ctx.quadraticCurveTo( mx - nx, my - ny, x, y )
		ctx.fill()

	}

	for ( let s = 0; s < CELLS; s ++ ) {

		const ox = s * S, cx = ox + S / 2, cy = S / 2
		ctx.save()
		ctx.beginPath()
		ctx.rect( ox + 2, 2, S - 4, S - 4 ) // margem: nada invade a célula vizinha (nem no mipmap)
		ctx.clip()
		if ( s < 4 ) {

			const lobes = 6 + Math.floor( random() * 4 )
			for ( let i = 0; i < lobes; i ++ ) {

				const a = random() * Math.PI * 2, d = random() * S * 0.2
				ctx.beginPath()
				ctx.arc( cx + Math.cos( a ) * d, cy + Math.sin( a ) * d, S * ( 0.14 + random() * 0.08 ), 0, Math.PI * 2 )
				ctx.fill()

			}

			// pontas de folha saindo da borda (silhueta serrilhada, não bolha lisa)
			const tips = 9 + Math.floor( random() * 6 )
			for ( let i = 0; i < tips; i ++ ) {

				const a = ( i / tips ) * Math.PI * 2 + random() * 0.4
				const r0 = S * 0.22
				leaf( cx + Math.cos( a ) * r0, cy + Math.sin( a ) * r0, a + ( random() - 0.5 ) * 0.6, S * ( 0.13 + random() * 0.1 ), S * ( 0.035 + random() * 0.02 ) )

			}

		} else {

			const n = 3 + Math.floor( random() * 3 )
			for ( let i = 0; i < n; i ++ ) {

				const f = n === 1 ? 0 : i / ( n - 1 ) - 0.5
				// sobe a partir da base (y grande = baixo no canvas; o shader aponta o "cima" do cartão para fora da copa)
				const ang = - Math.PI / 2 + f * 1.6 + ( random() - 0.5 ) * 0.3
				leaf( cx + f * S * 0.15, S * 0.88, ang, S * ( 0.5 + random() * 0.25 ) * ( 1 - Math.abs( f ) * 0.4 ), S * ( 0.08 + random() * 0.04 ) )

			}

		}

		ctx.restore()

	}

	const tex = new THREE.CanvasTexture( canvas )
	tex.colorSpace = THREE.NoColorSpace
	tex.anisotropy = 4
	return tex

}