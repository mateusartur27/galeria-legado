// Sons sintetizados na hora (Web Audio), sem arquivos: cada chamada varia o tom → nunca soa repetido.
// (Firewood usa 6–14 variações gravadas por evento; síntese é a versão "zero download" — ver knowledge/09-audio.md.)
export class Sfx {

	constructor() {

		this.ctx = null
		this.noise = null

	}

	ensure() {

		if ( ! this.ctx ) {

			try { this.ctx = new AudioContext() } catch { return null }
			const len = this.ctx.sampleRate * 0.6
			this.noise = this.ctx.createBuffer( 1, len, this.ctx.sampleRate )
			const d = this.noise.getChannelData( 0 )
			for ( let i = 0; i < len; i ++ ) d[ i ] = Math.random() * 2 - 1

		}

		if ( this.ctx.state === 'suspended' ) this.ctx.resume()
		return this.ctx

	}

	env( gain, t, peak, decay ) {

		gain.gain.setValueAtTime( 0.0001, t )
		gain.gain.exponentialRampToValueAtTime( peak, t + 0.004 )
		gain.gain.exponentialRampToValueAtTime( 0.0001, t + decay )

	}

	// machado entrando na madeira: estalo (ruído agudo) + baque grave + "toc" de madeira
	chop( power = 1 ) {

		const ctx = this.ensure()
		if ( ! ctx ) return
		const t = ctx.currentTime, r = 0.85 + Math.random() * 0.3
		const out = ctx.createGain()
		out.gain.value = 0.55
		out.connect( ctx.destination )

		const crack = ctx.createBufferSource()
		crack.buffer = this.noise
		const band = ctx.createBiquadFilter()
		band.type = 'bandpass'
		band.frequency.value = 2300 * r
		band.Q.value = 0.9
		const g1 = ctx.createGain()
		this.env( g1, t, 0.9 * power, 0.16 )
		crack.connect( band ).connect( g1 ).connect( out )
		crack.start( t, Math.random() * 0.3, 0.2 )

		const thump = ctx.createOscillator()
		thump.type = 'sine'
		thump.frequency.setValueAtTime( 150 * r, t )
		thump.frequency.exponentialRampToValueAtTime( 48, t + 0.14 )
		const g2 = ctx.createGain()
		this.env( g2, t, 0.8 * power, 0.22 )
		thump.connect( g2 ).connect( out )
		thump.start( t )
		thump.stop( t + 0.25 )

		const knock = ctx.createOscillator()
		knock.type = 'triangle'
		knock.frequency.setValueAtTime( 520 * r, t )
		knock.frequency.exponentialRampToValueAtTime( 260 * r, t + 0.07 )
		const g3 = ctx.createGain()
		this.env( g3, t, 0.35 * power, 0.09 )
		knock.connect( g3 ).connect( out )
		knock.start( t )
		knock.stop( t + 0.12 )

	}

	// pedaço caindo/batendo (volume pela velocidade do impacto)
	clack( v = 1 ) {

		const ctx = this.ensure()
		if ( ! ctx ) return
		const t = ctx.currentTime, r = 0.8 + Math.random() * 0.5
		const osc = ctx.createOscillator()
		osc.type = 'triangle'
		osc.frequency.setValueAtTime( 380 * r, t )
		osc.frequency.exponentialRampToValueAtTime( 190 * r, t + 0.06 )
		const g = ctx.createGain()
		this.env( g, t, Math.min( 0.25, 0.05 * v ), 0.08 )
		osc.connect( g ).connect( ctx.destination )
		osc.start( t )
		osc.stop( t + 0.1 )

	}

	// Motor sintetizado (como o EngineWorklet do Starter Kit Racing, versão simples): 2 osciladores → passa-baixa;
	// rotação (0..1) sobe tom e brilho. Chamar todo frame enquanto dirige; engine(0, 0) silencia.
	engine( rpm = 0, on = 1 ) {

		const ctx = this.ensure()
		if ( ! ctx ) return
		if ( ! this.motor ) {

			const a = ctx.createOscillator(), b = ctx.createOscillator()
			a.type = 'sawtooth'
			b.type = 'square'
			const lp = ctx.createBiquadFilter()
			lp.type = 'lowpass'
			lp.Q.value = 3
			const g = ctx.createGain()
			g.gain.value = 0
			a.connect( lp )
			b.connect( lp )
			lp.connect( g ).connect( ctx.destination )
			a.start()
			b.start()
			this.motor = { a, b, lp, g }

		}

		const t = ctx.currentTime, m = this.motor
		const f = 38 + rpm * 120
		m.a.frequency.setTargetAtTime( f, t, 0.05 )
		m.b.frequency.setTargetAtTime( f * 0.502, t, 0.05 )
		m.lp.frequency.setTargetAtTime( 300 + rpm * 1600, t, 0.05 )
		m.g.gain.setTargetAtTime( on ? 0.045 + rpm * 0.05 : 0, t, on ? 0.05 : 0.15 )

	}

	// ---------------- água: síntese "física" (sem arquivos) ----------------
	// O som de água de verdade é feito de BOLHAS: cada bolha que se forma vibra como um seno curto cujo tom SOBE um pouco
	// enquanto some (bolha de Minnaert: ~300–2000 Hz, 20–90 ms). Riacho = chuva de bolhas + um leito grave; respingo =
	// impacto de ruído que fecha + nuvem de bolhas que vai rareando; cachoeira = ruído marrom/rosa largo (sem LFO, que soava
	// como "wah"); mar = ruído grave que cresce e recua num ciclo de onda + o "shhh" da espuma voltando.
	// Ruído branco puro soa como chiado de TV: aqui quase tudo usa ruído marrom (branco integrado = mais grave e cheio),
	// buffers de 4 s com início aleatório (o loop curto de 0,6 s se percebia) e um compressor no barramento da água.

	waterBus() {

		const ctx = this.ensure()
		if ( ! ctx ) return null
		if ( ! this.wbus ) {

			const len = ctx.sampleRate * 4
			const make = ( fill ) => { const b = ctx.createBuffer( 1, len, ctx.sampleRate ); fill( b.getChannelData( 0 ) ); return b }
			this.white4 = make( ( d ) => { for ( let i = 0; i < len; i ++ ) d[ i ] = Math.random() * 2 - 1 } )
			this.brown4 = make( ( d ) => {

				let v = 0
				for ( let i = 0; i < len; i ++ ) { v = ( v + 0.02 * ( Math.random() * 2 - 1 ) ) / 1.02; d[ i ] = v * 3.5 }

			} )
			// rosa (Paul Kellet, versão econômica): meio-termo entre branco e marrom — cachoeira
			this.pink4 = make( ( d ) => {

				let b0 = 0, b1 = 0, b2 = 0
				for ( let i = 0; i < len; i ++ ) {

					const w = Math.random() * 2 - 1
					b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913
					d[ i ] = ( b0 + b1 + b2 + w * 0.1848 ) * 0.2

				}

			} )
			const comp = ctx.createDynamicsCompressor()
			comp.threshold.value = - 18
			comp.ratio.value = 4
			this.wbus = ctx.createGain()
			this.wbus.gain.value = 0.9
			this.wbus.connect( comp ).connect( ctx.destination )

		}
		return this.wbus

	}

	// fonte de ruído (buffer de 4 s, começa num ponto aleatório)
	noiseSrc( buffer, t, dur, loop = false ) {

		const s = this.ctx.createBufferSource()
		s.buffer = buffer
		s.loop = loop
		if ( loop ) s.start( t, Math.random() * 3.5 )
		else s.start( t, Math.random() * ( 3.9 - dur ), dur )
		return s

	}

	// uma bolha: seno com o tom subindo (rise ~1,1–1,5×) e decaimento exponencial
	bubble( t, f0, dur, amp, dest ) {

		const ctx = this.ctx
		const o = ctx.createOscillator()
		o.frequency.setValueAtTime( f0, t )
		o.frequency.linearRampToValueAtTime( f0 * ( 1.1 + Math.random() * 0.4 ), t + dur )
		const g = ctx.createGain()
		g.gain.setValueAtTime( 0, t )
		g.gain.linearRampToValueAtTime( amp, t + 0.003 )
		g.gain.exponentialRampToValueAtTime( 0.0001, t + dur )
		o.connect( g ).connect( dest )
		o.start( t )
		o.stop( t + dur + 0.02 )

	}

	// "ploc" de desenho animado: seno com o tom CAINDO rápido (o contrário da bolha real) — a assinatura divertida da água
	plop( t, f0, f1, dur, amp, dest ) {

		const ctx = this.ctx
		const o = ctx.createOscillator()
		o.frequency.setValueAtTime( f0, t )
		o.frequency.exponentialRampToValueAtTime( f1, t + dur )
		const g = ctx.createGain()
		g.gain.setValueAtTime( 0, t )
		g.gain.linearRampToValueAtTime( amp, t + 0.006 )
		g.gain.exponentialRampToValueAtTime( 0.0001, t + dur * 1.3 )
		o.connect( g ).connect( dest )
		o.start( t )
		o.stop( t + dur * 1.3 + 0.02 )

	}

	// respingo (cair/pular na água): power 0..2 — "BLOOP" grave + tchum + algumas bolhas subindo ("blub blub")
	splash( power = 1 ) {

		const bus = this.waterBus()
		if ( ! bus ) return
		const ctx = this.ctx, t = ctx.currentTime + 0.01
		const p = Math.min( 2, power )
		// corpo do impacto: ruído marrom com passa-baixa que fecha (o "tchum")
		const body = this.noiseSrc( this.brown4, t, 0.9 )
		const lp = ctx.createBiquadFilter()
		lp.type = 'lowpass'
		lp.Q.value = 0.7
		lp.frequency.setValueAtTime( 2600 + p * 1800, t )
		lp.frequency.exponentialRampToValueAtTime( 320, t + 0.45 + p * 0.15 )
		const g1 = ctx.createGain()
		g1.gain.setValueAtTime( 0, t )
		g1.gain.linearRampToValueAtTime( 0.4 + p * 0.25, t + 0.012 )
		g1.gain.exponentialRampToValueAtTime( 0.001, t + 0.55 + p * 0.25 )
		body.connect( lp ).connect( g1 ).connect( bus )
		// borrifo: chiado agudo curto (as gotas no ar)
		const spray = this.noiseSrc( this.white4, t + 0.02, 0.5 )
		const hp = ctx.createBiquadFilter()
		hp.type = 'highpass'
		hp.frequency.value = 3500
		const g2 = ctx.createGain()
		g2.gain.setValueAtTime( 0, t + 0.02 )
		g2.gain.linearRampToValueAtTime( 0.05 + p * 0.04, t + 0.05 )
		g2.gain.exponentialRampToValueAtTime( 0.001, t + 0.35 + p * 0.1 )
		spray.connect( hp ).connect( g2 ).connect( bus )
		// BLOOP: quanto maior o mergulho, mais grave e mais longo
		const r = 0.9 + Math.random() * 0.2
		this.plop( t, ( 560 - p * 120 ) * r, ( 150 - p * 25 ) * r, 0.16 + p * 0.05, 0.32, bus )
		// blub blub: 3–6 bolhas espaçadas, cada uma mais aguda (sobem até a superfície)
		const n = 3 + Math.round( p * 1.5 + Math.random() )
		for ( let k = 0; k < n; k ++ ) this.bubble( t + 0.2 + k * ( 0.07 + Math.random() * 0.05 ), ( 420 + k * 110 ) * r, 0.06, 0.13 * ( 1 - k / ( n + 1 ) ), bus )

	}

	// passo dentro d'água / braçada: "chuá" grave curto + 1–3 bolhinhas
	wade( speed = 0.5, swim = false ) {

		const bus = this.waterBus()
		if ( ! bus ) return
		const ctx = this.ctx, t = ctx.currentTime + 0.005, r = 0.85 + Math.random() * 0.3
		const src = this.noiseSrc( this.brown4, t, 0.6 )
		const bp = ctx.createBiquadFilter()
		bp.type = 'bandpass'
		bp.Q.value = 0.9
		bp.frequency.setValueAtTime( ( swim ? 650 : 1100 ) * r, t )
		bp.frequency.exponentialRampToValueAtTime( ( swim ? 380 : 520 ) * r, t + ( swim ? 0.35 : 0.2 ) )
		const g = ctx.createGain()
		const peak = ( ( swim ? 0.55 : 0.45 ) + speed * 0.35 ) * 0.45 // o "chuá" fica de fundo; quem aparece é o plip/plop
		g.gain.setValueAtTime( 0, t )
		g.gain.linearRampToValueAtTime( peak, t + ( swim ? 0.06 : 0.025 ) ) // ataque macio: água não "estala"
		g.gain.exponentialRampToValueAtTime( 0.001, t + ( swim ? 0.45 : 0.26 ) )
		src.connect( bp ).connect( g ).connect( bus )
		// passos alternam plip (agudo) / plop (grave), como pé esquerdo e direito; nadando = "blub" grave
		this.stepAlt = ! this.stepAlt
		const f = swim ? 300 : this.stepAlt ? 640 : 500
		this.plop( t + 0.01, f * r, f * r * 0.55, swim ? 0.13 : 0.08, 0.11 + speed * 0.05, bus )
		if ( Math.random() < 0.5 ) this.bubble( t + 0.08 + Math.random() * 0.1, 700 + Math.random() * 500, 0.04, 0.05, bus )

	}

	// ambiente de água (0..1 cada; chamar por frame): cachoeira, riacho (chuva de bolhas), mar (ciclo de onda)
	water( fall = 0, river = 0, sea = 0 ) {

		const ctx = this.ctx
		if ( ! ctx || ctx.state !== 'running' ) return
		const bus = this.waterBus()
		const now = ctx.currentTime
		if ( ! this.amb ) {

			const chain = ( buffer, type, freq, q ) => {

				const s = this.noiseSrc( buffer, now, 0, true )
				const f = ctx.createBiquadFilter()
				f.type = type
				f.frequency.value = freq
				f.Q.value = q
				const g = ctx.createGain()
				g.gain.value = 0
				s.connect( f ).connect( g ).connect( bus )
				return { f, g }

			}
			this.amb = {
				fallBody: chain( this.pink4, 'lowpass', 1600, 0.4 ), // massa da cachoeira
				fallHiss: chain( this.white4, 'bandpass', 4200, 0.5 ), // véu agudo, bem baixo
				fallRumble: chain( this.brown4, 'lowpass', 220, 0.6 ), // tremor grave perto do pé
				bed: chain( this.brown4, 'lowpass', 700, 0.5 ), // leito do riacho
				seaBody: chain( this.brown4, 'lowpass', 420, 0.5 ), // mar: massa grave
				seaWash: chain( this.white4, 'bandpass', 1600, 0.35 ) // espuma recuando ("shhh")
			}
			this.bubbleLP = ctx.createBiquadFilter() // bolhas do riacho: tira o "bip" agudo
			this.bubbleLP.type = 'lowpass'
			this.bubbleLP.frequency.value = 2200
			this.bubbleLP.connect( bus )
			this.lastAmb = now
			this.wave0 = now

		}
		const a = this.amb, dt = Math.min( 0.1, now - this.lastAmb )
		this.lastAmb = now
		const set = ( g, v, tc = 0.25 ) => g.gain.setTargetAtTime( v, now, tc )
		// cachoeira: volume com flutuação lenta aleatória (não senoidal)
		this.fallWobble = ( this.fallWobble ?? 1 ) + ( 0.85 + Math.random() * 0.3 - ( this.fallWobble ?? 1 ) ) * Math.min( 1, dt * 2 )
		set( a.fallBody.g, fall * 0.2 * this.fallWobble )
		set( a.fallHiss.g, fall * 0.03 )
		set( a.fallRumble.g, fall * fall * 0.3 )
		// riacho: leito baixo + bolhas sorteadas (Poisson: ~45/s no máximo)
		set( a.bed.g, river * 0.09 )
		let want = river * 45 * dt
		while ( want > 0 ) {

			if ( Math.random() < Math.min( 1, want ) ) this.bubble( now + Math.random() * dt, 280 + Math.pow( Math.random(), 1.5 ) * 1100, 0.025 + Math.random() * 0.06, ( 0.012 + Math.random() * 0.03 ) * river, this.bubbleLP )
			want -= 1

		}
		// mar: onda a cada ~7–9 s — cresce devagar (2,5 s), quebra, e a espuma recua chiando
		const period = 8
		const ph = ( ( now - this.wave0 ) % period ) / period
		const swell = ph < 0.32 ? Math.pow( ph / 0.32, 2 ) : Math.exp( - ( ph - 0.32 ) * 5 )
		const wash = ph < 0.3 ? 0 : Math.sin( Math.min( 1, ( ph - 0.3 ) / 0.55 ) * Math.PI ) * Math.exp( - ( ph - 0.3 ) * 1.5 )
		set( a.seaBody.g, sea * ( 0.1 + swell * 0.3 ), 0.15 )
		set( a.seaWash.g, sea * wash * 0.12, 0.15 )

	}

	// "whoosh" do machado subindo
	swing() {

		const ctx = this.ensure()
		if ( ! ctx ) return
		const t = ctx.currentTime
		const src = ctx.createBufferSource()
		src.buffer = this.noise
		const f = ctx.createBiquadFilter()
		f.type = 'bandpass'
		f.Q.value = 1.4
		f.frequency.setValueAtTime( 400, t )
		f.frequency.exponentialRampToValueAtTime( 1600, t + 0.18 )
		const g = ctx.createGain()
		g.gain.setValueAtTime( 0.0001, t )
		g.gain.exponentialRampToValueAtTime( 0.12, t + 0.1 )
		g.gain.exponentialRampToValueAtTime( 0.0001, t + 0.24 )
		src.connect( f ).connect( g ).connect( ctx.destination )
		src.start( t, Math.random() * 0.2, 0.3 )

	}

}
