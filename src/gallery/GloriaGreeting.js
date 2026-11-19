import * as THREE from 'three/webgpu';

const MIC_URL = '/models/set/gloria/microphone.glb';
export { MIC_URL };

const ease = (time, start, end) => THREE.MathUtils.smootherstep(time, start, end);

const groups = {
	'shoulder-right': ['Braço direito', [
		['armOut', 'Abertura do ombro', -22, 28, '°'],
		['armForward', 'Ombro para frente', -22, 35, '°'],
		['elbow', 'Flexão do cotovelo', 25, 110, '°'],
	]],
	'wrist-right': ['Mão direita', [
		['handX', 'Para dentro ↔ para fora', -14, 14, 'cm'],
		['handY', 'Altura da mão', -14, 24, 'cm'],
		['handZ', 'Para trás ↔ para frente', -14, 18, 'cm'],
		['wristX', 'Giro do punho', -70, 70, '°'],
		['wristY', 'Desvio do punho', -45, 45, '°'],
		['wristZ', 'Flexão do punho', -45, 45, '°'],
	]],
	'finger-curl': ['Dedos da mão direita', [
		['grip', 'Curvatura dos dedos', 0, 100, '%'],
	]],
	'microphone': ['Microfone', [
		['micX', 'Ao longo da mão', -10, 10, 'cm'],
		['micY', 'Para dentro ↔ para fora', -10, 10, 'cm'],
		['micZ', 'De um lado ao outro', -10, 10, 'cm'],
		['micPitch', 'Inclinação para frente', -80, 80, '°'],
		['micYaw', 'Giro do microfone', -180, 180, '°'],
		['micRoll', 'Inclinação lateral', -80, 80, '°'],
	]],
};

const fields = Object.values(groups).flatMap(([, rows]) => rows);
const storageKey = 'legado.gloria.mao-e-microfone.v1';
const defaults = Object.fromEntries(fields.map(([key]) => [key, { elbow: 65, grip: 55 }[key] ?? 0]));

export function addGloriaPoseControls(desk, animation) {
	let selected = desk.keys()[0];
	const refresh = () => animation.pose(animation.time);
	const field = ([key, label, min, max, unit]) => [key, label, min, max, 1, unit];
	const overrides = Object.fromEntries(Object.entries(groups).map(([key, [, rows]]) => [
		key, Object.fromEntries(rows.map(row => {
			const [id, label, min, max, step, unit] = field(row);
			return [id, { label, min, max, step, unit }];
		})),
	]));
	const originalFields = desk.meta.spec;
	const originalOverride = Object.fromEntries(originalFields.map(([id, label, min, max, step, unit]) =>
		[id, { label, min, max, step, unit }]));
	return {
		...desk,
		meta: {
			...desk.meta,
			title: 'Glória · cenário e pose',
			spec: [...originalFields, ...fields.map(field)],
			savedMessage: 'Posições e pose da Glória salvas neste navegador',
			override: key => overrides[key] ?? originalOverride,
		},
		keys: () => [...desk.keys(), ...Object.keys(groups)],
		label: key => groups[key]?.[0] ?? desk.label(key),
		get: key => overrides[key] ? animation.adjustments : desk.get(key),
		set(key, prop, value) {
			const rule = overrides[key]?.[prop];
			if (!groups[key]) return desk.set(key, prop, value);
			if (!rule || !Number.isFinite(Number(value))) return;
			animation.adjustments[prop] = THREE.MathUtils.clamp(Number(value), rule.min, rule.max);
			refresh();
		},
		select(key) {
			selected = key;
			if (!groups[key]) desk.select(key);
			desk.marker(!groups[key]);
		},
		marker(on) { desk.marker(on && !groups[selected]); },
		save() {
			const saved = desk.save();
			try {
				localStorage.setItem(storageKey, JSON.stringify(animation.adjustments));
				return saved;
			} catch { return false; }
		},
		reset(key) {
			if (groups[key]) {
				for (const [prop] of groups[key][1]) animation.adjustments[prop] = defaults[prop];
				refresh();
				return;
			}
			desk.reset(key);
			if (!key) {
				Object.assign(animation.adjustments, defaults);
				try { localStorage.removeItem(storageKey); } catch {}
				refresh();
			}
		},
		all: () => ({ ...desk.all(), ...Object.fromEntries(Object.entries(groups).map(([key, [, rows]]) => [
			key, Object.fromEntries(rows.map(([prop]) => [prop, animation.adjustments[prop]])),
		])) }),
	};
}

function savedAdjustments() {
	const result = { ...defaults };
	try {
		const saved = JSON.parse(localStorage.getItem(storageKey));
		for (const [id, , min, max] of fields) {
			if (Number.isFinite(saved?.[id])) result[id] = THREE.MathUtils.clamp(saved[id], min, max);
		}
	} catch {}
	return result;
}


// Centros das articulações na malha da mão direita, em pose aberta.
const rightHandJoints = [
	['thumb', [[.804, .748, .048], [.849, .746, .073]], [.45, .75]],
	['index', [[.850, .744, .034], [.906, .743, .038], [.942, .743, .041]], [1.13, 1.46, .89]],
	['middle', [[.855, .744, .005], [.916, .743, .001], [.957, .743, .002]], [1.20, 1.56, .97]],
	['ring', [[.847, .742, -.022], [.903, .742, -.028], [.944, .742, -.028]], [1.28, 1.61, 1.03]],
	['little', [[.836, .739, -.048], [.883, .739, -.057], [.920, .739, -.060]], [1.34, 1.64, 1.09]],
];

function makeArm(side, pelvis) {
	const shoulder = new THREE.Bone();
	const elbow = new THREE.Bone();
	const wrist = new THREE.Bone();
	shoulder.position.set(side * .225, .759, -.035);
	elbow.position.set(side * .303, -.009, -.010);
	wrist.position.set(side * .255, .001, .028);
	pelvis.add(shoulder);
	shoulder.add(elbow);
	elbow.add(wrist);
	const bones = [shoulder, elbow, wrist];
	const fingers = [];
	if (side < 0) {
		const wristCenter = shoulder.position.clone().add(elbow.position).add(wrist.position);
		for (const [name, joints, curl] of rightHandJoints) {
			let parent = wrist;
			let previous = wristCenter;
			const fingerBones = joints.map(([reach, y, z], i) => {
				const point = new THREE.Vector3(-reach, y, z);
				const bone = new THREE.Bone();
				bone.name = name + '-' + (i + 1);
				bone.position.copy(point).sub(previous);
				parent.add(bone);
				bones.push(bone);
				parent = bone;
				previous = point;
				return bone;
			});
			const [base, next] = joints;
			const axis = new THREE.Vector3(next[2] - base[2], 0, next[0] - base[0]).normalize();
			fingers.push({ name, joints, curl, axis, bones: fingerBones });
		}
	}
	return { side, shoulder, elbow, wrist, fingers, bones };
}

function fingerWeights(fingers, reach, z, wristIndex, indices, weights, at, wristWeight) {
	const free = fingers[0];
	let finger = free;
	let best = Infinity;
	for (const digit of fingers) {
		const [base, next] = digit.joints;
		const tip = digit.joints[digit.joints.length - 1];
		const fraction = THREE.MathUtils.clamp((reach - base[0]) / (next[0] - base[0]), 0, 1);
		const lane = THREE.MathUtils.lerp(base[2], next[2], fraction);
		// Mantém o polegar separado depois da abertura entre ele e o indicador.
		const beyondThumb = digit === free ? Math.max(0, reach - tip[0] - .04) * 2 : 0;
		const distance = Math.abs(lane - z) + beyondThumb;
		if (distance < best) { best = distance; finger = digit; }
	}
	let previousIndex = wristIndex;
	let previousCoverage = wristWeight;
	let slot = at + 1;
	for (const [i, [joint]] of finger.joints.entries()) {
		const radius = i === 0 ? .016 : .014;
		const coverage = wristWeight * ease(reach, joint - radius, joint + radius);
		const share = previousCoverage - coverage;
		if (share > 0 && slot < at + 3) {
			indices[slot] = previousIndex;
			weights[slot++] = share;
		}
		previousIndex = finger.indices[i];
		previousCoverage = coverage;
		if (coverage <= 0) break;
	}
	if (previousCoverage > 0) {
		indices[slot] = previousIndex;
		weights[slot] = previousCoverage;
	}
}

function bindBody(body, rootBone, arms, neck) {
	const bones = [rootBone, neck, ...arms.flatMap(arm => arm.bones)];
	const [right, left] = arms;
	const rightIndex = bones.indexOf(right.shoulder);
	const leftIndex = bones.indexOf(left.shoulder);
	for (const finger of right.fingers) finger.indices = finger.bones.map(bone => bones.indexOf(bone));
	const mesh = new THREE.SkinnedMesh(body.geometry.clone(), body.material);
	mesh.name = body.name;
	mesh.position.copy(body.position);
	mesh.quaternion.copy(body.quaternion);
	mesh.scale.copy(body.scale);
	mesh.castShadow = body.castShadow;
	mesh.receiveShadow = body.receiveShadow;
	mesh.frustumCulled = false;
	body.parent.add(mesh);
	body.removeFromParent();
	mesh.add(rootBone);

	const position = mesh.geometry.getAttribute('position');
	const indices = new Uint16Array(position.count * 4);
	const weights = new Float32Array(position.count * 4);
	for (let i = 0; i < position.count; i++) {
		const x = position.getX(i);
		const y = position.getY(i);
		const reach = Math.abs(x);
		const at = i * 4;
		const shoulder = ease(reach, .155, .36) * ease(y, .53, .67);
		if (shoulder <= 0) {
			const neckWeight = ease(y, .785, .868) * (1 - ease(reach, .075, .15));
			indices[at + 1] = 1;
			weights[at] = 1 - neckWeight;
			weights[at + 1] = neckWeight;
			continue;
		}
		const upper = x < 0 ? rightIndex : leftIndex;
		const elbow = ease(reach, .453, .598);
		const wrist = ease(reach, .738, .835);
		if (wrist > 0) {
			indices[at] = upper + 1;
			weights[at] = 1 - wrist;
			if (x < 0) fingerWeights(right.fingers, reach, position.getZ(i), upper + 2, indices, weights, at, wrist);
			else {
				indices[at + 1] = upper + 2;
				weights[at + 1] = wrist;
			}
		} else {
			indices.set([0, upper, upper + 1], at);
			weights.set([1 - shoulder, shoulder * (1 - elbow), shoulder * elbow], at);
		}
	}
	mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
	mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
	mesh.updateWorldMatrix(true, true);
	mesh.bind(new THREE.Skeleton(bones));
	return mesh;
}

function setArm(arm, upper, lower, palmNormal, handDirection = lower) {
	arm.shoulder.quaternion.setFromUnitVectors(arm.elbow.position.clone().normalize(), upper.normalize());
	const lowerRotation = new THREE.Quaternion().setFromUnitVectors(arm.wrist.position.clone().normalize(), lower.normalize());
	arm.elbow.quaternion.copy(arm.shoulder.quaternion).invert().multiply(lowerRotation);

	const x = handDirection.clone().normalize().multiplyScalar(arm.side);
	const y = palmNormal.clone().addScaledVector(x, -palmNormal.dot(x)).normalize();
	const z = new THREE.Vector3().crossVectors(x, y);
	const basis = new THREE.Matrix4().makeBasis(x, y, z);
	const hand = new THREE.Quaternion().setFromRotationMatrix(basis);
	arm.wrist.quaternion.copy(lowerRotation).invert().multiply(hand);
	return hand;
}

export class GloriaGreeting {
	constructor(root, holder, microphone) {
		this.root = root;
		this.holder = holder;
		this.time = 0;
		this.duration = 12;
		this.adjustments = savedAdjustments();
		this.playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;

		const body = root.children.find(node => node.isMesh && /^corpo/i.test(node.name));
		const head = root.children.find(node => node.isMesh && /^cabe/i.test(node.name));
		const torso = new THREE.Bone();
		this.neck = new THREE.Bone();
		this.neck.position.set(0, .86, -.04);
		torso.add(this.neck);
		this.right = makeArm(-1, torso);
		this.left = makeArm(1, torso);
		this.body = bindBody(body, torso, [this.right, this.left], this.neck);
		head.position.sub(this.neck.position);
		this.neck.add(head);

		const radio = microphone.clone(true);
		const bounds = new THREE.Box3().setFromObject(radio);
		radio.position.sub(bounds.getCenter(new THREE.Vector3()));
		const mount = new THREE.Group();
		mount.name = 'Microfone na mão direita';
		radio.position.y += .055;
		mount.add(radio);
		this.right.wrist.add(mount);
		this.microphone = mount;
		this.pose(0);
	}

	update(dt) {
		if (!this.playing) return;
		this.time = (this.time + dt) % this.duration;
		this.pose(this.time);
	}

	pose(time) {
		const turn = ease(time, .40, 1.77);
		const cross = ease(time, 1.95, 3.65);
		const center = ease(time, 3.83, 5.04);
		const look = .54 * turn - 1.06 * cross + .52 * center;
		const raised = ease(time, 4.67, 5.83) - ease(time, 7.72, 9.05);
		const swingEnvelope = ease(time, 5.42, 5.84) - ease(time, 7.24, 7.96);
		const phase = (time - 5.67) * Math.PI * 2.35;
		const swing = Math.sin(phase) * swingEnvelope;
		const wristSwing = Math.sin(phase - .51) * swingEnvelope;
		const breath = Math.sin(time * Math.PI * 4 / this.duration);
		const nod = ease(time, 4.57, 5.33) - ease(time, 5.40, 6.55);
		this.neck.rotation.set(-.023 + .015 * breath + .032 * Math.abs(look) - .064 * nod,
			look + .018 * swing, -.085 * look - .046 * raised + .012 * wristSwing);

		this.poseRightArm(breath, look);

		const upper = new THREE.Vector3(.20, -.97, .10 + .035 * look)
			.lerp(new THREE.Vector3(.64 + .042 * swing, -.39, .35), raised);
		const lower = new THREE.Vector3(-.04, -.99, .10)
			.lerp(new THREE.Vector3(.26 + .17 * swing, .93, .27 + .05 * wristSwing), raised);
		const palm = new THREE.Vector3(.96, 0, -.19)
			.lerp(new THREE.Vector3(.13 * wristSwing, -.08, -1), raised);
		const fingers = lower.clone().add(new THREE.Vector3(.18 * wristSwing, .02 * raised, -.10 * raised));
		setArm(this.left, upper, lower, palm, fingers);
	}

	poseRightArm(breath, look) {
		const a = this.adjustments;
		const radians = THREE.MathUtils.degToRad;
		const centimeters = .01 / this.holder.scale.x;
		const shoulderTrim = new THREE.Euler(-radians(a.armForward), 0, -radians(a.armOut));
		const baseLower = new THREE.Vector3(.27, -.44, .85).normalize();
		const upper = new THREE.Vector3(-.28, -.96, .09 + .022 * look).normalize().applyEuler(shoulderTrim);
		const restLower = baseLower.clone().applyEuler(shoulderTrim);
		const bendAxis = new THREE.Vector3().crossVectors(upper, restLower).normalize();
		const lower = upper.clone().applyAxisAngle(bendAxis, radians(a.elbow) + breath * .012);
		const targetOffset = new THREE.Vector3(-a.handX, a.handY, a.handZ).multiplyScalar(centimeters);
		if (targetOffset.lengthSq() > 0) {
			const upperLength = this.right.elbow.position.length();
			const lowerLength = this.right.wrist.position.length();
			const target = upper.clone().multiplyScalar(upperLength).addScaledVector(lower, lowerLength).add(targetOffset);
			const distance = THREE.MathUtils.clamp(target.length(), Math.abs(upperLength - lowerLength) + .015, upperLength + lowerLength - .008);
			const axis = target.normalize();
			const outward = upper.clone().addScaledVector(axis, -upper.dot(axis));
			if (outward.lengthSq() < 1e-6) outward.copy(bendAxis).cross(axis);
			outward.normalize();
			const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
			const joint = axis.clone().multiplyScalar(along).addScaledVector(outward, Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)));
			lower.copy(axis).multiplyScalar(distance).sub(joint).normalize();
			upper.copy(joint).normalize();
		}
		const foreRotation = new THREE.Quaternion().setFromUnitVectors(baseLower, lower);
		const hand = setArm(this.right, upper, lower,
			new THREE.Vector3(-.85, .05, -.45).applyQuaternion(foreRotation),
			new THREE.Vector3(.17, -.25, .95).applyQuaternion(foreRotation));
		const wristTrim = new THREE.Quaternion().setFromEuler(new THREE.Euler(radians(a.wristX), radians(a.wristY), radians(a.wristZ)));
		this.right.wrist.quaternion.multiply(wristTrim);
		const grip = a.grip / 100;
		for (const finger of this.right.fingers) {
			finger.bones.forEach((bone, i) => bone.quaternion.setFromAxisAngle(finger.axis, grip * finger.curl[i]));
			if (finger.name === 'thumb') {
				finger.bones[0].quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -.64 * grip));
			}
		}
		this.microphone.position.set(-.103 + a.micX * centimeters, -.015 + a.micY * centimeters, .017 + a.micZ * centimeters);
		this.microphone.quaternion.copy(hand).invert().multiply(
			new THREE.Quaternion().setFromEuler(new THREE.Euler(.12 + radians(a.micPitch), -.18 + radians(a.micYaw), -.08 + radians(a.micRoll))));
	}
}
