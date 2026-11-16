import bpy, json, math, os, sys, traceback
from pathlib import Path
from mathutils import Vector

source=Path('C:/Users/Mateus/OneDrive/Desktop/NEGROS')
dest=Path('D:/ProjectGames/galeria-legado/public/models/rig-studio');dest.mkdir(parents=True,exist_ok=True)
catalog=[('aleijadinho','Aleijadinho','Rigs/Aleijadinho - Rig.blend',1.55),('machado','Machado de Assis','Rigs/Machado de Assis - Rig.blend',1.72),('reboucas','André Rebouças','Rigs/André Rebouças - Rig.blend',1.75),('adhemar','Adhemar','Adhemar.blend',1.78),('pele','Pelé','Pelé.blend',1.73),('gloria','Glória Maria','Glória Maria.blend',1.68),('luiz-gama','Luiz Gama','Luiz Gama.blend',1.75),('milton','Milton Santos','Milton Santos.blend',1.72),('nilo','Nilo','Nilo.blend',1.75),('pixinguinha','Pixinguinha','Pixinguinha.blend',1.75)]
only=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
report=json.loads((dest/'catalog.json').read_text(encoding='utf-8')) if only and (dest/'catalog.json').exists() else []
for cid,label,file,height in catalog:
 if only and cid not in only:continue
 try:
  print('STUDIO_START',cid,flush=True)
  bpy.ops.wm.open_mainfile(filepath=str(source/file))
  if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
  meshes=[o for o in bpy.context.view_layer.objects if o.type=='MESH' and not o.name.startswith('WGT-')]
  if cid=='machado':meshes=[o for o in meshes if o.name in ['Machado - cabeça','Machado - corpo']]
  rigs=list({m.object for o in meshes for m in o.modifiers if m.type=='ARMATURE' and m.object})
  for rig in rigs:
   rig.animation_data_clear();rig.data.pose_position='REST'
  for o in meshes:
   o.animation_data_clear()
   # Export only the character mesh; these source files contain body/head and optional accessories.
   for mod in list(o.modifiers):
    if mod.type not in ['ARMATURE']:o.modifiers.remove(mod)
  total=sum(len(o.data.polygons) for o in meshes)
  for o in meshes:
   if len(o.data.polygons)>15000:
    bpy.context.view_layer.objects.active=o;o.hide_set(False)
    if o.data.shape_keys:
     o.shape_key_clear()
    extent=max(o.dimensions)
    weld=o.modifiers.new('Weld disconnected source triangles','WELD');weld.merge_threshold=max(1e-7,extent*1e-6);weld.mode='ALL'
    bpy.ops.object.modifier_apply(modifier=weld.name)
    mod=o.modifiers.new('Studio preview','DECIMATE');mod.ratio=min(1,65000/max(total,1));mod.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=mod.name)
  # Keep packed source textures but bound their GPU footprint in this dedicated preview export.
  for image in bpy.data.images:
   if image.size[0]>1024 or image.size[1]>1024:
    fac=1024/max(image.size);image.scale(max(1,int(image.size[0]*fac)),max(1,int(image.size[1]*fac)))
  bpy.ops.object.select_all(action='DESELECT')
  for o in meshes+rigs:o.hide_set(False);o.hide_viewport=False;o.select_set(True)
  points=[o.matrix_world@Vector(p) for o in meshes for p in o.bound_box]
  bounds=[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
  bpy.ops.export_scene.gltf(filepath=str(dest/(cid+'.glb')),use_selection=True,export_format='GLB',export_apply=False,export_skins=True,export_def_bones=True,export_animations=False,export_yup=True,export_image_format='JPEG',export_jpeg_quality=85,export_vertex_color='ACTIVE',export_cameras=False,export_lights=False)
  entry=dict(id=cid,name=label,model='/models/rig-studio/'+cid+'.glb',height=height,source=file,rigged=bool(rigs),bones=[b.name for r in rigs for b in r.data.bones if b.use_deform],bounds=bounds)
  report=[e for e in report if e['id']!=cid];report.append(entry);(dest/'catalog.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
  print('STUDIO_DONE',cid,'bones',len(entry['bones']),'polygons',sum(len(o.data.polygons) for o in meshes),flush=True)
 except Exception as e:
  traceback.print_exc();print('STUDIO_FAILED',cid,str(e),flush=True)
print('STUDIO_COMPLETE',len(report),flush=True)
