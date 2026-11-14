import * as THREE from 'three/webgpu'
import { float, color, mix, step } from 'three/tsl'

// Paleta em textura (Messenger `tColors`, Bruno `palette.png`, Kenney `colormap.png`):
// cada cor do preset vira uma COLUNA; cada coluna tem 4 LINHAS de variação pintadas à mão por regra:
//   0 = base · 1 = mais clara e quente · 2 = mais escura e fria · 3 = dessaturada
// Modelos apontam o UV para a célula → 1 material para tudo, e trocar a paleta = trocar 1 textura.
// (Para pintar à mão: exporte `palette.toPNG()` no console, edite e carregue no lugar.)
export const PALETTE_ROWS = 4

export class Palette {

	constructor( palette ) {

		// achata o preset: strings viram colunas; listas (leaves) viram name0, name1…
		this.names = []
		const colors = []
		for ( const [ key, value ] of Object.entries( palette ) ) {

			const list = Array.isArray( value ) ? value : [ value ]
			list.forEach( ( hex, i ) => {

				if ( typeof hex !== 'string' ) return
				this.names.push( Array.isArray( value ) ? key + i : key )
				colors.push( new THREE.Color( hex ) )

			} )

		}

		this.columns = this.names.length
		const data = new Uint8Array( this.columns * PALETTE_ROWS * 4 )
		const variants = ( c ) => {

			// regras em HSL (sRGB): luz quente, sombra fria — a mesma regra da sombra colorida
			const hsl = {}
			c.getHSL( hsl, THREE.SRGBColorSpace )
			const mk = ( dh, ds, dl ) => new THREE.Color().setHSL(
				THREE.MathUtils.euclideanModulo( hsl.h + dh, 1 ), THREE.MathUtils.clamp( hsl.s + ds, 0, 1 ), THREE.MathUtils.clamp( hsl.l + dl, 0, 1 ), THREE.SRGBColorSpace
			)
			return [ c, mk( - 0.012, 0.03, 0.055 ), mk( 0.02, 0.02, - 0.07 ), mk( 0, - 0.12, 0.01 ) ]

		}

		colors.forEach( ( c, x ) => {

			variants( c ).forEach( ( v, y ) => {

				const k = ( y * this.columns + x ) * 4
				const rgb = v.getRGB( {}, THREE.SRGBColorSpace )
				data[ k ] = Math.round( rgb.r * 255 )
				data[ k + 1 ] = Math.round( rgb.g * 255 )
				data[ k + 2 ] = Math.round( rgb.b * 255 )
				data[ k + 3 ] = 255

			} )

		} )

		this.texture = new THREE.DataTexture( data, this.columns, PALETTE_ROWS, THREE.RGBAFormat, THREE.UnsignedByteType )
		this.texture.colorSpace = THREE.SRGBColorSpace
		this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter
		this.texture.generateMipmaps = false
		this.texture.needsUpdate = true
		this.data = data

	}

	index( name ) {

		const i = this.names.indexOf( name )
		if ( i < 0 ) throw new Error( `Palette: cor "${ name }" não existe (${ this.names.join( ', ' ) })` )
		return i

	}

	// UV do centro da célula (para atributos de geometria)
	uv( name, row = 0 ) {

		return [ ( this.index( name ) + 0.5 ) / this.columns, ( row + 0.5 ) / PALETTE_ROWS ]

	}

	// cor de uma célula como CONSTANTE (linear) — mesma cor da textura, sem leitura
	cell( name, row = 0 ) {

		const k = ( row * this.columns + this.index( name ) ) * 4
		return color( new THREE.Color().setRGB( this.data[ k ] / 255, this.data[ k + 1 ] / 255, this.data[ k + 2 ] / 255, THREE.SRGBColorSpace ) )

	}

	// cor (nó TSL, linear) de uma coluna; `row` pode ser número ou nó (0..3, arredondado para a célula).
	// Sem leitura de textura: as 4 linhas viram constantes escolhidas por step (o terreno pedia ~15 leituras da paleta por pixel)
	sample( name, row = 0 ) {

		if ( typeof row === 'number' ) return this.cell( name, Math.min( PALETTE_ROWS - 1, Math.max( 0, Math.floor( row ) ) ) )
		const r = float( row ).floor()
		const c = this.cell( name, 0 ).toVar()
		for ( let i = 1; i < PALETTE_ROWS; i ++ ) c.assign( mix( c, this.cell( name, i ), step( i - 0.5, r ) ) )
		return c

	}

	// PNG da paleta ampliada (8 px por célula) — para editar num programa de pintura
	toPNG( cell = 8 ) {

		const canvas = document.createElement( 'canvas' )
		canvas.width = this.columns * cell
		canvas.height = PALETTE_ROWS * cell
		const ctx = canvas.getContext( '2d' )
		for ( let y = 0; y < PALETTE_ROWS; y ++ ) for ( let x = 0; x < this.columns; x ++ ) {

			const k = ( y * this.columns + x ) * 4
			ctx.fillStyle = `rgb(${ this.data[ k ] },${ this.data[ k + 1 ] },${ this.data[ k + 2 ] })`
			ctx.fillRect( x * cell, y * cell, cell, cell )

		}

		return canvas.toDataURL( 'image/png' )

	}

}
