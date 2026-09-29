"""The reusable Mission Control platform base.

A manufactured display piece, not a terrain tile: a wide low plinth, a slim
accent band that carries the project colour, an upper plinth ledge, a recessed
emissive rim strip (the status light) and a paved deck. Every project sits on
the identical piece; only the accent material changes.
"""
import bpy
from mc_lib import slab, frame, mat, link, DECK_Z

DECK = 15.4           # paved deck, edge to edge
LEDGE = 16.4          # upper plinth
BAND = 16.7           # accent band
BASE = 16.9           # lower plinth


def build_platform(coll, accent='MC_PAINT_BLUE', status_coll=None):
    parts = []
    # lower plinth, slightly darker so the piece has weight and reads as grounded
    parts.append(slab('PB_Plinth', BASE, BASE, 1.6, 0.0, 0.42, mat('MC_PLINTH_DK'), coll, bevel=0.07, seg=3))
    # accent band: a touch inset so the plinth throws a soft contact line over it
    parts.append(slab('PB_Accent', BAND, BAND, 1.5, 0.42, 0.16, mat(accent), coll, bevel=0.035, seg=2))
    # upper plinth ledge
    parts.append(slab('PB_Ledge', LEDGE, LEDGE, 1.4, 0.58, 0.38, mat('MC_PLINTH'), coll, bevel=0.06, seg=3))
    # deck
    parts.append(slab('PB_Deck', DECK, DECK, 1.0, 0.92, DECK_Z - 0.92, mat('MC_PAVER'), coll, bevel=0.04, seg=2))
    # recessed status rim: a thin ring lying in the ledge between deck and plinth edge
    rim = frame('PB_StatusRim', 16.0, 16.0, 1.2, 15.62, 15.62, 1.0, 0.94, 0.045,
                mat('MC_STATUS_LIGHT'), status_coll or coll, bevel=0.012, seg=2)
    rim['status_role'] = 'rim'
    parts.append(rim)
    return parts
