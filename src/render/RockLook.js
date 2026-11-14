import { texture, vec2, vec3, float, mix, smoothstep, step, fract, abs, fwidth, max, min } from 'three/tsl'

// Pedra no desenho do Messenger (prints do jogo): creme quase chapado, traços curtos e quebrados (curvas de nível de um ruído,
// achatadas na vertical → quase horizontais, cortadas em pedaços por outro ruído), manchas verticais escuras e suaves de
// escorrido nas faces íngremes e grama em manchas recortadas (com pintinhas) no que olha para cima.
// p = posição no mundo (vec3), nW = normal no mundo, base = cor da pedra, ink/grass = cores, noise = textura de ruído (rgba).
// Custo: 9 leituras da textura (a 1ª versão fazia 18 e custava ~0,8 ms com a serra enchendo a tela) — os canais r/g/b/a de
// uma mesma leitura servem a efeitos diferentes.
export function messengerRock( { p, nW, base, ink, grass, noise, strokes = 1, moss = 1 } ) {

	const up = nW.y
	const col = vec3( base ).toVar()
	const flat = abs( up )
	// "3D" com 2 leituras (xz no chão, zy na parede), só onde precisa de traço contínuo
	const tri = ( q, off ) => mix( texture( noise, vec2( q.z, q.y ).add( off ) ), texture( noise, vec2( q.x, q.z ).add( off ) ), flat )
	// "3D" barato com 1 leitura (o y desloca o plano xz) para máscaras
	const one = ( s, off ) => texture( noise, p.xz.mul( s ).add( p.y.mul( s * 0.7 ) ).add( off ) )

	const big = one( 0.07, 0.3 ) // r: manchas de valor · g: grama (escala grande) · b: comprimento do escorrido
	col.mulAssign( mix( float( 0.95 ), float( 1.04 ), smoothstep( 0.42, 0.58, big.r ) ) )

	// escorridos: faixas verticais largas (ruído só no horizontal) que somem em comprimento; borda macia
	const side = float( 1 ).sub( smoothstep( 0.45, 0.8, flat ) )
	const hs = texture( noise, vec2( p.x.add( p.z ).mul( 0.21 ), p.y.mul( 0.012 ) ) ).g
	const stain = smoothstep( 0.56, 0.7, hs ).mul( smoothstep( 0.35, 0.6, big.b ) ).mul( side )
	col.assign( mix( col, col.mul( 0.78 ), stain.mul( 0.85 ) ) )

	// traços: curvas de nível (2,5 níveis) cortadas em pedaços; rachaduras verticais curtas e raras
	const s = tri( p.mul( vec3( 0.16, 0.55, 0.16 ) ), 0 ) // r: curvas de nível · b: rachaduras (mesma leitura)
	const c = s.r.mul( 2.5 )
	const fw = fwidth( c ).max( 1e-4 )
	const line = smoothstep( float( 0.5 ).sub( fw.mul( 1.1 ) ), float( 0.5 ).sub( fw.mul( 0.35 ) ), abs( fract( c ).sub( 0.5 ) ) )
	const m = one( 0.45, 5.1 ) // g: pedaços dos traços · a: quais rachaduras ficam · r/b: grama fina e pintinhas
	const dash = smoothstep( 0.42, 0.48, m.g )
	const far = float( 1 ).sub( smoothstep( 0.05, 0.12, fw ) ) // some de longe
	const cv = s.b.mul( 3 )
	const fv = fwidth( cv ).max( 1e-4 )
	const crack = smoothstep( float( 0.5 ).sub( fv ), float( 0.5 ).sub( fv.mul( 0.3 ) ), abs( fract( cv ).sub( 0.5 ) ) ).mul( smoothstep( 0.72, 0.76, m.a ) )
	col.assign( mix( col, ink, max( line.mul( dash ), crack ).mul( far ).mul( 0.85 * strokes ) ) )

	// grama por cima: só no que olha para cima, borda recortada em 2 escalas + pintinhas soltas perto da borda
	const v = up.sub( 0.62 ).mul( 2.2 ).add( big.g.sub( 0.5 ).mul( 1.1 ) ).add( m.r.sub( 0.5 ).mul( 0.35 ) )
	const aa = fwidth( v ).max( 1e-4 )
	const mossM = smoothstep( float( 0 ).sub( aa ), aa, v ).mul( moss )
	const specks = step( 0.78, one( 2.6, 7.7 ).b ).mul( smoothstep( - 0.35, - 0.05, v ) ).mul( float( 1 ).sub( mossM ) ).mul( moss )
	return mix( col, grass, min( float( 1 ), mossM.add( specks ) ) )

}
