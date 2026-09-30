"""Mission Control's passers-by: the worker base as a person out walking.

The same stylised figure, parts and materials as the crew (mc_worker), at the
same placed scale (1.4 times, about 1.6 m), so a passer-by and a worker are
people of one city. A passer-by is not crew and never looks it: no hard hat,
no status band (never MC_STATUS_LIGHT), hair instead, a jacket's long
sleeves, and the city's warm civilian neutrals, never a place's identity blue
or a status hue.

The rig is the worker's with one more bone, `root`, on the ground between
the feet: the app moves a passer-by by its root along its way and the clips
move everything above it. Two clips, the feet on the ground at every frame,
measured on the evaluated mesh rather than assumed (ground()):
  MC_WALK   one stride pair, two steps, in WALK_FRAMES frames: the root
            stays put and the app plays it by the ground covered, so the
            feet keep to the pavement; the ground one clip covers is
            measured (stride()) and travels as the rig's `mc_stride`.
  MC_PAUSE  standing at ease: weight settling, a glance each way.
"""
import bpy
import math
from mathutils import Matrix, Vector
import mc_worker

WALK_FRAMES = 32
PAUSE_FRAMES = 96
SCALE = 1.4

# The worker's bones, hung from a root at the feet.
BONES = [('root', None, (0, 0, 0), (0, 0.12, 0))] + \
        [(n, 'root' if p is None else p, h, t) for n, p, h, t in mc_worker.BONES]

# Warm civilian neutrals from the library's coated family: a camel coat over
# charcoal, and a brown jacket over stone. Each is one draw with the crew's
# paints (the family's vertex colour).
OUTFITS = {
    'camel': dict(vest='MC_WOOD', shirt='MC_WOOD', pants='MC_PLINTH_DK', hair='MC_DP_GRAPHITE', prop='bag'),
    'brown': dict(vest='MC_CS_CAPY', shirt='MC_CS_CAPY', pants='MC_DP_STONE', hair='MC_CS_CHARCOAL', prop=None),
}


def _key(pb, frame, rot=None, loc=None):
    mc_worker._key(pb, frame, rot=rot, loc=loc)


def author_actions(arm):
    """MC_WALK and MC_PAUSE, rotations in degrees on the measured axes
    (mc_worker): a downward bone swings forward on +X, a knee bends on -X,
    an upward bone leans forward on -X and turns about its own Y. The hips'
    height is left to ground()."""
    def cyc(a, b, c, d):                          # contact, passing, contact, passing, contact
        q = WALK_FRAMES // 4
        return [(1, a), (1 + q, b), (1 + 2 * q, c), (1 + 3 * q, d), (1 + 4 * q, a)]
    walk = {
        # a restrained walk: modest strides, the swing knee lifting the foot clear
        'thigh.L':    cyc((24, 0, 0), (-2, 0, 0), (-20, 0, 0), (12, 0, 0)),
        'shin.L':     cyc((-4, 0, 0), (-6, 0, 0), (-14, 0, 0), (-46, 0, 0)),
        'thigh.R':    cyc((-20, 0, 0), (12, 0, 0), (24, 0, 0), (-2, 0, 0)),
        'shin.R':     cyc((-14, 0, 0), (-46, 0, 0), (-4, 0, 0), (-6, 0, 0)),
        # arms against the legs, loose and small
        'upperarm.L': cyc((-13, 0, -5), (0, 0, -5), (13, 0, -5), (0, 0, -5)),
        'upperarm.R': cyc((13, 0, 5), (0, 0, 5), (-13, 0, 5), (0, 0, 5)),
        'forearm.L':  cyc((8, 0, 0), (12, 0, 0), (20, 0, 0), (12, 0, 0)),
        'forearm.R':  cyc((20, 0, 0), (12, 0, 0), (8, 0, 0), (12, 0, 0)),
        # the shoulders turn a little against the hips; the head stays level
        'spine':      cyc((-3, 2, 0), (-3, 0, 0), (-3, -2, 0), (-3, 0, 0)),
        'head':       cyc((3, -2, 0), (3, 0, 0), (3, 2, 0), (3, 0, 0)),
    }
    q = PAUSE_FRAMES // 4
    # every limb keyed, so a switch from the walk never leaves a leg mid-stride
    still = [(1, (0, 0, 0)), (PAUSE_FRAMES + 1, (0, 0, 0))]
    pause = {
        'thigh.L': still, 'shin.L': still, 'thigh.R': still, 'shin.R': still,
        'spine':      [(1, (0, 0, 0)), (1 + q, (-1.2, 0, 0.8)), (1 + 2 * q, (0, 0, 0)), (1 + 3 * q, (-1.2, 0, -0.8)), (PAUSE_FRAMES + 1, (0, 0, 0))],
        'head':       [(1, (0, 0, 0)), (1 + q, (2, 18, 0)), (1 + 2 * q, (0, 0, 0)), (1 + 3 * q, (4, -14, 0)), (PAUSE_FRAMES + 1, (0, 0, 0))],
        'upperarm.L': [(1, (2, 0, -5)), (1 + 2 * q, (4, 0, -6)), (PAUSE_FRAMES + 1, (2, 0, -5))],
        'upperarm.R': [(1, (2, 0, 5)), (1 + 2 * q, (0, 0, 6)), (PAUSE_FRAMES + 1, (2, 0, 5))],
        'forearm.L':  [(1, (10, 0, 0)), (PAUSE_FRAMES + 1, (10, 0, 0))],
        'forearm.R':  [(1, (10, 0, 0)), (PAUSE_FRAMES + 1, (10, 0, 0))],
    }
    acts = {'WALK': mc_worker._action(arm, 'MC_WALK', walk, WALK_FRAMES),
            'PAUSE': mc_worker._action(arm, 'MC_PAUSE', pause, PAUSE_FRAMES)}
    return acts


def _lowest(body):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ev.matrix_world
    low = min((mw @ v.co).z for v in me.vertices)
    ev.to_mesh_clear()
    return low


def ground(arm, body, act, frames):
    """Key the hips' height on every frame so the lowest point of the figure
    (a sole, a heel or a toe) is exactly on the ground: nothing floats and
    nothing sinks. Returns the worst error left, in metres."""
    arm.animation_data.action = act
    hips = arm.pose.bones['hips']
    scn = bpy.context.scene
    lifts = []
    for f in range(1, frames + 2):
        scn.frame_set(f)
        hips.location = (0, 0, 0)
        bpy.context.view_layer.update()
        lifts.append(-_lowest(body))
    for f, lift in zip(range(1, frames + 2), lifts):
        hips.location = (0, lift, 0)              # the hips bone points up: its own Y is the world's up
        hips.keyframe_insert('location', frame=f)
    worst = 0.0
    for f in range(1, frames + 2):
        scn.frame_set(f)
        worst = max(worst, abs(_lowest(body)))
    return worst


def stride(arm, body, act):
    """The ground one MC_WALK covers: how far the left foot goes back relative
    to the root while it is down, from its contact in front to its contact
    behind, twice. Measured on the foot itself (the shoe's own points, by
    their centre), so the heel's roll onto the toe is not counted."""
    arm.animation_data.action = act
    scn = bpy.context.scene
    group = body.vertex_groups['shin.L'].index
    rest = body.data.vertices
    ids = [v.index for v in rest if v.co.z < 0.075 * SCALE and any(g.group == group and g.weight > 0.5 for g in v.groups)]

    def foot_y(f):
        scn.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        ev = body.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ev.matrix_world
        y = sum((mw @ me.vertices[i].co).y for i in ids) / len(ids)
        ev.to_mesh_clear()
        return y
    return abs(foot_y(1) - foot_y(1 + WALK_FRAMES // 2)) * 2.0


def make_walker(coll, name, role, loc=(0, 0, 0), rot_z=0.0, outfit='camel'):
    o = OUTFITS[outfit]
    arm = mc_worker._armature(name + '_Rig', coll, SCALE, bones=BONES)
    body = mc_worker._body(name, coll, o['vest'], o['pants'], o['shirt'], prop=o['prop'],
                           head='hair', sleeves='long', hair=o['hair'])
    body.data.transform(Matrix.Scale(SCALE, 4))
    body.parent = arm
    mod = body.modifiers.new('MC_Armature', 'ARMATURE')
    mod.object = arm
    acts = author_actions(arm)
    err_walk = ground(arm, body, acts['WALK'], WALK_FRAMES)
    err_pause = ground(arm, body, acts['PAUSE'], PAUSE_FRAMES)
    metres = stride(arm, body, acts['WALK'])
    arm.animation_data.action = acts['WALK']
    arm.location = loc
    arm.rotation_euler.z = math.radians(rot_z)
    arm['worker_pose'] = 'WALK'
    arm['worker_outfit'] = outfit
    arm['mc_role'] = role
    arm['mc_clips'] = ','.join(a.name for a in acts.values())
    arm['mc_stride'] = round(metres, 4)
    bpy.context.scene.frame_set(1)
    print('WALKER', role, outfit, 'stride %.4f m' % metres, 'ground error walk %.5f pause %.5f m' % (err_walk, err_pause))
    return arm, body, err_walk, err_pause, metres
