import * as THREE from 'three/webgpu';
import { smoothstep, uv, vec2 } from 'three/tsl';

const PLAYBACK = .8;
const SUPPORT_SPEED = 2.81; // Recuo mediano dos dedos dos pés em apoio, na escala do FBX.
const BALL_RADIUS = .11;
const BALL_ARRIVAL = 2.6;
const STRIKE_START = 3.5;
const CONTACT_FRAME = 13 / 30;
const CONTACT_TIME = STRIKE_START + CONTACT_FRAME;
const FLIGHT_TIME = .74;
const LAUNCH_X = 10.5;
const LAUNCH_Z = -3.1;
const CONTACT_STORAGE = 'legado.layout.pele.ball.v1';
const BALL_POSITION = [
	[ 'x', 'Esquerda ↔ direita', -.5, 1.5, .005, 'm' ],
	[ 'y', 'Altura do centro', .13, .8, .005, 'm' ],
	[ 'z', 'Frente ↔ fundo', -.8, .8, .005, 'm' ],
];
const BLEND = .19;
const CYCLE = 6.3;
const SOLE_OFFSET = .0186; // Ponto mais baixo das chuteiras durante o ciclo.

export class PeleRun {
	constructor( entry, gltf, room, height, ballModel, strikeClip ) {
		const [ source ] = gltf.animations;
		if ( !source || !strikeClip ) throw new Error( 'Clipe de corrida ou de chute ausente' );
		const clip = source.clone();
		const start = Math.min( ...clip.tracks.map( track => track.times[ 0 ] ) );
		for ( const track of clip.tracks ) track.shift( -start );
		clip.resetDuration();

		const root = gltf.scene;
		const bounds = new THREE.Box3().setFromObject( root, true );
		const scale = height / ( bounds.max.y - bounds.min.y );
		const holder = new THREE.Group();
		holder.name = 'character-pele';
		holder.rotation.y = Math.PI;
		holder.scale.setScalar( scale );
		holder.position.set( 0, .02 + SOLE_OFFSET * scale, -.15 );
		holder.add( root );
		entry.group.add( holder );
		entry.character3d = this.holder = holder;

		const shadowMaterial = new THREE.MeshBasicNodeMaterial( {
			color: '#12170b', transparent: true, depthWrite: false, fog: false,
		} );
		const radius = uv().sub( vec2( .5 ) ).length();
		shadowMaterial.opacityNode = smoothstep( .02, .5, radius ).oneMinus().mul( .48 );
		const shadow = new THREE.Mesh( new THREE.PlaneGeometry( 1.7, .92 ), shadowMaterial );
		shadow.rotation.x = -Math.PI / 2;
		shadow.position.set( -.08, .023, holder.position.z );
		room.room.add( shadow );

		this.room = room;
		this.speed = SUPPORT_SPEED * scale * PLAYBACK;
		this.playing = !matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
		this.mixer = new THREE.AnimationMixer( root );
		this.action = this.mixer.clipAction( clip ).setEffectiveTimeScale( PLAYBACK ).play();
		this.strike = this.mixer.clipAction( strikeClip ).setLoop( THREE.LoopOnce, 1 );
		this.strike.clampWhenFinished = true;
		this.time = 0;
		const bones = [];
		root.traverse( node => { if ( node.isBone ) bones.push( node ); } );
		this.arms = [ 'Left', 'Right' ].map( ( side, index ) => ( {
			shoulder: bones.find( bone => bone.name.endsWith( side + 'Arm' ) ),
			elbow: bones.find( bone => bone.name.endsWith( side + 'ForeArm' ) ),
			wrist: bones.find( bone => bone.name.endsWith( side + 'Hand' ) ),
			sign: index === 0 ? 1 : -1,
			before: new THREE.Quaternion(),
		} ) );
		this.armClearance = {
			left: new THREE.Vector3(), right: new THREE.Vector3(), lateral: new THREE.Vector3(),
			center: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3(),
			direction: new THREE.Vector3(), goal: new THREE.Vector3(), turn: new THREE.Quaternion(),
			parent: new THREE.Quaternion(), identity: new THREE.Quaternion(), localTurn: new THREE.Quaternion(),
		};

		const boundsBall = new THREE.Box3().setFromObject( ballModel, true );
		const sizeBall = boundsBall.getSize( new THREE.Vector3() );
		const ballScale = 2 * BALL_RADIUS / Math.max( sizeBall.x, sizeBall.y, sizeBall.z );
		const pivot = new THREE.Group();
		pivot.position.copy( boundsBall.getCenter( new THREE.Vector3() ) ).multiplyScalar( -ballScale );
		ballModel.scale.multiplyScalar( ballScale );
		ballModel.position.multiplyScalar( ballScale );
		pivot.add( ballModel );
		this.ball = new THREE.Group();
		this.ball.add( pivot );
		this.ball.visible = false;

		this.ballShadow = new THREE.Mesh( new THREE.PlaneGeometry( .44, .37 ), shadowMaterial.clone() );
		this.ballShadow.rotation.x = -Math.PI / 2;
		this.ballShadow.visible = false;
		room.room.add( this.ball, this.ballShadow );

		// Ponta da chuteira direita no quadro 13, medida no clipe transferido.
		const contactDefault = {
			x: .291 * scale + BALL_RADIUS * .7,
			y: .02 + BALL_RADIUS,
			z: holder.position.z + .182 * scale,
		};
		this.contact = { ...contactDefault };
		try {
			const saved = JSON.parse( localStorage.getItem( CONTACT_STORAGE ) );
			for ( const [ axis, , min, max ] of BALL_POSITION ) {
				if ( Number.isFinite( saved?.[ axis ] ) ) this.contact[ axis ] = THREE.MathUtils.clamp( saved[ axis ], min, max );
			}
		} catch {}
		room.desk = {
			meta: { title: 'Bola · ponto do chute', spec: BALL_POSITION, startClosed: true, savedMessage: 'Posição da bola salva neste navegador' },
			keys: () => [ 'ball' ],
			label: () => 'Bola no contato com a chuteira',
			get: () => ( { ...this.contact } ),
			all: () => ( { ...this.contact } ),
			select() {},
			set: ( _key, axis, value ) => {
				this.contact[ axis ] = Number( value );
				this.updateBall( CONTACT_TIME );
			},
			save: () => {
				try { localStorage.setItem( CONTACT_STORAGE, JSON.stringify( this.contact ) ); return true; }
				catch { return false; }
			},
			reset: key => {
				this.contact = { ...contactDefault };
				if ( !key ) try { localStorage.removeItem( CONTACT_STORAGE ); } catch {}
				if ( this.editing ) this.updateBall( CONTACT_TIME );
			},
			marker: open => this.previewContact( open ),
		};
		this.mixer.update( 0 );
	}

	previewContact( open ) {
		if ( open === Boolean( this.editing ) ) return;
		this.restoreForearms();
		this.editing = open;
		this.mixer.stopAllAction();
		if ( open ) {
			this.strike.reset().play();
			this.strike.time = CONTACT_FRAME;
			this.mixer.update( 0 );
			this.updateBall( CONTACT_TIME );
		} else {
			this.time = 0;
			this.action.reset().setEffectiveTimeScale( PLAYBACK ).play();
			this.mixer.update( 0 );
			this.updateBall( 0 );
		}
	}

	update( dt ) {
		if ( !this.playing || this.editing ) return;
		this.restoreForearms();
		const elapsed = Math.min( dt, .1 );
		const before = this.time;
		const time = this.time = ( before + elapsed ) % CYCLE;
		const resume = STRIKE_START + this.strike.getClip().duration - BLEND;

		if ( before < STRIKE_START && time >= STRIKE_START ) {
			this.mixer.update( STRIKE_START - before );
			this.strike.reset().play().crossFadeFrom( this.action, BLEND, false );
			this.mixer.update( time - STRIKE_START );
		} else if ( before < resume && time >= resume ) {
			this.mixer.update( resume - before );
			this.action.reset().setEffectiveTimeScale( PLAYBACK ).play().crossFadeFrom( this.strike, BLEND, false );
			this.mixer.update( time - resume );
		} else {
			this.mixer.update( elapsed );
		}

		const fadeIn = THREE.MathUtils.smoothstep( time, STRIKE_START, CONTACT_TIME );
		const fadeOut = 1 - THREE.MathUtils.smoothstep( time, CONTACT_TIME + .13, resume + BLEND );
		const speed = this.speed * ( 1 - .68 * fadeIn * fadeOut );
		const { scroll, period } = this.room;
		scroll.value = ( scroll.value + speed * elapsed ) % period;
		this.updateBall( time );
		this.clearForearms();
	}

	restoreForearms() {
		for ( const arm of this.arms ) {
			if ( !arm.corrected ) continue;
			arm.elbow.quaternion.copy( arm.before );
			arm.corrected = false;
		}
	}

	clearForearms() {
		if ( this.arms.some( arm => !arm.shoulder || !arm.elbow || !arm.wrist ) ) return;
		const v = this.armClearance;
		this.arms[0].shoulder.getWorldPosition( v.left );
		this.arms[1].shoulder.getWorldPosition( v.right );
		v.center.copy( v.left ).lerp( v.right, .5 );
		v.lateral.subVectors( v.left, v.right );
		const halfWidth = v.lateral.length() / 2;
		if ( halfWidth < .01 ) return;
		v.lateral.normalize();
		for ( const arm of this.arms ) {
			arm.elbow.getWorldPosition( v.elbow );
			arm.wrist.getWorldPosition( v.wrist );
			const inward = halfWidth * .8 - arm.sign * v.goal.subVectors( v.wrist, v.center ).dot( v.lateral );
			const belowShoulder = v.center.y - v.wrist.y;
			const nearTorso = 1 - THREE.MathUtils.smoothstep( belowShoulder, .40, .67 );
			const correction = THREE.MathUtils.clamp( inward, 0, .075 ) * nearTorso;
			if ( correction < .001 ) continue;
			v.direction.subVectors( v.wrist, v.elbow ).normalize();
			v.goal.subVectors( v.wrist, v.elbow ).addScaledVector( v.lateral, correction * arm.sign ).normalize();
			v.turn.setFromUnitVectors( v.direction, v.goal );
			v.turn.rotateTowards( v.identity, Math.max( 0, v.turn.angleTo( v.identity ) - .26 ) );
			arm.before.copy( arm.elbow.quaternion );
			arm.corrected = true;
			arm.elbow.parent.getWorldQuaternion( v.parent );
			v.localTurn.copy( v.parent ).invert().multiply( v.turn ).multiply( v.parent );
			arm.elbow.quaternion.premultiply( v.localTurn );
		}
	}

	updateBall( time ) {
		const flight = time - CONTACT_TIME;
		const visible = this.ball.visible = this.ballShadow.visible = time >= BALL_ARRIVAL && flight < FLIGHT_TIME;
		if ( !visible ) return;

		const approachDistance = 2.35;
		const roll = THREE.MathUtils.clamp( ( time - BALL_ARRIVAL ) / ( CONTACT_TIME - BALL_ARRIVAL ), 0, 1 );
		const air = Math.max( 0, flight );
		const lift = Math.max( 0, air * ( 1.65 - 1.9 * air ) );
		const x = this.contact.x + approachDistance * ( 1 - roll ) + LAUNCH_X * air;
		const z = this.contact.z + LAUNCH_Z * air;
		const groundY = .02 + BALL_RADIUS;
		const contactHeight = this.contact.y - groundY;
		const firstBounce = .28;
		const secondBounce = .57;
		let approachHeight;
		if ( roll < firstBounce ) {
			const arc = roll / firstBounce;
			approachHeight = contactHeight * ( 1 - arc ) * ( .65 + 1.45 * arc );
		} else if ( roll < secondBounce ) {
			const arc = ( roll - firstBounce ) / ( secondBounce - firstBounce );
			approachHeight = contactHeight * 2.6 * arc * ( 1 - arc );
		} else {
			const arc = ( roll - secondBounce ) / ( 1 - secondBounce );
			approachHeight = contactHeight * arc * ( 2.4 - 1.4 * arc );
		}
		const y = groundY + approachHeight + lift;
		this.ball.position.set( x, y, z );
		this.ball.rotation.set( air * 5, 0, ( approachDistance * roll ) / BALL_RADIUS - air * 28 );
		this.ballShadow.position.set( x, .023, z );
		this.ballShadow.scale.setScalar( 1 + 1.8 * ( y - groundY ) );
	}

	getStats() {
		const kicking = this.time >= STRIKE_START && this.time < STRIKE_START + this.strike.getClip().duration;
		return { clip: kicking ? 'Chute' : 'Corrida', phase: kicking ? this.strike.time : this.action.time,
			cycleTime: this.time, ballVisible: this.ball.visible, grassOffset: this.room.scroll.value };
	}
}
