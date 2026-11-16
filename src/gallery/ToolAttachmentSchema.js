export const TOOL_ATTACHMENT_SCHEMA='aleijadinho-tools/v1';
export const TOOL_ATTACHMENTS=[
 {id:'mallet',bone:'RightHand',label:'Marreta · mão direita'},
 {id:'chisel',bone:'LeftHand',label:'Ponteiro · mão esquerda'},
 ...['Right','Left'].flatMap(side=>[
  ...[1,2,3].map(n=>({id:side.toLowerCase()+'-forearm-'+n,bone:side+'ForeArm',label:(n===3?'Corda':'Tira '+n)+' · antebraço '+(side==='Right'?'direito':'esquerdo')})),
  ...[1,2].map(n=>({id:side.toLowerCase()+'-hand-'+n,bone:side+'Hand',label:'Tira '+n+' · punho '+(side==='Right'?'direito':'esquerdo')})),
 ]),
];
export function validToolAttachments(data){
 const vector=(v,max)=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=max);
 return data?.schema===TOOL_ATTACHMENT_SCHEMA&&Number.isFinite(Date.parse(data.createdAt))&&Array.isArray(data.items)&&data.items.length===TOOL_ATTACHMENTS.length&&data.items.every(item=>item&&typeof item==='object')&&new Set(data.items.map(i=>i.id)).size===TOOL_ATTACHMENTS.length&&TOOL_ATTACHMENTS.every(spec=>{
  const item=data.items.find(i=>i.id===spec.id);return (item?.bone===spec.bone||['left-forearm-2','left-forearm-3'].includes(spec.id)&&item?.bone==='LeftHand')&&vector(item.positionCm,200)&&vector(item.rotationDeg,360);
 });
}
