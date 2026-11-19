import * as THREE from 'three/webgpu'
import { attribute, dot, float, mix, smoothstep, texture, vec3 } from 'three/tsl'
import { UniversalRigTest } from './UniversalRigTest.js'

export class NiloWriting {
	constructor(entry, gltf, seat, height, reference) {
		this.entry = entry
		this.root = gltf.scene
		this.root.getObjectByName('Bandeira do Brasil - corrigida')?.removeFromParent()
		const { sourceHeight, sourceCenter } = reference.normalization
		this.root.position.fromArray(sourceCenter).negate().divideScalar(sourceHeight)
		this.root.scale.setScalar(1 / sourceHeight)
		this.holder = new THREE.Group()
		this.holder.name = 'character-nilo'
		this.holder.add(this.root)
		const bones = new Map(reference.bones.map(record => {
			const bone = new THREE.Bone()
			bone.name = record.name
			bone.position.fromArray(record.position)
			bone.quaternion.fromArray(record.quaternion)
			bone.scale.fromArray(record.scale)
			return [record.name, bone]
		}))
		for (const record of reference.bones) {
			(bones.get(record.parent) ?? this.holder).add(bones.get(record.name))
		}
		const rest = [...bones.values()].map(b => [b,b.position.clone(),b.quaternion.clone(),b.scale.clone()])
		const rig = new UniversalRigTest({
			root:this.root, holder:this.holder,
			rigEditor:{rigRevision:0,bones:[...bones.values()],rest(){for(const [b,p,q,s] of rest){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s)}}}
		})
		// Bind before applying the seated pose or the chair transform.
		rig.prepare()
		rig.ensureSkin()
		for (const { mesh, skin } of rig.skin.pairs) {
			const face = /^cabe/i.test(mesh.name)
			if (!face && mesh.name !== 'Corpo_Nilo') continue
			if (face) {
				const headIndex = rig.bones.indexOf(bones.get('Head'))
				const neckIndex = rig.bones.indexOf(bones.get('Neck'))
				const collarIndex = rig.bones.indexOf(bones.get('Spine2'))
				const positions = skin.geometry.attributes.position
				const joints = skin.geometry.attributes.skinIndex
				const weights = skin.geometry.attributes.skinWeight
				const restPoint = new THREE.Vector3()
				const restToHolder = this.holder.matrixWorld.clone().invert().multiply(skin.matrixWorld)
				for (let i = 0; i < joints.count; i++) {
					restPoint.fromBufferAttribute(positions,i).applyMatrix4(restToHolder)
					// The front of the jaw is rigid even below the top of the neck.
					const jaw = THREE.MathUtils.smoothstep(restPoint.z,.025,.040)
					const front = THREE.MathUtils.smoothstep(restPoint.y,.826,.841)*jaw
					const headWeight = Math.max(front,THREE.MathUtils.smoothstep(restPoint.y,.847,.875))
					const collarWeight = (1-headWeight)*(1-THREE.MathUtils.smoothstep(restPoint.y,.832,.865))
					joints.setXYZW(i,headIndex,neckIndex,collarIndex,0)
					weights.setXYZW(i,headWeight,1-headWeight-collarWeight,collarWeight,0)
				}
				joints.needsUpdate = weights.needsUpdate = true
			}
			if (!face) {
				const joints = skin.geometry.attributes.skinIndex.array
				const weights = skin.geometry.attributes.skinWeight.array
				const handBones = rig.bones.map(bone => /Hand|Thumb|Index|Middle|Ring|Pinky/i.test(bone.name))
				const mask = new Float32Array(joints.length / 4)
				for (let i = 0; i < joints.length; i++) {
					if (handBones[joints[i]]) mask[i >> 2] += weights[i]
				}
				skin.geometry.setAttribute('niloHandArea', new THREE.BufferAttribute(mask, 1))
			}
			const correct = original => {
				if (!original.map) return original
				const mat = original.clone()
				const rgb = texture(mat.map).rgb
				const warmth = rgb.r.sub(rgb.b)
				const hueMask = smoothstep(.012,.105,warmth).mul(smoothstep(.02,.15,rgb.r))
				// Correct chroma separately from luminance to keep the skin texture.
				const luma = dot(rgb,vec3(.2126,.7152,.0722))
				const balanced = mix(rgb,vec3(1.18,.97,.84).mul(luma),.42)
				const multiplier = face ? vec3(.14,.18,.22) : vec3(.16,.20,.24)
				const area = face ? float(1) : smoothstep(.20,.70,attribute('niloHandArea','float'))
				mat.colorNode = mix(rgb,balanced.mul(multiplier),hueMask.mul(area))
				mat.roughness = .88
				return mat
			}
			skin.material = Array.isArray(skin.material) ? skin.material.map(correct) : correct(skin.material)
		}
		const scale = seat?.scale.x ?? 1
		this.holder.scale.setScalar(height / scale)
		this.holder.position.set(0,-.31/scale,.07/scale)
		;(seat ?? entry.group).add(this.holder)
		entry.character3d = this.holder
		entry.room.addCharacterToEditor?.(this.holder)
		this.bones = bones
		this.rig = rig
		this.time = 0
		this.gaze = new THREE.Vector3()
		this.headPosition = new THREE.Vector3()
		this.playing = !matchMedia('(prefers-reduced-motion: reduce)').matches
		this.update(0)
		if (seat) this.fitChair(seat)
		entry.room.finishChairFit?.()
	}

	fitChair(seat) {
		const upholstery = this.entry.room.chairModel
		const hips = this.bones.get('Hips')
		if (!upholstery || !hips) return

		// The default chair asset faces -X. The holder and saved character offsets stay put.
		if (Math.abs(seat.rotation.y) < .01) upholstery.rotation.y -= Math.PI / 2
		seat.updateWorldMatrix(true, true)
		const contact = seat.worldToLocal(this.holder.localToWorld(
			hips.position.clone().add(new THREE.Vector3(0,-.082,0))
		))
		const direction = new THREE.Vector3(0,-1,0).transformDirection(seat.matrixWorld)
		const ray = new THREE.Raycaster()
		const cushionAt = (x,z) => {
			ray.set(seat.localToWorld(new THREE.Vector3(x,.51,z)),direction)
			const hit = ray.intersectObject(upholstery,true)[0]
			return hit ? seat.worldToLocal(hit.point).y : 0
		}
		const cushion = cushionAt(contact.x, contact.z) || cushionAt(0, 0)
		if (cushion > .20) {
			const stretch = THREE.MathUtils.clamp(contact.y / cushion, 1, 2.25)
			upholstery.scale.y *= stretch
			upholstery.position.y *= stretch
			seat.updateWorldMatrix(true, true)
		}
	}

	update(dt) {
		if (this.playing) this.time = (this.time + dt) % 12
		const t = this.time * Math.PI / 6
		const lean = THREE.MathUtils.smoothstep(this.time,.55,3.1) * (1-THREE.MathUtils.smoothstep(this.time,9.7,12))
		// Move along the line slowly, then return quickly to the next line.
		const readingTime = Math.max(0,this.time-2.35)
		const lineDuration = 2.35
		const phase = (readingTime/lineDuration)%1
		const nextLine = THREE.MathUtils.smoothstep(phase,.73,1)
		const across = 2*(THREE.MathUtils.smoothstep(phase,.04,.71)-nextLine)-1
		const downPage = Math.min(1,(Math.floor(readingTime/lineDuration)+nextLine)/4)
		const handGesture = THREE.MathUtils.smoothstep(this.time,3.1,5.15)*(1-THREE.MathUtils.smoothstep(this.time,7.25,10))
		this.rig.a.rigEditor.rest()
		this.bones.get('Spine')?.rotateX(.21*lean)
		this.bones.get('Spine1')?.rotateX(.14*lean)
		this.bones.get('Spine2')?.rotateX((.13+.009*Math.sin(t))*lean)
		const orient = (name, direction, rotation = null) => {
			const bone = this.bones.get(name), rest = this.rig.rest.get(bone)
			if(!bone || !rest) return
			const target = new THREE.Quaternion().setFromUnitVectors(rest.direction,direction.normalize()).multiply(rest.q)
			if (rotation) target.premultiply(new THREE.Quaternion().setFromEuler(rotation))
			const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
			bone.quaternion.copy(parent.multiply(this.holder.getWorldQuaternion(new THREE.Quaternion())).multiply(target))
			bone.updateWorldMatrix(false,true)
		}
		this.holder.updateWorldMatrix(true,false)
		const up = new THREE.Vector3(0,1,0).transformDirection(this.holder.matrixWorld.clone().invert())
		const onPlane = point => point.addScaledVector(up,-point.dot(up))
		const handHeight = this.entry.room.getHandHeight()
		const worldScale = this.holder.matrixWorld.getMaxScaleOnAxis()
		const localOffset = ({x,y,z}) => onPlane(new THREE.Vector3(x,0,z)).addScaledVector(up,y).divideScalar(worldScale)
		for (const [side,sign] of [['Left',1],['Right',-1]]) {
			orient(side+'UpLeg',new THREE.Vector3(sign*.08,-.12,1))
			orient(side+'Leg',new THREE.Vector3(0,-1,-.18))
			orient(side+'Foot',new THREE.Vector3(0,-.35,1))
			const right = side === 'Right'
			const handPose = this.entry.room.getLimbOffset('hand'+side)
			const elbowPose = this.entry.room.getLimbOffset('elbow'+side)
			const handOffset = localOffset(handPose)
			const elbowOffset = localOffset(elbowPose)
			const reach = right ? handGesture : .22*handGesture
			const sway = Math.sin(t+(right ? .5 : 2.1))
			const target = this.entry.room.wristTargets?.[right ? 1 : 0]
			if (target) {
				const worldTarget = target.getWorldPosition(new THREE.Vector3())
				worldTarget.y += handHeight
				const wrist = this.holder.worldToLocal(worldTarget).add(handOffset)
				wrist.add(onPlane(new THREE.Vector3(-sign*(.018*reach+.006*sway),0,.027*reach)))
				this.placeArm(side,sign,wrist,up,elbowOffset,THREE.MathUtils.degToRad(elbowPose.armBend),orient)
			}
			const direction = onPlane(new THREE.Vector3(-sign*(.035+.22*reach),0,1)).normalize()
			const {rx,rot,rz} = handPose
			const radians = THREE.MathUtils.degToRad
			orient(side+'Hand',direction.addScaledVector(up,-.15),new THREE.Euler(radians(rx),radians(rot),radians(rz),'YXZ'))
		}
		const neck = this.bones.get('Neck')
		const head = this.bones.get('Head')
		const paper = this.entry.room.readingTarget
		if (neck && head && paper) {
			this.holder.worldToLocal(paper.getWorldPosition(this.gaze))
			this.gaze.z += .060-.12*downPage
			this.holder.worldToLocal(head.getWorldPosition(this.headPosition))
			this.gaze.sub(this.headPosition)
			const pitch = Math.atan2(-this.gaze.y,Math.hypot(this.gaze.x,this.gaze.z))
			const tilt = THREE.MathUtils.lerp(0,THREE.MathUtils.clamp(pitch-.36,.15,.60)+.075*downPage,lean)
			const centerYaw = THREE.MathUtils.clamp(Math.atan2(this.gaze.x,this.gaze.z),-.29,.29)
			const yaw = (centerYaw+.23*across)*lean
			neck.rotation.set(tilt*.25,yaw*.16,0,'YXZ')
			head.rotation.set(tilt*.75,yaw*.84,0,'YXZ')
		}
		this.holder.updateWorldMatrix(true,true)
	}

	placeArm(side,sign,wrist,up,elbowOffset,bend,orient) {
		const arm = this.bones.get(side+'Arm')
		const forearm = this.bones.get(side+'ForeArm')
		const hand = this.bones.get(side+'Hand')
		const shoulder = this.holder.worldToLocal(arm.getWorldPosition(new THREE.Vector3()))
		const upperLength = forearm.position.length(), lowerLength = hand.position.length()
		const forward = wrist.clone().sub(shoulder)
		// If the desk is far away, shorten the horizontal reach first.
		const fullReach = upperLength+lowerLength-.004
		const vertical = forward.dot(up)
		const rise = THREE.MathUtils.clamp(vertical,-fullReach+.001,fullReach-.001)
		const bentReach = Math.sqrt(upperLength**2+lowerLength**2+2*upperLength*lowerLength*Math.cos(bend))
		const maxReach = Math.min(fullReach,Math.max(Math.abs(rise)+.001,bentReach))
		forward.addScaledVector(up,-vertical)
		forward.clampLength(.001,Math.sqrt(maxReach**2-rise**2)).addScaledVector(up,rise)
		const distance = Math.max(forward.length(),Math.abs(upperLength-lowerLength)+.002)
		forward.normalize()
		const along = (upperLength**2-lowerLength**2+distance**2)/(2*distance)
		const outward = new THREE.Vector3(sign*.80,-.90,-.20)
		outward.addScaledVector(forward,-outward.dot(forward)).normalize()
		const radius = Math.sqrt(Math.max(0,upperLength**2-along**2))
		const elbowGuide = outward.clone().multiplyScalar(Math.max(.022,radius)).add(elbowOffset)
		elbowGuide.addScaledVector(forward,-elbowGuide.dot(forward))
		if (elbowGuide.lengthSq() < .000001) elbowGuide.copy(outward)
		const elbow = forward.clone().multiplyScalar(along).addScaledVector(elbowGuide.normalize(),radius)
		orient(side+'Arm',elbow.clone())
		orient(side+'ForeArm',forward.multiplyScalar(distance).sub(elbow))
	}

	getStats() { return { pose:'Leitura sentada', time:this.time, playing:this.playing, source:'Rig ajustado no editor' } }
}
