// Grava o passeio automático em quadros JPEG (passo fixo, determinístico) para virar o vídeo do site.
//   node tools/record-tour.mjs [--niches 4] [--fps 30] [--width 1440] [--height 664] [--out .rec-frames] [--url http://localhost:5186]
// Depois: ffmpeg (ver tools/encode-tour.ps1). Escreve também timeline.json (quando cada personagem está em destaque).
import fs from 'node:fs'
import path from 'node:path'
process.env.PLAYWRIGHT_BROWSERS_PATH ??= 'D:/threejs-lab/tools/.browsers'
const { chromium } = await import( 'file:///D:/threejs-lab/tools/node_modules/playwright/index.mjs' )

const args = process.argv.slice( 2 )
const opt = ( n, d ) => { const i = args.indexOf( '--' + n ); return i < 0 ? d : args[ i + 1 ] }
const niches = Number( opt( 'niches', 4 ) ), fps = Number( opt( 'fps', 30 ) ), width = Number( opt( 'width', 1440 ) ), height = Number( opt( 'height', 664 ) )
const out = path.resolve( opt( 'out', '.rec-frames' ) ), base = opt( 'url', 'http://localhost:5186' )
fs.rmSync( out, { recursive: true, force: true } ); fs.mkdirSync( out, { recursive: true } )

const browser = await chromium.launch( { headless: true, args: [ '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--disable-gpu-sandbox' ] } )
const page = await browser.newPage( { viewport: { width, height }, deviceScaleFactor: 1 } )
page.on( 'pageerror', e => console.error( 'pageerror', e.message ) )
await page.goto( `${base}/?tour&record&dpr=1${opt( 'query', '' )}`, { waitUntil: 'load' } )
await page.waitForFunction( () => window.__rec && window.__game?.state?.assetsReady && document.getElementById( 'loading' ).classList.contains( 'done' ), null, { timeout: 900000 } )
await page.waitForTimeout( 1500 )

const dt = 1 / fps, timeline = []
let n = 0, doneNiches = 0, lastKey = null, tail = 0
for ( ;; ) {

	const r = await page.evaluate( ( dt ) => {

		const info = window.__rec.step( dt )
		const c = document.querySelector( 'canvas.game-canvas' )
		return { info, img: c.toDataURL( 'image/jpeg', 0.93 ), done: window.__game.state.tourDone ?? 0 }

	}, dt )
	fs.writeFileSync( path.join( out, `f${String( n ).padStart( 5, '0' )}.jpg` ), Buffer.from( r.img.split( ',' )[ 1 ], 'base64' ) )
	const key = `${r.info.cur}:${r.info.char}:${r.info.phase}`
	if ( key !== lastKey ) { timeline.push( { frame: n, t: +( n * dt ).toFixed(2), logical: r.info.cur, char: r.info.char, phase: r.info.phase } ); lastKey = key }
	doneNiches = r.done
	n ++
	if ( doneNiches >= niches ) { if ( ++ tail > fps * 2 ) break }
	if ( n % 150 === 0 ) console.log( 'quadros', n, 'nichos concluídos', doneNiches )
	if ( n > fps * 240 ) { console.error( 'limite de 240 s atingido' ); break }

}
fs.writeFileSync( path.join( out, 'timeline.json' ), JSON.stringify( { fps, frames: n, duration: +( n * dt ).toFixed( 2 ), timeline }, null, 1 ) )
console.log( 'pronto:', n, 'quadros' )
await browser.close()
