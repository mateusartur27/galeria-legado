import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { texLoader } from './Ktx.js';
import { texture, color, vec3, uniform, positionWorld, smoothstep, step, mix, vec4 } from 'three/tsl';

export const PORTRAIT_WALL_DROP = .30;
export const BAY_LENGTH=12;
export const PALETTE={ivory:'#ddd0b4',stone:'#d1c5af',terracotta:'#bc9385',indigo:'#27394e',gold:'#dbb77b',wood:'#433948',leaf:'#729682',shadow:'#59658c',haze:'#182239',carpet:'#9f2944'};
export const galleryPhase=uniform(0);
export const galleryBrightness=uniform(1);
export const nicheInside=uniform(0); // 1 com a câmera dentro de um nicho: some o forro (y≈6,9) que cobre o nicho das baias vizinhas
export const galleryRoofBrightness=uniform(.7);
export const galleryLightHeight=uniform(5.35);
function azulejoMap(){return canvasMap(512,768,(c,w,h)=>{
 c.fillStyle='#e4dfca';c.fillRect(0,0,w,h);
 for(let row=0;row<6;row++)for(let col=0;col<4;col++){
  c.save();c.translate(col*128+64,row*128+64);c.rotate(((row+col)%4)*Math.PI/2);
  c.strokeStyle='#315f80';c.lineWidth=8;c.beginPath();c.arc(-64,-64,92,0,Math.PI/2);c.stroke();
  c.strokeStyle='#6b9da7';c.lineWidth=3;c.beginPath();c.arc(-64,-64,108,0,Math.PI/2);c.stroke();
  c.fillStyle=(row+col)%3?'#315f80':'#b18551';c.beginPath();c.moveTo(-35,34);c.bezierCurveTo(-55,-20,22,-48,34,-34);c.bezierCurveTo(44,10,2,40,-35,34);c.fill();
  c.strokeStyle='#e7dcc0';c.lineWidth=2;c.beginPath();c.moveTo(-30,29);c.lineTo(28,-29);c.stroke();c.restore();
  c.strokeStyle='#b4b9ac';c.lineWidth=1;c.strokeRect(col*128+1,row*128+1,126,126);
 }
});}

function canvasMap(w,h,paint){const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function motifMap(){return canvasMap(1024,128,(c,w,h)=>{c.fillStyle='#253951';c.fillRect(0,0,w,h);c.strokeStyle='#c9a361';c.lineWidth=7;for(let x=-128;x<w+128;x+=128){for(let k=0;k<3;k++){const r=56-k*17;c.beginPath();c.moveTo(x+64,64-r);c.lineTo(x+64+r,64);c.lineTo(x+64,64+r);c.lineTo(x+64-r,64);c.closePath();c.stroke();}}c.lineWidth=3;c.strokeRect(0,5,w,118);});}
function glowMap(){return canvasMap(128,128,(c,w,h)=>{const g=c.createRadialGradient(64,64,2,64,64,64);g.addColorStop(0,'rgba(255,216,156,.7)');g.addColorStop(.3,'rgba(255,203,125,.35)');g.addColorStop(1,'rgba(255,196,111,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});}
function aoMap(){return canvasMap(128,128,(c,w,h)=>{const g=c.createRadialGradient(64,64,10,64,64,64);g.addColorStop(0,'rgba(33,25,20,.5)');g.addColorStop(.4,'rgba(33,25,20,.27)');g.addColorStop(1,'rgba(33,25,20,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});}
function leafMap(){return canvasMap(128,256,(c,w,h)=>{const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#a6b36c');g.addColorStop(.45,'#738c49');g.addColorStop(1,'#3c5a33');c.fillStyle=g;c.fillRect(0,0,w,h);c.strokeStyle='#c5c68b88';c.lineWidth=1.3;c.beginPath();c.moveTo(64,0);c.lineTo(64,h);c.stroke();c.strokeStyle='#c2cc922e';c.lineWidth=.7;for(let y=12;y<h;y+=14){c.beginPath();c.moveTo(2,y-30);c.lineTo(64,y);c.lineTo(126,y-30);c.stroke();}});}
function plaqueMap(){return canvasMap(512,1024,(c,w,h)=>{c.fillStyle='#e4d3b2';c.fillRect(0,0,w,h);c.strokeStyle='#a98a57';c.lineWidth=2;c.strokeRect(28,28,w-56,h-56);c.fillStyle='#344453';c.textAlign='center';c.font='22px Georgia';c.fillText('L E G A D O',w/2,100);c.font='13px Arial';c.fillText('GALERIA DE HISTÓRIAS',w/2,137);c.strokeStyle='#ad8d58';c.beginPath();c.moveTo(190,190);c.lineTo(322,190);c.stroke();c.font='italic 38px Georgia';c.fillText('Raízes &',w/2,290);c.fillText('horizontes',w/2,340);c.fillStyle='#b39c76';for(let i=0;i<7;i++)c.fillRect(100,430+i*22,w-200-(i===6?100:0),3);c.strokeStyle='#8f7651';c.lineWidth=2;for(let i=0;i<5;i++){const r=35+i*20;c.beginPath();c.arc(256,820,r,Math.PI,0);c.lineTo(256+r,935);c.moveTo(256-r,820);c.lineTo(256-r,935);c.stroke();}});}

function marbleMap(){return canvasMap(512,512,(c,w,h)=>{c.fillStyle='#d2ccbe';c.fillRect(0,0,w,h);for(let i=0;i<12;i++){const x=i*49;c.strokeStyle=i%3?'#b9b6b322':'#ffffff3b';c.lineWidth=i%3?1:3;c.beginPath();c.moveTo(x-130,0);c.bezierCurveTo(x+10,190,x-180,250,x+60,h);c.stroke();}c.strokeStyle='#8d8a8138';c.lineWidth=2;c.strokeRect(1,1,w-2,h-2);});}
function timberMap(){return canvasMap(256,512,(c,w,h)=>{c.fillStyle='#795b44';c.fillRect(0,0,w,h);for(let i=0;i<65;i++){const x=(i*37)%w;c.strokeStyle=i%4?'#3a291d44':'#bd916450';c.lineWidth=i%5?1:3;c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x+18,150,x-24,360,x+3,h);c.stroke();}for(let i=0;i<6;i++){c.strokeStyle='#36241d77';c.lineWidth=2;c.beginPath();c.ellipse(30+(i*53)%190,45+i*81,5,19,.2,0,Math.PI*2);c.stroke();}c.fillStyle='#211c173c';c.fillRect(0,0,8,h);});}
function carpetMap(){return canvasMap(512,1024,(c,w,h)=>{c.fillStyle='#901b34';c.fillRect(0,0,w,h);const g=c.createLinearGradient(0,0,w,0);g.addColorStop(0,'#4b153233');g.addColorStop(.5,'#e5747b18');g.addColorStop(1,'#4b153233');c.fillStyle=g;c.fillRect(0,0,w,h);for(const x of [18,26,w-28,w-20]){c.fillStyle='#d9b478';c.fillRect(x,0,x===26||x===w-28?2:4,h);}for(let y=0;y<h;y+=64){for(const x of [44,w-44]){c.save();c.translate(x,y);c.rotate(Math.PI/4);c.strokeStyle='#c79a64';c.lineWidth=1;c.strokeRect(-5,-5,10,10);c.restore();}}c.fillStyle='#ffd4b505';for(let y=1;y<h;y+=4)for(let x=55+(y%8);x<w-54;x+=7)c.fillRect(x,y,1,1);});}
function nightMap(){return canvasMap(256,256,(c,w,h)=>{const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#121d39');g.addColorStop(1,'#405778');c.fillStyle=g;c.fillRect(0,0,w,h);for(let i=0;i<23;i++){const x=(i*71+11)%256,y=(i*i*37+23)%256;c.fillStyle=i%3?'#adbad1':'#faf1d4';c.beginPath();c.arc(x,y,i%3?.65:1.2,0,Math.PI*2);c.fill();}});}
export function applyReceivedLighting(m){
 if(m.userData.receivedLight)return;
 // The saved roof exposure grows through the upper wall into the roof, with no hard seam.
 const upperZone=smoothstep(4.8,6.76,positionWorld.y);
 const receivedLight=mix(1,galleryRoofBrightness,upperZone);
 const originalOutput=m.setupOutput.bind(m);
 m.setupOutput=(builder,lit)=>originalOutput(builder,vec4(lit.rgb.mul(receivedLight),lit.a));
 m.userData.receivedLight={lower:1,upper:"saved-roof-brightness",transition:[4.8,6.76]};
}
// Roof and upper masonry share the same continuous exposure field before fog.
export function applyRoofBrightness(material){
 material.userData.roofBrightness=true;
}
export async function createMaterials(){
 const ramp=new THREE.DataTexture(new Uint8Array([90,90,90,255,145,145,145,255,205,205,205,255,255,255,255,255]),4,1);ramp.needsUpdate=true;ramp.minFilter=ramp.magFilter=THREE.LinearFilter;
 const toon=hex=>new THREE.MeshToonNodeMaterial({color:hex,gradientMap:ramp,vertexColors:true});
 const std=(hex,roughness=.6,metalness=0)=>new THREE.MeshStandardNodeMaterial({color:hex,roughness,metalness,vertexColors:true});
 const marble=marbleMap();marble.wrapS=marble.wrapT=THREE.RepeatWrapping;marble.repeat.set(6,8);marble.anisotropy=4;
 const runner=carpetMap();runner.wrapT=THREE.RepeatWrapping;runner.anisotropy=4;
 const mats={floor:new THREE.MeshStandardNodeMaterial({map:marble,color:'#b8b7bf',roughness:.42,metalness:.05,vertexColors:true}),carpet:new THREE.MeshStandardNodeMaterial({map:runner,roughness:1,vertexColors:true}),wood:toon('#594753'),ceiling:new THREE.MeshPhysicalNodeMaterial({color:'#e4cfb6',roughness:.94,metalness:0,specularIntensity:.12,clearcoat:0,envMapIntensity:.18,vertexColors:true}),plaster:toon(PALETTE.ivory),stone:std('#d1c7b7',.4),blue:toon('#34445d'),clay:toon('#b89485'),gold:std('#e0b776',.26,.7),dark:toon('#292c3f'),leaf:toon('#80a289'),ceramic:new THREE.MeshPhysicalNodeMaterial({color:'#3f6671',roughness:.28,metalness:.1,clearcoat:.65,vertexColors:true}),velvet:toon('#427270'),rope:toon('#932f48'),motif:new THREE.MeshStandardNodeMaterial({map:motifMap(),roughness:.55,metalness:.12,vertexColors:true,side:THREE.DoubleSide}),lamp:new THREE.MeshBasicNodeMaterial({color:'#ffe6b4'}),sky:new THREE.MeshBasicNodeMaterial({map:nightMap(),side:THREE.DoubleSide}),glow:new THREE.MeshBasicNodeMaterial({map:glowMap(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.2}),ao:new THREE.MeshBasicNodeMaterial({map:aoMap(),transparent:true,depthWrite:false,opacity:.7}),plaque:new THREE.MeshToonNodeMaterial({map:plaqueMap(),gradientMap:ramp,vertexColors:true})};
 const ceilingTextures=await Promise.all(['diff','nor_gl'].map(kind=>texLoader.loadAsync('/textures/ceiling/paneled-'+kind+'.webp')));
 for(const tex of ceilingTextures){tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(1.5,2);tex.anisotropy=4;}
 ceilingTextures[0].colorSpace=THREE.SRGBColorSpace;
mats.ceiling.opacityNode=nicheInside.mul(step(4.6,positionWorld.x.abs())).mul(step(positionWorld.y,7.1)).oneMinus();mats.ceiling.alphaTest=.5;
 mats.ceiling.map=ceilingTextures[0];mats.ceiling.colorNode=texture(ceilingTextures[0]).rgb.mul(2);mats.ceiling.normalMap=ceilingTextures[1];mats.ceiling.normalScale=new THREE.Vector2(.65,.65);
 mats.leaf.side=THREE.DoubleSide;
 mats.azulejo=new THREE.MeshStandardNodeMaterial({map:azulejoMap(),roughness:.38,metalness:.02,vertexColors:true,side:THREE.DoubleSide});
 mats.chandelier=new THREE.MeshBasicNodeMaterial({color:new THREE.Color('#ffe6b4').multiplyScalar(2.6)});
 mats.wood.map=timberMap();mats.wood.color.set('#ffffff');
 // Stylized baked lamp bounce follows the moving bays. Fixed shader cost, no light per niche.
 const localZ=positionWorld.z.sub(galleryPhase).add(smoothstep(-2.8,2.8,positionWorld.x).mul(BAY_LENGTH/2)).add(BAY_LENGTH*64+BAY_LENGTH/2).mod(BAY_LENGTH).sub(BAY_LENGTH/2);
 const pool=smoothstep(0,5.8,localZ.abs()).oneMinus();
 const sideBounce=positionWorld.x.abs().sub(4.7).abs().mul(.22).add(positionWorld.y.sub(galleryLightHeight.sub(2.35)).abs().mul(.13)).add(localZ.abs().mul(.06));
 const setFocus=smoothstep(1.5,3.5,localZ.abs()).oneMinus().mul(smoothstep(3.9,5.3,positionWorld.x.abs())).mul(smoothstep(1.9,4.6,positionWorld.y).oneMinus());
 const warmth=smoothstep(.15,1.8,sideBounce).oneMinus().mul(.27).add(pool.mul(.07));
 for(const [key,m]of Object.entries(mats)){
  if(['lamp','chandelier','sky','glow','ao'].includes(key))continue;
  const base=m.map?texture(m.map).rgb:color(m.color);
  m.emissiveNode=base.mul(vec3(1,.68,.33)).mul(warmth);
  // Soft indirect fill reveals the paneled soffit without adding per-bay lights.
  if(key==='ceiling')m.emissiveNode=m.emissiveNode.add(base.mul(vec3(.43,.36,.28)));
  if(key==='wood'){
   const roofLift=smoothstep(4.8,6.1,positionWorld.y);
   m.emissiveNode=m.emissiveNode.add(base.mul(key==='wood'?.19:.32).add(vec3(.025,.024,.032)).mul(roofLift));
  }
  m.emissiveNode=m.emissiveNode.mul(galleryBrightness);
  applyReceivedLighting(m);
  if(key==='ceiling')applyRoofBrightness(m);
 }
 mats['roof-placeholder']=mats.wood;
 return mats;
}

// A single detailed architectural bay is baked into one geometry per material.
// Every visible bay is an instance of those geometries: fixed memory, bounded draw calls.
class BayBuilder{
 constructor(timberLayout){this.parts=new Map();this.obj=new THREE.Object3D();this.timberLayout=timberLayout;}
 add(key,g,p=[0,0,0],r=[0,0,0],s=[1,1,1],tint='#ffffff'){
  if(key==='wood'&&p[1]>5)key='roof-placeholder';
  g=g.index?g.toNonIndexed():g;
  this.obj.position.set(...p);this.obj.rotation.set(...r);this.obj.scale.set(...s);this.obj.updateMatrix();g.applyMatrix4(this.obj.matrix);
  if(this.offsetZ)g.translate(0,0,this.offsetZ);
  if(this.offsetY)g.translate(0,this.offsetY,0);
  const c=new THREE.Color(tint),colors=new Float32Array(g.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));
  if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  for(const attr of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(attr))g.deleteAttribute(attr);
  if(!this.parts.has(key))this.parts.set(key,[]);this.parts.get(key).push(g);
 }
 box(key,p,s,r=[0,0,0],tint){
  if(key==='wood'&&p[1]>5){
   const axis=s.indexOf(Math.max(...s)),direction=new THREE.Vector3().setComponent(axis,1),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction));
   const cross=s.filter((_,i)=>i!==axis);this.timberLayout.push(new THREE.Matrix4().compose(new THREE.Vector3(...p),q,new THREE.Vector3(cross[0],s[axis],cross[1])));
  }
  this.add(key,new THREE.BoxGeometry(1,1,1),p,r,s,tint);
 }
 round(key,p,s,r=[0,0,0],radius=.1){this.add(key,new RoundedBoxGeometry(...s,2,radius),p,r);}
 beam(a,b,width=.15,depth=width,key='wood'){
  const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),dir=bv.clone().sub(av);const length=dir.length();if(key==='wood'&&(a[1]+b[1])*.5>5)this.timberLayout.push(new THREE.Matrix4().compose(av.clone().add(bv).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize()),new THREE.Vector3(width,length,depth)));const g=new THREE.BoxGeometry(width,length,depth);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()));this.add(key,g,av.add(bv).multiplyScalar(.5).toArray());
 }
 finish(){const result=new Map();for(const [key,arr]of this.parts){const g=mergeGeometries(arr,false);g.computeBoundingSphere();result.set(key,g);arr.forEach(p=>p.dispose());}return result;}
}
function arch(radius,spring,thickness,depth){
 const s=new THREE.Shape(),r=radius,t=thickness;s.moveTo(-r-t,0);s.lineTo(-r-t,spring);s.absarc(0,spring,r+t,Math.PI,0,true);s.lineTo(r+t,0);s.lineTo(r,0);s.lineTo(r,spring);s.absarc(0,spring,r,0,Math.PI,false);s.lineTo(-r,0);s.closePath();
 return new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:2,steps:1,curveSegments:28});
}
function arcBand(r,spring,t,depth){const s=new THREE.Shape();s.absarc(0,spring,r+t,0,Math.PI,false);s.absarc(0,spring,r,Math.PI,0,true);s.closePath();return new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:32});}
function patternedArc(inner,outer,spring){const p=[],uv=[],idx=[];for(let i=0;i<=64;i++){const a=i/64*Math.PI;for(let j=0;j<2;j++){const r=j?outer:inner;p.push(Math.cos(a)*r,Math.sin(a)*r+spring,-.04);uv.push(i/64,j);}}for(let i=0;i<64;i++){const v=i*2;idx.push(v,v+1,v+2,v+1,v+3,v+2);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;}
function leafGeometry(){const p=[],uv=[],idx=[];for(let i=0;i<=8;i++){const t=i/8,w=Math.sin(Math.PI*t)*.18;for(let side=-1;side<=1;side+=2){p.push(side*w,t*.75,Math.sin(t*Math.PI)*.13);uv.push((side+1)/2,t);}}for(let i=0;i<8;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;}
function solidArcade(){
 const s=new THREE.Shape();s.moveTo(-6,0);s.lineTo(-6,6.58);s.lineTo(6,6.58);s.lineTo(6,0);s.lineTo(2.7,0);s.lineTo(2.7,2.6);s.absarc(0,2.6,2.7,0,Math.PI,false);s.lineTo(-2.7,0);s.closePath();
 return new THREE.ExtrudeGeometry(s,{depth:1.1,bevelEnabled:false,curveSegments:28});
}
// One continuous beveled entablature receives every pilaster.
// The shafts tuck into its underside instead of carrying oversized separate caps.
function continuousCornice(side){
 const profile=[[4.14,6.49],[4.14,6.53],[4.035,6.62],[4.035,6.76],[5.875,6.76],[5.875,6.49]];
 const shape=new THREE.Shape();profile.forEach(([x,y],i)=>i?shape.lineTo(side*x,y):shape.moveTo(side*x,y));shape.closePath();
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:BAY_LENGTH,bevelEnabled:false,steps:1});geometry.translate(0,0,-BAY_LENGTH/2);return geometry;
}
function buildBay(timberLayout){
 const b=new BayBuilder(timberLayout);const pitch=Math.atan2(2.3,7.8);let seed=75;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 // Travertine borders, hand-made terracotta, fine brass inlays.
 b.add('floor',new THREE.PlaneGeometry(8.3,BAY_LENGTH),[0,.005,0],[-Math.PI/2,0,0]);
 b.add('carpet',new THREE.PlaneGeometry(4.6,BAY_LENGTH),[0,.023,0],[-Math.PI/2,0,0]);
 for(const side of [-1,1])b.box('gold',[side*2.32,.018,0],[.018,.018,BAY_LENGTH]);
 for(const side of [-1,1]){
  b.offsetZ=side===1?-BAY_LENGTH/2:0;
  b.box('stone',[side*5.9,-.09,0],[3.5,.18,BAY_LENGTH]);
  for(const x of [4.08,4.24])b.box('gold',[side*x,.015,0],[.018,.012,BAY_LENGTH]);
  b.box('dark',[side*4.16,.009,0],[.1,.014,BAY_LENGTH]);
  // Rounded display platform, empty and ready for future character sets.
  b.round('gold',[side*6.25,.045,0],[2.8,.035,5.3],[0,0,0],.08);
  b.round('stone',[side*6.25,.12,0],[2.76,.18,5.26],[0,0,0],.09);
  const angle=side*Math.PI/2;
  b.add('plaster',solidArcade(),[side*4.85,.18,0],[0,angle,0]);
  b.add('stone',arch(2.7,2.6,.38,.8),[side*4.65,.18,0],[0,angle,0]);
  // Continuous masonry, deep portal reveals, broad cornices and paneled dado.
  b.add('stone',continuousCornice(side));
  b.box('gold',[side*4.02,6.68,0],[.025,.025,BAY_LENGTH]);
  for(const z of [-4.65,4.65]){
   b.box('blue',[side*4.79,.67,z],[.14,1.28,2.7]);
   b.box('stone',[side*4.68,.12,z],[.4,.24,2.9]);
   b.box('gold',[side*4.68,1.32,z],[.16,.045,2.75]);
   b.box('stone',[side*4.77,3.65-PORTRAIT_WALL_DROP,z],[.16,3.25,2.45]);
   b.add('azulejo',new THREE.PlaneGeometry(2.3,3.1),[side*4.67,3.65-PORTRAIT_WALL_DROP,z],[0,-side*Math.PI/2,0]);
  }
  b.add(side===1?'blue':'clay',arcBand(3.08,2.6,.55,.43),[side*4.66,.18,0],[0,angle,0]);
  b.add('motif',patternedArc(3.1,3.61,2.6),[side*4.66,.18,0],[0,angle,0]);
  b.add('gold',arcBand(3.05,2.6,.035,.45),[side*4.64,.18,0],[0,angle,0]);
  b.add('gold',arcBand(3.63,2.6,.035,.45),[side*4.64,.18,0],[0,angle,0]);
  // Recessed back wall with a second arch: layers add depth to empty niches.
  b.box('plaster',[side*7.72,3.45,0],[.2,6.9,BAY_LENGTH]);
  b.box('blue',[side*7.59,2.5,0],[.04,4.55,5.4]);
  b.add('plaster',arch(2.3,2.25,.2,.12),[side*7.51,.22,0],[0,angle,0]);
  b.box('blue',[side*7.4,.49,0],[.15,.5,BAY_LENGTH]);
  b.box('gold',[side*7.3,.76,0],[.022,.025,BAY_LENGTH]);
  // Travertine pilasters, stepped plinths, fluted insets.
  for(const z of [-3.65,3.65]){
   b.round('clay',[side*4.66,3.26,z],[1.05,6.52,.9],[0,0,0],.06);
   // Slim ceramic trough rests on the cornice and clears the wooden bearing.
   b.round('ceramic',[side*3.99,6.87,z],[.56,.22,1.3],[0,0,0],.035);
   b.box('dark',[side*3.99,6.983,z],[.49,.008,1.23]);
   b.box('gold',[side*3.705,6.94,z],[.018,.022,1.28]);
   b.box('stone',[side*4.64,.23,z],[1.3,.46,1.15]);
   b.box('gold',[side*4.7,.41,z],[.73,.035,.55]);
   // Restored slender pilasters; trailing greenery softens their meeting with the cornice.
   for(let f=-2;f<=2;f++)b.box('stone',[side*4.1,3.45,z+f*.115],[.065,5.4,.04]);
  }
  // Frieze on the rear entablature, authored geometric motif.
  b.add('motif',new THREE.PlaneGeometry(BAY_LENGTH,.64),[side*7.59,5.65,0],[0,-side*Math.PI/2,0]);
  // Velvet museum cordons frame the empty exhibits without entering the red carpet.
  for(const z of [-2,2]){
   b.add('gold',new THREE.CylinderGeometry(.17,.22,.06,16),[side*3.98,.04,z]);
   b.add('gold',new THREE.CylinderGeometry(.027,.04,.87,10),[side*3.98,.5,z]);
   b.add('gold',new THREE.SphereGeometry(.075,12,8),[side*3.98,.96,z]);
  }
  const cord=new THREE.CatmullRomCurve3([new THREE.Vector3(side*3.98,.94,-2),new THREE.Vector3(side*3.98,.7,0),new THREE.Vector3(side*3.98,.94,2)]);
  b.add('rope',new THREE.TubeGeometry(cord,20,.027,6,false));
  // Recessed ceiling spots and small sconces; pooled light is baked geometry.
  for(const z of [-2,2]){
   b.add('glow',new THREE.PlaneGeometry(3.3,2.6),[side*7.58,1.55,z],[0,-side*Math.PI/2,0]);
   b.add('glow',new THREE.PlaneGeometry(3.2,3.2),[side*6.3,.19,z],[-Math.PI/2,0,0]);
  }
  for(const z of [-3.35,3.35]){
   b.box('gold',[side*4.31,1.9,z],[.15,.32,.15]);
   b.add('lamp',new THREE.CylinderGeometry(.065,.065,.22,10),[side*4.2,1.9,z]);
  }

 }
 b.offsetZ=0;
 // Roof bearings sit on the masonry crown at y=6.76 m.
 // The main pitched roof covers the aisle; lower flat soffits close the alcoves.
 const roofSpan=4.65,roofRise=1.8,roofPitch=Math.atan2(roofRise,roofSpan),slope=Math.hypot(roofSpan,roofRise);
 for(const side of [-1,1]){
  b.box('ceiling',[side*roofSpan/2,8.31,0],[slope,.14,BAY_LENGTH],[0,0,-side*roofPitch]);
  b.box('ceiling',[side*6.2,6.92,0],[3.1,.14,BAY_LENGTH]);
  for(let x=.2;x<roofSpan;x+=.85)b.box('wood',[side*x,9.06-x*roofRise/roofSpan-.12,0],[.15,.13,BAY_LENGTH],[0,0,-side*roofPitch]);
  for(let z=-BAY_LENGTH/2;z<BAY_LENGTH/2;z+=3)b.beam([0,8.94,z],[side*roofSpan,7.14,z],.38,.4);
  for(const x of [1.3,3.05])b.box('wood',[side*x,8.94-x*roofRise/roofSpan-.18,0],[.32,.36,BAY_LENGTH],[0,0,-side*roofPitch]);
  b.box('wood',[side*4.7,6.98,0],[.42,.42,BAY_LENGTH]);
  b.box('wood',[side*4.76,7.23,0],[.18,.3,BAY_LENGTH]);
 }
 b.box('wood',[0,8.90,0],[.5,.42,BAY_LENGTH]);
 for(const z of [-BAY_LENGTH/2]){
  b.beam([-4.9,6.98,z],[4.9,6.98,z],.42,.54);
  b.beam([0,7.0,z],[0,8.82,z],.34,.36);
  for(const side of [-1,1])b.beam([side*3.7,7.05,z],[side*1.4,8.28,z],.28,.32);
 }
 // Preserve the chandelier body height and extend only its suspension.
 b.add('gold',new THREE.CylinderGeometry(.025,.025,3.38,12),[0,7.39,0]);
 return b.finish();
}

// Separa os triângulos da parede do fundo dos nichos (|x| > BACK_X) em geometrias próprias, que compartilham os mesmos buffers.
const BACK_X=7.28,NICHE_X=1e9; /* desligado: cortar a parede do museu por x deixava lajes soltas */ // NICHE_X: tudo ATRÁS da parede do museu (alcova: parede do fundo, forro, piso e luzes do nicho) vira peça própria, que um set com `openWalls` esconde nessa baia e nas vizinhas; a parede do museu (portal, pilastras, cornija) fica
function splitBack(key,g){
 const pos=g.attributes.position,idx=g.index,n=(idx?idx.count:pos.count)/3,main=[],L=[],R=[],CL=[],CR=[],NL=[],NR=[];
 for(let t=0;t<n;t++){const a=idx?idx.getX(t*3):t*3,b=idx?idx.getX(t*3+1):t*3+1,c=idx?idx.getX(t*3+2):t*3+2;const x=(pos.getX(a)+pos.getX(b)+pos.getX(c))/3,y=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3,cord=key==='rope'||(key==='gold'&&Math.abs(x)>3.9&&Math.abs(x)<4.07&&y<1.1);(x<-BACK_X?L:x>BACK_X?R:cord?(x<0?CL:CR):x<-NICHE_X?NL:x>NICHE_X?NR:main).push(a,b,c);}
 if(!L.length&&!R.length&&!CL.length&&!CR.length&&!NL.length&&!NR.length)return [{geo:g,side:0,kind:''}];
 const mk=arr=>{const ng=new THREE.BufferGeometry();for(const k of Object.keys(g.attributes))ng.setAttribute(k,g.attributes[k]);ng.setIndex(arr);return ng;};
 return [{geo:mk(main),side:0,kind:''},...(L.length?[{geo:mk(L),side:-1,kind:'back'}]:[]),...(R.length?[{geo:mk(R),side:1,kind:'back'}]:[]),...(CL.length?[{geo:mk(CL),side:-1,kind:'cord'}]:[]),...(CR.length?[{geo:mk(CR),side:1,kind:'cord'}]:[]),...(NL.length?[{geo:mk(NL),side:-1,kind:'niche'}]:[]),...(NR.length?[{geo:mk(NR),side:1,kind:'niche'}]:[])];
}
export class Gallery{
 constructor(scene,materials,{count=13}={}){
  this.scene=scene;this.materials=materials;this.count=count;this.meshes=[];this.props=[];this.matrix=new THREE.Matrix4();this.zero=new THREE.Matrix4().makeScale(0,0,0);this.obj=new THREE.Object3D();this.progress=0;this.behind=Math.floor(count/2);this.base=-this.behind;this.recycles=0;this.slots=Array.from({length:count},(_,i)=>i-1);
  this.timberLayout=[];
  for(const [key,geometry0]of buildBay(this.timberLayout))for(const {geo:geometry,side:backSide,kind}of splitBack(key,geometry0)){
   const mesh=new THREE.InstancedMesh(geometry,materials[key],count);mesh.name=`gallery-${key}${backSide?(kind==='cord'?'-cord':kind==='niche'?'-niche':'-back')+(backSide<0?'L':'R'):''}`;mesh.userData.part=kind;mesh.userData.back=backSide;mesh.castShadow=['wood','roof-placeholder','plaster','clay','blue'].includes(key);mesh.receiveShadow=!['sky','lamp','glow','ao'].includes(key);mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);if(key==='leaf')materials[key].side=THREE.DoubleSide;this.meshes.push(mesh);scene.add(mesh);
  }
  this.update(0);
 }
 // Parede do fundo de um nicho pode ser aberta (set com openBack): some só nessa baia (a do nicho esquerdo; a do direito fica entre duas baias).
 // openWalls: a rua do set continua pelas baias vizinhas do mesmo lado (±1), senão as paredes delas cortariam as casas.
 bayFlag(prop,side,logical){if(this.sets?.empty)return false;const w=prop==='openWalls'?1:0;return !!this.sets?.entries?.some(e=>e.character[prop]&&(prop!=='openWalls'||e.inside)&&e.side===side&&(side===-1?Math.abs(logical-e.bay)<=w:(logical>=e.bay-w&&logical<=e.bay+1+w)));}
 update(progress){
  // Câmera parada (set aberto): nada muda, então não reenvia à GPU as matrizes de centenas de instâncias a cada quadro (travadinhas + lixo de memória).
  if(progress===this.lastProgress&&!this.dirty)return;this.lastProgress=progress;this.dirty=false;
  this.progress=progress;const base=Math.floor(progress/BAY_LENGTH)-this.behind;if(base!==this.base){this.recycles+=Math.abs(base-this.base);this.base=base;}
  // Camera stays near the origin. Reposition a bounded ring; no growing world coordinates.
  const phase=progress%BAY_LENGTH;
  galleryPhase.value=phase;
  this.sets?.update(progress);
  for(let i=0;i<this.count;i++){
   const logical=base+i;this.slots[i]=logical;const z=-(i-this.behind)*BAY_LENGTH+phase;
   this.matrix.makeTranslation(0,0,z);
   for(const mesh of this.meshes){const bk=mesh.userData.back;const pt=mesh.userData.part;mesh.setMatrixAt(i,bk&&(this.bayFlag(pt==='cord'?'ownCordon':pt==='niche'?'openWalls':'openBack',bk,logical)||(pt==='back'&&this.bayFlag('openWalls',bk,logical)))?this.zero:this.matrix);}

  }
  for(const m of [...this.meshes,...this.props])m.instanceMatrix.needsUpdate=true;
  this.curated?.update(progress);
  this.timber?.update(progress);
  this.hangingPlants?.update(progress);
 }
 getStats(){return{hangingPlants:this.hangingPlants?.getStats()??null,timber:this.timber?.getStats()??null,residentBays:this.count,behindBays:this.behind,curated:this.curated?.getStats()??null,bayLength:BAY_LENGTH,distance:Math.round(this.progress*100)/100,recycles:this.recycles,firstBay:this.base,geometryGroups:this.meshes.length,plantGroups:this.props.length,slots:[...this.slots]};}
}










