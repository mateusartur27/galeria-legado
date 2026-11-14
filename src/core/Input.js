// Teclado + mouse + gamepad + toque (joystick virtual à esquerda, câmera à direita, toque rápido = pulo).
export class Input {

	constructor( element ) {

		this.keys = new Set()
		this.look = { x: 0, y: 0 }
		this.zoom = 0
		this.jumpPressed = false
		this.actionPressed = false
		this.touchMove = { x: 0, y: 0, active: false }
		this.dragging = false
		this.element = element

		addEventListener( 'keydown', ( e ) => {

			if ( e.repeat ) return
			this.keys.add( e.code )
			if ( e.code === 'Space' ) this.jumpPressed = true
			if ( e.code === 'KeyE' ) this.actionPressed = true
			if ( e.code === 'KeyF' ) this.interactPressed = true // entrar/sair de veículo

		} )
		addEventListener( 'keyup', ( e ) => this.keys.delete( e.code ) )
		addEventListener( 'blur', () => this.keys.clear() )

		element.addEventListener( 'pointerdown', ( e ) => {

			if ( e.pointerType === 'touch' ) return
			this.dragging = true
			this.press = { x: e.clientX, y: e.clientY, t: performance.now() }
			element.setPointerCapture( e.pointerId )

		} )
		element.addEventListener( 'pointerup', ( e ) => {

			this.dragging = false
			element.releasePointerCapture?.( e.pointerId )
			// clique curto sem arrastar = ação (arrastar continua girando a câmera)
			const p = this.press
			if ( p && e.pointerType !== 'touch' && performance.now() - p.t < 300 && Math.hypot( e.clientX - p.x, e.clientY - p.y ) < 6 ) this.actionPressed = true
			this.press = null

		} )
		element.addEventListener( 'pointermove', ( e ) => {

			if ( ! this.dragging || e.pointerType === 'touch' ) return
			this.look.x += e.movementX
			this.look.y += e.movementY

		} )
		element.addEventListener( 'wheel', ( e ) => { this.zoom += Math.sign( e.deltaY ) }, { passive: true } )
		element.addEventListener( 'contextmenu', ( e ) => e.preventDefault() )

		this.setupTouch( element )

	}

	setupTouch( element ) {

		const touches = new Map()
		element.addEventListener( 'touchstart', ( e ) => {

			for ( const t of e.changedTouches ) {

				const left = t.clientX < innerWidth * 0.5
				touches.set( t.identifier, { left, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t0: performance.now() } )

			}

			e.preventDefault()

		}, { passive: false } )

		element.addEventListener( 'touchmove', ( e ) => {

			for ( const t of e.changedTouches ) {

				const s = touches.get( t.identifier )
				if ( ! s ) continue
				if ( s.left ) {

					const dx = ( t.clientX - s.x0 ) / 60, dy = ( t.clientY - s.y0 ) / 60
					const len = Math.hypot( dx, dy ), k = len > 1 ? 1 / len : 1
					this.touchMove = { x: dx * k, y: dy * k, active: true }

				} else {

					this.look.x += ( t.clientX - s.x ) * 1.4
					this.look.y += ( t.clientY - s.y ) * 1.4

				}

				s.x = t.clientX
				s.y = t.clientY

			}

			e.preventDefault()

		}, { passive: false } )

		const end = ( e ) => {

			for ( const t of e.changedTouches ) {

				const s = touches.get( t.identifier )
				if ( ! s ) continue
				if ( s.left ) this.touchMove = { x: 0, y: 0, active: false }
				else if ( performance.now() - s.t0 < 220 && Math.hypot( t.clientX - s.x0, t.clientY - s.y0 ) < 12 ) this.jumpPressed = true
				touches.delete( t.identifier )

			}

		}

		element.addEventListener( 'touchend', end )
		element.addEventListener( 'touchcancel', end )

	}

	// Vetor de movimento (x = direita, y = frente), magnitude ≤ 1
	move() {

		let x = 0, y = 0
		const k = this.keys
		if ( k.has( 'KeyW' ) || k.has( 'ArrowUp' ) ) y += 1
		if ( k.has( 'KeyS' ) || k.has( 'ArrowDown' ) ) y -= 1
		if ( k.has( 'KeyA' ) || k.has( 'ArrowLeft' ) ) x -= 1
		if ( k.has( 'KeyD' ) || k.has( 'ArrowRight' ) ) x += 1

		const pad = navigator.getGamepads?.()[ 0 ]
		if ( pad ) {

			const dz = ( v ) => Math.abs( v ) > 0.15 ? v : 0
			x += dz( pad.axes[ 0 ] )
			y -= dz( pad.axes[ 1 ] )
			this.look.x += dz( pad.axes[ 2 ] ) * 9
			this.look.y += dz( pad.axes[ 3 ] ) * 6
			if ( pad.buttons[ 0 ]?.pressed && ! this._padJump ) this.jumpPressed = true
			this._padJump = pad.buttons[ 0 ]?.pressed
			if ( pad.buttons[ 2 ]?.pressed && ! this._padAction ) this.actionPressed = true
			this._padAction = pad.buttons[ 2 ]?.pressed
			if ( pad.buttons[ 3 ]?.pressed && ! this._padInteract ) this.interactPressed = true
			this._padInteract = pad.buttons[ 3 ]?.pressed

		}

		if ( this.touchMove.active ) {

			x += this.touchMove.x
			y -= this.touchMove.y

		}

		const len = Math.hypot( x, y )
		return len > 1 ? { x: x / len, y: y / len } : { x, y }

	}

	get running() {

		const pad = navigator.getGamepads?.()[ 0 ]
		return this.keys.has( 'ShiftLeft' ) || this.keys.has( 'ShiftRight' ) || !! pad?.buttons[ 1 ]?.pressed

	}

	consumeJump() {

		const j = this.jumpPressed
		this.jumpPressed = false
		return j

	}

	consumeInteract() {

		const a = this.interactPressed
		this.interactPressed = false
		return !! a

	}

	consumeAction() {

		const a = this.actionPressed
		this.actionPressed = false
		return !! a

	}

	consumeLook() {

		const l = { x: this.look.x, y: this.look.y, zoom: this.zoom }
		this.look.x = this.look.y = this.zoom = 0
		return l

	}

}
