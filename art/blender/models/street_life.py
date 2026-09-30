"""City life's passers-by: two people out walking (docs/3D-ART-BIBLE.md,
City life). Built on the shared master rig with no platform and no project:

  blender -b -noaudio -P art/blender/scripts/build_master.py -- --only street

The app gives each its own way on the city's sidewalks (field/world.js
walkWays) and moves it there by its root; this file only makes the people.
They are scenery: nothing here reads, shows or stands for a project.
"""
import mc_walker

# role, outfit, where they stand for the preview, facing (225 faces the camera)
WALKERS = [
    ('walker_a', 'camel', (-0.55, 0.0, 0.0), 210),
    ('walker_b', 'brown', (0.55, 0.0, 0.0), 240),
]


def build(coll):
    out = []
    for role, outfit, loc, rz in WALKERS:
        out.append(mc_walker.make_walker(coll, 'ST_Worker_' + role, role, loc=loc, rot_z=rz, outfit=outfit))
    return out
