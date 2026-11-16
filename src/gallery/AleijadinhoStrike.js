import * as THREE from 'three/webgpu';
import './strike-timeline.css';

// ---------------------------------------------------------------------------------------------
// Golpe do Aleijadinho: a mão ESQUERDA crava a ponta do ponteiro no ponto do golpe ("alvo") e a marreta (mão DIREITA)
// bate na traseira do ponteiro. O corpo (pernas, tronco) segue o clipe do Mixamo; os braços são resolvidos por IK de 2 ossos.
// O movimento do maço é uma linha do tempo de CHAVES editáveis (painel "Golpe"): recuo, tronco, curva e marca de impacto; punho e maço mantêm a orientação.
// ---------------------------------------------------------------------------------------------

const KEY = 'legado.aleijadinho.golpe.v1', ENDPOINT = '/__reference/aleijadinho-golpe';
const TIP_Z = .26, BUTT_Z = - .09;          // pontas do ponteiro no referencial dele (m reais): ponta e traseira
const FACE = [ .07, .27, 0 ];               // centro da face de bater do maço no referencial dele (m reais)
const D2R = Math.PI / 180;
const EASE = { linear: u => u, in: u => u * u, out: u => 1 - ( 1 - u ) * ( 1 - u ), inout: u => u * u * ( 3 - 2 * u ) };
const EASE_NAMES = { linear: 'Linear', in: 'Acelera (cai)', out: 'Freia (sobe)', inout: 'Suave' };

export const STRIKE_DEFAULT = {
	schema: 'aleijadinho-golpe/v1', enabled: true, duration: 2.3,
	tool: { pitch: 38, yaw: 0, roll: - 55 }, // ponteiro: inclinação para baixo, giro lateral e lado de onde vem o cabo da marreta (°)
	keys: [
		{ t: 0.00, recuo: 22, ang: 55, giro: 0, tronco: 0, ease: 'inout' },
		{ t: 0.55, recuo: 30, ang: 70, giro: 0, tronco: 0, ease: 'in' },
		{ t: 0.85, recuo: 0, ang: 0, giro: 0, tronco: 0, ease: 'out', hit: true },
		{ t: 1.10, recuo: 9, ang: 15, giro: 0, tronco: 0, ease: 'inout' },
		{ t: 1.60, recuo: 24, ang: 58, giro: 0, tronco: 0, ease: 'inout' },
	],
};

const V = THREE.Vector3, Q = THREE.Quaternion, M = THREE.Matrix4;
const basisQ = ( x, y ) => { const z = new V().crossVectors( x, y ).normalize(), yy = new V().crossVectors( z, x ).normalize(); return new Q().setFromRotationMatrix( new M().makeBasis( x, yy, z ) ); };
const clone = o => JSON.parse( JSON.stringify( o ) );

export class AleijadinhoStrike {
	constructor( char ) {
		this.c = char; this.cfg = clone( STRIKE_DEFAULT ); this.cfg.duration = char.clip.duration;
		this.cfg.keys.forEach( k => k.t = Math.min( k.t, this.cfg.duration - .01 ) );
		this.enabled = false; this.sel = 0; // desligado por padrão: vale a animação original do Mixamo
		this.info = { L: 0, R: 0 };
		const b = char.bones, ax = ( bone, child ) => child.position.clone().normalize();
		char.root.updateMatrixWorld( true );
		const mk = ( side, n1, n2, n3 ) => {
			const A = b[ side + n1 ], F = b[ side + n2 ], H = b[ side + n3 ];
			const wdir = H.getWorldPosition( new V() ).sub( F.getWorldPosition( new V() ) ).normalize();
			return { A, F, H, aA: ax( A, F ), aF: ax( F, H ), aH: wdir.applyQuaternion( H.getWorldQuaternion( new Q() ).invert() ) };
		};
		this.L = mk( 'Left', 'Arm', 'ForeArm', 'Hand' ); this.R = mk( 'Right', 'Arm', 'ForeArm', 'Hand' );
		this.LL = mk( 'Left', 'UpLeg', 'Leg', 'Foot' ); this.RL = mk( 'Right', 'UpLeg', 'Leg', 'Foot' ); // pernas: mantêm os pés plantados quando a bacia desce
		this.spine = [ [ b.Spine, .3 ], [ b.Spine1, .35 ], [ b.Spine2, .35 ] ];
		// referenciais locais (na mão) das ferramentas: ponteiro = (eixo da ponta, eixo do osso); marreta = (X da face, Y do cabo)
		this.qChisel = basisQ( new V( 0, 0, 1 ).applyQuaternion( char.chisel.quaternion ).normalize(), this.L.aH.clone() );
		this.qMallet = basisQ( new V( 1, 0, 0 ).applyQuaternion( char.mallet.quaternion ).normalize(), new V( 0, 1, 0 ).applyQuaternion( char.mallet.quaternion ).normalize() );
		this.sorted();
	}

	refreshRigAxes() {
		const c=this.c;c.root.updateMatrixWorld(true);for(const arm of [this.L,this.R,this.LL,this.RL]){arm.aA.copy(arm.F.position).normalize();arm.aF.copy(arm.H.position).normalize();arm.aH.copy(arm.H.getWorldPosition(new V()).sub(arm.F.getWorldPosition(new V())).normalize().applyQuaternion(arm.H.getWorldQuaternion(new Q()).invert()));}
		this.refreshToolAxes();
	}

	refreshToolAxes() {
		const c=this.c;this.qChisel=basisQ(new V(0,0,1).applyQuaternion(c.chisel.quaternion).normalize(),this.L.aH.clone());this.qMallet=basisQ(new V(1,0,0).applyQuaternion(c.mallet.quaternion).normalize(),new V(0,1,0).applyQuaternion(c.mallet.quaternion).normalize());
	}

	sorted() { this.cfg.keys.sort( ( a, b ) => a.t - b.t ); }

	// ---- linha do tempo ----
	eval( t ) {
		const ks = this.cfg.keys, n = ks.length, D = this.cfg.duration;
		if ( ! n ) return { recuo: 20, ang: 40, giro: 0, tronco: 0, bacY: 0, bacF: 0 };
		let i = n - 1; for ( let j = 0; j < n; j ++ ) if ( ks[ j ].t <= t ) i = j; else break;
		const a = ks[ i ], bi = ( i + 1 ) % n, b = ks[ bi ];
		const t0 = i === n - 1 && a.t > t ? a.t - D : a.t, t1 = bi <= i ? b.t + D : b.t;
		const u = n === 1 ? 0 : THREE.MathUtils.clamp( ( t - t0 ) / Math.max( 1e-4, t1 - t0 ), 0, 1 ), e = ( EASE[ a.ease ] ?? EASE.inout )( u );
		const L = ( p ) => ( a[ p ] ?? 0 ) + ( ( b[ p ] ?? 0 ) - ( a[ p ] ?? 0 ) ) * e;
		return { recuo: Math.max( 0, L( 'recuo' ) ), ang: L( 'ang' ), giro: L( 'giro' ), tronco: L( 'tronco' ), bacY: L( 'bacY' ), bacF: L( 'bacF' ) };
	}
	// algum golpe (chave com `hit`) cruzado entre os instantes prev → cur?
	crossed( prev, cur ) {
		for ( const k of this.cfg.keys ) if ( k.hit ) { if ( cur >= prev ? ( k.t > prev && k.t <= cur ) : ( k.t > prev || k.t <= cur ) ) return true; }
		return false;
	}

	// ---- IK ----
	elbow( arm, W, poleW ) {
		const pA = arm.A.getWorldPosition( new V() ), pF = arm.F.getWorldPosition( new V() ), pH = arm.H.getWorldPosition( new V() );
		const L1 = pA.distanceTo( pF ), L2 = pF.distanceTo( pH ), to = W.clone().sub( pA ), d = to.length(), dir = to.clone().divideScalar( Math.max( d, 1e-6 ) );
		const dc = THREE.MathUtils.clamp( d, .12 * ( L1 + L2 ), ( L1 + L2 ) * .999 );
		const a = ( L1 * L1 - L2 * L2 + dc * dc ) / ( 2 * dc ), h = Math.sqrt( Math.max( 0, L1 * L1 - a * a ) );
		const pv = poleW.clone().sub( dir.clone().multiplyScalar( poleW.dot( dir ) ) ); if ( pv.lengthSq() < 1e-6 ) pv.set( 0, - 1, 0 ); pv.normalize();
		return { pA, E: pA.clone().addScaledVector( dir, a ).addScaledVector( pv, h ), Wc: pA.clone().addScaledVector( dir, dc ), miss: d - dc };
	}
	aim( bone, axisLocal, dirW ) {
		bone.updateWorldMatrix( true, false );
		const wq = bone.getWorldQuaternion( new Q() ), cur = axisLocal.clone().applyQuaternion( wq ), delta = new Q().setFromUnitVectors( cur, dirW.clone().normalize() );
		bone.quaternion.copy( bone.parent.getWorldQuaternion( new Q() ).invert().multiply( delta.multiply( wq ) ) ); bone.updateMatrixWorld( true );
	}
	setArm( arm, el, qh ) {
		this.aim( arm.A, arm.aA, el.E.clone().sub( el.pA ) ); this.aim( arm.F, arm.aF, el.Wc.clone().sub( el.E ) );
		arm.H.updateWorldMatrix( true, false ); arm.H.quaternion.copy( arm.H.parent.getWorldQuaternion( new Q() ).invert().multiply( qh ) ); arm.H.updateMatrixWorld( true );
	}

	// Initial wrist target; the final solve keeps the wrist rigid with the forearm.
	malletPose( ex, up, butt, p ) {
		const c = this.c, s = c.scale, m = c.mallet, qm = m.quaternion;
		const ey = up.clone().addScaledVector( ex, - up.dot( ex ) ).normalize().applyQuaternion( new Q().setFromAxisAngle( ex, this.cfg.tool.roll * D2R ) );
		const qh = basisQ( ex, ey ).multiply( this.qMallet.clone().invert() ), F = butt.clone().addScaledVector( ex, - p.recuo / 100 );
		const W = F.sub( m.position.clone().multiplyScalar( s ).applyQuaternion( qh ) ).sub( new V( ...FACE ).applyQuaternion( qm ).applyQuaternion( qh ) );
		return { qh, W };
	}
	// mão esquerda: punho para a ponta do ponteiro ficar em `tip`; a mão gira em torno do eixo do ponteiro para alinhar o punho ao antebraço (Dy)
	chiselPose( tip, ex, up, Dy ) {
		const c = this.c, s = c.scale, ch = c.chisel, yT = Dy.clone().addScaledVector( ex, - Dy.dot( ex ) ); if ( yT.lengthSq() < 1e-4 ) yT.copy( up ); yT.normalize();
		const qh = basisQ( ex, yT ).multiply( this.qChisel.clone().invert() );
		const off = ch.position.clone().multiplyScalar( s ).applyQuaternion( qh ).add( new V( 0, 0, TIP_Z ).applyQuaternion( ch.quaternion ).applyQuaternion( qh ) );
		return { qh, W: tip.clone().sub( off ) };
	}
	reach( arm ) { return arm.A.getWorldPosition( new V() ).distanceTo( arm.F.getWorldPosition( new V() ) ) + arm.F.getWorldPosition( new V() ).distanceTo( arm.H.getWorldPosition( new V() ) ); }

	apply( time ) {
		const c = this.c, T = c.opts.target; if ( ! this.enabled || ! T || c.rest ) return;
		c.root.updateMatrixWorld( true ); T.updateWorldMatrix( true, false );
		const tip = T.getWorldPosition( new V() ), up = new V( 0, 1, 0 ), W = o => o.getWorldPosition( new V() ), refresh = () => c.root.updateMatrixWorld( true );
		const qc = c.holder.getWorldQuaternion( new Q() ), fwd = new V( 0, 0, 1 ).applyQuaternion( qc ).setY( 0 ).normalize(), left = new V( 1, 0, 0 ).applyQuaternion( qc ).setY( 0 ).normalize();
		const p = this.eval( time ), hips = c.bones.Hips;
		const feet = [ this.LL, this.RL ].map( l => ( { l, pos: W( l.H ), q: l.H.getWorldQuaternion( new Q() ) } ) ); // pés como o Mixamo os deixou: ficam plantados

		// eixo do ponteiro (da traseira para a ponta)
		const yaw = new Q().setFromAxisAngle( up, this.cfg.tool.yaw * D2R ), pit = this.cfg.tool.pitch * D2R;
		const ex = fwd.clone().applyQuaternion( yaw ).multiplyScalar( Math.cos( pit ) ).addScaledVector( up, - Math.sin( pit ) ).normalize();
		const butt = tip.clone().addScaledVector( ex, - ( TIP_Z - BUTT_Z ) );

		// tronco: inclinação extra (positivo = para a frente) distribuída pela coluna; parte sempre da pose do Mixamo
		const spineQ = this.spine.map( ( [ b ] ) => b.quaternion.clone() );
		const setLean = deg => {
			this.spine.forEach( ( [ b ], i ) => b.quaternion.copy( spineQ[ i ] ) ); c.root.updateMatrixWorld( true );
			if ( ! deg ) return;
			for ( const [ bone, share ] of this.spine ) {
				bone.updateWorldMatrix( true, false ); const qp = bone.parent.getWorldQuaternion( new Q() );
				const loc = qp.clone().invert().multiply( new Q().setFromAxisAngle( left, deg * D2R * share ) ).multiply( qp ); bone.quaternion.premultiply( loc ); bone.updateMatrixWorld( true );
			}
		};
		// bacia: aproxima o tronco (pernas dobram, pés plantados) até os punhos alcançarem; só para frente/baixo e um pouco de lado
		const solve = () => {
			const shR = W( this.R.A ), pl = W( this.L.A );
			const L0 = this.chiselPose( tip, ex, up, W( this.L.H ).sub( W( this.L.F ) ).normalize() ), rl = this.reach( this.L ) * .92, rr = this.reach( this.R ) * .95;
			const solveV = mal => {
				const v = new V(); if ( this.cfg.auto === false ) return v;
				for ( let i = 0; i < 10; i ++ ) for ( const [ pp, ww, r ] of [ [ pl, L0.W, rl ], [ shR, mal.W, rr ] ] ) { const d = ww.clone().sub( pp ).sub( v ), l = d.length(); if ( l > r ) v.addScaledVector( d, 1 - r / l ); }
				const vy = THREE.MathUtils.clamp( v.dot( up ), - .40, .05 ), vf = THREE.MathUtils.clamp( v.dot( fwd ), - .1, .34 ), vl = THREE.MathUtils.clamp( v.dot( left ), - .16, .16 );
				return up.clone().multiplyScalar( vy ).addScaledVector( fwd, vf ).addScaledVector( left, vl );
			};
			const mal = this.malletPose( ex, up, butt, p ), v = solveV( mal );
			const miss = Math.max( 0, L0.W.distanceTo( pl.clone().add( v ) ) - rl ) + Math.max( 0, mal.W.distanceTo( shR.clone().add( v ) ) - rr );
			return { mal, v, miss };
		};
		let lean = p.tronco;
		if ( this.cfg.auto !== false ) { // escolhe a inclinação extra do tronco (de -35° a +10° em torno da chave) que deixa os braços mais folgados
			let best = Infinity, bl = lean;
			for ( const d of [ 0, - 12, - 24, - 36, 12 ] ) { setLean( p.tronco + d ); const r = solve(); const cost = r.miss * 10 + r.v.length() * .3 + Math.abs( d ) * .004; if ( cost < best ) { best = cost; bl = p.tronco + d; } }
			lean = bl;
		}
		setLean( lean ); const sol = solve(), mal = sol.mal, v = sol.v;
		v.addScaledVector( up, p.bacY / 100 ).addScaledVector( fwd, p.bacF / 100 ); this.info.body = v.length(); this.info.lean = lean;
		if ( v.lengthSq() > 1e-8 ) { hips.position.copy( hips.parent.worldToLocal( W( hips ).add( v ) ) ); hips.updateMatrixWorld( true ); }		for ( const f of feet ) this.setArm( f.l, this.elbow( f.l, f.pos, fwd.clone().addScaledVector( up, .15 ) ), f.q );

		// ---- mão esquerda: a ponta do ponteiro na pedra
		{
			const arm = this.L, pole = left.clone().multiplyScalar( .5 ).addScaledVector( up, - 1 ).addScaledVector( fwd, - .25 );
			let Dy = W( arm.H ).sub( W( arm.F ) ).normalize(), cp, el;
			for ( let i = 0; i < 3; i ++ ) { cp = this.chiselPose( tip, ex, up, Dy ); el = this.elbow( arm, cp.W, pole ); Dy = el.Wc.clone().sub( el.E ).normalize(); }
			this.setArm( arm, el, cp.qh ); this.info.L = el.miss;
		}
		// ---- mão direita: a face da marreta na traseira do ponteiro
		{
			const arm=this.R,pole=left.clone().multiplyScalar(-.5).addScaledVector(up,-1).addScaledVector(fwd,-.25),faceTarget=butt.clone().addScaledVector(ex,-p.recuo/100);
			// Solve the tool contact by moving shoulder/elbow, never by rotating the wrist.
			const wrist=mal.W.clone(),offset=c.mallet.position.clone().multiplyScalar(c.scale).add(new V(...FACE).applyQuaternion(c.mallet.quaternion));
			for(let i=0;i<24;i++){
				const el=this.elbow(arm,wrist,pole);this.aim(arm.A,arm.aA,el.E.clone().sub(el.pA));this.aim(arm.F,arm.aF,el.Wc.clone().sub(el.E));c.holdMalletOrientation();
				const target=faceTarget.clone().sub(offset.clone().applyQuaternion(arm.H.getWorldQuaternion(new Q())));
				if(wrist.distanceToSquared(target)<1e-10)break;wrist.lerp(target,.6);
			}
			const face=W(arm.H).add(offset.applyQuaternion(arm.H.getWorldQuaternion(new Q())));this.info.R=face.distanceTo(faceTarget);
		}
		refresh();
	}

	// ---------------------------------------------------------------------------------------------
	// persistência
	// ---------------------------------------------------------------------------------------------
	snapshot() { return { ...clone( this.cfg ), createdAt: new Date().toISOString(), enabled: this.enabled }; }
	valid( r ) { return r?.schema === 'aleijadinho-golpe/v1' && Array.isArray( r.keys ) && r.keys.length > 0 && r.keys.every( k => [ 't', 'recuo', 'ang', 'giro', 'tronco' ].every( f => Number.isFinite( k[ f ] ) ) ) && Number.isFinite( r.tool?.pitch ) && Number.isFinite( r.tool?.yaw ); }
	adopt( r ) { this.cfg = { ...clone( STRIKE_DEFAULT ), ...clone( r ), duration: this.c.clip.duration }; this.cfg.tool = { ...STRIKE_DEFAULT.tool, ...this.cfg.tool }; this.enabled = r.enabled !== false; this.sel = Math.min( this.sel, this.cfg.keys.length - 1 ); this.sorted(); }
	async load() {
		let local, project; try { local = JSON.parse( localStorage.getItem( KEY ) ); } catch { } try { const r = await fetch( ENDPOINT ); if ( r.ok ) project = await r.json(); } catch { }
		const saved = [ local, project ].filter( r => this.valid( r ) ).sort( ( a, b ) => Date.parse( b.createdAt ) - Date.parse( a.createdAt ) )[ 0 ];
		if ( saved ) { this.adopt( saved ); this.refresh?.(); }
	}
	async save() {
		const data = this.snapshot(); let note = '';
		try { localStorage.setItem( KEY, JSON.stringify( data ) ); note = 'Salvo no navegador. '; } catch { }
		try {
			const r = await fetch( ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( data ) } ), j = await r.json();
			if ( ! r.ok || ! j.saved ) throw new Error( j.error || 'falha' ); this.dirty = false; return note + 'Salvo no projeto: já consigo ler sua animação.';
		} catch { return note + 'Não consegui gravar no projeto; use Copiar e cole o JSON na conversa.'; }
	}

	// ---------------------------------------------------------------------------------------------
	// painel de linha do tempo
	// ---------------------------------------------------------------------------------------------
	mount( game ) {
		const c = this.c, cfg = () => this.cfg, D = () => this.cfg.duration; window.__aleijadinho = c; // depuração
		const btn = document.createElement( 'button' ); btn.id = 'golpe-toggle'; btn.textContent = 'Golpe'; btn.title = 'Ajustar o golpe do Aleijadinho na linha do tempo'; btn.setAttribute( 'aria-label', btn.title );
		document.querySelector( '.controls' )?.append( btn );
		const el = document.createElement( 'section' ); el.id = 'golpe-panel'; el.hidden = true; el.setAttribute( 'aria-label', 'Linha do tempo do golpe' );
		el.innerHTML = `
<header><b>GOLPE · ALEIJADINHO</b><label class="g-chk"><input type="checkbox" data-on> Ponteiro + marreta</label><label class="g-chk" title="Aproxima a bacia da pedra (pernas dobram, pés plantados) até os braços alcançarem"><input type="checkbox" data-auto> Auto-alcance</label><span class="g-cam">Câmera <select data-cam><option value="">Livre</option><option value="right">Lado direito</option><option value="left">Lado esquerdo</option><option value="three">3/4 frente</option><option value="back">Costas</option><option value="top">De cima</option></select></span><label class="g-chk" title="Esconde sala, tablado e estátua para ver só o personagem"><input type="checkbox" data-solo> Só ele</label><button data-min aria-label="Recolher" title="Recolher / expandir">▾</button><button data-close aria-label="Fechar">×</button></header>
<div class="g-row"><button data-play class="g-ico">⏸</button><input type="range" data-scrub min="0" max="1" step="0.01"><output data-time></output></div>
<div class="g-track" data-track><i class="g-head"></i></div>
<div class="g-grid" data-fields></div>
<div class="g-row g-btns"><button data-add>+ Chave aqui</button><button data-del>Remover chave</button><button data-reset>Padrão</button><button data-copy>Copiar JSON</button><button data-save class="g-save">Salvar</button></div>
<p class="g-status" data-status></p><p class="g-reach" data-reach></p>`;
		document.body.append( el );
		const $ = q => el.querySelector( q ), reach = $( '[data-reach]' ), status = $( '[data-status]' ), say = t => status.textContent = t;
		const scrub = $( '[data-scrub]' ), track = $( '[data-track]' ), head = $( '.g-head' ), timeOut = $( '[data-time]' ), fields = $( '[data-fields]' ), play = $( '[data-play]' );
		scrub.max = D();
		const field = ( label, min, max, step, unit, get, set, opts = {} ) => {
			const w = document.createElement( 'label' ); w.className = 'g-f'; w.innerHTML = `<span>${ label } <output></output></span><input type="range" min="${ min }" max="${ max }" step="${ step }">`;
			const i = w.querySelector( 'input' ), o = w.querySelector( 'output' ); const show = () => o.textContent = ( + i.value ).toFixed( step < 1 ? ( step < .1 ? 2 : 1 ) : 0 ) + unit;
			i.oninput = () => { set( + i.value ); show(); this.dirty = true; if ( ! opts.noSeek ) this.hold(); }; w.sync = () => { i.value = get(); show(); }; fields.append( w ); return w;
		};
		const selKey = () => cfg().keys[ this.sel ];
		const F = [
			field( 'Tempo da chave', 0, D(), .01, ' s', () => selKey()?.t ?? 0, v => { const k = selKey(); if ( k ) { k.t = v; this.sorted(); this.sel = cfg().keys.indexOf( k ); buildMarkers(); } } ),
			field( 'Recuo do maço (0 = encostado)', 0, 60, .5, ' cm', () => selKey()?.recuo ?? 0, v => selKey() && ( selKey().recuo = v ) ),
			field( 'Tronco extra (+ p/ frente)', - 30, 45, 1, '°', () => selKey()?.tronco ?? 0, v => selKey() && ( selKey().tronco = v ) ),
			field( 'Bacia extra: altura', - 50, 20, 1, ' cm', () => selKey()?.bacY ?? 0, v => selKey() && ( selKey().bacY = v ) ),
			field( 'Bacia extra: p/ frente', - 30, 40, 1, ' cm', () => selKey()?.bacF ?? 0, v => selKey() && ( selKey().bacF = v ) ),
		];
		const sw = document.createElement( 'div' ); sw.className = 'g-f g-sel'; sw.innerHTML = `<span>Curva até a próxima</span><select data-ease>${ Object.entries( EASE_NAMES ).map( ( [ k, v ] ) => `<option value="${ k }">${ v }</option>` ).join( '' ) }</select><label class="g-chk"><input type="checkbox" data-hit> Golpe aqui (lascas)</label>`; fields.append( sw );
		const G = [
			field( 'Ponteiro: inclinação p/ baixo', 0, 85, 1, '°', () => cfg().tool.pitch, v => cfg().tool.pitch = v ),
			field( 'Ponteiro: giro lateral', - 90, 90, 1, '°', () => cfg().tool.yaw, v => cfg().tool.yaw = v ),
			field( 'Cabo da marreta: lado (base)', - 180, 180, 1, '°', () => cfg().tool.roll, v => cfg().tool.roll = v ),
		];
		const easeSel = $( '[data-ease]' ), hitChk = $( '[data-hit]' );
		easeSel.onchange = () => { selKey().ease = easeSel.value; this.dirty = true; easeSel.blur(); }; hitChk.onchange = () => { selKey().hit = hitChk.checked || undefined; this.dirty = true; buildMarkers(); hitChk.blur(); };
		const syncFields = () => { [ ...F, ...G ].forEach( f => f.sync() ); const k = selKey(); if ( k ) { easeSel.value = k.ease || 'inout'; hitChk.checked = !! k.hit; } };
		this.hold = () => { c.playing = false; play.textContent = '▶'; c.seek( c.time ); };

		let markers = [];
		const buildMarkers = () => {
			markers.forEach( m => m.remove() ); markers = [];
			cfg().keys.forEach( ( k, i ) => {
				const m = document.createElement( 'button' ); m.className = 'g-key' + ( i === this.sel ? ' on' : '' ) + ( k.hit ? ' hit' : '' ); m.style.left = ( k.t / D() * 100 ) + '%'; m.title = `Chave ${ i + 1 } · ${ k.t.toFixed( 2 ) } s${ k.hit ? ' · GOLPE' : '' }`; m.textContent = k.hit ? '✦' : '';
				m.onclick = e => { e.stopPropagation(); this.sel = i; c.playing = false; play.textContent = '▶'; c.seek( k.t ); buildMarkers(); syncFields(); }; track.append( m ); markers.push( m );
			} );
		};
		this.refresh = () => { scrub.max = D(); buildMarkers(); syncFields(); $( '[data-on]' ).checked = this.enabled; $( '[data-auto]' ).checked = cfg().auto !== false; };
		track.onclick = e => { const r = track.getBoundingClientRect(); this.hold(); c.seek( THREE.MathUtils.clamp( ( e.clientX - r.left ) / r.width, 0, .999 ) * D() ); };
		scrub.oninput = () => { c.playing = false; play.textContent = '▶'; c.seek( + scrub.value ); };
		play.onclick = () => { c.playing = ! c.playing; play.textContent = c.playing ? '⏸' : '▶'; };
		$( '[data-on]' ).onchange = e => { this.enabled = e.target.checked; this.dirty = true; c.seek( c.time ); };
		$( '[data-auto]' ).onchange = e => { cfg().auto = e.target.checked; this.dirty = true; c.seek( c.time ); };
		$( '[data-add]' ).onclick = () => { const t = c.time, p = this.eval( t ); cfg().keys.push( { t: + t.toFixed( 2 ), recuo: + p.recuo.toFixed( 1 ), ang: + p.ang.toFixed( 0 ), giro: + p.giro.toFixed( 0 ), tronco: + p.tronco.toFixed( 0 ), bacY: + p.bacY.toFixed( 0 ), bacF: + p.bacF.toFixed( 0 ), ease: 'inout' } ); const added = cfg().keys.at( - 1 ); this.sorted(); this.sel = cfg().keys.indexOf( added ); this.dirty = true; buildMarkers(); syncFields(); say( 'Chave criada em ' + t.toFixed( 2 ) + ' s: ajuste os valores.' ); };
		$( '[data-del]' ).onclick = () => { if ( cfg().keys.length <= 1 ) { say( 'Precisa de pelo menos uma chave.' ); return; } cfg().keys.splice( this.sel, 1 ); this.sel = Math.max( 0, this.sel - 1 ); this.dirty = true; buildMarkers(); syncFields(); this.hold(); };
		$( '[data-reset]' ).onclick = () => { this.adopt( { ...clone( STRIKE_DEFAULT ), createdAt: 0 } ); this.cfg.duration = c.clip.duration; this.refresh(); this.hold(); say( 'Voltou ao padrão (ainda não salvo).' ); };
		$( '[data-copy]' ).onclick = async () => { const j = JSON.stringify( this.snapshot() ); try { await navigator.clipboard.writeText( j ); say( 'JSON copiado.' ); } catch { say( 'Não consegui copiar.' ); } };
		$( '[data-save]' ).onclick = async () => { say( 'Salvando…' ); say( await this.save() ); };
		$( '[data-min]' ).onclick = e => { const m = el.classList.toggle( 'min' ); e.currentTarget.textContent = m ? '▴' : '▾'; };
		$( '[data-close]' ).onclick = () => { el.hidden = true; window.__camOverride = this.oldCam; };
		btn.onclick = () => { el.hidden = ! el.hidden; if ( ! el.hidden ) { this.refresh(); this.oldCam = window.__camOverride; } };

		// câmera de apoio: gruda no Aleijadinho em vistas fixas (a rotina do jogo usa window.__camOverride)
		$( '[data-cam]' ).onchange = e => {
			const v = e.target.value; e.target.blur(); this.camView = v; if ( ! v ) { window.__camOverride = undefined; return; }
		};
		this.updateCam = () => {
			if ( ! this.camView ) return; const T = c.opts.target.getWorldPosition( new V() ), qc = c.holder.getWorldQuaternion( new Q() );
			const fw = new V( 0, 0, 1 ).applyQuaternion( qc ).setY( 0 ).normalize(), lf = new V( 1, 0, 0 ).applyQuaternion( qc ).setY( 0 ).normalize();
			const [ sd, fr, up, d ] = { right: [ - 1, 0, .45, 1.9 ], left: [ 1, 0, .35, 1.9 ], three: [ .7, .7, .35, 1.5 ], back: [ 0, - 1, .7, 1.8 ], top: [ 0, .13, 1.9, 1.9 ] }[ this.camView ];
			const at = T.clone().add( new V( 0, .3, 0 ) ).addScaledVector( fw, - .05 ), pos = at.clone().addScaledVector( lf, sd * d ).addScaledVector( fw, fr * d * ( this.camView === 'top' ? 1 : 1 ) ).add( new V( 0, up, 0 ) );
			if ( this.camView === 'top' ) pos.copy( at ).addScaledVector( fw, .3 ).add( new V( 0, 1.7, 0 ) );
			window.__camOverride = { pos: pos.toArray(), at: at.toArray(), fov: 32 };
		};
		// só o personagem (esconde a sala, o tablado e a estátua) para enxergar a pose sem nada na frente
		$( '[data-solo]' ).onchange = e => {
			const room = c.entry.room.room, scaf = c.entry.room.scaf; this.soloSaved ??= new Map();
			if ( e.target.checked ) { for ( const o of [ ...room.children, ...scaf.children ] ) if ( o !== scaf && ! o.isLight && ( o.isMesh || room.children.includes( o ) ) ) { this.soloSaved.set( o, o.visible ); o.visible = false; } }
			else { for ( const [ o, v ] of this.soloSaved ) o.visible = v; this.soloSaved.clear(); }
		};
		this.refresh(); this.tickUI = () => {
			if ( el.hidden ) return; this.updateCam(); const t = c.time; scrub.value = t; timeOut.textContent = `${ t.toFixed( 2 ) } / ${ D().toFixed( 2 ) } s`; head.style.left = ( t / D() * 100 ) + '%';
			const warn = n => n > .004 ? ` ${ ( n * 100 ).toFixed( 0 ) } cm fora do alcance` : ' ok'; reach.textContent = `Braço esquerdo:${ warn( this.info.L ) } · Braço direito:${ warn( this.info.R ) } · bacia deslocada ${ ( ( this.info.body ?? 0 ) * 100 ).toFixed( 0 ) } cm`;
		};
		const loop = () => { this.tickUI(); requestAnimationFrame( loop ); }; requestAnimationFrame( loop );
		if ( new URLSearchParams( location.search ).has( 'golpe' ) ) btn.click();
	}
}
