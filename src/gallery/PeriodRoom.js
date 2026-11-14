import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { texture, vec3, vec2, vec4, float, mix, smoothstep, step, uniform, positionLocal, cameraPosition, modelWorldMatrixInverse } from 'three/tsl';

// ---------------------------------------------------------------------------------------------
// Sala de época FECHADA, dentro do portal do nicho. Referencial local (o mesmo de CharacterSets):
//   origem = centro do nicho no piso do pedestal · +Z = corredor (frente) · -Z = parede do fundo · X = ao longo do corredor.
// Tudo aqui é invólucro próprio (piso, paredes, abóbada): nada do nicho genérico aparece lá dentro.
// Assets: Poly Haven CC0 (móveis, quadros, relógios, lustre) + texturas CC0 (parquet, lambri, reboco);
// papel de parede, tapete e lombadas são pintados em canvas (desenho próprio).
// ---------------------------------------------------------------------------------------------

// Ajuste ao vivo da paisagem da janela (painel "Janela" no modo ?set=). size = largura (m) da imagem gigante atrás da parede,
// depth = distância dela atrás da janela, x/y = onde a montanha fica em relação ao centro da janela (m). Persistido no navegador.
const WV_KEY = 'legado.window.v1', WV_DEFAULT = { size: 17, depth: 2.6, x: 0, y: 1.85 }
function readWV() { try { const s = JSON.parse(localStorage.getItem(WV_KEY)); return { ...WV_DEFAULT, ...( s && typeof s === 'object' ? s : {} ) } } catch { return { ...WV_DEFAULT } } }
const _wv = readWV()
export const windowView = {
	defaults: WV_DEFAULT,
	u: { size: uniform(_wv.size), depth: uniform(_wv.depth), x: uniform(_wv.x), y: uniform(_wv.y) },
	get() { return { size: this.u.size.value, depth: this.u.depth.value, x: this.u.x.value, y: this.u.y.value } },
	set(k, v) { this.u[ k ].value = Number(v) },
	save() { try { localStorage.setItem(WV_KEY, JSON.stringify(this.get())); return true } catch { return false } },
	reset() { for (const k of Object.keys(WV_DEFAULT)) this.u[ k ].value = WV_DEFAULT[ k ]; try { localStorage.removeItem(WV_KEY) } catch {} },
}
export const ROOM = { halfW: 2.66, spring: 2.57, front: 1.36, back: -1.0 } // meio-vão, início do arco (y), z da frente e do fundo
export const TAU = Math.PI * 2

export function canvasTex(w, h, paint, { repeat = false, srgb = true } = {}) {
	const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h)
	const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace
	t.anisotropy = 8; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t
}

// Papel de parede adamascado verde-garrafa com arabescos dourados (ladrilho de 1 m, repetível).
function damaskTexture() {
	return canvasTex(512, 512, (c, w, h) => {
		c.fillStyle = '#1b4437'; c.fillRect(0, 0, w, h)
		c.globalAlpha = .07; for (let i = 0; i < 3000; i++) { c.fillStyle = Math.random() < .5 ? '#000' : '#a6d6bd'; c.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 3) } c.globalAlpha = 1
		const tone = '#25574a', gold = '#b99a58'
		// treliça em ogiva (tom sobre tom)
		c.strokeStyle = tone; c.lineWidth = 9
		for (const [ cx, cy ] of [ [ 0, 0 ], [ 512, 0 ], [ 0, 512 ], [ 512, 512 ], [ 256, 256 ] ]) {
			c.beginPath(); c.moveTo(cx, cy - 256); c.bezierCurveTo(cx + 170, cy - 130, cx + 170, cy + 130, cx, cy + 256); c.moveTo(cx, cy - 256); c.bezierCurveTo(cx - 170, cy - 130, cx - 170, cy + 130, cx, cy + 256); c.stroke()
		}
		c.lineWidth = 2; c.strokeStyle = 'rgba(185,154,88,.55)'
		for (const [ cx, cy ] of [ [ 256, 256 ], [ 0, 0 ], [ 512, 0 ], [ 0, 512 ], [ 512, 512 ] ]) { c.beginPath(); c.moveTo(cx, cy - 256); c.bezierCurveTo(cx + 170, cy - 130, cx + 170, cy + 130, cx, cy + 256); c.moveTo(cx, cy - 256); c.bezierCurveTo(cx - 170, cy - 130, cx - 170, cy + 130, cx, cy + 256); c.stroke() }
		// roseta de 8 pétalas no centro de cada ogiva
		const rosette = (cx, cy, s) => {
			c.save(); c.translate(cx, cy); c.scale(s, s)
			for (let k = 0; k < 8; k++) { c.save(); c.rotate(k * Math.PI / 4); c.fillStyle = gold; c.beginPath(); c.moveTo(0, -12); c.bezierCurveTo(14, -34, 12, -56, 0, -66); c.bezierCurveTo(-12, -56, -14, -34, 0, -12); c.fill(); c.fillStyle = '#1b4437'; c.beginPath(); c.moveTo(0, -26); c.bezierCurveTo(5, -36, 4, -46, 0, -52); c.bezierCurveTo(-4, -46, -5, -36, 0, -26); c.fill(); c.restore() }
			c.fillStyle = gold; c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill(); c.fillStyle = '#1b4437'; c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill()
			for (let k = 0; k < 4; k++) { c.save(); c.rotate(k * Math.PI / 2 + Math.PI / 4); c.fillStyle = gold; c.beginPath(); c.moveTo(0, -78); c.lineTo(6, -88); c.lineTo(0, -98); c.lineTo(-6, -88); c.closePath(); c.fill(); c.restore() }
			c.restore()
		}
		rosette(256, 256, .85); for (const [ x, y ] of [ [ 0, 0 ], [ 512, 0 ], [ 0, 512 ], [ 512, 512 ] ]) rosette(x, y, .85)
		// florão pequeno entre as ogivas
		for (const [ x, y ] of [ [ 256, 0 ], [ 256, 512 ], [ 0, 256 ], [ 512, 256 ] ]) { c.fillStyle = gold; c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill(); for (let k = 0; k < 4; k++) { c.save(); c.translate(x, y); c.rotate(k * Math.PI / 2); c.beginPath(); c.ellipse(0, -22, 5, 11, 0, 0, TAU); c.fill(); c.restore() } }
	}, { repeat: true })
}
// Tapete persa: campo vinho, medalhão central, cantoneiras, barras de borda e franjas.
function rugTexture() {
	return canvasTex(1024, 640, (c, w, h) => {
		c.fillStyle = '#e8dcc0'; c.fillRect(0, 0, w, h)
		const border = (inset, color) => { c.fillStyle = color; c.fillRect(inset, inset, w - inset * 2, h - inset * 2) }
		border(26, '#1c2f4a'); border(46, '#caa862'); border(56, '#7a1d2c')
		// faixa principal com motivo repetido
		c.fillStyle = '#16294a'; c.fillRect(66, 66, w - 132, h - 132)
		const stripe = (a, b) => { for (let x = 90; x < w - 90; x += 46) { c.fillStyle = '#b8503a'; c.beginPath(); c.moveTo(x, a); c.lineTo(x + 16, a + 14); c.lineTo(x, a + 28); c.lineTo(x - 16, a + 14); c.closePath(); c.fill(); c.fillStyle = '#d8b66a'; c.beginPath(); c.arc(x, a + 14, 4, 0, TAU); c.fill() } }
		stripe(76); for (let x = 90; x < w - 90; x += 46) { c.fillStyle = '#b8503a'; c.beginPath(); c.moveTo(x, h - 104); c.lineTo(x + 16, h - 90); c.lineTo(x, h - 76); c.lineTo(x - 16, h - 90); c.closePath(); c.fill(); c.fillStyle = '#d8b66a'; c.beginPath(); c.arc(x, h - 90, 4, 0, TAU); c.fill() }
		for (let y = 120; y < h - 120; y += 46) for (const x of [ 80, w - 80 ]) { c.fillStyle = '#b8503a'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 14, y + 14); c.lineTo(x, y + 28); c.lineTo(x - 14, y + 14); c.closePath(); c.fill() }
		c.fillStyle = '#caa862'; c.fillRect(112, 112, w - 224, 3); c.fillRect(112, h - 115, w - 224, 3); c.fillRect(112, 112, 3, h - 224); c.fillRect(w - 115, 112, 3, h - 224)
		// campo
		const g = c.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * .5); g.addColorStop(0, '#9c2a38'); g.addColorStop(1, '#6f1a29'); c.fillStyle = g; c.fillRect(118, 118, w - 236, h - 236)
		// arabescos finos no campo
		c.strokeStyle = 'rgba(224,190,120,.42)'; c.lineWidth = 2
		for (let i = 0; i < 26; i++) { const x = 150 + (i * 97) % (w - 300), y = 150 + (i * 61) % (h - 300); c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 40, y - 30, x + 70, y + 30, x + 100, y); c.stroke(); c.beginPath(); c.arc(x + 100, y, 6, 0, TAU); c.stroke() }
		// medalhão
		const cx = w / 2, cy = h / 2
		const dia = (rx, ry, color) => { c.fillStyle = color; c.beginPath(); c.moveTo(cx, cy - ry); c.lineTo(cx + rx, cy); c.lineTo(cx, cy + ry); c.lineTo(cx - rx, cy); c.closePath(); c.fill() }
		dia(330, 200, '#caa862'); dia(316, 188, '#16294a'); dia(292, 170, '#b8503a'); dia(250, 142, '#1c2f4a'); dia(206, 116, '#d8b66a'); dia(190, 106, '#8d2230'); dia(120, 68, '#16294a'); dia(84, 48, '#d8b66a')
		c.fillStyle = '#8d2230'; c.beginPath(); c.arc(cx, cy, 24, 0, TAU); c.fill()
		for (let k = 0; k < 8; k++) { c.save(); c.translate(cx, cy); c.rotate(k * Math.PI / 4); c.fillStyle = '#e8dcc0'; c.beginPath(); c.ellipse(0, -38, 7, 15, 0, 0, TAU); c.fill(); c.restore() }
		// cantoneiras
		for (const [ sx, sy ] of [ [ 1, 1 ], [ -1, 1 ], [ 1, -1 ], [ -1, -1 ] ]) { c.save(); c.translate(cx + sx * 410, cy + sy * 215); c.fillStyle = '#16294a'; c.beginPath(); c.moveTo(0, -70 * sy); c.lineTo(60 * sx, 0); c.lineTo(0, 70 * sy); c.lineTo(-40 * sx, 0); c.closePath(); c.fill(); c.fillStyle = '#caa862'; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill(); c.restore() }
		// franjas nas pontas
		c.fillStyle = '#efe6d0'; for (let x = 4; x < w; x += 7) { c.fillRect(x, 0, 3, 24); c.fillRect(x, h - 24, 3, 24) }
		// desgaste
		c.globalAlpha = .08; for (let i = 0; i < 4000; i++) { c.fillStyle = Math.random() < .5 ? '#000' : '#fff'; c.fillRect(Math.random() * w, Math.random() * h, 2, 2) } c.globalAlpha = 1
	})
}

// Atlas de lombadas: 16 tiras (couro, tecido, dourados, rótulos).
const SPINES = 16
function spineAtlas() {
	const cw = 48, ch = 256
	return canvasTex(cw * SPINES, ch, (c) => {
		const leathers = [ '#5b1f1a', '#2a3b2d', '#1f2f4c', '#6b4a24', '#41261d', '#7a2f26', '#33302a', '#4b3a58', '#8a6b36', '#233c3a', '#6a2b34', '#3b2c20', '#2c3552', '#5f4b2a', '#47231c', '#25392f' ]
		for (let i = 0; i < SPINES; i++) {
			const x = i * cw, col = leathers[ i ], g = c.createLinearGradient(x, 0, x + cw, 0)
			g.addColorStop(0, shade(col, -26)); g.addColorStop(.28, shade(col, 14)); g.addColorStop(.7, col); g.addColorStop(1, shade(col, -30)); c.fillStyle = g; c.fillRect(x, 0, cw, ch)
			c.globalAlpha = .12; for (let k = 0; k < 90; k++) { c.fillStyle = Math.random() < .5 ? '#000' : '#fff'; c.fillRect(x + Math.random() * cw, Math.random() * ch, 1 + Math.random() * 2, 1) } c.globalAlpha = 1
			const gold = '#d7b66c'; c.fillStyle = gold
			for (const y of [ 14, 22, ch - 22, ch - 14 ]) c.fillRect(x + 3, y, cw - 6, 2)
			for (const y of [ 70, 78, 182, 190 ]) { c.globalAlpha = .85; c.fillRect(x + 6, y, cw - 12, 1.5); c.globalAlpha = 1 }
			c.fillStyle = shade(col, 38); c.fillRect(x + 8, 92, cw - 16, 76); c.fillStyle = '#e8d7a8'; c.globalAlpha = .9
			for (let l = 0; l < 4; l++) c.fillRect(x + 12, 100 + l * 16, cw - 24 - (l * 5) % 9, 4); c.globalAlpha = 1
		}
	})
}
function shade(hex, amt) { const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt / 255 * 2))); return '#' + c.getHexString() }

// ---------- geometria utilitária ----------
export function withColor(g, hex) { // cor por vértice
	const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3)
	for (let i = 0; i < n; i++) { a[ i * 3 ] = c.r; a[ i * 3 + 1 ] = c.g; a[ i * 3 + 2 ] = c.b }
	g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g
}
export function xf(g, p = [ 0, 0, 0 ], r = [ 0, 0, 0 ], s = [ 1, 1, 1 ]) { const o = new THREE.Object3D(); o.position.set(...p); o.rotation.set(...r); o.scale.set(...s); o.updateMatrix(); g.applyMatrix4(o.matrix); return g }
// Superfície ao longo de um perfil 2D (x,y) extrudada em z. UV = (comprimento de arco, z) / tile. Normais para dentro da sala.
export function tube(profile, z0, z1, tile) {
	const pos = [], uv = [], idx = []; let len = 0
	profile.forEach((p, i) => { if (i) len += Math.hypot(p[ 0 ] - profile[ i - 1 ][ 0 ], p[ 1 ] - profile[ i - 1 ][ 1 ]); pos.push(p[ 0 ], p[ 1 ], z0, p[ 0 ], p[ 1 ], z1); uv.push(len / tile, z0 / tile, len / tile, z1 / tile) })
	for (let i = 0; i < profile.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
	const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g
}
export function arcPts(cx, cy, r, a0, a1, n) { return Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [ cx + Math.cos(a) * r, cy + Math.sin(a) * r ] }) }
// Painel plano (parede do fundo) a partir de um polígono 2D; UV = (x,y)/tile.
export function wallPanel(points, z, tile) {
	const sh = new THREE.Shape(points.map(p => new THREE.Vector2(p[ 0 ], p[ 1 ]))), g = new THREE.ShapeGeometry(sh, 24), uv = g.attributes.uv, p = g.attributes.position
	for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile)
	g.translate(0, 0, z); return g
}
export const box = (w, h, d, p, hex) => withColor(xf(new THREE.BoxGeometry(w, h, d), p), hex)

// ---------- estante embutida com livros ----------
function bookcase(wood, books, { x, z, w, h, depth = .42, seed = 3, shelves = 6 }) {
	let s = seed; const rnd = () => ( s = ( Math.imul(s, 1664525) + 1013904223 ) >>> 0 ) / 4294967296
	const t = .035, inner = w - .16, gap = ( h - .3 ) / shelves
	// moldura
	wood.push(box(.08, h, depth, [ x - w / 2 + .04, h / 2, z ], '#5a4030'), box(.08, h, depth, [ x + w / 2 - .04, h / 2, z ], '#5a4030'))
	wood.push(box(w, .3, depth + .04, [ x, .15, z + .02 ], '#4a3426'), box(w + .1, .07, depth + .08, [ x, .335, z + .03 ], '#6b4c38'))
	wood.push(box(w + .12, .16, depth + .1, [ x, h + .08, z + .04 ], '#4a3426'), box(w + .2, .06, depth + .16, [ x, h + .19, z + .07 ], '#6b4c38'))
	for (let i = -4; i <= 4; i++) wood.push(box(.05, .05, .04, [ x + i * ( w / 9 ), h - .03, z + depth / 2 + .02 ], '#7a5a40')) // dentículos
	wood.push(box(w - .12, h, .03, [ x, h / 2, z - depth / 2 + .015 ], '#2b1f18')) // fundo
	for (let i = 0; i <= shelves; i++) { const y = .36 + i * gap; if (i < shelves) wood.push(box(inner, t, depth - .02, [ x, y, z + .005 ], '#5a4030')) }
	// livros
	for (let i = 0; i < shelves; i++) {
		const y = .36 + i * gap + t / 2; let cx = x - inner / 2 + .02
		while (cx < x + inner / 2 - .08) {
			if (rnd() < .035) { cx += .1 + rnd() * .12; continue } // vão
			const bw = .028 + rnd() * .04, bh = gap * ( .6 + rnd() * .34 ), bd = depth * ( .62 + rnd() * .22 ), lean = rnd() < .05 ? ( rnd() - .5 ) * .3 : 0, tile = Math.floor(rnd() * SPINES)
			const g = new THREE.BoxGeometry(bw, bh, bd), uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, ( tile + uv.getX(k) ) / SPINES)
			books.push(xf(g, [ cx + bw / 2, y + bh / 2, z + depth / 2 - bd / 2 - .03 + ( rnd() - .5 ) * .02 ], [ 0, 0, lean ])); cx += bw + .002 + ( lean ? .06 : 0 )
		}
	}
}

// ---------- carga e montagem ----------
const gltfCache = new Map()
export async function loadModel(id) {
	if (!gltfCache.has(id)) gltfCache.set(id, new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(id.startsWith('/') ? id : `/models/set/${id}.glb`).then(g => g.scene).catch(err => { console.warn('asset ausente', id, err.message); return null }))
	return gltfCache.get(id)
}
export const texLoader = new THREE.TextureLoader(), texCache = new Map()
export function polyTex(name, kind, tile, w, h, srgb) { // clone com repetição própria
	const key = `${name}-${kind}`
	
	const t = texCache.get(key).clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / tile, h / tile); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t
}

// Folhagem de palmeira/bananeira vista pela janela (camada próxima, com alfa). Cores frias para contrastar com a foto sépia.
function foliageTexture() {
	return canvasTex(1024, 1024, (c, w, h) => {
		let s = 5; const rnd = () => ( s = ( Math.imul(s, 1664525) + 1013904223 ) >>> 0 ) / 4294967296
		const leaflet = (x, y, ang, len, wd, col) => { c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = col; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * .5, -wd, len, 0); c.quadraticCurveTo(len * .5, wd * .35, 0, 0); c.fill(); c.restore() }
		const frond = (x0, y0, a0, len, bend, size) => {
			const pts = []; for (let i = 0; i <= 28; i++) { const t = i / 28, a = a0 + bend * t * t; pts.push([ x0 + Math.cos(a0) * len * t + Math.sin(bend * t * t) * len * .28 * Math.cos(a0 + Math.PI / 2) * t, y0 + Math.sin(a0) * len * t + bend * len * .22 * t * t ]) }
			c.strokeStyle = '#1b3a24'; c.lineWidth = 5; c.beginPath(); pts.forEach(( p, i ) => i ? c.lineTo(p[ 0 ], p[ 1 ]) : c.moveTo(p[ 0 ], p[ 1 ])); c.stroke()
			for (let i = 2; i < 28; i++) { const p = pts[ i ], q = pts[ i + 1 ] || p, ang = Math.atan2(q[ 1 ] - p[ 1 ], q[ 0 ] - p[ 0 ]), l = size * ( 1 - Math.abs(i - 12) / 22 ) * ( .7 + rnd() * .5 ), g = 38 + rnd() * 40
				for (const side of [ -1, 1 ]) leaflet(p[ 0 ], p[ 1 ], ang + side * ( 1.0 + rnd() * .25 ), l, 7 + rnd() * 3, `rgb(${22 + g * .25 | 0},${g + 34 | 0},${30 + g * .3 | 0})`) }
		}
		frond(-30, 60, .45, 760, .9, 190); frond(-20, 170, .2, 640, 1.1, 170); frond(60, -20, .95, 600, .8, 160)
		frond(w + 30, 30, Math.PI - .55, 700, -.85, 185); frond(w + 20, 150, Math.PI - .25, 560, -1.0, 160)
		// folhas largas penduradas no alto
		for (let k = 0; k < 5; k++) { const x = w * ( .2 + k * .15 ) + rnd() * 40; leaflet(x, -20, Math.PI / 2 + ( rnd() - .5 ) * .5, 110 + rnd() * 90, 30 + rnd() * 14, `rgb(${24 + rnd() * 14 | 0},${70 + rnd() * 40 | 0},${40 + rnd() * 20 | 0})`) }
	})
}
// Máscara de luz que entra pela janela (painéis separados por caixilhos), para projetar no piso.
function sunPatchTexture() {
	return canvasTex(256, 512, (c, w, h) => {
		c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'
		const x0 = 18, x1 = w - 18, mid = w / 2, bar = 7
		for (const [ a, b ] of [ [ x0, mid - bar ], [ mid + bar, x1 ] ]) for (const [ ya, yb ] of [ [ 150, 250 ], [ 262, 372 ], [ 384, 494 ] ]) c.fillRect(a, ya, b - a, yb - ya)
		c.beginPath(); c.moveTo(x0, 138); c.arc(mid, 138, mid - x0, Math.PI, 0); c.lineTo(x1, 138); c.closePath(); c.fill()
		c.fillStyle = '#000'; c.fillRect(mid - 3, 0, 6, 150); for (let k = 1; k < 4; k++) { c.save(); c.translate(mid, 138); c.rotate(-Math.PI + k * Math.PI / 4); c.fillRect(-2.5, 0, 5, mid); c.restore() }
		c.filter = 'blur(5px)'; c.drawImage(c.canvas, 0, 0); c.filter = 'none'
	}, { srgb: false })
}

export async function buildStudyRoom(group, { galleryBrightness }) {
	await Promise.all([ 'diagonal_parquet', 'dark_paneled_wood', 'beige_wall_001', 'dark_wood' ].flatMap(n => [ 'diff', 'nor_gl' ].map(async k => { const key = `${n}-${k}`; if (!texCache.has(key)) texCache.set(key, await texLoader.loadAsync(`/textures/set/${key}.webp`)) })))
	const rioTex = await texLoader.loadAsync('/textures/set/rio.webp'); rioTex.colorSpace = THREE.SRGBColorSpace; rioTex.anisotropy = 8; rioTex.wrapS = rioTex.wrapT = THREE.ClampToEdgeWrapping
	const warm = vec3(1, .78, .5)
	const mat = (opts, glow = .14) => { const m = new THREE.MeshStandardNodeMaterial(opts); m.emissiveNode = ( m.map ? texture(m.map).rgb : vec3(new THREE.Color(m.color))).mul(warm).mul(glow).mul(galleryBrightness); return m }
	const { halfW: W, spring: SP, front: ZF, back: ZB } = ROOM, D = ZF - ZB
	const room = new THREE.Group(); room.name = 'room'; group.add(room)
	const add = (g, m, { cast = false, recv = true } = {}) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = cast; mesh.receiveShadow = recv; room.add(mesh); return mesh }
	// Escurecimento de cantos/teto/rodapé aplicado depois da luz (barato, dá peso e "sujeira" de ambiente) — só nas superfícies da sala.
	const aoShell = m => {
		const p = positionLocal, edge = float(W).sub(p.x.abs()).min(p.z.sub(ZB)), top = float(SP).add(float(W)).sub(p.y)
		const ao = mix(float(.6), float(1), smoothstep(0, .9, edge)).mul(mix(float(.7), float(1), smoothstep(0, .5, p.y.add(.25))))
		const orig = m.setupOutput.bind(m); m.setupOutput = (builder, lit) => orig(builder, vec4(lit.rgb.mul(ao), lit.a)); return m
	}
	const shell = ( opts, glow ) => aoShell(mat(opts, glow))

	// --- piso: parquet em espinha de peixe, polido, com desgaste
	const floorG = new THREE.PlaneGeometry(W * 2, D); floorG.rotateX(-Math.PI / 2); floorG.translate(0, .02, ( ZF + ZB ) / 2)
	add(floorG, shell({ map: polyTex('diagonal_parquet', 'diff', 1.2, W * 2, D, true), normalMap: polyTex('diagonal_parquet', 'nor_gl', 1.2, W * 2, D), roughness: .42, metalness: 0, color: '#b79c84' }, .1))
	// --- paredes laterais: lambri escuro (até 1,15 m) + papel de parede (até o início do arco)
	const wainOpts = { map: polyTex('dark_paneled_wood', 'diff', 1.0, 1.0, 1.0, true), normalMap: polyTex('dark_paneled_wood', 'nor_gl', 1.0, 1.0, 1.0), roughness: .5, color: '#b9a696', side: THREE.DoubleSide }
	const wainM = shell(wainOpts, .1)
	add(tube([[ -W, 0 ], [ -W, 1.15 ]], ZB, ZF, 1.0), wainM); add(tube([[ W, 0 ], [ W, 1.15 ]], ZB, ZF, 1.0), wainM)
	const dam = damaskTexture(), papM = shell({ map: dam, roughness: .9, color: '#c9d2c4', side: THREE.DoubleSide }, .1)
	add(tube([[ -W, 1.15 ], [ -W, SP ]], ZB, ZF, 1.0), papM); add(tube([[ W, 1.15 ], [ W, SP ]], ZB, ZF, 1.0), papM)
	// --- abóbada: reboco claro
	const vaultM = shell({ map: polyTex('beige_wall_001', 'diff', 2.2, 2.2, 2.2, true), normalMap: polyTex('beige_wall_001', 'nor_gl', 2.2, 2.2, 2.2), roughness: .92, color: '#e6d7bd', side: THREE.DoubleSide }, .12)
	add(tube(arcPts(0, SP, W, Math.PI, 0, 40).reverse(), ZB, ZF, 2.2), vaultM)
	// --- parede do fundo, com a janela em arco recortada no centro
	const WH = .5, SILL = 1.15 // meio-vão e peitoril da janela
	const holeRect = new THREE.Path([ new THREE.Vector2(-WH, SILL), new THREE.Vector2(WH, SILL), new THREE.Vector2(WH, SP), new THREE.Vector2(-WH, SP) ])
	const holeArch = new THREE.Path(); holeArch.moveTo(-WH, SP); holeArch.absarc(0, SP, WH, Math.PI, 0, true); holeArch.lineTo(-WH, SP)
	const panelWithHole = (pts, hole, tile) => { const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[ 0 ], p[ 1 ]))); if (hole) sh.holes.push(hole); const g = new THREE.ShapeGeometry(sh, 24), uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile); g.translate(0, 0, ZB); return g }
	add(wallPanel([[ -W, 0 ], [ W, 0 ], [ W, SILL ], [ -W, SILL ]], ZB, 1.0), wainM)
	add(panelWithHole([[ -W, SILL ], [ W, SILL ], [ W, SP ], [ -W, SP ]], holeRect, 1.0), papM)
	const arc = arcPts(0, SP, W, 0, Math.PI, 40)
	add(panelWithHole([[ W, SP ], ...arc, [ -W, SP ]], holeArch, 2.2), vaultM)

	// --- marcenaria (cor por vértice, 1 draw): rodapé, guarda-pó, cornija, molduras
	const woodMat = shell({ map: polyTex('dark_wood', 'diff', 1.2, 1.2, 1.2, true), normalMap: polyTex('dark_wood', 'nor_gl', 1.2, 1.2, 1.2), roughness: .5, vertexColors: true, side: THREE.DoubleSide }, .1)
	const wood = [], gold = [], paint = [], books = [], marble = []
	for (const sx of [ -1, 1 ]) {
		wood.push(box(.04, .2, D, [ sx * ( W - .02 ), .1, ( ZF + ZB ) / 2 ], '#6a4a36'))
		wood.push(box(.06, .07, D, [ sx * ( W - .03 ), 1.16, ( ZF + ZB ) / 2 ], '#7a5842'))
		wood.push(box(.1, .14, D, [ sx * ( W - .05 ), SP - .07, ( ZF + ZB ) / 2 ], '#6a4a36'))
		gold.push(box(.02, .03, D, [ sx * ( W - .11 ), SP - .01, ( ZF + ZB ) / 2 ], '#e0bb70'))
	}
	wood.push(box(W * 2, .2, .04, [ 0, .1, ZB + .02 ], '#6a4a36'), box(W * 2, .07, .06, [ 0, 1.16, ZB + .03 ], '#7a5842'))
	gold.push(box(W * 2, .02, .03, [ 0, .05, ZF - .01 ], '#e8c57c')) // soleira de latão na entrada
	const ring = (list, r, cy, th, dep, z, c, from = 0, to = Math.PI, n = 40) => { const pts = arcPts(0, cy, r, from, to, n); for (let i = 0; i < pts.length - 1; i++) { const [ a, b ] = [ pts[ i ], pts[ i + 1 ] ], len = Math.hypot(b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ]), ang = Math.atan2(b[ 1 ] - a[ 1 ], b[ 0 ] - a[ 0 ]); list.push(withColor(xf(new THREE.BoxGeometry(len * 1.05, th, dep), [ ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2, z ], [ 0, 0, ang ]), c)) } }
	ring(wood, W - .03, SP, .07, .05, ZB + .03, '#7a5842'); ring(gold, W - .1, SP, .018, .05, ZB + .03, '#e0bb70')
	for (const z of [ -.35, .45, 1.2 ]) { ring(wood, W - .04, SP, .06, .07, z, '#6a4a36', 0, Math.PI, 48); ring(gold, W - .1, SP, .02, .07, z, '#e0bb70', 0, Math.PI, 48) }
	// janela: aduela, caixilhos, leque do arco, peitoril de mármore
	const FR = '#cfc5ae', fz = ZB + .035
	for (const sx of [ -1, 1 ]) paint.push(box(.07, SP - SILL, .13, [ sx * ( WH + .035 ), ( SILL + SP ) / 2, ZB + .06 ], FR))
	ring(paint, WH + .035, SP, .07, .13, ZB + .06, FR, 0, Math.PI, 28)
	paint.push(box(.035, SP - SILL + WH, .035, [ 0, SILL + ( SP - SILL + WH ) / 2, fz ], FR)) // caixilho central
	for (const y of [ 1.62, 2.1, SP ]) paint.push(box(WH * 2, .03, .035, [ 0, y, fz ], FR))
	for (let k = 1; k < 4; k++) { const a = Math.PI * k / 4; paint.push(withColor(xf(new THREE.BoxGeometry(.03, WH, .035), [ Math.cos(a) * WH / 2, SP + Math.sin(a) * WH / 2, fz ], [ 0, 0, a - Math.PI / 2 ]), FR)) }
	ring(paint, WH * .55, SP, .03, .035, fz, FR, 0, Math.PI, 24)
	marble.push(box(WH * 2 + .34, .06, .3, [ 0, SILL - .03, ZB + .13 ], '#d9d0bc'), box(WH * 2 + .24, .05, .04, [ 0, SILL - .085, ZB + .27 ], '#c8bea8'))
	// cortinas: barra de latão com ponteiras
	{ const RY = 3.32, RZ = ZB + .26, RL = 2.5, B = '#c9a35c'
		gold.push(withColor(xf(new THREE.CylinderGeometry(.02, .02, RL, 16), [ 0, RY, RZ ], [ 0, 0, Math.PI / 2 ]), B))                       // barra
		for (const sx of [ -1, 1 ]) {
			gold.push(withColor(xf(new THREE.CylinderGeometry(.032, .032, .05, 16), [ sx * ( RL / 2 + .02 ), RY, RZ ], [ 0, 0, Math.PI / 2 ]), '#b48f4c')) // tampa
			gold.push(withColor(xf(new THREE.CylinderGeometry(.012, .012, .26, 10), [ sx * 1.0, RY, ZB + .13 ], [ Math.PI / 2, 0, 0 ]), B))              // braço do suporte
			gold.push(withColor(xf(new THREE.CylinderGeometry(.045, .045, .014, 18), [ sx * 1.0, RY, ZB + .007 ], [ Math.PI / 2, 0, 0 ]), '#b48f4c'))   // roseta na parede
			for (let k = 0; k < 7; k++) { const rx = sx * ( .83 - .21 + k * .07 ) // argolas que prendem a cortina na barra (a cortina passa por dentro delas)
				gold.push(withColor(xf(new THREE.TorusGeometry(.034, .006, 8, 18), [ rx, RY, RZ ], [ 0, Math.PI / 2, 0 ]), '#d2ac63')) }
		}
	}
	
	// estantes embutidas flanqueando a janela
	bookcase(wood, books, { x: -1.81, z: ZB + .21, w: 1.62, h: 2.62, seed: 11 })
	bookcase(wood, books, { x: 1.835, z: ZB + .21, w: 1.57, h: 2.62, seed: 29, shelves: 6 })
	// pilha de livros e livro aberto na escrivaninha
	const stackBook = (w, h, d, p, r, tile) => { const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, ( tile + uv.getX(k) ) / SPINES); books.push(xf(g, p, r)) }
	// texto à mão: página esquerda inteira, direita só no começo (ele ainda vai continuar escrevendo). Topo da página fica para o lado da janela.
	const pageTex = {}
	const pageMat = kind => {
		if (!pageTex[ kind ]) {
			const tx = canvasTex(256, 360, (c, w, h) => {
				c.fillStyle = '#d9cfb2'; c.fillRect(0, 0, w, h); const g = c.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, h * .75); g.addColorStop(0, 'rgba(255,248,225,.25)'); g.addColorStop(1, 'rgba(120,95,55,.28)'); c.fillStyle = g; c.fillRect(0, 0, w, h)
				let s = kind === 'full' ? 21 : 77; const rnd = () => ( s = ( Math.imul(s, 1664525) + 1013904223 ) >>> 0 ) / 4294967296
				const lines = kind === 'full' ? 19 : 8, lh = 17, top = 26
				c.strokeStyle = '#2f261c'; c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round'
				for (let i = 0; i < lines; i++) {
					const y = top + i * lh, last = i === lines - 1, endX = kind === 'half' && last ? 40 + rnd() * 50 : w - 22 - rnd() * 14
					let x = 24 + ( i % 7 === 0 ? 14 : 0 ); c.beginPath(); c.moveTo(x, y)
					while (x < endX) { const wl = 10 + rnd() * 26; for (let k = 0; k < wl && x < endX; k += 2) { x += 2; c.lineTo(x, y + Math.sin(x * .85 + i) * 2.4 + ( rnd() - .5 ) * 1.6 - ( ( k % 6 ) < 2 ? 3 : 0 ) * rnd()) } x += 5 + rnd() * 4; c.moveTo(x, y) }
					c.stroke()
				}
				if (kind === 'half') { c.fillStyle = 'rgba(30,22,14,.6)'; c.beginPath(); c.arc(70, top + 7 * lh + 12, 2.2, 0, TAU); c.fill() }
			})
			const m = new THREE.MeshStandardNodeMaterial({ map: tx, roughness: .85 }); m.emissiveNode = texture(tx).rgb.mul(.1).mul(galleryBrightness); pageTex[ kind ] = m
		}
		return pageTex[ kind ]
	}
	// objetos soltos da mesa: cada um é um grupo independente, reposicionável pelo painel "Mesa" (e salvo no navegador)
	const paintMat = mat({ color: '#ffffff', roughness: .55, vertexColors: true }, .14), goldMat = mat({ color: '#d7b36a', roughness: .3, metalness: .85, vertexColors: true }, .12)
	const mk = () => ({ wood: [], paint: [], gold: [] })
	const fin = (m, grp) => { for (const [ arr, mt ] of [ [ m.wood, woodMat ], [ m.paint, paintMat ], [ m.gold, goldMat ] ]) if (arr.length) { const mesh = new THREE.Mesh(mergeGeometries(arr.map(g => g.index ? g.toNonIndexed() : g), false), mt); mesh.receiveShadow = true; grp.add(mesh) } }
	const deskObjs = {}
	{ const m = mk(), grp = new THREE.Group(), tilt = .05 // livro aberto, virado para quem senta na cadeira; página esquerda escrita, direita só no começo
		m.wood.push(withColor(xf(new THREE.BoxGeometry(.42, .012, .29), [ 0, .006, 0 ]), '#3b1f19'))
		for (const s of [ -1, 1 ]) { const cx = -s * .095, cy = .0185, ang = s * tilt
			m.paint.push(withColor(xf(new THREE.BoxGeometry(.19, .02, .26), [ cx, cy, 0 ], [ 0, Math.PI, ang ]), '#d7ccae'))
			const pg = new THREE.Mesh(new THREE.PlaneGeometry(.18, .25).rotateX(-Math.PI / 2), pageMat(s === -1 ? 'full' : 'half')); pg.position.set(cx, cy + .0105, 0); pg.rotation.set(0, Math.PI, ang); pg.renderOrder = 1; grp.add(pg) }
		m.gold.push(withColor(xf(new THREE.BoxGeometry(.006, .0008, .1), [ -.015, .0215, -.14 ]), '#8d2230'))
		fin(m, grp); deskObjs.book = { label: 'Livro aberto', grp, base: 0, def: { x: 0, z: .8, rot: 0 } } }
	{ const m = mk(), grp = new THREE.Group() // tinteiro
		m.wood.push(withColor(xf(new THREE.CylinderGeometry(.028, .034, .05, 14), [ 0, .025, 0 ]), '#1b1b22'))
		m.gold.push(withColor(xf(new THREE.CylinderGeometry(.018, .028, .014, 14), [ 0, .057, 0 ]), '#d7b36a'))
		fin(m, grp); deskObjs.ink = { label: 'Tinteiro', grp, base: 0, def: { x: -.3, z: .77, rot: 0 } } }
	{ const m = mk(), grp = new THREE.Group() // pena
		m.paint.push(withColor(xf(new THREE.CylinderGeometry(.0035, .0012, .28, 5), [ 0, .042, 0 ], [ 0, .55 + Math.PI, Math.PI / 2 - .07 ]), '#e8e1cf'))
		fin(m, grp); deskObjs.pen = { label: 'Pena', grp, base: 0, def: { x: -.2, z: .71, rot: 0 } } }	// pendente simples de latão com globo de vidro fosco: lampião a querosene/gás, comum no Rio de 1880–1900
	const PL = { x: 0, z: .6, top: SP + W - .02, globeY: 3.3 }
	gold.push(withColor(xf(new THREE.CylinderGeometry(.07, .09, .03, 18), [ PL.x, PL.top, PL.z ]), '#c9a35c'))
	gold.push(withColor(xf(new THREE.CylinderGeometry(.007, .007, PL.top - 3.62, 6), [ PL.x, ( PL.top + 3.62 ) / 2, PL.z ]), '#b08a45'))
	gold.push(withColor(xf(new THREE.CylinderGeometry(.016, .016, .22, 10), [ PL.x, 3.54, PL.z ]), '#d4ad66'))
	gold.push(withColor(xf(new THREE.CylinderGeometry(.045, .2, .13, 28, 1, true), [ PL.x, 3.43, PL.z ]), '#c9a35c'))
	gold.push(withColor(xf(new THREE.SphereGeometry(.035, 14, 10), [ PL.x, 3.5, PL.z ]), '#d9b46c'))
	gold.push(withColor(xf(new THREE.CylinderGeometry(.075, .06, .035, 18), [ PL.x, 3.165, PL.z ]), '#c9a35c'))
	gold.push(withColor(xf(new THREE.SphereGeometry(.022, 10, 8), [ PL.x, 3.13, PL.z ]), '#d9b46c'))
	const globeM = new THREE.MeshStandardNodeMaterial({ color: '#f1e6cf', roughness: .35, transparent: true, opacity: .96 }); globeM.emissiveNode = vec3(1, .83, .55).mul(.75).mul(galleryBrightness)
	const globe = new THREE.Mesh(new THREE.SphereGeometry(.125, 26, 18), globeM); globe.scale.set(1, 1.1, 1); globe.position.set(PL.x, PL.globeY, PL.z); room.add(globe)
	const mergeInto = (arr, material, opts) => { if (arr.length) add(mergeGeometries(arr.map(g => g.index ? g.toNonIndexed() : g), false), material, opts) }
	mergeInto(wood, woodMat, { cast: true })
	mergeInto(paint, paintMat, { cast: true })
	mergeInto(marble, mat({ color: '#ffffff', roughness: .35, vertexColors: true }, .1))
	mergeInto(gold, goldMat)
	const atlas = spineAtlas(); atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping
	const bookGeo = books.map(g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (![ 'position', 'normal', 'uv' ].includes(k)) g.deleteAttribute(k); return g })
	if (bookGeo.length) add(mergeGeometries(bookGeo, false), mat({ map: atlas, roughness: .6, color: '#b5a595' }, .1))

	// --- JANELA COM PARALAXE: a foto do Rio de Janeiro (Marc Ferrez/IMS, domínio público) fica "longe", atrás da parede,
	// e a folhagem fica perto da vidraça. Cada camada é amostrada pelo raio do olho — move a cabeça, a paisagem desliza em
	// velocidades diferentes, como numa janela de verdade. Nada de geometria atrás da parede.
	const camLocal = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz, ray = positionLocal.sub(camLocal), back = ray.z.negate().max(.05)
	const layer = (depth, cx, cy, w, h) => { const hit = positionLocal.add(ray.mul(depth.div(back))); return vec2(hit.x.sub(cx).div(w).add(.5), hit.y.sub(cy).div(h).add(.5)) }
	const wvS = windowView.u.size, wvH = wvS.mul(1.0411), far = texture(rioTex, layer(windowView.u.depth, windowView.u.x.add(wvS.mul(.03)), windowView.u.y.add(wvH.mul(.06)), wvS, wvH)).rgb
	const glow = vec3(1.0, .96, .9)
	const win = new THREE.MeshBasicNodeMaterial(); win.colorNode = far.mul(glow).mul(.85); win.fog = false
	const hole = new THREE.Shape([ new THREE.Vector2(-WH, SILL), new THREE.Vector2(WH, SILL), new THREE.Vector2(WH, SP) ]); hole.lineTo(WH, SP); hole.absarc(0, SP, WH, 0, Math.PI, false); hole.lineTo(-WH, SILL)
	const pane = new THREE.Mesh(new THREE.ShapeGeometry(hole, 24).translate(0, 0, ZB - .02), win); room.add(pane)

	// cortinas de veludo com pregas (geometria com dobras senoidais)
	const curtainGeo = (x0) => { const g = new THREE.PlaneGeometry(.46, 3.1, 36, 12), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const u = p.getX(i) + .23, v = p.getY(i); p.setZ(i, Math.sin(u * 26) * .035 * ( .6 + ( 1.55 - v ) * .18 ) + ( x0 < 0 ? -u : u ) * .02 * ( 1.55 - v ) * .5) } g.computeVertexNormals(); return g.translate(x0, 1.76, ZB + .26) }
	const velvet = new THREE.MeshStandardNodeMaterial({ color: '#552630', roughness: .95, side: THREE.DoubleSide }); velvet.emissiveNode = vec3(new THREE.Color('#552630')).mul(.05).mul(galleryBrightness)
	for (const sx of [ -1, 1 ]) { const c = new THREE.Mesh(curtainGeo(sx * .83), velvet); c.castShadow = false; room.add(c) }

	// --- tapete oriental
	const rug = new THREE.PlaneGeometry(3.7, 2.31); rug.rotateX(-Math.PI / 2); rug.translate(0, .028, .12)
	add(rug, mat({ map: rugTexture(), roughness: 1, color: '#a89a8a' }, .1))

	// --- móveis e objetos (Poly Haven CC0). h = altura final em m; pos = [x, y(base), z]; rot em rad.
	const RW = W - .3 // encostado na parede direita
	const items = [
		// janela: aparador com busto e relógio de lareira
		{ id: 'small_wooden_table_01', h: .78, pos: [ 0, .02, ZB + .3 ], rotY: 0, tint: '#6d4e3d' },
		{ id: 'marble_bust_01', h: .46, pos: [ -.33, .8, ZB + .3 ], rotY: .25 },
		{ id: 'mantel_clock_01', h: .25, pos: [ .3, .8, ZB + .3 ], rotY: -.12 },
		// escrivaninha centralizada e mais à frente, virada para o corredor, cadeira atrás
		{ id: 'ClassicConsole_01', h: .78, pos: [ 0, .02, .88 ], rotY: 0 },
		{ id: 'dining_chair_02', h: 1.0, pos: [ 0, .02, .2 ], rotY: .1 },
		{ id: 'vintage_oil_lamp', h: .42, pos: [ -.44, .8, .78 ], rotY: 0 },
		{ id: 'brass_candleholders', h: .24, pos: [ .38, .8, .78 ], rotY: .3 },
		// paredes: relógio de pé no meio da parede direita, quadros com vistas do Rio
		{ id: 'vintage_grandfather_clock_01', h: 2.15, pos: [ RW, .02, .15 ], rotY: -Math.PI / 2 },
		{ id: 'fancy_picture_frame_01', h: .66, pos: [ W - .04, 1.95, .88 ], rotY: -Math.PI / 2, hang: true, art: '/textures/set/frame2.webp' },
		{ id: 'fancy_picture_frame_01', h: .85, pos: [ -W + .05, 1.95, .4 ], rotY: Math.PI / 2, hang: true, art: '/textures/set/frame1.webp' },
		{ id: 'ArmChair_01', h: 1.0, pos: [ 1.5, .02, .85 ], rotY: -.8, tint: '#d8c8b0' },
		{ id: 'vintage_suitcase', h: .3, pos: [ -.95, .02, -.4 ], rotY: .4 },
		{ id: 'potted_plant_02', h: 1.1, pos: [ -2.25, .02, 1.0 ], rotY: .6 },
	]
	const mats = new Map()
	const fix = src => { if (mats.has(src)) return mats.get(src); if (/glass/i.test(src.name || '')) { const gm = new THREE.MeshStandardNodeMaterial({ color: '#dfe8e4', roughness: .05, metalness: .1, transparent: true, opacity: .14, depthWrite: false }); mats.set(src, gm); return gm } const m = new THREE.MeshStandardNodeMaterial({ color: src.color, map: src.map, normalMap: src.normalMap, normalScale: new THREE.Vector2(.6, .6), roughness: src.roughnessMap ? 1 : Math.max(.4, src.roughness ?? .7), roughnessMap: src.roughnessMap, metalness: src.metalness ?? 0, metalnessMap: src.metalnessMap, aoMap: src.aoMap, alphaMap: src.alphaMap, transparent: src.transparent, alphaTest: src.alphaTest, side: src.side, emissive: src.emissive, emissiveMap: src.emissiveMap }); if (m.map) m.emissiveNode = texture(m.map).rgb.mul(warm).mul(.09).mul(galleryBrightness); mats.set(src, m); return m }
	const artTex = new Map(); for (const it of items) if (it.art && !artTex.has(it.art)) { const tx = await texLoader.loadAsync(it.art); tx.colorSpace = THREE.SRGBColorSpace; tx.flipY = false; tx.anisotropy = 8; artTex.set(it.art, tx) }
	const artMats = new Map(); const artMat = tx => { if (!artMats.has(tx)) { const m = new THREE.MeshStandardNodeMaterial({ map: tx, roughness: .7, metalness: 0 }); m.emissiveNode = texture(tx).rgb.mul(.04).mul(galleryBrightness); artMats.set(tx, m) } return artMats.get(tx) }
	const tints = new Map(); const tinted = (src, hex) => { const k = src.uuid + hex; if (!tints.has(k)) { const m = fix(src).clone(); m.color = new THREE.Color(hex); m.emissiveNode = m.map ? texture(m.map).rgb.mul(new THREE.Color(hex)).mul(warm).mul(.09).mul(galleryBrightness) : null; tints.set(k, m) } return tints.get(k) }
	const dims = new Map(); const dimmed = src => { if (!dims.has(src)) { const m = fix(src).clone(); m.color = new THREE.Color('#c9c2b4'); m.emissiveNode = m.map ? texture(m.map).rgb.mul(.03).mul(galleryBrightness) : null; dims.set(src, m) } return dims.get(src) }
	const placed = {}, holders = {}
	for (const it of items) {
		const src = await loadModel(it.id); if (!src) continue
		const obj = src.clone(true); obj.traverse(n => { if (n.isMesh) { n.material = ( it.art && /canvas$/i.test(n.material.name || '') ) ? artMat(artTex.get(it.art)) : it.hang ? dimmed(n.material) : it.tint ? tinted(n.material, it.tint) : fix(n.material); n.castShadow = !it.hang; n.receiveShadow = true } })
		obj.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(obj), size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3())
		const s = it.h / size.y; const holder = new THREE.Group(); if (it.hang) obj.position.set(-ctr.x, -ctr.y, -bb.min.z); else obj.position.set(-ctr.x, it.top ? -bb.max.y : -bb.min.y, -ctr.z); holder.add(obj); holder.scale.setScalar(s)
		holder.position.set(...it.pos); holder.rotation.y = it.rotY; room.add(holder); holders[ it.id ] = holder; placed[ it.id ] = { size: size.toArray().map(v => +( v * s ).toFixed(3)), pos: it.pos }
	}
	// registro dos objetos da mesa + API usada pelo painel "Mesa"
	deskObjs.lamp = { label: 'Lâmpada a óleo', grp: holders.vintage_oil_lamp, base: 0, def: { x: -.44, z: .78, rot: 0 } }
	deskObjs.candle = { label: 'Candelabros', grp: holders.brass_candleholders, base: .3, def: { x: .38, z: .78, rot: 0 } }
	const DESK_KEY = 'legado.desk.v1', savedDesk = ( () => { try { return JSON.parse(localStorage.getItem(DESK_KEY)) || {} } catch { return {} } } )()
	const marker = new THREE.Mesh(new THREE.RingGeometry(.075, .09, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: '#ffd27a', transparent: true, opacity: .95, depthTest: false })); marker.renderOrder = 20; marker.visible = false; room.add(marker)
	let current = 'book'
	const apply = k => { const o = deskObjs[ k ]; if (!o || !o.grp) return; const v = o.val; o.grp.position.set(v.x, .8, v.z); o.grp.rotation.y = o.base + v.rot * Math.PI / 180; if (k === current) marker.position.set(v.x, .812, v.z) }
	for (const k of Object.keys(deskObjs)) { const o = deskObjs[ k ]; if (!o.grp) { delete deskObjs[ k ]; continue } o.val = { ...o.def, ...( savedDesk[ k ] || {} ) }; if (!o.grp.parent) room.add(o.grp); apply(k) }
	const desk = {
		setAnimatedPen(on) { if(deskObjs.pen?.grp) deskObjs.pen.grp.visible=!on },
		keys: () => Object.keys(deskObjs), label: k => deskObjs[ k ].label, get: k => ( { ...deskObjs[ k ].val } ),
		set(k, prop, v) { deskObjs[ k ].val[ prop ] = Number(v); apply(k) },
		select(k) { current = k; apply(k) }, marker(on) { marker.visible = !!on },
		save() { try { const out = {}; for (const k of Object.keys(deskObjs)) out[ k ] = { ...deskObjs[ k ].val }; localStorage.setItem(DESK_KEY, JSON.stringify(out)); return true } catch { return false } },
		reset(one) { for (const k of one ? [ one ] : Object.keys(deskObjs)) { deskObjs[ k ].val = { ...deskObjs[ k ].def }; apply(k) } if (!one) try { localStorage.removeItem(DESK_KEY) } catch {} },
		all() { const out = {}; for (const k of Object.keys(deskObjs)) out[ k ] = { ...deskObjs[ k ].val }; return out },
	}
	// luz do dia: foco quente vindo da janela (sem sombra, só direção e cor), acompanha o nicho
	const sun = new THREE.SpotLight('#ffcb8c', 22, 7.5, .75, 1, 1.6); sun.position.set(.15, 2.5, ZB - .5); sun.target.position.set(.4, .3, ZB + 1.8); room.add(sun, sun.target)
	return { room, placed, atlas, sun, desk, chair: holders.dining_chair_02 }
}
























