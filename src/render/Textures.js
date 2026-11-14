import * as THREE from 'three/webgpu'
import { rng, clamp } from '../core/utils.js'

// Textura de ruído RGBA tileável (como os "noises" do Messenger/Bruno): cada canal uma escala.
// Amostrar no shader com coordenadas de mundo → detalhe sem polígonos.
export function createNoiseTexture( size = 256, seed = 1 ) {

	const random = rng( seed )
	const data = new Uint8Array( size * size * 4 )
	const periods = [ 4, 8, 16, 32 ]
	const lattices = periods.map( ( p ) => {

		const l = new Float32Array( p * p )
		for ( let i = 0; i < l.length; i ++ ) l[ i ] = random()
		return l

	} )

	const fade = ( t ) => t * t * t * ( t * ( t * 6 - 15 ) + 10 )

	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			for ( let c = 0; c < 4; c ++ ) {

				// fBm de value noise periódico: canal c começa no período c
				let v = 0, amp = 0.5, norm = 0
				for ( let o = 0; o < 3; o ++ ) {

					const pi = Math.min( c + o, periods.length - 1 )
					const p = periods[ pi ]
					const fx = ( x / size ) * p, fy = ( y / size ) * p
					const x0 = Math.floor( fx ), y0 = Math.floor( fy )
					const tx = fade( fx - x0 ), ty = fade( fy - y0 )
					const L = lattices[ pi ]
					const a = L[ ( y0 % p ) * p + ( x0 % p ) ], b = L[ ( y0 % p ) * p + ( ( x0 + 1 ) % p ) ]
					const d = L[ ( ( y0 + 1 ) % p ) * p + ( x0 % p ) ], e = L[ ( ( y0 + 1 ) % p ) * p + ( ( x0 + 1 ) % p ) ]
					v += ( ( a + ( b - a ) * tx ) * ( 1 - ty ) + ( d + ( e - d ) * tx ) * ty ) * amp
					norm += amp
					amp *= 0.5

				}

				data[ ( y * size + x ) * 4 + c ] = Math.round( clamp( v / norm, 0, 1 ) * 255 )

			}

		}

	}

	const texture = new THREE.DataTexture( data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType )
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping
	texture.magFilter = THREE.LinearFilter
	texture.minFilter = THREE.LinearMipmapLinearFilter
	texture.generateMipmaps = true
	texture.needsUpdate = true
	return texture

}

// LUT 3D de grading gerada por código (sem Photoshop): contraste, saturação e split-toning.
// Usada depois do tone mapping (espaço sRGB), como LUTs .cube.
export function createGradeLUT( grade, size = 32 ) {

	const data = new Uint8Array( size * size * size * 4 )
	const sh = new THREE.Color( grade.shadows ?? '#000000' ).convertLinearToSRGB()
	const hi = new THREE.Color( grade.highlights ?? '#ffffff' ).convertLinearToSRGB()
	const contrast = grade.contrast ?? 1, saturation = grade.saturation ?? 1, split = grade.split ?? 0

	let i = 0
	for ( let b = 0; b < size; b ++ ) {

		for ( let g = 0; g < size; g ++ ) {

			for ( let r = 0; r < size; r ++ ) {

				let cr = r / ( size - 1 ), cg = g / ( size - 1 ), cb = b / ( size - 1 )

				cr = ( cr - 0.5 ) * contrast + 0.5
				cg = ( cg - 0.5 ) * contrast + 0.5
				cb = ( cb - 0.5 ) * contrast + 0.5

				const l = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb
				cr = l + ( cr - l ) * saturation
				cg = l + ( cg - l ) * saturation
				cb = l + ( cb - l ) * saturation

				const ws = ( 1 - l ) * ( 1 - l ) * split, wh = l * l * split
				cr += ( sh.r - l ) * ws + ( hi.r - l ) * wh
				cg += ( sh.g - l ) * ws + ( hi.g - l ) * wh
				cb += ( sh.b - l ) * ws + ( hi.b - l ) * wh

				data[ i ++ ] = Math.round( clamp( cr, 0, 1 ) * 255 )
				data[ i ++ ] = Math.round( clamp( cg, 0, 1 ) * 255 )
				data[ i ++ ] = Math.round( clamp( cb, 0, 1 ) * 255 )
				data[ i ++ ] = 255

			}

		}

	}

	const texture = new THREE.Data3DTexture( data, size, size, size )
	texture.format = THREE.RGBAFormat
	texture.type = THREE.UnsignedByteType
	texture.minFilter = texture.magFilter = THREE.LinearFilter
	texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping
	texture.unpackAlignment = 1
	texture.needsUpdate = true
	return texture

}

// Matcap gerado por código (Bruno 2019 usa imagens pintadas; aqui a "esfera iluminada" é calculada):
// luz principal quente no alto à esquerda, preenchimento colorido (luz do chão) embaixo, rim e brilho de plástico.
// Neutro/claro → multiplicado pela cor de cada material (1 textura serve para tudo).
export function createMatcapTexture( { key = '#fff4e6', fill = '#ff9a5c', rim = '#ffe2c4', spec = 0.5, ambient = 0.3 } = {}, size = 256 ) {

	const K = new THREE.Color( key ), F = new THREE.Color( fill ), R = new THREE.Color( rim )
	const L = new THREE.Vector3( - 0.45, 0.65, 0.62 ).normalize() // luz principal (espaço de visão)
	const H = new THREE.Vector3( 0, 0, 1 ).add( L ).normalize()
	const data = new Uint8Array( size * size * 4 )
	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const nx = ( x + 0.5 ) / size * 2 - 1, ny = ( y + 0.5 ) / size * 2 - 1
			const r2 = Math.min( nx * nx + ny * ny, 1 )
			const nz = Math.sqrt( 1 - r2 )
			const ndl = nx * L.x + ny * L.y + nz * L.z
			const wrap = clamp( ( ndl + 0.35 ) / 1.35, 0, 1 ) // difuso "embrulhado" = macio
			const key2 = wrap * wrap * ( 3 - 2 * wrap )
			const down = clamp( - ny * 0.8 + 0.1, 0, 1 ) * ( 1 - key2 ) // preenchimento vindo de baixo
			const rimK = Math.pow( 1 - nz, 3 ) * 0.5
			const ndh = Math.max( 0, nx * H.x + ny * H.y + nz * H.z )
			const sp = Math.pow( ndh, 60 ) * spec + Math.pow( ndh, 12 ) * spec * 0.15
			const i = ( y * size + x ) * 4
			const c = ( k ) => clamp( ambient + K[ k ] * key2 * ( 1 - ambient ) + F[ k ] * down * 0.55 + R[ k ] * rimK + sp, 0, 1 )
			data[ i ] = Math.round( c( 'r' ) * 255 )
			data[ i + 1 ] = Math.round( c( 'g' ) * 255 )
			data[ i + 2 ] = Math.round( c( 'b' ) * 255 )
			data[ i + 3 ] = 255

		}

	}

	const texture = new THREE.DataTexture( data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType )
	texture.magFilter = texture.minFilter = THREE.LinearFilter
	texture.needsUpdate = true
	return texture

}

// Rampas pintadas (Summer Afternoon): cada linha = gradiente sombra→luz de um material.
// rows: [ [ [pos, '#hex'], [pos, '#hex'], ... ], ... ]  → amostrar em vec2(luz, (linha + .5) / rows.length)
export function createRampTexture( rows, width = 128 ) {

	const canvas = document.createElement( 'canvas' )
	canvas.width = width
	canvas.height = rows.length
	const ctx = canvas.getContext( '2d' )
	rows.forEach( ( stops, y ) => {

		const gradient = ctx.createLinearGradient( 0, 0, width, 0 )
		for ( const [ pos, hex ] of stops ) gradient.addColorStop( pos, hex )
		ctx.fillStyle = gradient
		ctx.fillRect( 0, y, width, 1 )

	} )

	const texture = new THREE.CanvasTexture( canvas )
	texture.colorSpace = THREE.SRGBColorSpace
	texture.magFilter = THREE.LinearFilter
	texture.minFilter = THREE.LinearFilter
	texture.generateMipmaps = false
	texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
	return texture

}
