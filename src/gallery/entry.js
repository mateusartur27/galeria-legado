import './style.css'
// Porta de entrada. No site publicado o visitante vê um VÍDEO do passeio (gravado em qualidade máxima por tools/record-tour.mjs):
// zero custo de 3D no celular, sem carregamento pesado, sem serrilhado. "Ver detalhes" abre a cena 3D do personagem que está na tela
// (sala parada, só com movimento suave de câmera, sem interação). A versão 3D ao vivo continua em ?live (e no servidor de desenvolvimento).
const params = new URLSearchParams( location.search )
const dev = [ 'live', 'set', 'rig', 'editar', 'record', 'tour', 'all', 'clean', 'debug' ].some( k => params.has( k ) )
const $ = id => document.getElementById( id )

const NAMES = { machado: 'Machado de Assis', aleijadinho: 'Aleijadinho', reboucas: 'André Rebouças', milton: 'Milton Santos' }

async function reel() {

	document.body.classList.add( 'reel' )
	const style = document.createElement( 'style' )
	style.textContent = `
		body.reel{background:#0d1530}
		#reel{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;background:#0d1530;z-index:-1}
		#reel-fade{position:fixed;inset:0;background:#0d1530;opacity:0;transition:opacity .7s;pointer-events:none;z-index:-1}
		#reel-fade.on{opacity:1}
		body.reel .controls,body.reel .hint,body.reel #restore,body.reel #lighting-toggle,body.reel #notice{display:none!important}
		body.reel .topbar,body.reel .bottom,body.reel #intro{z-index:2}
		body.reel #intro{transition:opacity 1.6s}
		body.reel.reel-clear #intro{opacity:0;pointer-events:none}
		#reel-details{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));z-index:3;display:inline-flex;gap:.6em;align-items:center;padding:.8em 1.3em;border-radius:999px;border:1px solid #ffffff55;background:#0d1530aa;color:#fff;font:600 13px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;backdrop-filter:blur(6px);cursor:pointer;opacity:0;transition:opacity .8s}
		#reel-details.on{opacity:1}`
	document.head.appendChild( style )

	const v = document.createElement( 'video' )
	v.id = 'reel'; v.src = '/tour/reel.mp4'; v.poster = '/tour/poster.jpg'; v.muted = true; v.playsInline = true; v.autoplay = true; v.preload = 'auto'; v.setAttribute( 'playsinline', '' ); v.setAttribute( 'aria-hidden', 'true' )
	const fade = document.createElement( 'div' ); fade.id = 'reel-fade'
	document.body.prepend( fade ); document.body.prepend( v )

	// o botão "Ver detalhes" sai da introdução (que some) e fica fixo no canto
	const old = $( 'enter' ), btn = document.createElement( 'button' ); btn.id = 'reel-details'; btn.type = 'button'
	old?.remove(); document.body.appendChild( btn )

	let timeline = [], current = null
	try { timeline = ( await ( await fetch( '/tour/timeline.json' ) ).json() ).timeline ?? [] } catch {}
	const charAt = t => { let c = null; for ( const e of timeline ) { if ( e.t <= t ) c = e.char; else break } return c }
	const refresh = () => {

		const c = charAt( v.currentTime )
		if ( c !== current ) { current = c; btn.textContent = c ? `${NAMES[ c ] ?? c} · Ver detalhes ↗` : ''; btn.classList.toggle( 'on', !! c ) }
		if ( v.duration && v.duration - v.currentTime < .8 ) fade.classList.add( 'on' )

	}
	v.addEventListener( 'timeupdate', refresh )
	v.addEventListener( 'ended', () => { v.currentTime = 0; v.play().catch( () => {} ); setTimeout( () => fade.classList.remove( 'on' ), 150 ) } )
	v.addEventListener( 'playing', () => { fade.classList.remove( 'on' ); $( 'loading' )?.classList.add( 'done' ) } )
	v.addEventListener( 'error', () => { $( 'loading' )?.classList.add( 'done' ) } )
	btn.onclick = () => { if ( current ) location.href = `/?set=${current}` }
	// alguns navegadores só liberam o vídeo depois do primeiro toque
	addEventListener( 'pointerdown', () => { if ( v.paused ) v.play().catch( () => {} ) }, { once: true } )
	v.play().catch( () => {} )
	setTimeout( () => $( 'loading' )?.classList.add( 'done' ), 2500 )
	setTimeout( () => document.body.classList.add( 'reel-clear' ), 7000 )

	// celular em pé: pede para virar na horizontal
	const rotate = $( 'rotate' ), portrait = matchMedia( '(orientation: portrait)' ), touch = matchMedia( '(pointer:coarse)' ).matches
	let skipped = false
	const upd = () => { if ( rotate ) rotate.hidden = ! ( touch && portrait.matches && ! skipped ) }
	portrait.addEventListener( 'change', upd ); upd()
	$( 'rotate-skip' ) && ( $( 'rotate-skip' ).onclick = () => { skipped = true; upd() } )
	$( 'rotate-go' ) && ( $( 'rotate-go' ).onclick = async () => { try { await document.documentElement.requestFullscreen( { navigationUI: 'hide' } ) } catch {} try { await screen.orientation.lock( 'landscape' ) } catch {} upd() } )
	$( 'fullscreen' ) && ( $( 'fullscreen' ).onclick = async () => { try { if ( ! document.fullscreenElement ) await document.documentElement.requestFullscreen(); else await document.exitFullscreen() } catch {} } )

}

if ( ( import.meta.env.PROD || params.has( 'reel' ) ) && ! dev ) reel()
else import( './main.js' )
