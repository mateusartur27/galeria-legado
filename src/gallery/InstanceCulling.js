import * as THREE from 'three/webgpu';

// Culling por instância: os objetos do corredor (lustres, vasos, estátuas, vigas, paredes de cada baia) são InstancedMesh — o motor desenha o bloco inteiro
// mesmo que só uma baia apareça. Aqui cada instância é testada contra o campo de visão da câmera e só as visíveis entram no desenho (mesh.count).
// Os objetos continuam existindo; só custam quando você olha para eles.
const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sphere = new THREE.Sphere();

export class InstanceCuller {

	constructor() { this.items = new Map(); this.cam = new Float32Array( 9 ); this.dirty = true }

	// registra os InstancedMesh da cena que seguem o padrão de nome
	register( scene, pattern = /^(gallery|asset)-/ ) {

		for ( const m of scene.children ) {

			if ( ! m.isInstancedMesh || this.items.has( m ) || ! pattern.test( m.name ) ) continue
			if ( ! m.geometry.boundingSphere ) m.geometry.computeBoundingSphere()
			m.frustumCulled = false // quem decide é este culler (a esfera em cache do motor ficaria velha ao mudar o count)
			this.items.set( m, { src: new Float32Array( 0 ), n: 0, hidden: false } )

		}

	}

	// chamar ANTES dos donos atualizarem as instâncias: devolve o count completo (o culling o reduz a cada quadro)
	restore() { for ( const [ m, it ] of this.items ) if ( it.fullN != null ) m.count = it.fullN }

	// chamar logo depois que os donos atualizam as matrizes das instâncias: guarda a lista completa
	capture() {

		for ( const [ m, it ] of this.items ) {

			const n = m.count
			if ( it.src.length < n * 16 ) it.src = new Float32Array( n * 16 )
			it.src.set( m.instanceMatrix.array.subarray( 0, n * 16 ) )
			it.n = n; it.fullN = n

		}
		this.dirty = true

	}

	apply( camera ) {

		const e = camera.matrixWorld.elements, c = this.cam
		const key = [ e[ 12 ], e[ 13 ], e[ 14 ], e[ 0 ], e[ 2 ], e[ 4 ], e[ 6 ], camera.fov, camera.aspect ]
		for ( let i = 0; i < 9; i ++ ) if ( Math.abs( key[ i ] - c[ i ] ) > 1e-5 ) { this.dirty = true; c[ i ] = key[ i ] }
		if ( ! this.dirty ) return
		this.dirty = false

		camera.updateMatrixWorld()
		pv.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse )
		frustum.setFromProjectionMatrix( pv )

		for ( const [ m, it ] of this.items ) {

			const src = it.src, dst = m.instanceMatrix.array, bs = m.geometry.boundingSphere, r0 = bs.radius, cx = bs.center.x, cy = bs.center.y, cz = bs.center.z
			let k = 0
			for ( let i = 0; i < it.n; i ++ ) {

				const o = i * 16
				const sx = Math.hypot( src[ o ], src[ o + 1 ], src[ o + 2 ] ), sy = Math.hypot( src[ o + 4 ], src[ o + 5 ], src[ o + 6 ] ), sz = Math.hypot( src[ o + 8 ], src[ o + 9 ], src[ o + 10 ] )
				const s = Math.max( sx, sy, sz )
				if ( s === 0 ) continue // instância desligada (escala 0)
				// centro da esfera no mundo = M · centro local
				sphere.center.set(
					src[ o ] * cx + src[ o + 4 ] * cy + src[ o + 8 ] * cz + src[ o + 12 ],
					src[ o + 1 ] * cx + src[ o + 5 ] * cy + src[ o + 9 ] * cz + src[ o + 13 ],
					src[ o + 2 ] * cx + src[ o + 6 ] * cy + src[ o + 10 ] * cz + src[ o + 14 ] )
				sphere.radius = r0 * s
				if ( ! frustum.intersectsSphere( sphere ) ) continue
				if ( k !== i ) dst.set( src.subarray( o, o + 16 ), k * 16 )
				k ++

			}
			m.count = k
			m.instanceMatrix.needsUpdate = true
			// sem nada visível: nem entra na fila de desenho (não mexe em quem já estava escondido pelo dono)
			if ( k === 0 ) { if ( m.visible ) { m.visible = false; it.hidden = true } } else if ( it.hidden ) { m.visible = true; it.hidden = false }

		}

	}

}
