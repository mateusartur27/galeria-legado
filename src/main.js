import * as THREE from 'three/webgpu'
import * as TSL from 'three/tsl'
import { settings } from './config.js'
import { Engine } from './core/Engine.js'
import { Input } from './core/Input.js'
import { createPhysics } from './core/Physics.js'
import { createLook } from './render/ToonMaterial.js'
import { createNoiseTexture } from './render/Textures.js'
import { Pipeline } from './render/Pipeline.js'
import { Sky } from './render/Sky.js'
import { Sun } from './render/Sun.js'
import { Terrain } from './world/Terrain.js'
import { Grass } from './world/Grass.js'
import { Props } from './world/Props.js'
import { Water } from './world/Water.js'
import { Village } from './world/Village.js'
import { Folk } from './world/Folk.js'
import { River } from './world/River.js'
import { WaterFx } from './world/WaterFx.js'
import { Tufts } from './world/Tufts.js'
import { Nature } from './world/Nature.js'
import { Palette } from './render/Palette.js'
import { Assets } from './core/Assets.js'
import { BlobShadows } from './world/BlobShadows.js'
import { Gobo } from './render/Gobo.js'
import { Player } from './game/Player.js'
import { CameraRig } from './game/CameraRig.js'
import { Firewood } from './game/Firewood.js'
import { Sfx } from './game/Sfx.js'
import { Track } from './world/Track.js'
import { Car } from './game/Car.js'
import { ProbeGI } from './render/ProbeGI.js'
import { DayCycle } from './render/DayCycle.js'
import { Lamps } from './world/Lamps.js'

const style = settings.style
const quality = settings.quality
const hud = document.getElementById( 'hud' )
const loading = document.getElementById( 'loading' )

async function main() {

	const physicsPromise = createPhysics() // WASM carrega em paralelo
	const engine = await new Engine( settings ).init()
	const renderer = engine.renderer

	const scene = new THREE.Scene()
	const camera = new THREE.PerspectiveCamera( style.camera.fov, innerWidth / innerHeight, 0.3, 600 )
	engine.onResize( ( w, h ) => { camera.aspect = w / h; camera.updateProjectionMatrix() } )

	const look = createLook( { ...style, debugView: settings.view } )
	const assets = new Assets( renderer ) // glTF (Meshopt/KTX2/Draco) — personagem e natureza
	const noiseTexture = createNoiseTexture( 256, settings.seed )
	look.noiseTexture = noiseTexture // caneta e hachura leem desta textura (ToonMaterial)
	const sun = new Sun( look, style, quality )
	look.install( scene, sun.light ) // névoa global (scene.fogNode) + identifica o sol p/ o modelo de luz toon

	// ---------- Mundo
	const world = style.world
	// pista (synthwave/kit): traçado definido ANTES do terreno, que se aplaina ao longo dela
	const track = style.vehicle?.track ? new Track() : null
	const palette = style.paletteTexture ? new Palette( style.palette ) : null // paleta em textura (Messenger tColors)
	const terrain = new Terrain( { look, palette: style.palette, paletteTex: palette, noiseTexture, seed: settings.seed, world, track } )
	const sky = new Sky( look, style )
	const water = world.floating ? null : new Water( { look, terrain, palette: style.palette, noiseTexture, sky, mode: world.water } )
	const grass = world.grass ? new Grass( { look, terrain, palette: style.palette, noiseTexture, subdivisions: quality.grass, shape: world.grassShape, variation: world.grassShape === 'blade' ? 1 : 0, lawnKeep: world.lawnKeep, field: world.grassField } ) : null
	const avoid = [ { x: 0, z: 0, r: world.village ? 14 : 7 } ] // mundo pequeno: raio maior para não ter árvore colada na câmera do spawn
	if ( world.grassField ) avoid.push( { x: world.grassField.x, z: world.grassField.z, r: world.grassField.r } ) // campo aberto: sem árvore/pedra dentro
	if ( terrain.riverData ) avoid.push( { test: ( x, z ) => terrain.riverDistance( x, z ) < 4 } ) // nada dentro/na beira do rio
	if ( world.field ) avoid.push( { x: world.field.x, z: world.field.z, r: world.field.r * 0.75 } ) // campo grande: aberto, árvores só na borda
	if ( track ) avoid.push( { test: ( x, z ) => track.distance( x, z ) < track.width * 0.5 + 2.5 } )
	const village = world.village ? new Village( { look, terrain, palette: style.palette, paletteTex: palette, ...world.village } ) : null
	if ( village ) {

		avoid.push( { x: world.village.x, z: world.village.z, r: world.village.r + 2.5 } )
		// ruas da vila (town): nada de árvore/pedra/planta em cima da rua, da calçada nem dos prédios de trás
		if ( world.village.road ) avoid.push( { test: ( x, z ) => terrain.roadDistance( x, z ) < 9 } )
		scene.add( village.mesh )

	}
	// world.ancient: segundo conjunto (ex.: cidade murada da China antiga, Village kind 'zhou'), com platô próprio no Terrain
	const ancient = world.ancient ? new Village( { look, terrain, palette: style.palette, paletteTex: palette, ...world.ancient } ) : null
	if ( ancient ) {

		avoid.push( { x: world.ancient.x, z: world.ancient.z, r: world.ancient.r + 2 } )
		scene.add( ancient.mesh )

	}
	// moradores e animais da cidade antiga (world.folk; coordenadas locais da cidade)
	const folk = ancient && world.folk ? new Folk( { look, terrain, village: ancient, config: world.folk } ) : null
	if ( folk ) scene.add( folk.group )

	// tufos desenhados (Messenger) no gramado; fora da casa
	const tufts = world.tufts ? new Tufts( {
		look, terrain, palette: style.palette, count: world.tufts, ids: !! world.tuftIds, style: world.tuftStyle ?? 'blades', farInk: world.tuftInkFar,
		avoid: [
			...( world.village ? [ { x: world.village.x, z: world.village.z, r: world.village.tuftClear ?? 3.2 } ] : [] ),
			...( world.village?.road ? [ { test: ( x, z ) => terrain.roadDistance( x, z ) < 3.2 } ] : [] ), // tufos até a beira da calçada
			...( terrain.riverData ? [ { test: ( x, z ) => terrain.riverDistance( x, z ) < 0.5 } ] : [] ), // tufos até a margem do rio
			...( world.ancient ? [ { x: world.ancient.x, z: world.ancient.z, r: 12 } ] : [] ), // pátio do caldeirão limpo; mato no resto da cidade
			...( world.grassField ? [ { x: world.grassField.x, z: world.grassField.z, r: world.grassField.r * 0.8 } ] : [] ) // dentro do campo, a grama alta substitui os tufos
		]
	} ) : null
	if ( tufts ) scene.add( tufts.mesh )

	// world.nature: árvores/pedras/arbustos CC0 (public/models/nature.glb) — o Props só distribui; a Nature desenha
	const props = new Props( {
		look, terrain, palette: style.palette, treeCount: world.treeCount ?? quality.trees, rockCount: world.rockCount ?? quality.rocks, avoid,
		kind: world.trees, rockKind: world.rocks, treeScale: world.treeScale, rockScale: world.rockScale,
		leafShadows: style.leafShadows, noiseTexture, build: ! world.nature, groves: world.biomes ?? [], bushes: world.bushes ?? 0
	} )
	// lanternas de poste (Bruno): acendem à noite com o ciclo do dia
	// algumas em volta do início (a 7–9 m, fora da área livre do spawn) para a noite ter luz logo de cara
	const lampSpots = [ [ 7, 5 ], [ - 6, 7.5 ], [ - 7, - 6 ], [ 8, - 7 ] ].filter( ( [ x, z ] ) => terrain.grassAt( x, z ) > 0.5 && ! village )
	const lamps = world.lamps ? new Lamps( { look, terrain, palette: style.palette, count: world.lamps, avoid, spots: lampSpots } ) : null
	if ( lamps ) scene.add( lamps.group )
	// ciclo do dia (style.dayCycle): anima sol, sombra e névoa; ?time=night para num momento
	const dayCycle = style.dayCycle ? new DayCycle( { look, sun, config: { ...style.dayCycle, elevation: style.sun.elevation, azimuth: style.sun.azimuth } } ) : null
	// árvores plantadas pelos conjuntos (pátio da cidade antiga): entram no layout como árvores do mapa (mesmo modelo/cartões)
	for ( const [ lx, lz ] of ancient?.treeSpots ?? [] ) {

		const p = ancient.worldPoint( terrain, lx, lz )
		props.trees.push( { x: p.x, z: p.z, y: p.y - 0.15, s: 1, r: Math.random() * Math.PI * 2 } )

	}
	const nature = world.nature ? new Nature( {
		look, terrain, palette: style.palette, layout: props, camera,
		gltf: await assets.gltf( world.nature.model ),
		config: { ...world.nature, avoid }
	} ) : null

	scene.add( terrain.mesh, sky.mesh, sun.light, sun.light.target, props.group )
	if ( nature ) scene.add( nature.group )
	if ( water ) scene.add( water.mesh )
	const river = terrain.riverData ? new River( { look, terrain, palette: style.palette, noiseTexture, sky } ) : null
	if ( river ) scene.add( river.group )
	if ( grass ) scene.add( grass.mesh )
	if ( track ) scene.add( track.build( look, terrain, style.vehicle.track ) )

	// sombras falsas (matcap-toy): sem shadow map, um quad por objeto
	let blobs = null
	if ( style.shadows.type === 'blob' ) {

		blobs = new BlobShadows( { look, terrain, sun } )
		for ( const t of props.trees ) blobs.add( { x: t.x, y: t.y, z: t.z, radius: 1.5 * t.s, height: 2.6 * t.s, strength: 0.8 } )
		for ( const r of props.rocks ) blobs.add( { x: r.x, y: r.y, z: r.z, radius: r.s * 1.15, height: r.s * 0.4, strength: 0.7 } )
		scene.add( blobs.mesh )

	}

	// gobo (photoreal-tactile): vídeo de folhas projetado pelo sol
	const gobo = style.gobo && sun.light.castShadow ? new Gobo( { look, sun, noiseTexture, config: style.gobo } ) : null
	if ( gobo ) scene.add( gobo.mesh )

	if ( style.hemi ) {

		// kit (Kenney): luz hemisférica céu/chão no lugar de reflexos do céu
		scene.add( new THREE.HemisphereLight( style.hemi.sky, style.hemi.ground, style.hemi.intensity ) )

	} else if ( style.shading === 'pbr' ) {

		// luz ambiente/reflexos do próprio céu (PMREM)
		// material próprio SEM mrtNode: o PMREM renderiza fora do pass com MRT (senão o WGSL sai sem saída de cor)
		const envMaterial = sky.mesh.material.clone()
		envMaterial.mrtNode = null
		const envScene = new THREE.Scene()
		envScene.add( new THREE.Mesh( new THREE.SphereGeometry( 10, 32, 16 ), envMaterial ) )
		const pmrem = new THREE.PMREMGenerator( renderer )
		scene.environment = pmrem.fromScene( envScene, 0.02 ).texture
		scene.environmentIntensity = style.ambient
		pmrem.dispose()

	}

	// ---------- Física + jogador
	const physics = await physicsPromise
	terrain.addToPhysics( physics )
	if ( nature ) nature.addToPhysics( physics )
	else props.addToPhysics( physics )
	village?.addToPhysics( physics )
	ancient?.addToPhysics( physics )
	const spawn = new THREE.Vector3( 0, terrain.sampleHeight( 0, 0 ), 0 )
	// personagem riggado (style.character): modelo + animações em .glb separados (tools/character/build_kid.py)
	let character = null
	if ( style.character ) {

		const [ gltf, anims ] = await Promise.all( [ assets.gltf( style.character.model ), assets.gltf( style.character.anims ) ] )
		character = { ...style.character, gltf, anims } // + inkNoise / shadowCut (Player.buildCharacter)

	}

	const player = new Player( { look, palette: style.palette, physics, spawn, character } )
	scene.add( player.root )

	const playerBlob = blobs ? blobs.add( { x: spawn.x, y: spawn.y, z: spawn.z, radius: 0.6, height: 0.8, strength: 0.95 } ) : - 1

	const input = new Input( renderer.domElement )
	const rig = new CameraRig( camera, terrain, physics, { ...style.camera, collideAll: style.seeThrough === false } )
	rig.ignore = player.collider // o foco da câmera fica dentro da cápsula do jogador
	rig.update( 1, { x: 0, y: 0, zoom: 0 }, spawn, new THREE.Vector3() )

	// estação de rachar lenha (Firewood): E / clique perto do toco
	const sfx = new Sfx()
	// áudio só depois de um gesto (política do navegador); a partir daí o ambiente de água toca sozinho
	for ( const ev of [ 'keydown', 'pointerdown' ] ) addEventListener( ev, () => sfx.ensure(), { once: true } )
	// água: nadar/andar no raso/correnteza (Player) + anéis, respingos e som (WaterFx)
	let waterFx = null
	if ( water || river ) {

		player.waterAt = ( x, z ) => terrain.waterAt( x, z )
		player.waterGround = ( x, z ) => terrain.sampleHeight( x, z )
		player.bounds = terrain.size * 0.62
		waterFx = new WaterFx( { terrain, palette: style.palette, noiseTexture, sfx, falls: river?.falls } )
		scene.add( waterFx.group )

	}
	const firewood = style.firewood ? new Firewood( { look, terrain, physics, noiseTexture, sfx, rig, player, blobShadows: blobs } ) : null
	if ( firewood ) {

		scene.add( firewood.group )
		grass?.clearing.value.set( firewood.center.x, firewood.center.z, 2.6 ) // chão limpo: as lascas ficam visíveis

	}
	const prompt = document.getElementById( 'prompt' )
	const showPrompt = ( text ) => {

		if ( ! prompt ) return
		if ( text && prompt.innerHTML !== text ) prompt.innerHTML = text
		prompt.classList.toggle( 'show', !! text )

	}

	// carro arcade (Kenney/Horizon Drive): F perto do carro entra/sai
	let car = null
	if ( style.vehicle ) {

		const start = track ? track.start( terrain ) : { position: new THREE.Vector3( 4, terrain.sampleHeight( 4, - 3 ), - 3 ), yaw: 0 }
		car = new Car( { look, physics, palette: style.palette, sfx, position: start.position, yaw: start.yaw } )
		scene.add( car.root )

	}

	// ---------- Pós
	const pipeline = new Pipeline( renderer, scene, camera, style, quality )

	if ( settings.debug ) await setupDebug( renderer, look, pipeline, sun, grass )

	// GI assada (kit): o bake renderiza a cena fora do pass com MRT → materiais sem mrtNode (estilo sem contorno não usa)
	let gi = null
	if ( style.gi && style.shading === 'pbr' ) {

		scene.traverse( ( o ) => { for ( const m of [ o.material ].flat() ) if ( m?.mrtNode ) m.mrtNode = null } )
		gi = new ProbeGI( { renderer, scene, center: new THREE.Vector3( 0, 5, - 20 ), config: style.gi } )

	}

	// compila shaders antes do 1º frame (evita travadas)
	sun.update( spawn )
	gobo?.update( spawn )
	await renderer.compileAsync( scene, camera )

	// ---------- Loop
	const inputState = { moveVector: { x: 0, y: 0 }, running: false, jump: false }
	let hudTimer = 0

	engine.setLoop( ( dt ) => {

		inputState.moveVector = input.move()
		inputState.running = input.running
		if ( input.consumeJump() ) inputState.jump = true

		// entrar/sair do carro
		const driving = car?.driving ?? false
		const nearCar = car && ! driving && player.renderPosition.distanceTo( car.renderPosition ) < 3.2
		if ( input.consumeInteract() && car && ( driving || nearCar ) ) {

			car.driving = ! driving
			player.setActive( ! car.driving )
			rig.lead = car.driving ? 0.45 : style.camera.lead
			if ( ! car.driving ) {

				// sai pela porta esquerda
				const x = car.renderPosition.x + Math.cos( car.yaw ) * 2, z = car.renderPosition.z - Math.sin( car.yaw ) * 2
				player.teleport( x, terrain.sampleHeight( x, z ) + 0.2, z )
				sfx.engine( 0, 0 )

			}

		}

		const basis = rig.basis()
		const alpha = physics.update( dt, ( step ) => {

			if ( ! car?.driving ) player.fixedUpdate( step, inputState, basis )
			car?.fixedUpdate( step, inputState )
			firewood?.fixedUpdate( step )

		} )

		if ( car ) {

			car.update( dt, alpha )
			if ( car.driving ) player.teleport( car.renderPosition.x, car.renderPosition.y, car.renderPosition.z ) // jogador "dentro" do carro

		}

		player.update( dt, alpha )
		const focus = car?.driving ? car.renderPosition : player.renderPosition
		const focusVel = car?.driving ? car.velocity : player.velocity

		let promptText = null
		if ( firewood ) {

			const near = firewood.near
			if ( input.consumeAction() && near ) firewood.chop()
			firewood.update( dt, alpha )
			if ( near && ! firewood.swing ) promptText = '<b>E</b> / clique · rachar lenha'

		} else input.consumeAction()

		if ( car?.driving ) promptText = '<b>W/S</b> acelerar · <b>A/D</b> virar · <b>F</b> sair'
		else if ( nearCar ) promptText = '<b>F</b> · dirigir'
		showPrompt( promptText )

		if ( blobs ) blobs.setDynamic( playerBlob, player.renderPosition, Math.max( 0, player.renderPosition.y - terrain.sampleHeight( player.renderPosition.x, player.renderPosition.z ) ), player.facing )

		if ( car?.driving ) rig.chase( car.yaw, dt, Math.min( 3, 0.6 + Math.hypot( focusVel.x, focusVel.z ) * 0.2 ) )
		rig.update( dt, input.consumeLook(), focus, focusVel )
		look.updateOccluder( camera, focus )
		dayCycle?.update( dt )
		lamps?.update( dayCycle?.night ?? 0 )
		sun.update( focus )
		gobo?.update( focus )
		grass?.update( focus )
		tufts?.update( focus )
		folk?.update( dt, focus )
		river?.update( dt )
		if ( waterFx && ! car?.driving ) waterFx.update( dt, player, camera )
		sky.update( camera )

		gi?.update() // GI: assa algumas sondas por frame até completar
		pipeline.render()

		hudTimer += dt
		if ( hudTimer > 0.5 && hud ) {

			hudTimer = 0
			const info = renderer.info.render
			hud.querySelector( '.stats' ).textContent =
				`${ engine.backend } · ${ Math.round( engine.fps ?? 0 ) } fps · dpr ${ engine.dpr.toFixed( 2 ) } · ${ info.drawCalls } draws · ${ ( info.triangles / 1000 ).toFixed( 0 ) }k tris`

		}

	} )

	setupHud()
	loading?.classList.add( 'hidden' )
	// inspeção no console / por agentes (tools/snap.mjs --eval "...")
	window.__game = { THREE, TSL, scene, camera, renderer, player, terrain, grass, props, nature, village, ancient, folk, river, waterFx, tufts, palette, water, sky, sun, look, pipeline, engine, firewood, gobo, blobs, rig, physics, style, car, track, gi, dayCycle, lamps }

}

function setupHud() {

	if ( ! hud ) return
	hud.querySelector( '.style' ).textContent = `${ style.label } · qualidade ${ settings.qualityName }`
	for ( const a of hud.querySelectorAll( '[data-style]' ) ) {

		const url = new URL( location.href )
		url.searchParams.set( 'style', a.dataset.style )
		a.href = url.toString()
		if ( a.dataset.style === settings.styleName ) a.classList.add( 'active' )

	}

}

async function setupDebug( renderer, look, pipeline, sun, grass ) {

	const { Inspector } = await import( 'three/addons/inspector/Inspector.js' )
	renderer.inspector = new Inspector()
	const gui = renderer.inspector.createParameters( 'Look' )
	const sunAngles = { elevation: settings.style.sun.elevation, azimuth: settings.style.sun.azimuth }
	gui.add( sunAngles, 'elevation', 2, 89 ).onChange( () => sun.setAngles( sunAngles.elevation, sunAngles.azimuth ) )
	gui.add( sunAngles, 'azimuth', 0, 360 ).onChange( () => sun.setAngles( sunAngles.elevation, sunAngles.azimuth ) )
	gui.add( look.shadowValue, 'value', 0, 1 ).name( 'shadowValue' )
	gui.add( look.shadowHue, 'value', - 1, 1 ).name( 'shadowHue' )
	gui.add( look.bandSoft, 'value', 0, 1 ).name( 'bandSoft' )
	gui.add( look.ambient, 'value', 0, 1 ).name( 'ambient' )
	gui.add( look.fogFar, 'value', 50, 400 ).name( 'fogFar' )
	if ( grass ) gui.add( grass.wind, 'value', 0, 1.5 ).name( 'wind' )
	if ( pipeline.outline ) {

		gui.add( pipeline.outline.thickness, 'value', 0, 3 ).name( 'ink thickness' )
		gui.add( pipeline.outline.depth, 'value', 0.001, 0.1 ).name( 'ink depth' )
		gui.add( pipeline.outline.normal, 'value', 0.05, 1.5 ).name( 'ink normal' )

	}

	if ( pipeline.lutIntensity ) gui.add( pipeline.lutIntensity, 'value', 0, 1 ).name( 'grade' )

}

main().catch( ( err ) => {

	console.error( err )
	if ( loading ) loading.textContent = 'Erro ao iniciar: ' + err.message

} )
