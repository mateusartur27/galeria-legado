"""
build_kid.py — monta o personagem "mensageiro" a partir de assets CC0 da Quaternius, em modo headless.

Fontes (CC0 1.0, ver License*.txt nos zips em D:\\threejs-lab\\assets\\quaternius):
  - Universal Base Characters [Standard]  → corpo Superhero_Female + cabelo rigado na cabeça
  - Universal Animation Library [Standard] → animações (FBX "Unreal Engine": mesmo esqueleto do corpo)

Saída:
  public/models/kid.glb        corpo + cabelo + mochila, COR POR VÉRTICE (sem texturas), esqueleto
  public/models/kid_anims.glb  só o esqueleto + animações (Idle/Walk/Jog/Sprint/Jump)

Estilo (Messenger): casaco laranja, calça preta larga até a canela, meia clara, tênis preto, mochila vermelha.
As cores saem do osso dominante de cada vértice; a roupa é "inflada" pela normal → volume e borda que o contorno desenha.

Uso:
  & "D:\\blender-5.1.0-windows-x64\\blender.exe" -b --factory-startup --python tools/character/build_kid.py -- [--hair Hair_Long]
"""
import bpy
import sys
import os
from mathutils import Vector

argv = sys.argv[ sys.argv.index( '--' ) + 1: ] if '--' in sys.argv else []
HAIR = argv[ argv.index( '--hair' ) + 1 ] if '--hair' in argv else 'Hair_Long'

ASSETS = r'D:\threejs-lab\assets\quaternius'
BODY = os.path.join( ASSETS, r'ubc\x\standard\Base Characters\Godot - UE\Superhero_Female_FullBody.gltf' )
HAIR_FILE = os.path.join( ASSETS, r'ubc\x\standard\Hairstyles\Rigged to Head Bone\glTF (Godot -Unreal)', HAIR + '.gltf' )
ANIMS = os.path.join( ASSETS, r'ual\x\standard\Unreal Engine\AL_Standard.fbx' )
OUT_DIR = os.path.join( os.path.dirname( os.path.abspath( __file__ ) ), '..', '..', 'public', 'models' )
os.makedirs( OUT_DIR, exist_ok=True )

KEEP_ANIMS = [ 'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land' ]

# paleta (sRGB) — referência: screenshot do Messenger
PAL = {
	'skin': '#f1d2b6', 'jacket': '#e8743b', 'pants': '#25272c', 'sock': '#e9e4d6', 'shoe': '#1d1e22',
	'hair': '#1f1d22', 'brow': '#1f1d22', 'eye': '#1a1a1e', 'bag': '#b8362f', 'bagLogo': '#efe6d0', 'strap': '#7d241f'
}


def lin( hex_ ):

	h = hex_.lstrip( '#' )
	c = [ int( h[ i:i + 2 ], 16 ) / 255 for i in ( 0, 2, 4 ) ]
	return [ ( x / 12.92 if x <= 0.04045 else ( ( x + 0.055 ) / 1.055 ) ** 2.4 ) for x in c ] + [ 1.0 ]


def paint( mesh_obj, color_of_vertex ):

	me = mesh_obj.data
	attr = me.color_attributes.new( 'Col', 'FLOAT_COLOR', 'POINT' )
	for v in me.vertices:
		attr.data[ v.index ].color = color_of_vertex( v )
	me.color_attributes.active_color = attr
	me.color_attributes.render_color_index = me.color_attributes.find( 'Col' )


def import_gltf( path ):

	before = set( bpy.data.objects )
	bpy.ops.import_scene.gltf( filepath=path )
	return [ o for o in bpy.data.objects if o not in before ]


bpy.ops.wm.read_factory_settings( use_empty=True )

# ------------------------------------------------------------------ corpo
objs = import_gltf( BODY )
arm = next( o for o in objs if o.type == 'ARMATURE' )
arm.name = 'Kid'
meshes = [ o for o in objs if o.type == 'MESH' ]
body = next( o for o in meshes if 'Superhero' in o.name )

bones = arm.data.bones
mw = arm.matrix_world
def bone_head( name ): return mw @ bones[ name ].head_local

knee_z = ( bone_head( 'calf_l' ).z + bone_head( 'calf_r' ).z ) / 2
ankle_z = ( bone_head( 'foot_l' ).z + bone_head( 'foot_r' ).z ) / 2
sock_top = ankle_z + ( knee_z - ankle_z ) * 0.5  # calça larga até o meio da canela (Messenger)

JACKET = ( 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r' )
PANTS = ( 'pelvis', 'thigh_l', 'thigh_r' )
SHOE = ( 'foot_l', 'foot_r', 'ball_l', 'ball_r' )


def region( obj, v ):

	best, bw = None, 0
	for g in v.groups:
		if g.weight > bw:
			bw, best = g.weight, obj.vertex_groups[ g.group ].name
	z = ( obj.matrix_world @ v.co ).z
	if best in JACKET: return 'jacket'
	if best in PANTS: return 'pants'
	if best in ( 'calf_l', 'calf_r' ): return 'pants' if z > sock_top else 'sock'
	if best in SHOE: return 'shoe'
	return 'skin'  # cabeça, pescoço, mãos


# volume da roupa (m): o degrau na borda vira linha de contorno, como costura de desenho
INFLATE = { 'jacket': 0.02, 'pants': 0.03, 'shoe': 0.014, 'sock': 0.006, 'skin': 0.0 }
regions = [ region( body, v ) for v in body.data.vertices ]
for v, r in zip( body.data.vertices, regions ):
	k = INFLATE[ r ]
	if r == 'pants':
		# calça "pantalona": abre mais perto da barra
		z = ( body.matrix_world @ v.co ).z
		k += max( 0.0, ( knee_z + 0.15 - z ) / ( knee_z + 0.15 - sock_top + 1e-6 ) ) * 0.06
	v.co += v.normal * k
paint( body, lambda v: lin( PAL[ regions[ v.index ] ] ) )

for o in meshes:
	if o is body: continue
	n = o.name.lower()
	paint( o, lambda v, c=lin( PAL[ 'eye' if 'eye' in n and 'brow' not in n else 'brow' ] ): c )

# ------------------------------------------------------------------ cabelo (rigado no osso Head)
hair_objs = import_gltf( HAIR_FILE )
head_z = bone_head( 'Head' ).z
for o in hair_objs:
	if o.type != 'MESH': continue
	o.name = 'Hair'
	# corte "chanel" (Messenger): apaga o cabelo abaixo da linha do queixo
	if '--bob' in argv:
		import bmesh
		cut = head_z + float( argv[ argv.index( '--bob' ) + 1 ] )
		bm = bmesh.new()
		bm.from_mesh( o.data )
		bmesh.ops.delete( bm, geom=[ v for v in bm.verts if ( o.matrix_world @ v.co ).z < cut ], context='VERTS' )
		bm.to_mesh( o.data )
		bm.free()
	paint( o, lambda v: lin( PAL[ 'hair' ] ) )
	world = o.matrix_world.copy()
	o.parent = arm
	o.matrix_world = world
	for m in o.modifiers:
		if m.type == 'ARMATURE': m.object = arm
	if not any( m.type == 'ARMATURE' for m in o.modifiers ):
		mod = o.modifiers.new( 'Armature', 'ARMATURE' )
		mod.object = arm
	if 'Head' not in o.vertex_groups:
		g = o.vertex_groups.new( name='Head' )
		g.add( [ v.index for v in o.data.vertices ], 1.0, 'REPLACE' )
	meshes.append( o )
for o in hair_objs:
	if o.type == 'ARMATURE': bpy.data.objects.remove( o, do_unlink=True )

# ------------------------------------------------------------------ mochila (rígida no spine_03)
s3 = bone_head( 'spine_03' )
chest = bone_head( 'spine_02' )
back_dir = Vector( ( 0, 1, 0 ) )  # glTF +Z (frente) → Blender −Y: costas = +Y
depth = max( ( body.matrix_world @ v.co ).y for v in body.data.vertices if regions[ v.index ] == 'jacket' and abs( ( body.matrix_world @ v.co ).x ) < 0.08 )


def box( name, size, center, col, bevel=0.03 ):

	bpy.ops.mesh.primitive_cube_add( size=1, location=center )
	o = bpy.context.active_object
	o.name = name
	o.scale = size
	bpy.ops.object.transform_apply( scale=True )
	if bevel:
		b = o.modifiers.new( 'Bevel', 'BEVEL' )
		b.width = bevel
		b.segments = 2
		bpy.ops.object.modifier_apply( modifier=b.name )
	paint( o, lambda v: lin( col ) )
	g = o.vertex_groups.new( name='spine_03' )
	g.add( [ v.index for v in o.data.vertices ], 1.0, 'REPLACE' )
	world = o.matrix_world.copy()
	o.parent = arm
	o.matrix_world = world
	m = o.modifiers.new( 'Armature', 'ARMATURE' )
	m.object = arm
	return o


bag_c = Vector( ( 0, depth + 0.1, ( s3.z + chest.z ) / 2 - 0.04 ) )
meshes.append( box( 'Bag', ( 0.34, 0.17, 0.4 ), bag_c, PAL[ 'bag' ], 0.05 ) )
meshes.append( box( 'BagLid', ( 0.32, 0.12, 0.12 ), bag_c + Vector( ( 0, 0.03, 0.18 ) ), PAL[ 'bag' ], 0.04 ) )
meshes.append( box( 'BagLogo', ( 0.17, 0.02, 0.12 ), bag_c + Vector( ( 0, 0.088, -0.02 ) ), PAL[ 'bagLogo' ], 0.0 ) )
meshes.append( box( 'BagPocket', ( 0.22, 0.05, 0.12 ), bag_c + Vector( ( 0, 0.095, -0.13 ) ), PAL[ 'strap' ], 0.02 ) )

# ------------------------------------------------------------------ exporta o personagem
bpy.ops.object.select_all( action='DESELECT' )
arm.select_set( True )
for o in meshes: o.select_set( True )
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(
	filepath=os.path.join( OUT_DIR, 'kid.glb' ), export_format='GLB', use_selection=True,
	export_apply=True, export_yup=True, export_texcoords=False, export_normals=True,
	export_vertex_color='ACTIVE', export_materials='NONE', export_skins=True, export_animations=False
)

# ------------------------------------------------------------------ animações (esqueleto do FBX "Unreal")
bpy.ops.wm.read_factory_settings( use_empty=True )
bpy.ops.import_scene.fbx( filepath=ANIMS )
rig = next( o for o in bpy.data.objects if o.type == 'ARMATURE' )
for o in list( bpy.data.objects ):
	if o.type == 'MESH': bpy.data.objects.remove( o, do_unlink=True )
for a in list( bpy.data.actions ):
	short = a.name.split( '|' )[ -1 ]
	if short in KEEP_ANIMS:
		a.name = short
		a.use_fake_user = True
	else:
		bpy.data.actions.remove( a )
rig.animation_data_create()
rig.animation_data.action = bpy.data.actions[ 'Idle_Loop' ]
bpy.ops.object.select_all( action='DESELECT' )
rig.select_set( True )
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
	filepath=os.path.join( OUT_DIR, 'kid_anims.glb' ), export_format='GLB', use_selection=True,
	export_yup=True, export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
	export_materials='NONE', export_force_sampling=True
)
print( 'OK kid.glb + kid_anims.glb em', os.path.abspath( OUT_DIR ), 'cabelo:', HAIR )
