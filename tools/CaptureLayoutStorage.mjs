import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const keys = [
	'legado.layout.luizgama.v3',
	'legado.nilo.objects.v1',
	'legado.layout.milton.v1',
	'legado.layout.pixinguinha.v1',
	'legado.layout.gloria.v1',
	'legado.gloria.mao-e-microfone.v1',
]
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<title>Ajustes da Galeria Legado</title><body><p id="status">Lendo os ajustes da galeria neste navegador…</p>
<script type="module">
const keys = ${JSON.stringify(keys)}
const status = document.getElementById('status')
try {
	const settings = Object.fromEntries(keys.flatMap(key => {
		const saved = localStorage.getItem(key)
		return saved ? [[key, JSON.parse(saved)]] : []
	}))
	const result = await fetch(location.pathname, {
		method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(settings),
	})
	if (!result.ok) throw new Error()
	status.textContent = Object.keys(settings).length === keys.length
		? 'Ajustes da galeria transferidos para a gravação local.'
		: 'Alguns ajustes não foram encontrados neste navegador.'
} catch { status.textContent = 'Não foi possível transferir os ajustes da galeria.' }
</script></body></html>`

export function captureLayoutStorage(root) {
	return {
		name: 'legado-local-capture-layout',
		configureServer(server) {
			server.middlewares.use('/ajustes-para-gravacao', async (req, res) => {
				if (!/^(localhost|127\.0\.0\.1|\[::1\]):5186$/.test(req.headers.host ?? '')) {
					res.writeHead(403).end()
					return
				}
				if (req.method === 'GET') {
					res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}).end(html)
					return
				}
				if (req.method !== 'POST' || req.headers.origin !== `http://${req.headers.host}`) {
					res.writeHead(403).end()
					return
				}
				try {
					const chunks = []
					let length = 0
					for await (const chunk of req) {
						length += chunk.length
						if (length > 65536) { res.writeHead(413).end(); return }
						chunks.push(chunk)
					}
					const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
					const settings = Object.fromEntries(keys.flatMap(key => {
						const entry = input?.[key]
						if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
						return [[key, entry]]
					}))
					if (!Object.keys(settings).length) { res.writeHead(422).end(); return }
					const directory = join(root, 'asset-source', 'capture')
					await mkdir(directory, {recursive: true})
					await writeFile(join(directory, 'saved-layouts.json'), JSON.stringify(settings, null, 2))
					res.writeHead(204).end()
				} catch {
					res.writeHead(400).end()
				}
			})
		},
	}
}
