import * as THREE from 'three/webgpu'
import { UniversalRigTest } from './UniversalRigTest.js'

const V = THREE.Vector3
const Q = THREE.Quaternion
const X = new V( 1, 0, 0 )

export class PixinguinhaPlaying {
	constructor( entry, root, saxophone, height ) {
		const bounds = new THREE.Box3().setFromObject( root )
		const center = bounds.getCenter( new V() )
		const sourceHeight = bounds.max.y - bounds.min.y
		const model = new THREE.Group()
		model.add( root )
		root.position.sub( new V( center.x, bounds.min.y, center.z ) )
		model.scale.setScalar( 1 / sourceHeight )
		const holder = this.holder = new THREE.Group()
		holder.name = 'character-pixinguinha'
		holder.add( model )
		entry.character3d = holder

		const joints = new Map()
		const joint = ( name, x, y, z, parent ) => {
			const bone = new THREE.Bone()
			bone.name = name
			const point = new V( x, y, z )
			bone.position.copy( point )
			if ( parent ) bone.position.sub( joints.get( parent ).point )
			;( joints.get( parent )?.bone ?? holder ).add( bone )
			joints.set( name, { bone, point } )
		}
		joint( 'Hips', 0, .48, 0 )
		joint( 'Spine', 0, .58, 0, 'Hips' )
		joint( 'Spine2', 0, .75, 0, 'Spine' )
		joint( 'Neck', 0, .85, 0, 'Spine2' )
		joint( 'Head', 0, .91, 0, 'Neck' )
		for ( const [ side, sign ] of [ [ 'Left', 1 ], [ 'Right', -1 ] ] ) {
			joint( side + 'Arm', sign * .115, .795, -.012, 'Spine2' )
			joint( side + 'ForeArm', sign * .262, .779, -.008, side + 'Arm' )
			joint( side + 'Hand', sign * .374, .77, 0, side + 'ForeArm' )
			joint( side + 'UpLeg', sign * .059, .48, 0, 'Hips' )
			joint( side + 'Leg', sign * .069, .259, -.007, side + 'UpLeg' )
			joint( side + 'Foot', sign * .076, .044, -.014, side + 'Leg' )
			joint( side + 'ToeBase', sign * .076, .022, .047, side + 'Foot' )
		}
		this.joints = joints
		const bones = [ ...joints.values() ].map( j => j.bone )
		const rig = new UniversalRigTest( { root: model, holder, rigEditor: { rigRevision: 0, bones, rest() {} } } )
		rig.prepare()
		rig.ensureSkin()
		for ( const { mesh, skin } of rig.skin.pairs ) {
			skin.castShadow = mesh.castShadow
			skin.receiveShadow = mesh.receiveShadow
			if ( ! /^Cabe/i.test( mesh.name ) ) continue
			const head = bones.indexOf( joints.get( 'Head' ).bone )
			const indices = skin.geometry.attributes.skinIndex
			const weights = skin.geometry.attributes.skinWeight
			for ( let i = 0; i < indices.count; i++ ) {
				indices.setXYZW( i, head, 0, 0, 0 )
				weights.setXYZW( i, 1, 0, 0, 0 )
			}
		}
		const seat = entry.room.seatDefault
		holder.scale.setScalar( height )
		holder.position.set( seat.x, seat.y + .542 - .48 * height, seat.z )
		holder.position.add( new V( 0, 0, -.035 ).applyAxisAngle( new V( 0, 1, 0 ), seat.yaw ) )
		holder.rotation.y = seat.yaw
		entry.room.room.add( holder )

		this.instrument = new THREE.Group()
		this.instrument.name = 'saxofone-pixinguinha'
		holder.add( this.instrument )
		// GLB mesh coordinates: +Z points toward the mouthpiece and +X toward the bell.
		const sax = saxophone.getObjectByName( 'Saxophone_lambert1_0' ).clone()
		const basis = new THREE.Matrix4().makeBasis( new V( 0, 0, 1 ), new V( 1, 0, 0 ), new V( 0, 1, 0 ) )
		sax.quaternion.setFromRotationMatrix( basis )
		sax.scale.setScalar( .00365 )
		sax.position.copy( new V( -.25, 0, 117 ).multiplyScalar( -sax.scale.x ).applyQuaternion( sax.quaternion ) )
		sax.castShadow = sax.receiveShadow = true
		this.instrument.add( sax )
		this.sax = sax
		this.time = 0
		this.playing = !matchMedia( '(prefers-reduced-motion: reduce)' ).matches
		this.roomAnimation = entry.room.anim
		this.settings = entry.room.attachPose( this )
		this.update( 0 )
	}

	point( name ) {
		return this.holder.worldToLocal( this.joints.get( name ).bone.getWorldPosition( new V() ) )
	}

	orient( name, rotation ) {
		const bone = this.joints.get( name ).bone
		const holderRotation = this.holder.getWorldQuaternion( new Q() )
		bone.quaternion.copy( bone.parent.getWorldQuaternion( new Q() ).invert().multiply( holderRotation ).multiply( rotation ) )
	}

	aim( name, restDirection, direction ) {
		this.orient( name, new Q().setFromUnitVectors( restDirection.normalize(), direction.normalize() ) )
	}

	setEditing( editing ) {
		this.editing = editing
		if ( editing ) this.time = 0
		this.update( 0 )
	}

	offset( { x, y, z } ) {
		return new V( x, y, z ).divideScalar( this.holder.scale.x )
	}

	rotation( { rx, ry, rz } ) {
		const radians = THREE.MathUtils.degToRad
		return new Q().setFromEuler( new THREE.Euler( radians( rx ), radians( ry ), radians( rz ) ) )
	}

	arm( side, sign, wrist, fingers, pose, handPose ) {
		const upper = side + 'Arm', lower = side + 'ForeArm', hand = side + 'Hand'
		const restUpper = this.joints.get( lower ).point.clone().sub( this.joints.get( upper ).point )
		const restLower = this.joints.get( hand ).point.clone().sub( this.joints.get( lower ).point )
		const shoulderBone = this.joints.get( upper ).bone
		const shoulderRest = this.joints.get( upper ).point.clone().sub( this.joints.get( 'Spine2' ).point )
		shoulderBone.position.copy( shoulderRest ).add( this.offset( pose ) )
		const shoulder = this.point( upper )
		const reach = wrist.clone().sub( shoulder )
		const a = restUpper.length(), b = restLower.length()
		const distance = THREE.MathUtils.clamp( reach.length(), Math.abs( a - b ) + .002, a + b - .002 )
		const axis = reach.lengthSq() > 1e-8 ? reach.normalize() : new V( 0, 0, 1 )
		const flex = Math.acos( THREE.MathUtils.clamp( ( distance ** 2 - a * a - b * b ) / ( 2 * a * b ), -1, 1 ) )
		const bend = THREE.MathUtils.clamp( flex + THREE.MathUtils.degToRad( pose.bend ), .08, 2.85 )
		const length = Math.sqrt( a * a + b * b + 2 * a * b * Math.cos( bend ) )
		const along = ( a * a - b * b + length * length ) / ( 2 * length )
		const pole = new V( sign * .38, -1, -.14 )
		pole.addScaledVector( axis, -pole.dot( axis ) )
		if ( pole.lengthSq() < 1e-6 ) pole.crossVectors( axis, X )
		pole.normalize().applyAxisAngle( axis, THREE.MathUtils.degToRad( pose.swivel ) )
		const elbow = axis.clone().multiplyScalar( along ).addScaledVector( pole, Math.sqrt( Math.max( 0, a * a - along * along ) ) )
		this.aim( upper, restUpper, elbow.clone() )
		this.aim( lower, restLower, axis.multiplyScalar( length ).sub( elbow ) )
		const restHand = new V( sign, -.06, .08 ).normalize()
		const grip = new Q().setFromUnitVectors( restHand, fingers.normalize() )
		this.orient( hand, grip.premultiply( this.rotation( handPose ) ) )
	}

	update( dt ) {
		this.roomAnimation.update( dt )
		if ( this.playing && !this.editing ) this.time += dt
		const sway = Math.sin( this.time * 2.2 )
		this.orient( 'Spine2', new Q().setFromEuler( new THREE.Euler( .04, 0, sway * .018 ) ) )
		this.orient( 'Head', new Q().setFromAxisAngle( X, .07 ) )
		for ( const [ side, sign ] of [ [ 'Left', 1 ], [ 'Right', -1 ] ] ) {
			this.aim( side + 'UpLeg', new V( sign * .01, -.221, -.007 ), new V( sign * .044, -.065, .22 ) )
			this.aim( side + 'Leg', new V( sign * .007, -.215, -.007 ), new V( sign * .008, -.215, -.027 ) )
			this.orient( side + 'Foot', new Q() )
		}
		const anchor = this.point( 'Head' ).add( new V( -.005, -.005, .074 ) )
		const baseRotation = new THREE.Euler( -.40, -.12, -.105 + sway * .018 )
		const saxPose = this.settings( 'sax' )
		this.instrument.position.copy( anchor ).add( this.offset( saxPose ) )
		this.instrument.quaternion.copy( this.rotation( saxPose ) ).multiply( new Q().setFromEuler( baseRotation ) )
		this.instrument.scale.setScalar( saxPose.scale / 100 )
		for ( const [ side, sign, key, suffix ] of [ [ 'Left', 1, 82, 'E' ], [ 'Right', -1, 59, 'D' ] ] ) {
			const handPose = this.settings( 'mao' + suffix )
			const contact = new V( 13, sign * 4, key ).multiply( this.sax.scale ).applyQuaternion( this.sax.quaternion ).add( this.sax.position ).applyEuler( baseRotation ).add( anchor )
			const fingers = new V( -sign * .8, -.48 + .06 * Math.sin( this.time * 13 + sign ), .24 )
			const wrist = contact.addScaledVector( fingers, -.043 ).add( this.offset( handPose ) )
			this.arm( side, sign, wrist, fingers, this.settings( 'braco' + suffix ), handPose )
		}
	}

	getStats() { return this.roomAnimation.getStats() }
}
