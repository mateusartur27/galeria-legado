// Rapier (WASM) carregado sob demanda. Passo fixo de 60 Hz com acumulador (determinístico, sem "túnel" em FPS baixo).
export async function createPhysics() {

	const RAPIER = ( await import( '@dimforge/rapier3d-compat' ) ).default
	await RAPIER.init()
	const world = new RAPIER.World( { x: 0, y: - 9.81, z: 0 } )
	world.timestep = 1 / 60

	const physics = {
		RAPIER,
		world,
		step: 1 / 60,
		accumulator: 0,
		alpha: 0,
		// chama fixedUpdate(step) N vezes e devolve alpha p/ interpolar o visual
		update( dt, fixedUpdate ) {

			physics.accumulator = Math.min( physics.accumulator + dt, 0.25 )
			while ( physics.accumulator >= physics.step ) {

				fixedUpdate( physics.step )
				world.step()
				physics.accumulator -= physics.step

			}

			physics.alpha = physics.accumulator / physics.step
			return physics.alpha

		}
	}

	return physics

}
