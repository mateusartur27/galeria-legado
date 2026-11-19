import * as THREE from 'three/webgpu'
import { canvasTex } from './PeriodRoom.js'
import { UniversalRigTest } from './UniversalRigTest.js'

const sides = [ [ 'Left', 1, 'esquerdo', 'esquerda' ], [ 'Right', -1, 'direito', 'direita' ] ]
const positionControls = [
	[ 'x', 'Posição lateral · X', -.2, .2, .005, 'm' ],
	[ 'y', 'Posição vertical · Y', -.2, .2, .005, 'm' ],
	[ 'z', 'Posição frente/fundo · Z', -.2, .2, .005, 'm' ],
]
const rotationControls = [
	[ 'rx', 'Giro · X', -180, 180, 1, '°' ],
	[ 'rot', 'Giro · Y', -180, 180, 1, '°' ],
	[ 'rz', 'Giro · Z', -180, 180, 1, '°' ],
]
const offsetDefaults = { x: 0, y: 0, z: 0 }
const limbDefaults = { ...offsetDefaults, rx: 0, rot: 0, rz: 0 }

export function seatLuizGama( entry, root, height ) {
	const { bench, seatHeight, addReadingControl } = entry.room
	root.updateMatrixWorld( true )
	const bounds = new THREE.Box3().setFromObject( root )
	const center = bounds.getCenter( new THREE.Vector3() )
	const sourceHeight = bounds.max.y - bounds.min.y
	root.scale.multiplyScalar( 1 / sourceHeight )
	root.position.sub( new THREE.Vector3( center.x, bounds.min.y, center.z ) ).divideScalar( sourceHeight )

	const holder = new THREE.Group()
	holder.name = 'character-luizgama'
	holder.add( root )
	const bones = new Map()
	const joint = ( name, parent, x, y, z ) => {
		const bone = new THREE.Bone()
		const point = new THREE.Vector3( x, y, z )
		bone.name = name
		bone.position.copy( point ).sub( bones.get( parent )?.point ?? new THREE.Vector3() )
		;( bones.get( parent )?.bone ?? holder ).add( bone )
		bones.set( name, { bone, point } )
	}
	joint( 'Hips', null, 0, .50, -.012 )
	joint( 'Spine', 'Hips', 0, .59, -.008 )
	joint( 'Spine1', 'Spine', 0, .68, 0 )
	joint( 'Spine2', 'Spine1', 0, .76, 0 )
	joint( 'Neck', 'Spine2', 0, .857, .003 )
	joint( 'Head', 'Neck', 0, .92, .009 )
	for ( const [ side, sign ] of sides ) {
		joint( side + 'Shoulder', 'Spine2', sign * .055, .765, -.018 )
		joint( side + 'Arm', side + 'Shoulder', sign * .137, .746, -.029 )
		joint( side + 'ForeArm', side + 'Arm', sign * .276, .718, -.032 )
		joint( side + 'Hand', side + 'ForeArm', sign * .407, .705, -.026 )
		joint( side + 'UpLeg', 'Hips', sign * .078, .50, -.012 )
		joint( side + 'Leg', side + 'UpLeg', sign * .079, .278, .005 )
		joint( side + 'Foot', side + 'Leg', sign * .080, .063, -.005 )
		joint( side + 'ToeBase', side + 'Foot', sign * .080, .021, .058 )
	}

	const rig = new UniversalRigTest( {
		root, holder,
		rigEditor: { bones: [ ...bones.values() ].map( record => record.bone ), rigRevision: 0, rest() {} },
	} )
	rig.prepare()
	rig.ensureSkin()
	for ( const { mesh, skin } of rig.skin.pairs ) {
		skin.castShadow = mesh.castShadow
		skin.receiveShadow = mesh.receiveShadow
		if ( /cabeça/i.test( mesh.name ) ) {
			const head = rig.bones.indexOf( bones.get( 'Head' ).bone )
			const indices = skin.geometry.attributes.skinIndex, weights = skin.geometry.attributes.skinWeight
			for ( let i = 0; i < indices.count; i ++ ) {
				indices.setXYZW( i, head, 0, 0, 0 )
				weights.setXYZW( i, 1, 0, 0, 0 )
			}
		} else {
			// Distribui a dobra pelas mangas e mantém cada mão rígida depois do punho.
			const vertices = skin.geometry.attributes.position
			const indices = skin.geometry.attributes.skinIndex, weights = skin.geometry.attributes.skinWeight
			const toHolder = holder.matrixWorld.clone().invert().multiply( skin.matrixWorld )
			const handJoints = sides.map( ( [ side ] ) => [ 'Arm', 'ForeArm', 'Hand' ].map( name => rig.bones.indexOf( bones.get( side + name ).bone ) ) )
			const point = new THREE.Vector3()
			for ( let i = 0; i < vertices.count; i ++ ) {
				point.fromBufferAttribute( vertices, i ).applyMatrix4( toHolder )
				const x = Math.abs( point.x )
				if ( x <= .16 || point.y < .62 ) continue
				const [ arm, forearm, hand ] = handJoints[ point.x > 0 ? 0 : 1 ]
				const sleeve = THREE.MathUtils.smoothstep( x, .16, .23 ) * THREE.MathUtils.smoothstep( point.y, .62, .655 )
				const elbow = THREE.MathUtils.smoothstep( x, .228, .324 )
				const wrist = THREE.MathUtils.smoothstep( x, .382, .431 )
				if ( sleeve < 1 ) {
					const prior = [ indices.getX( i ), indices.getY( i ), indices.getZ( i ), indices.getW( i ) ]
					const priorWeights = [ weights.getX( i ), weights.getY( i ), weights.getZ( i ), weights.getW( i ) ]
					const blend = new Map( [ [ arm, sleeve ] ] )
					prior.forEach( ( index, j ) => blend.set( index, ( blend.get( index ) ?? 0 ) + ( 1 - sleeve ) * priorWeights[ j ] ) )
					const best = [ ...blend ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 4 )
					const sum = best.reduce( ( total, [ , weight ] ) => total + weight, 0 )
					while ( best.length < 4 ) best.push( [ 0, 0 ] )
					indices.setXYZW( i, ...best.map( ( [ index ] ) => index ) )
					weights.setXYZW( i, ...best.map( ( [ , weight ] ) => weight / sum ) )
				} else {
					indices.setXYZW( i, arm, forearm, hand, 0 )
					weights.setXYZW( i, 1 - elbow, elbow - wrist, wrist, 0 )
				}
			}
			indices.needsUpdate = weights.needsUpdate = true
		}
	}

	holder.scale.setScalar( height )
	holder.position.set( 0, seatHeight - .437 * height, -.075 )
	bench.add( holder )
	entry.character3d = holder
	const paper = makeNewspaper()
	holder.add( paper )

	const vector = ( x, y, z ) => new THREE.Vector3( x, y, z )
	const bone = name => bones.get( name ).bone
	const local = name => holder.worldToLocal( bone( name ).getWorldPosition( new THREE.Vector3() ) )
	const orient = ( name, direction, adjustment, palm = null, palmInfluence = 1 ) => {
		const b = bone( name ), rest = rig.rest.get( b )
		const rotation = new THREE.Quaternion().setFromUnitVectors( rest.direction, direction.normalize() ).multiply( rest.q )
		if ( palm ) {
			const current = vector( 0, -1, 0 ).applyQuaternion( rotation )
			current.addScaledVector( direction, -current.dot( direction ) ).normalize()
			palm.addScaledVector( direction, -palm.dot( direction ) ).normalize()
			const angle = Math.atan2( direction.dot( current.clone().cross( palm ) ), current.dot( palm ) )
			rotation.premultiply( new THREE.Quaternion().setFromAxisAngle( direction, angle * palmInfluence ) )
		}
		if ( adjustment ) rotation.multiply( adjustment )
		b.quaternion.copy( b.parent.getWorldQuaternion( new THREE.Quaternion() ).invert()
			.multiply( holder.getWorldQuaternion( new THREE.Quaternion() ) ).multiply( rotation ) )
	}
	for ( const [ side, sign ] of sides ) {
		orient( side + 'UpLeg', vector( sign * .11, -.09, 1 ) )
		orient( side + 'Leg', vector( 0, -1, .08 ) )
		bone( side + 'Foot' ).quaternion.copy( bone( side + 'Leg' ).getWorldQuaternion( new THREE.Quaternion() ).invert()
			.multiply( holder.getWorldQuaternion( new THREE.Quaternion() ) ) )
	}

	const adjustments = { paper: { ...limbDefaults, size: 100 } }
	for ( const [ side ] of sides ) {
		adjustments[ side + 'Arm' ] = limbDefaults
		adjustments[ side + 'Hand' ] = limbDefaults
	}
	const offset = value => vector( value.x, value.y, value.z ).divideScalar( height )
	const radians = THREE.MathUtils.degToRad
	const rotationOf = value => new THREE.Euler( radians( value.rx ), radians( value.rot ), radians( value.rz ), 'YXZ' )
	const pose = time => {
		const breath = Math.sin( time * 1.6 )
		bone( 'Spine' ).rotation.x = .105 + .013 * breath
		bone( 'Spine2' ).rotation.x = .06
		bone( 'Neck' ).rotation.x = .24 + .09 * Math.sin( time * 1.2 )
		bone( 'Head' ).rotation.y = .15 * Math.sin( time * .8 )
		for ( const [ side, sign ] of sides ) {
			const arm = adjustments[ side + 'Arm' ], hand = adjustments[ side + 'Hand' ]
			const shoulder = local( side + 'Arm' )
			const wrist = vector( sign * .132, .655 + .004 * breath, .229 ).add( offset( hand ) )
			const upper = bone( side + 'ForeArm' ).position.length()
			const lower = bone( side + 'Hand' ).position.length()
			const forward = wrist.clone().sub( shoulder )
			const distance = THREE.MathUtils.clamp( forward.length(), Math.abs( upper - lower ) + .002, upper + lower - .002 )
			if ( forward.lengthSq() < 1e-8 ) forward.set( 0, 0, 1 )
			forward.normalize()
			const along = ( upper ** 2 - lower ** 2 + distance ** 2 ) / ( 2 * distance )
			const bend = vector( sign * .24, -1, -.22 ).applyEuler( rotationOf( arm ) ).addScaledVector( offset( arm ), 9 )
			bend.addScaledVector( forward, -bend.dot( forward ) )
			if ( bend.lengthSq() < 1e-8 ) {
				bend.crossVectors( forward, Math.abs( forward.y ) < .9 ? vector( 0, 1, 0 ) : vector( 1, 0, 0 ) )
			}
			bend.normalize()
			const elbow = forward.clone().multiplyScalar( along ).addScaledVector( bend, Math.sqrt( Math.max( 0, upper ** 2 - along ** 2 ) ) )
			orient( side + 'Arm', elbow.clone() )
			orient( side + 'ForeArm', forward.multiplyScalar( distance ).sub( elbow ), null, vector( 0, .75, -1 ), .4 )
			orient( side + 'Hand', vector( -sign * .17, .64, .65 ), new THREE.Quaternion().setFromEuler( rotationOf( hand ) ), vector( 0, .75, -1 ) )
		}
		paper.position.set( 0, .692 + .004 * breath, .273 ).add( offset( adjustments.paper ) )
		paper.scale.setScalar( adjustments.paper.size / 100 )
		paper.rotation.copy( rotationOf( adjustments.paper ) )
	}
	let time = 0
	const moving = !matchMedia( '(prefers-reduced-motion: reduce)' ).matches
	const register = ( key, label, spec ) => {
		addReadingControl( key, label, spec, adjustments[ key ], value => {
			adjustments[ key ] = value
			pose( time )
		} )
	}
	const elbowControls = positionControls.map( ( [ key, label, ...range ] ) => [ key, label.replace( 'Posição', 'Cotovelo' ), ...range ] )
	for ( const [ side, , armLabel, handLabel ] of sides ) {
		register( side + 'Arm', 'Braço ' + armLabel, [ ...elbowControls, ...rotationControls ] )
		register( side + 'Hand', 'Mão ' + handLabel, [ ...positionControls, ...rotationControls ] )
	}
	register( 'paper', 'Jornal', [ ...positionControls, ...rotationControls, [ 'size', 'Tamanho', 25, 225, 1, '%' ] ] )
	pose( 0 )
	return { root, holder, update( dt ) { if ( moving && dt > 0 ) { time = ( time + dt ) % ( 20 * Math.PI ); pose( time ) } } }
}

function makeNewspaper() {
	const print = canvasTex( 768, 512, ( ctx, w, h ) => {
		ctx.fillStyle = '#c9b68e'
		ctx.fillRect( 0, 0, w, h )
		ctx.fillStyle = '#312920'
		ctx.font = 'bold 39px Georgia'
		ctx.textAlign = 'center'
		ctx.fillText( 'A IMPRENSA', w / 2, 55 )
		ctx.font = '16px Georgia'
		ctx.fillText( 'SÃO PAULO   ·   NOTÍCIAS DA PROVÍNCIA', w / 2, 85 )
		ctx.fillRect( 28, 101, w - 56, 3 )
		ctx.textAlign = 'left'
		for ( let column = 0; column < 4; column ++ ) {
			ctx.font = 'bold 17px Georgia'
			ctx.fillText( [ 'NOTÍCIAS', 'DA CAPITAL', 'AINDA HOJE', 'AVISOS' ][ column ], 29 + 181 * column, 131 )
			for ( let line = 0; line < 32; line ++ ) {
				ctx.globalAlpha = .32 + ( line % 5 ) * .095
				ctx.fillRect( 29 + column * 181, 150 + line * 10, 165 - ( line * 17 + column * 11 ) % 31, 2 )
			}
			ctx.globalAlpha = 1
		}
	} )
	const shape = new THREE.PlaneGeometry( .222, .164, 16, 8 )
	const points = shape.attributes.position
	for ( let i = 0; i < points.count; i ++ ) {
		const x = points.getX( i ), y = points.getY( i )
		points.setXYZ( i, x, y * .89, -y * .46 + .012 * ( Math.abs( x ) / .111 ) )
	}
	shape.computeVertexNormals()
	const paper = new THREE.Mesh( shape, new THREE.MeshStandardNodeMaterial( { map: print, side: THREE.DoubleSide, roughness: 1 } ) )
	paper.name = 'jornal-luizgama'
	paper.castShadow = true
	paper.receiveShadow = true
	return paper
}