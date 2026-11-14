"""
build_nature.py — junta modelos CC0 do "Stylized Nature MegaKit [Standard]" (Quaternius) num único nature.glb, headless.

- Cada modelo vira UM objeto (malhas unidas), origem no pé, nome = nome do arquivo (o jogo instancia por nome).
- Estilo Messenger: casca e pedra ficam SEM textura (cor chapada vem da paleta no jogo); folhas mantêm só a textura
  de recorte (alfa) — a cor também vem da paleta. Mapas normais são descartados (luz em 2 tons não usa).
- Materiais renomeados para o jogo reconhecer: Leaf_* (recorte), Bark, Rock.

Uso:
  & "D:\\blender-5.1.0-windows-x64\\blender.exe" -b --factory-startup --python tools/nature/build_nature.py
Depois: node D:/threejs-lab/tools/optimize-glb.mjs public/models/nature.glb --texture webp
"""
import bpy
import os

SRC = r'D:\threejs-lab\assets\quaternius\nature\x\glTF'
OUT = os.path.join( os.path.dirname( os.path.abspath( __file__ ) ), '..', '..', 'public', 'models', 'nature.glb' )

MODELS = [
	'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5',
	'TwistedTree_1', 'TwistedTree_2', 'TwistedTree_3',
	'Bush_Common', 'Fern_1', 'Plant_1_Big', 'Plant_7_Big',
	'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'
]

bpy.ops.wm.read_factory_settings( use_empty=True )


def simplify_material( mat ):

	name = mat.name
	nt = mat.node_tree
	if not nt: return
	bsdf = next( ( n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED' ), None )
	# mapas normais fora
	for n in list( nt.nodes ):
		if n.type == 'NORMAL_MAP': nt.nodes.remove( n )
	if name.startswith( 'Leaves' ) or name.startswith( 'Leaf' ):
		mat.name = 'Leaf_' + name.split( '.' )[ 0 ]
		return
	# casca/pedra: sem textura nenhuma
	for n in list( nt.nodes ):
		if n.type == 'TEX_IMAGE': nt.nodes.remove( n )
	if bsdf: bsdf.inputs[ 'Base Color' ].default_value = ( 0.5, 0.5, 0.5, 1 )
	mat.name = 'Rock' if 'Rock' in name else 'Bark'


done = []
for model in MODELS:

	before = set( bpy.data.objects )
	bpy.ops.import_scene.gltf( filepath=os.path.join( SRC, model + '.gltf' ) )
	new = [ o for o in bpy.data.objects if o not in before ]
	meshes = [ o for o in new if o.type == 'MESH' ]
	for o in new:
		if o.type != 'MESH': continue
		o.parent = None
	bpy.ops.object.select_all( action='DESELECT' )
	for o in meshes: o.select_set( True )
	bpy.context.view_layer.objects.active = meshes[ 0 ]
	bpy.ops.object.transform_apply( location=True, rotation=True, scale=True )
	if len( meshes ) > 1: bpy.ops.object.join()
	obj = bpy.context.view_layer.objects.active
	obj.name = model
	obj.data.name = model
	for o in new:
		if o.name in bpy.data.objects and o.type != 'MESH': bpy.data.objects.remove( o, do_unlink=True )
	done.append( obj )

for m in bpy.data.materials: simplify_material( m )
# materiais duplicados (Leaves_X.001) → um só por nome base
for obj in done:
	for slot in obj.material_slots:
		base = slot.material.name.split( '.' )[ 0 ]
		if base in bpy.data.materials: slot.material = bpy.data.materials[ base ]

# lado a lado no x (só para inspecionar no Blender; o jogo reposiciona)
for i, obj in enumerate( done ):
	obj.location = ( i * 6, 0, 0 )

bpy.ops.object.select_all( action='DESELECT' )
for o in done: o.select_set( True )
os.makedirs( os.path.dirname( OUT ), exist_ok=True )
bpy.ops.export_scene.gltf(
	filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
	export_texcoords=True, export_normals=True, export_materials='EXPORT', export_animations=False,
	export_image_format='WEBP'
)
print( 'OK nature.glb', len( done ), 'modelos ->', os.path.abspath( OUT ) )
