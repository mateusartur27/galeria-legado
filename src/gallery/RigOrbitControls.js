import { MathUtils } from 'three/webgpu';

export class RigOrbitControls {
 constructor(editor){
  this.e=editor;this.canvas=editor.game.renderer.domElement;this.points=new Map();this.events={
   pointerdown:event=>this.down(event),pointermove:event=>this.move(event),pointerup:event=>this.end(event),pointercancel:event=>this.end(event),lostpointercapture:event=>this.end(event),
   wheel:event=>{if(!editor.editing)return;event.preventDefault();editor.zoom=MathUtils.clamp(editor.zoom*Math.exp(-event.deltaY*.001),.55,2);editor.focus();this.sync();},
   contextmenu:event=>{if(editor.editing)event.preventDefault();},
  };
  for(const [name,handler] of Object.entries(this.events))this.canvas.addEventListener(name,handler,{passive:false});this.onBlur=()=>this.endAll();addEventListener('blur',this.onBlur);
 }
 sync(){const e=this.e,input=e.panel.querySelector('[data-orbit]'),zoom=e.panel.querySelector('.rig-zoom input');if(input)input.value=MathUtils.radToDeg(Math.atan2(Math.sin(e.orbitYaw),Math.cos(e.orbitYaw)));if(zoom)zoom.value=e.zoom;}
 down(event){if(!this.e.editing||![0,2].includes(event.button))return;event.preventDefault();this.points.set(event.pointerId,{x:event.clientX,y:event.clientY});this.canvas.setPointerCapture(event.pointerId);document.body.classList.add('rig-orbiting');this.reset();}
 reset(){const p=[...this.points.values()];if(p.length===1){this.last={...p[0]};}else if(p.length>=2)this.pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
 move(event){if(!this.points.has(event.pointerId))return;event.preventDefault();this.points.set(event.pointerId,{x:event.clientX,y:event.clientY});const e=this.e,p=[...this.points.values()];
  if(p.length===1){e.orbitYaw-=(p[0].x-this.last.x)*.008;e.orbitPitch=MathUtils.clamp(e.orbitPitch+(p[0].y-this.last.y)*.006,-1.15,1.15);this.last={...p[0]};}
  else{const d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(this.pinch>0)e.zoom=MathUtils.clamp(e.zoom*d/this.pinch,.55,2);this.pinch=d;}
  e.view='orbit';e.focus();this.sync();
 }
 end(event){this.points.delete(event.pointerId);if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);if(!this.points.size)document.body.classList.remove('rig-orbiting');this.reset();}
 endAll(){for(const id of this.points.keys())if(this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.points.clear();document.body.classList.remove('rig-orbiting');}
 dispose(){this.endAll();for(const [name,handler] of Object.entries(this.events))this.canvas.removeEventListener(name,handler);removeEventListener('blur',this.onBlur);}
}
