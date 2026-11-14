import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { galleryBrightness } from './Gallery.js';
import { vec3 } from 'three/tsl';
import { AleijadinhoStrike } from './AleijadinhoStrike.js';

// ---------------------------------------------------------------------------------------------
// Aleijadinho trabalhando no andaime: rig próprio (Rigs/Aleijadinho - Rig.blend) + animação do Mixamo.
// As mãos do modelo não fecham (a doença do escultor): as ferramentas ficam AMARRADAS ao punho e ao antebraço com tiras de couro.
// As ferramentas são filhas dos ossos e posicionadas na T-pose do arquivo (coordenadas do modelo, Y para cima, rosto em +Z),
// por isso acompanham o braço em qualquer quadro.
// ---------------------------------------------------------------------------------------------

const MODEL_HEIGHT = 1.0 + 1.368; // altura do arquivo (pés em y = -0.995, topo da cabeça em y = 1.373)
const FEET_Y = -0.995;

export const WORK_DEFAULT = {
	height: 1.55,            // altura do personagem na cena (m)
	pos: [ .15, 2.04, .0 ],  // posição dos pés no referencial do andaime (x, topo do tablado, z)
	facing: Math.PI / 2,     // com +90° ele olha para +X do andaime (de frente para a pedra)
	speed: 1,
};

const makeMat = ( color, rough = .7, metal = 0, glow = .07 ) => {
	const m = new THREE.MeshStandardNodeMaterial( { color, roughness: rough, metalness: metal } );
	m.emissiveNode = vec3( new THREE.Color( color ) ).mul( glow ).mul( galleryBrightness ); return m;
};
const cleanName = s => s.replace( /[^a-zA-Z0-9]/g, '' );

export class AleijadinhoWorking {
	constructor( entry, gltf, parent, opts = {} ) {
		this.entry = entry; this.opts = { ...WORK_DEFAULT, ...opts };
		this.root = gltf.scene;
		const s = this.opts.height / MODEL_HEIGHT;
		this.holder = new THREE.Group(); this.holder.name = 'character-aleijadinho';
		this.holder.scale.setScalar( s );
		const A = this.opts.anchor; // grupo posicionável no painel (pés no chão do tablado)
		if ( A ) this.holder.position.set( 0, - FEET_Y * s, 0 ); else { this.holder.position.set( this.opts.pos[ 0 ], this.opts.pos[ 1 ] - FEET_Y * s, this.opts.pos[ 2 ] ); this.holder.rotation.y = this.opts.facing; }
		this.holder.add( this.root ); ( A ?? parent ).add( this.holder );
		entry.character3d = this.holder;
		this.scale = s;

		this.holder.updateMatrixWorld( true );
		this.restPose = []; this.root.traverse( n => { if ( n.isBone ) this.restPose.push( [ n, n.position.clone(), n.quaternion.clone(), n.scale.clone() ] ); } ); // T-pose do arquivo
		this.mixer = new THREE.AnimationMixer( this.root );
		this.clip = gltf.animations[ 0 ]; if ( ! this.clip ) throw new Error( 'O Aleijadinho está sem animação.' );
		this.action = this.mixer.clipAction( this.clip ).setLoop( THREE.LoopRepeat, Infinity ).play();
		this.time = 0; this.playing = ! matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
		this.bones = {}; this.skinned = null;
		this.root.traverse( n => { if ( n.isBone ) this.bones[ cleanName( n.name ) ] = n; if ( n.isSkinnedMesh && ! this.skinned ) this.skinned = n; } );
		if ( ! this.bones.RightHand || ! this.bones.LeftHand ) throw new Error( 'Não encontrei as mãos do Aleijadinho.' );
		this.root.updateMatrixWorld( true );
		this.buildTools();
		this.buildChips( parent ); this.buildWorkHooks();
			if ( this.opts.target ) this.strike = new AleijadinhoStrike( this ); // mão esquerda crava o ponteiro, a direita bate nele (linha do tempo editável)
		this.update( 0 );
		this.debugFromUrl();
	}

	// depuração: ?wt=1.15 (pausa nesse instante do clipe) &wa=0 (ângulo da câmera em graus; 0 = vista do corredor) &wd=3 (distância) &wf=34 (fov)
	debugFromUrl() {
		const q = new URLSearchParams( location.search ); if ( ! q.has( 'wt' ) ) return;
		this.playing = false; this.seek( Number( q.get( 'wt' ) ) );
		const v = new THREE.Vector3(); this.bones.Spine1.getWorldPosition( v ); const ang = ( Number( q.get( 'wa' ) ) || 0 ) * Math.PI / 180, d = Number( q.get( 'wd' ) ) || 3;
		window.__camOverride = { pos: [ v.x + Math.cos( ang ) * d, v.y + .1, v.z + Math.sin( ang ) * d ], at: [ v.x, v.y - .05, v.z ], fov: Number( q.get( 'wf' ) ) || 34 };
		setTimeout( () => document.querySelectorAll( 'select' ).forEach( s => { let n = s; while ( n && ! [ 'fixed', 'absolute' ].includes( getComputedStyle( n ).position ) ) n = n.parentElement; if ( n ) n.style.display = 'none'; } ), 3000 ); // esconde o painel de posições
	}

	// ligações com o painel de posições: 'Cintura' congela na T-pose; 'Ponto do golpe' mostra um ponto brilhante
	buildWorkHooks() {
		const o = this.opts; if ( ! o.hooks ) return;
		if ( o.target ) { const m = new THREE.MeshBasicNodeMaterial( { color: '#ff9a3c', depthTest: false, transparent: true, opacity: .95 } ); const dot = new THREE.Mesh( new THREE.SphereGeometry( .035, 12, 8 ), m ); dot.renderOrder = 30; dot.visible = false; o.target.add( dot ); this.targetDot = dot; }
		o.hooks.onSelect = k => { this.rest = k === 'cintura'; if ( this.targetDot ) this.targetDot.visible = k === 'alvo'; if ( ! this.rest ) this.update( 0 ); };
		o.hooks.onMarker = on => { if ( ! on ) { this.rest = false; if ( this.targetDot ) this.targetDot.visible = false; } };
	}
	// lascas de pedra que saltam do bloco a cada golpe (impact = ponto do golpe no referencial do andaime; hitTime = instante do impacto no clipe)
	buildChips( parent ) {
		this.hitTime = this.opts.hitTime ?? .95; this.chips = []; this.hitKey = '';
		if ( ! this.opts.target && ! this.opts.impact ) return;
		const mt = makeMat( '#c9cfc3', .9, 0, .08 ), geo = new THREE.BoxGeometry( .022, .01, .016 );
		for ( let i = 0; i < 14; i ++ ) { const m = new THREE.Mesh( geo, mt ); m.visible = false; m.castShadow = true; parent.add( m ); this.chips.push( { m, v: new THREE.Vector3(), age: 9, spin: new THREE.Vector3() } ); }
	}
	// instante do primeiro contato do maço com o ponto do golpe (recalculado quando o personagem ou o ponto mudam de lugar)
	autoHitTime() {
		const A = this.opts.anchor, T = this.opts.target; if ( ! A || ! T || ! this.mallet ) return;
		const key = [ ...A.position.toArray(), A.rotation.y, ...T.position.toArray() ].map( v => v.toFixed( 3 ) ).join( ',' ); if ( key === this.hitKey ) return; this.hitKey = key;
		const tip = this.tipProbe ??= ( () => { const o = new THREE.Object3D(); o.position.set( 0, .3 / this.scale, 0 ); this.mallet.add( o ); return o; } )();
		const parent = this.holder.parent?.parent ?? this.holder.parent, v = new THREE.Vector3(), saved = this.time; parent?.updateMatrixWorld( true );
		const dur = this.clip.duration, step = .02; let best = Infinity, bestT = this.hitTime, first = null;
		for ( let t = 0; t < dur; t += step ) {
			this.mixer.setTime( t ); this.root.updateMatrixWorld( true ); tip.getWorldPosition( v ); ( this.opts.target.parent ).worldToLocal( v );
			const d = v.distanceTo( T.position ); if ( d < best ) { best = d; bestT = t; } if ( first === null && d < .14 ) first = t;
		}
		this.mixer.setTime( saved ); this.root.updateMatrixWorld( true );
		this.hitTime = Math.max( 0, ( first ?? bestT ) - .03 ); this.hitDist = best;
	}
	burst() {
		const p = this.opts.target ? this.opts.target.position.toArray() : this.opts.impact;
		for ( const c of this.chips ) {
			c.age = 0; c.m.visible = true; c.m.position.set( p[ 0 ] + ( Math.random() - .5 ) * .1, p[ 1 ], p[ 2 ] + ( Math.random() - .5 ) * .1 );
			c.v.set( ( Math.random() - .5 ) * 1.1, .9 + Math.random() * 1.1, ( Math.random() - .35 ) * 1.1 ); c.spin.set( Math.random() * 12, Math.random() * 12, Math.random() * 12 );
		}
	}
	stepChips( dt ) {
		for ( const c of this.chips ) {
			if ( c.age > 1 ) continue; c.age += dt; c.v.y -= 6 * dt; c.m.position.addScaledVector( c.v, dt );
			c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
			if ( c.m.position.y < ( this.opts.anchor ? this.opts.anchor.position.y : ( this.opts.floorY ?? 0 ) ) || c.age > .9 ) { c.age = 9; c.m.visible = false; }
		}
	}

	// coloca `obj` (definido na T-pose, em coordenadas do arquivo) como filho do osso, preso a ele
	// prende `obj` ao osso; o referencial do osso tem Y ao longo do osso (do pulso para os dedos)
	lash( boneName, obj, pos = [ 0, 0, 0 ], rot = [ 0, 0, 0 ] ) {
		const bone = this.bones[ boneName ]; obj.position.set( ...pos ); obj.rotation.set( ...rot ); bone.add( obj );
		obj.traverse( n => { if ( n.isMesh ) { n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false; } } );
	}

	buildTools() {
		const k = 1 / this.scale;              // metros reais → unidades do arquivo
		const wood = makeMat( '#7a5532', .66 ), darkWood = makeMat( '#4e3420', .72 ), leather = makeMat( '#4b2f1c', .85 ), rope = makeMat( '#b79d6e', .95 ), iron = makeMat( '#aeb2b5', .42, .85, .05 );
		const ring = ( r, tube, mt ) => new THREE.Mesh( new THREE.TorusGeometry( r, tube, 8, 24 ).rotateX( Math.PI / 2 ), mt ); // eixo ao longo de Y (do osso)
		const part = ( geo, mt ) => new THREE.Mesh( geo, mt );
		const T = this.opts.tools ?? {};

		// ---- tiras de couro e cordas em volta do punho (osso do antebraço = antes do pulso; osso da mão = depois)
		for ( const side of [ 'Right', 'Left' ] ) {
			const bind = ( boneName, y, r, tube, mt ) => { const m = ring( r, tube, mt ); m.scale.set( 1, 1, .9 ); this.lash( boneName, m, [ 0, y, 0 ] ); };
			bind( side + 'ForeArm', .06, .074, .016, leather ); bind( side + 'ForeArm', .135, .066, .014, leather ); bind( side + 'ForeArm', .165, .064, .01, rope );
			bind( side + 'Hand', .045, .068, .015, leather ); bind( side + 'Hand', .10, .074, .01, rope );
		}

		// ---- maço de madeira (mão direita: ele é destro): cabo amarrado ALONGADO ao braço (mesma direção), cabeça na ponta, além dos dedos
		{
			const g = new THREE.Group();
			const handle = part( new THREE.CylinderGeometry( .017 * k, .021 * k, .30 * k, 10 ), wood ); handle.position.y = .10 * k;
			const head = part( new THREE.CylinderGeometry( .05 * k, .05 * k, .14 * k, 16 ).rotateZ( Math.PI / 2 ), darkWood ); head.position.y = .27 * k;   // cilindro com eixo X (perpendicular ao cabo)
			const bandA = part( new THREE.CylinderGeometry( .052 * k, .052 * k, .012 * k, 16 ).rotateZ( Math.PI / 2 ), iron ); bandA.position.set( .05 * k, .27 * k, 0 );
			const bandB = bandA.clone(); bandB.position.x = - .05 * k;
			const lash = part( new THREE.CylinderGeometry( .026 * k, .026 * k, .05 * k, 10 ), leather ); lash.position.y = .06 * k;
			g.add( handle, head, bandA, bandB, lash );
			this.lash( 'RightHand', g, T.malletPos ?? [ 0, .02, .0 ], T.malletRot ?? [ 0, 0, 0 ] ); this.mallet = g;
		}
		// ---- ponteiro (mão esquerda): amarrado a 90° do braço, atravessado na palma, ponta para a frente
		{
			const g = new THREE.Group(), axis = geo => geo.rotateX( Math.PI / 2 );   // cilindros com eixo Z (perpendicular ao braço)
			// medidas reais (m) no referencial do ponteiro: traseira em z = -.09, ponta em z = +.26 (AleijadinhoStrike usa os mesmos números)
			const handle = part( axis( new THREE.CylinderGeometry( .016 * k, .02 * k, .12 * k, 10 ) ), wood ); handle.position.z = - .03 * k;
			const cap = part( axis( new THREE.CylinderGeometry( .023 * k, .023 * k, .012 * k, 12 ) ), iron ); cap.position.z = - .096 * k;   // cabeça de ferro: onde a marreta bate
			const ferrule = part( axis( new THREE.CylinderGeometry( .021 * k, .021 * k, .018 * k, 10 ) ), iron ); ferrule.position.z = .04 * k;
			const shaft = part( axis( new THREE.CylinderGeometry( .01 * k, .007 * k, .2 * k, 8 ) ), iron ); shaft.position.z = .15 * k;
			const tip = part( new THREE.BoxGeometry( .02 * k, .004 * k, .02 * k ), iron ); tip.position.z = .26 * k;
			const lash = part( axis( new THREE.CylinderGeometry( .024 * k, .024 * k, .045 * k, 10 ) ), leather ); lash.position.z = - .02 * k;
			g.add( handle, cap, ferrule, shaft, tip, lash );
			this.lash( 'LeftHand', g, T.chiselPos ?? [ 0, .12, 0 ], T.chiselRot ?? [ 0, 0, 0 ] ); this.chisel = g;
			if ( ! T.chiselRot ) { // ponta (+Z do grupo) para trás do personagem na T-pose
				const bone = this.bones.LeftHand, qb = bone.getWorldQuaternion( new THREE.Quaternion() ), back = new THREE.Vector3( 0, 0, - 1 ).applyQuaternion( this.holder.getWorldQuaternion( new THREE.Quaternion() ) ).applyQuaternion( qb.invert() );
				g.quaternion.setFromUnitVectors( new THREE.Vector3( 0, 0, 1 ), back ); }
		}
	}	update( dt ) {
		if ( this.rigEditor?.editing && ! this.rigEditor.preview ) return;
		this.rigEditor?.restorePoseOffsets();
		this.rigCalibration?.restoreFrame();
		if ( this.rest ) { for ( const [ n, p, q, s ] of this.restPose ) { n.position.copy( p ); n.quaternion.copy( q ); n.scale.copy( s ); } this.rigCalibration?.apply(); return; }
		const st = this.strike?.enabled ? this.strike : null; if ( ! st ) this.autoHitTime();
		if ( this.playing ) {
			const prev = this.time; this.time = ( this.time + Math.min( dt, .1 ) * this.opts.speed ) % this.clip.duration;
			if ( dt > 0 && this.chips?.length && ( st ? st.crossed( prev, this.time ) : ( prev < this.hitTime && this.time >= this.hitTime ) ) ) this.burst();
			this.stepChips?.( Math.min( dt, .1 ) );
		}
		this.mixer.setTime( this.time );
		this.rigEditor?.applyCalibration();
		this.rigCalibration?.apply();
		st?.apply( this.time );
	}
	seek( seconds ) { this.time = ( ( seconds % this.clip.duration ) + this.clip.duration ) % this.clip.duration; this.update( 0 ); }
	getStats() { return { clip: this.clip.name, duration: this.clip.duration, time: this.time, playing: this.playing, rigCalibration: this.rigCalibration?.status, bones: Object.keys( this.bones ).length }; }
}





