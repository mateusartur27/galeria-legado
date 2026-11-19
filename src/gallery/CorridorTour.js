import { PORTRAIT_WALL_DROP } from './Gallery.js'
import * as THREE from 'three/webgpu'

const PHOTO_X = 4.57
const WALL_OFFSET = 6
const PORTRAIT_DROP = .30
const PHOTO_WIDTH = 1.73
const PHOTO_HEIGHT = 2.30
const DEFAULT_PLACEMENT = { offset: 0, height: 3.65, scale: 1 }

const NAMEPLATE_WIDTH = 1.47
const NAMEPLATE_HEIGHT = .26

function makeNameplateTexture(name) {
	const canvas = document.createElement('canvas')
	canvas.width = 768
	canvas.height = 136
	const ctx = canvas.getContext('2d')
	ctx.fillStyle = '#28221e'
	ctx.fillRect(0, 0, canvas.width, canvas.height)
	ctx.strokeStyle = '#a48455'
	ctx.lineWidth = 2
	ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24)
	ctx.fillStyle = '#d4b882'
	for (const x of [30, canvas.width - 30]) {
		ctx.beginPath()
		ctx.arc(x, canvas.height / 2, 3, 0, Math.PI * 2)
		ctx.fill()
	}
	ctx.fillStyle = '#f2dfb6'
	ctx.font = '54px Georgia, serif'
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 3, canvas.width - 116)
	const map = new THREE.CanvasTexture(canvas)
	map.colorSpace = THREE.SRGBColorSpace
	map.anisotropy = 4
	return map
}

export class CorridorTour {
	constructor( scene, sets, state ) {
		this.scene = scene
		this.sets = sets
		this.state = state
		this.cur = sets.first
		this.curChar = sets.entries[ 0 ].character.id
		this.phase = 0
		this.dwell = 0
		this.portraits = []
		this.sharedPlacement = {}
	}

	async loadPortraits() {
		const loader = new THREE.TextureLoader()
		const imageGeometry = new THREE.PlaneGeometry( PHOTO_WIDTH, PHOTO_HEIGHT )
		const frameGeometry = new THREE.BoxGeometry( PHOTO_WIDTH + .10, PHOTO_HEIGHT + .10, .07 )
		const trimGeometry = new THREE.BoxGeometry( PHOTO_WIDTH + .042, PHOTO_HEIGHT + .042, .025 )
		const frameMaterial = new THREE.MeshStandardNodeMaterial( { color: '#3b2619', roughness: .52 } )
		const trimMaterial = new THREE.MeshStandardNodeMaterial( { color: '#c1985f', metalness: .25, roughness: .45 } )
		const nameplateBacking = new THREE.BoxGeometry(NAMEPLATE_WIDTH + .037, NAMEPLATE_HEIGHT + .037, .051)
		const nameplateFace = new THREE.PlaneGeometry(NAMEPLATE_WIDTH, NAMEPLATE_HEIGHT)
		this.portraits = await Promise.all( this.sets.entries.map( async entry => {
			const map = await loader.loadAsync( `/portraits/${entry.character.id}.webp` )
			map.colorSpace = THREE.SRGBColorSpace
			const exhibit = new THREE.Group()
			exhibit.name = `portrait-${entry.character.id}`
			exhibit.add( new THREE.Mesh( frameGeometry, frameMaterial ) )
			const trim = new THREE.Mesh( trimGeometry, trimMaterial )
			trim.position.z = .039
			exhibit.add( trim )
			const image = new THREE.Mesh( imageGeometry, new THREE.MeshBasicNodeMaterial( { map, toneMapped: false } ) )
			image.position.z = .054
			exhibit.add( image )
			const plaqueY = -PHOTO_HEIGHT / 2 - .11 - NAMEPLATE_HEIGHT / 2
			const backing = new THREE.Mesh(nameplateBacking, trimMaterial)
			backing.position.set(0, plaqueY, .014)
			const face = new THREE.Mesh(nameplateFace, new THREE.MeshBasicNodeMaterial({
				map: makeNameplateTexture(entry.character.name), toneMapped: false,
			}))
			face.position.set(0, plaqueY, .041)
			exhibit.add(backing, face)
			return { entry, exhibit }
		} ) )
		for ( const { exhibit } of this.portraits ) this.scene.add( exhibit )
		this.updatePortraits()
	}

	placement() {
		return { ...DEFAULT_PLACEMENT, ...this.sharedPlacement }
	}

	portraitPoint( entry ) {
		const { offset, height } = this.placement()
		return { x: entry.side * PHOTO_X, y: height - PORTRAIT_WALL_DROP, z: entry.worldZ + WALL_OFFSET + entry.side * offset }
	}

	selectPortrait( index ) {
		const entry = this.sets.entries[index]
		this.cur = entry.base
		this.curChar = entry.character.id
		this.phase = 0
		this.dwell = 0
		this.state.paused = true
		this.state.distance = this.sets.stopDistance(entry.base) - WALL_OFFSET
		this.state.camX = 0
		this.state.eye = 3.65
		this.state.yaw = this.state.targetYaw = -entry.side * Math.PI / 2
		this.state.pitch = this.state.targetPitch = 0
		this.onSubject?.(entry.character)
	}

	updatePortraits() {
		for ( const { entry, exhibit } of this.portraits ) {
			const point = this.portraitPoint(entry)
			exhibit.position.set(point.x, point.y, point.z)
			exhibit.scale.setScalar(this.placement().scale)
			exhibit.rotation.y = -entry.side * Math.PI / 2
			exhibit.visible = Math.abs( entry.worldZ ) < this.sets.range
		}
	}

	step( dt, aimPoint ) {
		const { sets, state } = this
		if ( ! state.assetsReady ) return
		const index = ( this.cur - sets.first ) % sets.entries.length
		const entry = sets.entries[ index ]
		const center = sets.stopDistance( this.cur )
		const cameraStop = center - ( this.phase === 0 ? WALL_OFFSET + .12 : .35 )
		const remaining = cameraStop - state.distance
		const smoothstep = THREE.MathUtils.smoothstep
		const focus = 1 - smoothstep( remaining, 1, 3.9 )
		const speed = 1.1 + 1.9 * smoothstep( remaining, .12, 2.4 )
		state.distance += Math.max( 0, Math.min( remaining, dt * speed * state.speed ) )

		const close = this.phase === 1
		const blend = 1 - Math.exp( -dt * 3 )
		state.camX += ( entry.side * ( close ? 1.55 : .65 ) * focus - state.camX ) * blend
		state.eye += ( ( close ? 1.75 : 1.97 ) - state.eye ) * blend
		const target = close
			? sets.empty ? { x: entry.side * 7.45, y: 1.65, z: entry.worldZ } : aimPoint( entry )
			: this.portraitPoint(entry)
		const z = target.z + state.distance - ( center + entry.worldZ )
		const x = target.x - state.camX
		state.targetYaw = Math.atan2( -x, -z ) * focus
		const portraitPitch = Math.atan2( target.y - state.eye, Math.hypot( x, z ) )
		const yawError = Math.abs( state.targetYaw - state.yaw )
		const nearPortrait = 1 - smoothstep( remaining, .1, 1.6 )
		const facingPortrait = 1 - smoothstep( yawError, .12, .55 )
		const lift = nearPortrait * facingPortrait
		state.targetPitch = close ? portraitPitch * focus : portraitPitch * lift

		if ( remaining > .001 || yawError > .035
			|| Math.abs( state.targetPitch - state.pitch ) > .035 ) return
		this.dwell += dt
		if ( this.dwell < ( close ? ( sets.empty ? 1.55 : 3.5 ) : 1.7 ) ) return
		this.dwell = 0
		this.phase = close ? 0 : 1
		if ( close ) {
			state.tourDone = ( state.tourDone ?? 0 ) + 1
			this.cur++
			const next = sets.entries[ ( index + 1 ) % sets.entries.length ].character
			this.curChar = next.id
			this.onSubject?.(next)
		}
	}
}
