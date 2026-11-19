import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texture, vec3 } from 'three/tsl';
import { ROOM, arcPts, canvasTex, loadModel, tube, wallPanel } from './PeriodRoom.js';


const WALL = '#28483b';
const WOOD = '#755238';
const WARM = vec3(1, .82, .59);

function random(seed) {
	let state = seed
	return () => ( state = ( Math.imul(state, 1664525) + 1013904223 ) >>> 0 ) / 4294967296
}

function floorTexture() {
	return canvasTex(768, 768, (c, w, h) => {
		const rnd = random(1909), tones = ['#63452f', '#715039', '#5b3e2c', '#79583e', '#674831']
		for (let row = 0; row < 12; row++) {
			const y = row * 64
			c.fillStyle = tones[row % tones.length]; c.fillRect(0, y, w, 64)
			c.fillStyle = '#38281f55'; c.fillRect(0, y + 2, w, 2)
			for (let x = 0; x < w; x += 125 + rnd() * 65) {
				c.fillStyle = '#c49a6940'; c.fillRect(x, y + 4, 1, 56)
				for (let line = 0; line < 5; line++) {
					const yy = y + 8 + rnd() * 48
					c.strokeStyle = rnd() < .5 ? '#3d2c2044' : '#c29b6b35'
					c.lineWidth = .7 + rnd() * 1.2
					c.beginPath(); c.moveTo(x + 3, yy)
					c.bezierCurveTo(x + 28, yy - 4, x + 58, yy + 4, x + 92, yy + (rnd() - .5) * 5)
					c.stroke()
				}
			}
		}
		c.fillStyle = '#261d1770'
		for (let y = 0; y < h; y += 64) c.fillRect(0, y, w, 2)
	}, { repeat: true })
}

function wallTexture() {
	return canvasTex(512, 512, (c, w, h) => {
		const rnd = random(76)
		c.fillStyle = WALL; c.fillRect(0, 0, w, h)
		for (let i = 0; i < 5400; i++) {
			c.fillStyle = rnd() < .5 ? '#071b1422' : '#d7c58a18'
			c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 2)
		}
		for (let y = 32; y < h; y += 68) {
			c.strokeStyle = '#d1b56c25'; c.lineWidth = 1
			c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * .3, y - 4, w * .6, y + 3, w, y - 2); c.stroke()
		}
	}, { repeat: true })
}

function presidentialRugTexture() {
	return canvasTex(768, 512, (c, w, h) => {
		const navy = '#142744', blue = '#24486f', gold = '#c9a65a', lightGold = '#e0c779'
		c.fillStyle = navy; c.fillRect(0, 0, w, h)
		c.strokeStyle = gold; c.lineWidth = 12; c.strokeRect(16, 16, w - 32, h - 32)
		c.strokeStyle = blue; c.lineWidth = 10; c.strokeRect(32, 32, w - 64, h - 64)
		c.strokeStyle = gold; c.lineWidth = 2; c.strokeRect(48, 48, w - 96, h - 96)
		c.fillStyle = blue; c.fillRect(54, 54, w - 108, h - 108)

		const diamond = (x, y, rx, ry, color) => {
			c.fillStyle = color; c.beginPath()
			c.moveTo(x, y - ry); c.lineTo(x + rx, y); c.lineTo(x, y + ry); c.lineTo(x - rx, y)
			c.closePath(); c.fill()
		}
		for (let x = 78; x < w - 78; x += 42) {
			diamond(x, 68, 7, 11, lightGold); diamond(x, h - 68, 7, 11, lightGold)
		}
		for (let y = 104; y < h - 104; y += 42) {
			diamond(68, y, 7, 11, lightGold); diamond(w - 68, y, 7, 11, lightGold)
		}

		const cx = w / 2, cy = h / 2
		c.fillStyle = gold; c.beginPath(); c.ellipse(cx, cy, 176, 112, 0, 0, Math.PI * 2); c.fill()
		c.fillStyle = navy; c.beginPath(); c.ellipse(cx, cy, 158, 96, 0, 0, Math.PI * 2); c.fill()
		c.strokeStyle = lightGold; c.lineWidth = 3; c.beginPath(); c.ellipse(cx, cy, 138, 80, 0, 0, Math.PI * 2); c.stroke()
		diamond(cx, cy, 91, 54, gold); diamond(cx, cy, 74, 42, blue); diamond(cx, cy, 44, 25, lightGold)
		for (let i = 0; i < 8; i++) {
			c.save(); c.translate(cx, cy); c.rotate(i * Math.PI / 4)
			c.fillStyle = gold; c.beginPath(); c.ellipse(0, -68, 7, 20, 0, 0, Math.PI * 2); c.fill()
			c.restore()
		}
	}, {})
}

export async function buildNiloRoom(group, { galleryBrightness }) {
	const { halfW: W, front: ZF, spring: SPRING } = ROOM
	// A abóbada acompanha o vão do portal; acima dele, o arco de pedra atravessa o forro.
	const D = 4.6, ZB = ZF - D, deskZ = -.55
	const room = new THREE.Group(); room.name = 'room-nilo'; group.add(room)
	const add = (geometry, material, { cast = false, recv = true } = {}) => {
		if(material === panelMat || material === sidePanelMat){const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++){const u=uv.getX(i),v=uv.getY(i);if(material === sidePanelMat) uv.setXY(i,v/.32,u/1.18);else uv.setXY(i,u/.32,v/1.18)}}
        const mesh = new THREE.Mesh(geometry, material)
		mesh.castShadow = cast; mesh.receiveShadow = recv; room.add(mesh); return mesh
	}
	const lit = (options, glow = .08) => {
		const material = new THREE.MeshStandardNodeMaterial(options)
		const base = material.map ? texture(material.map).rgb : vec3(material.color)
		material.emissiveNode = base.mul(WARM).mul(glow).mul(galleryBrightness)
		return material
	}
	const floorMap = floorTexture(), wallMap = wallTexture()
	floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping
	floorMap.repeat.set(2.6, 1.5)
	wallMap.wrapS = wallMap.wrapT = THREE.RepeatWrapping
	wallMap.repeat.set(2.4, 1.15)
	const floorMat = lit({ map: floorMap, color: '#bba181', roughness: .88 }, .1)
	const wallMat = lit({ map: wallMap, color: '#ffffff', roughness: .94, side: THREE.DoubleSide })
	const panelMap = canvasTex(512, 512, (c,w,h) => {
        const rnd=random(412); c.fillStyle='#65462f'; c.fillRect(0,0,w,h)
        for(let i=0;i<450;i++){const x=rnd()*w;c.strokeStyle=i%3?'#35231930':'#c2916030';c.lineWidth=.5+rnd();c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x+8,170,x-8,340,x,h);c.stroke()}
        c.fillStyle='#312217';c.fillRect(0,0,3,h);c.fillStyle='#ad805250';c.fillRect(3,0,2,h)
    }, {repeat:true})
    const sidePanelMat = lit({map:panelMap,color:'#ffffff',roughness:1,side:THREE.DoubleSide},.03)
    const panelMat = lit({ map: panelMap, color: '#ffffff', roughness: 1, side: THREE.DoubleSide })

	const floor = new THREE.PlaneGeometry(W * 2, D)
	floor.rotateX(-Math.PI / 2); floor.translate(0, .025, (ZF + ZB) / 2)
	add(floor, floorMat)
	const rug = new THREE.PlaneGeometry(3.8, 3.25)
	rug.rotateX(-Math.PI / 2); rug.translate(0, .045, (ZF + ZB) / 2)
	add(rug, lit({ map: presidentialRugTexture(), color: '#ffffff', roughness: 1 }, .05))
	add(tube([[-W, 0], [-W, SPRING]], ZB, ZF, 1), wallMat)
	add(tube([[W, 0], [W, SPRING]], ZB, ZF, 1), wallMat)
	add(tube(arcPts(0, SPRING, W, Math.PI, 0, 40).reverse(), ZB, ZF, 1), wallMat)
	add(tube([[-W + .025, 0], [-W + .025, 1.18]], ZB, ZF, 1), sidePanelMat)
	add(tube([[W - .025, 0], [W - .025, 1.18]], ZB, ZF, 1), sidePanelMat)
	add(wallPanel([[-W, 0], [W, 0], [W, SPRING], [-W, SPRING]], ZB, 1), wallMat)
	add(wallPanel([[W, SPRING], ...arcPts(0, SPRING, W, 0, Math.PI, 40), [-W, SPRING]], ZB, 1), wallMat)
	add(wallPanel([[-W, 0], [W, 0], [W, 1.18], [-W, 1.18]], ZB + .025, 1), panelMat)

	const trimWoodMat = lit({ color: WOOD, roughness: .48 }, .06)
	const trimGoldMat = lit({ color: '#c9a35c', roughness: .32, metalness: .55 }, .08)
	const centerZ = (ZF + ZB) / 2
	const trimWood = [], trimGold = []
	for (const z of [ZB + .22, centerZ, ZF - .22]) {
		trimWood.push(new THREE.TorusGeometry(W - .04, .035, 6, 40, Math.PI).translate(0, SPRING, z))
		trimGold.push(new THREE.TorusGeometry(W - .14, .009, 4, 40, Math.PI).translate(0, SPRING, z))
	}
	for (const side of [-1, 1]) {
		trimWood.push(new THREE.BoxGeometry(.08, .12, D).translate(side * (W - .04), SPRING - .07, centerZ))
		trimGold.push(new THREE.BoxGeometry(.02, .02, D).translate(side * (W - .105), SPRING - .01, centerZ))
	}
	trimWood.push(new THREE.BoxGeometry(W * 2, .12, .08).translate(0, SPRING - .07, ZB + .04))
	trimGold.push(new THREE.BoxGeometry(W * 2, .02, .025).translate(0, SPRING - .01, ZB + .08))
	add(mergeGeometries(trimWood, false), trimWoodMat, { cast: true })
	add(mergeGeometries(trimGold, false), trimGoldMat)

	const paths = {
		oldBooks: '/models/set/nilo/old-books.glb',
		telephone: '/models/set/nilo/telephone.glb',
		globe: '/models/set/nilo/globe.glb',
		candelabra: '/models/set/nilo/candelabra.glb',
		bookcase: '/models/set/nilo/bookcase.glb',
		desk: '/models/set/nilo/desk.glb',
		chair: '/models/set/nilo/chair.glb',
		grandfatherClock: '/models/set/nilo/grandfather_clock.glb',
		plant: '/models/set/nilo/monstera.glb',
		sideboard: '/models/set/nilo/victorian-sideboard.glb',

		sconce: '/models/set/nilo/sconce.glb',
	}
	const loaded = await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await loadModel(path)]))
	for (const [name, model] of loaded) {
		if (!model) throw new Error(`Não foi possível carregar o asset de Nilo: ${name}`)
	}
	const assets = Object.fromEntries(loaded)

	const materials = new Map()
	const fixMaterial = source => {
		if (materials.has(source)) return materials.get(source)
		const material = new THREE.MeshStandardNodeMaterial({
			color: source.color, map: source.map, normalMap: source.normalMap,
			normalScale: new THREE.Vector2(.6, .6),
			roughness: source.roughnessMap ? 1 : Math.max(.45, source.roughness ?? .7),
			roughnessMap: source.roughnessMap, metalness: source.metalness ?? 0,
			metalnessMap: source.metalnessMap, aoMap: source.aoMap, alphaMap: source.alphaMap,
			transparent: source.transparent, opacity: source.opacity, depthWrite: source.depthWrite, alphaTest: source.alphaTest, side: source.side,
			emissive: source.emissive, emissiveMap: source.emissiveMap,
		})
		if (material.map) material.emissiveNode = texture(material.map).rgb.mul(WARM).mul(.08).mul(galleryBrightness)
		materials.set(source, material)
		return material
	}
	const editable = {}, tabletop = {};
	const place = (source, height, position, rotY = 0, parent = null) => {
		const model = source.clone(true)
		model.traverse(node => {
			if (!node.isMesh) return
			node.material = Array.isArray(node.material) ? node.material.map(fixMaterial) : fixMaterial(node.material)
			node.castShadow = true; node.receiveShadow = true
		})
		model.updateMatrixWorld(true)
		const bounds = new THREE.Box3().setFromObject(model)
		const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3())
		if (!Number.isFinite(size.y) || size.y <= 0) throw new Error(`Asset de Nilo sem altura válida: ${source.name}`)
		model.position.set(-center.x, -bounds.min.y, -center.z)
		const holder = new THREE.Group(); holder.add(model)
		holder.scale.setScalar(height / size.y)
		holder.position.set(...position); holder.rotation.y = rotY; room.add(holder)
		if (parent) parent.attach(holder)
		const key = Object.keys(assets).find(k => assets[k] === source) || 'objeto'; const id = key in editable ? key + '2' : key; editable[id] = holder; if (parent) tabletop[id] = holder; return holder
	}

	place(assets.bookcase, 2.45, [-W + .42, .02, ZB + 1.65], Math.PI / 2)
	place(assets.bookcase, 2.45, [-W + .42, .02, ZF - 1.1], Math.PI / 2)
	const writingDesk = place(assets.desk, .78, [0, .02, deskZ], Math.PI / 2)
	const wristTargets = [1,-1].map(side => {
		const target = new THREE.Object3D()
		target.position.set(side*.22,.80,deskZ-.68)
		room.add(target)
		writingDesk.attach(target)
		return target
	})
	const walnut = lit({color:'#563620',roughness:.65})
	const leather = lit({color:'#263b32',roughness:.84})
	const brass = lit({color:'#ad8550',roughness:.55,metalness:.35})
	const paper = lit({color:'#e9d9b4',roughness:1})
	const ink = lit({color:'#302724',roughness:.8})
	const glass = lit({color:'#263339',roughness:.28})
	const box = (w,h,d,x,y,z,material) => add(new THREE.BoxGeometry(w,h,d).translate(x,y,z),material)
	const tabletopItem = (id, parent, ...items) => {
		const pivot = new THREE.Group()
		const bounds = new THREE.Box3()
		for (const item of items) bounds.union(new THREE.Box3().setFromObject(item))
		bounds.getCenter(pivot.position)
		room.add(pivot)
		for (const item of items) pivot.attach(item)
		parent.attach(pivot)
		editable[id] = tabletop[id] = pivot
	}
	const handwriting = canvasTex(256, 192, (c,w,h) => {
		c.fillStyle='#e5d3aa'; c.fillRect(0,0,w,h)
		c.strokeStyle='#594735'; c.lineWidth=1.6
		const rnd=random(1909)
		for(let y=26;y<h-19;y+=13) {
			c.beginPath(); c.moveTo(23,y)
			for(let x=24;x<w-25-(y%3)*14;x+=4) c.lineTo(x,y+(rnd()-.5)*6)
			c.stroke()
		}
	})
	const letter = (x,y,z,angle) => add(new THREE.PlaneGeometry(.29,.21)
		.rotateX(-Math.PI/2).rotateY(angle).translate(x,y,z),lit({map:handwriting,roughness:1},.055))
	const inkwell = add(new THREE.CylinderGeometry(.053,.062,.062,12).translate(.33,.839,deskZ-.17),glass)
	const cap = add(new THREE.CylinderGeometry(.028,.035,.018,12).translate(.33,.879,deskZ-.17),brass)
	tabletopItem('blotter',writingDesk,box(.76,.012,.43,0,.807,deskZ,leather))
	tabletopItem('papers',writingDesk,box(.24,.014,.16,-.11,.821,deskZ+.08,paper))
	tabletopItem('letter1',writingDesk,letter(-.07,.832,deskZ+.02,-.15))
	tabletopItem('letter2',writingDesk,letter(.14,.821,deskZ-.045,.19))
	tabletopItem('pen',writingDesk,add(new THREE.CylinderGeometry(.006,.008,.21,10).rotateZ(Math.PI/2).rotateY(.3).translate(.24,.832,deskZ+.12),ink))
	tabletopItem('inkwell',writingDesk,inkwell,cap)
	place(assets.telephone, .25, [-.51,.8,deskZ-.04], .28, writingDesk)
	place(assets.globe, .35, [.51,.8,deskZ+.07], -.15, writingDesk)
	place(assets.candelabra, .39, [.40,.8,deskZ-.25], .13, writingDesk)

	const seat = place(assets.chair, 1.15, [0, .02, deskZ - 1.1])
	const chairModel = seat.children[0]
	const chairShape = new THREE.Group()
	seat.add(chairShape)
	chairShape.add(chairModel)
	place(assets.grandfatherClock, 2.26, [W - .34, .025, ZB + 1.35], -Math.PI / 2)

	const cabinetHeight = .91, cabinetZ = -.38
	const cabinet = place(assets.sideboard, cabinetHeight, [W-.36,.025,cabinetZ], -Math.PI/2)
	place(assets.plant, 1.11, [W-.64,.025,.83], -.25)
	place(assets.oldBooks, .24, [W-.43,.695,cabinetZ+.04], -Math.PI/2, cabinet)

	const map = new THREE.Group()
	map.position.set(W-.047,1.79,cabinetZ)
	map.rotation.y=-Math.PI/2
	room.add(map)
	editable.framedMap=map
	const mapTexture=await new THREE.TextureLoader().loadAsync('/models/set/nilo/mapa-brasil-1909.png')
	mapTexture.colorSpace=THREE.SRGBColorSpace
	mapTexture.anisotropy=8
	const mapW=1.43,mapH=mapW*2/3
	map.add(add(new THREE.PlaneGeometry(mapW,mapH).translate(0,0,.022),lit({map:mapTexture,roughness:1},.12)))
	for(const side of [-1,1]) {
		map.add(box(mapW+.10,.05,.042,0,side*(mapH+.05)/2,0,walnut))
		map.add(box(.05,mapH,.042,side*(mapW+.05)/2,0,0,walnut))
		map.add(box(mapW+.018,.009,.012,0,side*(mapH+.009)/2,.024,brass))
		map.add(box(.009,mapH,.012,side*(mapW+.009)/2,0,.024,brass))
	}

	const flag = new THREE.Group()
	flag.position.set(0, 2.03, ZB + .12)
	room.add(flag)
	editable.wallFlag = flag
	const flagMap = await new THREE.TextureLoader().loadAsync('/models/set/nilo/brasil.png')
	flagMap.colorSpace = THREE.SRGBColorSpace
	flagMap.anisotropy = 8
	const cloth = new THREE.PlaneGeometry(2.35, 1.645, 64, 40)
	const positions = cloth.attributes.position
	for (let i = 0; i < positions.count; i++) {
		const x = positions.getX(i), y = positions.getY(i)
		const u = x / 2.35 + .5, v = y / 1.645 + .5
		const sag = .075 * Math.sin(Math.PI * u)
		const fold = (.02 + .04 * (1 - v)) * Math.sin(u * 23 + v * 1.8)
		positions.setXYZ(i, x, y - sag, fold)
	}
	cloth.computeVertexNormals()
	flag.add(add(cloth, lit({ map: flagMap, color: '#ebdfca', side: THREE.DoubleSide, roughness: 1 }, .025), { cast: true }))

	const lampLeft = place(assets.sconce, .32, [-1.65, 1.9, ZB + .16])
	const lampRight = place(assets.sconce, .32, [1.65, 1.9, ZB + .16])

	const keyLight = new THREE.SpotLight('#ffd29a', 14, 11, .82, .82, 1.5)
	keyLight.position.set(0, 3.55, deskZ + .25); keyLight.target.position.set(0, .7, deskZ - .35)
	room.add(keyLight, keyLight.target)
    // Brilho somente visual: sem luz pontual nem contribuição no ambiente.
    for(const lamp of [lampLeft,lampRight]) lamp.traverse(node=>{
        if(!node.isMesh)return
        const finish=m=>{
            if(m.color.r>.6 && Math.abs(m.color.r-m.color.g)<.04 && Math.abs(m.color.g-m.color.b)<.04){
                return new THREE.MeshBasicNodeMaterial({color:new THREE.Color(3,2.85,2.55),side:m.side})
            }
            const matte=m.clone();matte.roughness=1;matte.metalness=0;matte.envMapIntensity=0;return matte
        }
        node.material=Array.isArray(node.material)?node.material.map(finish):finish(node.material)
    })

    const storageKey = 'legado.nilo.objects.v1'
    const defaults = {}, values = {}
    const poseLabels = {
        handLeft:'Mão esquerda', handRight:'Mão direita',
        elbowLeft:'Cotovelo esquerdo', elbowRight:'Cotovelo direito',
    }
    const labels = {nilo:'Nilo Peçanha',oldBooks:'Livros do aparador',telephone:'Telefone',globe:'Globo',candelabra:'Candelabro',blotter:'Mata-borrão',papers:'Pilha de papéis',letter1:'Carta 1',letter2:'Carta 2',pen:'Pena',inkwell:'Tinteiro',bookcase:'Estante original',bookcase2:'Estante duplicada',desk:'Escrivaninha',chair:'Cadeira',grandfatherClock:'Relógio de chão',wallFlag:'Bandeira de parede',framedMap:'Mapa emoldurado',plant:'Costela-de-adão',sideboard:'Aparador',sconce:'Luminária esquerda',sconce2:'Luminária direita'}
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(storageKey)) || {} } catch {}
    const anchors = {}
    for (const [key, item] of Object.entries(tabletop)) {
        anchors[key] = { position: item.position.clone(), rotation: item.rotation.clone(), scale: item.parent.scale.x }
    }
    let chairFitted = false
    const applyChairShape = () => {
        const {chairWidth,chairHeight,chairDepth} = values.chair
        chairShape.scale.set(chairWidth,chairHeight,chairDepth)
    }
    const finishChairFit = () => {
        chairFitted = true
        applyChairShape()
    }
    const apply = k => {
        const o = editable[k], v = values[k]
        if (!o) return
        const anchor = anchors[k]
        if (anchor) {
            o.position.copy(anchor.position).addScaledVector(new THREE.Vector3(v.x,v.y,v.z),1/anchor.scale)
            o.rotation.set(anchor.rotation.x+v.rx*Math.PI/180,anchor.rotation.y+v.rot*Math.PI/180,anchor.rotation.z+v.rz*Math.PI/180)
        } else {
            o.position.set(v.x,v.y,v.z)
            o.rotation.set(v.rx*Math.PI/180,v.rot*Math.PI/180,v.rz*Math.PI/180)
        }
        o.scale.setScalar(defaults[k].baseScale*v.size)
        if (k === 'chair' && chairFitted) applyChairShape()
    }
    const initObject = (k,o) => {
        defaults[k]={x:o.position.x,y:o.position.y,z:o.position.z,rx:o.rotation.x*180/Math.PI,rot:o.rotation.y*180/Math.PI,rz:o.rotation.z*180/Math.PI,size:1,baseScale:o.scale.x}
        if (k === 'nilo') defaults[k].handHeight = .065
        if (k === 'chair') Object.assign(defaults[k],{chairWidth:1,chairHeight:1,chairDepth:1})
        if (anchors[k]) Object.assign(defaults[k],{x:0,y:0,z:0,rx:0,rot:0,rz:0});
        values[k]={...defaults[k],...saved[k]}; apply(k)
    }
    for (const [key, object] of Object.entries(editable)) initObject(key, object)
    const addCharacterToEditor = object => {
        editable.nilo = object
        anchors.nilo = { position: object.position.clone(), rotation: object.rotation.clone(), scale: object.parent.scale.x }
        initObject('nilo', object)
    }
    for (const key of Object.keys(poseLabels)) {
        defaults[key] = key.startsWith('hand') ? {x:0,y:0,z:0,rx:0,rot:0,rz:0} : {x:0,y:0,z:0,armBend:0}
        values[key] = {...defaults[key],...saved[key]}
    }
    const chairSpec = [
        ['chairWidth','Largura da cadeira',.5,2,.01,'×'],
        ['chairHeight','Altura da cadeira',.5,2,.01,'×'],
        ['chairDepth','Profundidade da cadeira',.5,2,.01,'×'],
    ]
    const desk = {
        meta:{title:'Nilo · objetos',spec:[['x','Esquerda ↔ direita',-2.5,2.5,.01,'m'],['y','Altura',0,4,.01,'m'],['z','Frente ↔ fundo',ZB+.05,ZF,.01,'m'],['rot','Giro horizontal',-180,180,1,'°'],['rx','Inclinação X',-180,180,1,'°'],['rz','Inclinação Z',-180,180,1,'°'],['size','Tamanho',.1,3,.01,'×'], ...chairSpec, ['handHeight','Altura das mãos sobre a mesa',0,.22,.005,'m'], ['armBend','Flexão do braço',0,130,1,'°']], override(key) {
            if (Object.hasOwn(poseLabels,key)) {
                const axes = {
                    x:{label:'Deslocamento lateral',min:-.30,max:.30,step:.005,unit:'m'},
                    y:{label:'Altura relativa',min:-.20,max:.20,step:.005,unit:'m'},
                    z:{label:'Frente ↔ fundo',min:-.30,max:.30,step:.005,unit:'m'},
                }
                if (key.startsWith('hand')) {
                    const rotation = (label,min,max) => ({label,min,max,step:1,unit:'°'})
                    return {...axes,rx:rotation('Inclinar a mão',-80,80),rot:rotation('Giro horizontal da mão',-100,100),rz:rotation('Virar a palma',-180,180)}
                }
                return {...axes,armBend:{label:'Flexão do braço',min:0,max:130,step:1,unit:'°'}}
            }
            const labels = key === 'nilo' ? {x:'Esquerda ↔ direita',y:'Altura na cadeira',z:'Frente ↔ fundo'} : {x:'Deslocamento X no tampo',y:'Altura relativa ao tampo',z:'Deslocamento Z no tampo'}
            const spec = this.spec.filter(([axis]) =>
                (key === 'chair' || !axis.startsWith('chair')) && (key === 'nilo' || axis !== 'handHeight') && axis !== 'armBend'
            )
            return Object.fromEntries(spec.map(([axis,label,min,max,step,unit]) => [
                axis, anchors[key] && Object.hasOwn(labels,axis) ? {label:labels[axis],min:-.7,max:.7,step:.005,unit} : {label,min,max,step,unit}
            ]))
        }},
        keys:()=>[...Object.keys(editable),...Object.keys(poseLabels)],label:k=>labels[k]||poseLabels[k]||k,get:k=>({...values[k]}),select(){},marker(){},
        set(k,p,v){values[k][p]=Number(v);apply(k)},
        save(){try{localStorage.setItem(storageKey,JSON.stringify(values));return true}catch{return false}},
        reset(k){for(const id of k?[k]:Object.keys(values)){values[id]={...defaults[id]};apply(id)}if(!k)localStorage.removeItem(storageKey)},
        all:()=>structuredClone(values)
    }
	return { room, seat, chairModel, wristTargets, getLimbOffset: key => values[key], getHandHeight: () => values.nilo.handHeight, readingTarget: editable.letter1, desk, addCharacterToEditor, finishChairFit, walkMaxX: () => Math.abs(group.position.x) - ZB - .35, sun: keyLight }
}
