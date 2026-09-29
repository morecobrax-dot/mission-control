"""Compose images into a labelled-by-order contact sheet.

  blender -b -noaudio -P sheet.py -- --out sheet.png --cols 3 --cell 600
      [--crop x0,y0,x1,y1] [--bg 0.93,0.93,0.93] img1.png img2.png ...

Crop values are fractions of each image (origin top-left). Cells are square and
each image is fitted inside its cell.
"""
import os
import sys
import bpy
import numpy as np


def load(path, crop):
    im = bpy.data.images.load(path)
    w, h = im.size
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    if crop:
        x0, y0, x1, y1 = crop
        px = px[int(h * (1 - y1)):int(h * (1 - y0)), int(w * x0):int(w * x1)]
    return px


def fit(px, cell):
    h, w = px.shape[:2]
    s = cell / max(w, h)
    nw, nh = max(1, int(w * s)), max(1, int(h * s))
    im = bpy.data.images.new('t', w, h, alpha=True)
    im.pixels = px.ravel().tolist()
    im.scale(nw, nh)
    out = np.array(im.pixels[:], dtype=np.float32).reshape(nh, nw, 4)
    bpy.data.images.remove(im)
    return out


def main():
    a = sys.argv[sys.argv.index('--') + 1:]
    def opt(n, d=None):
        return a[a.index(n) + 1] if n in a else d
    out, cols, cell = os.path.abspath(opt('--out')), int(opt('--cols', 3)), int(opt('--cell', 600))
    crop = [float(v) for v in opt('--crop').split(',')] if opt('--crop') else None
    bg = [float(v) for v in opt('--bg', '0.9,0.9,0.9').split(',')]
    skip = {'--out', '--cols', '--cell', '--crop', '--bg'}
    files, i = [], 0
    while i < len(a):
        if a[i] in skip:
            i += 2
        else:
            files.append(os.path.abspath(a[i]))
            i += 1
    rows = (len(files) + cols - 1) // cols
    canvas = np.ones((rows * cell, cols * cell, 4), dtype=np.float32)
    canvas[..., 0], canvas[..., 1], canvas[..., 2] = bg
    for n, f in enumerate(files):
        c = fit(load(f, crop), cell)
        r, k = divmod(n, cols)
        y = (rows - 1 - r) * cell + (cell - c.shape[0]) // 2
        x = k * cell + (cell - c.shape[1]) // 2
        canvas[y:y + c.shape[0], x:x + c.shape[1]] = c
    im = bpy.data.images.new('sheet', cols * cell, rows * cell, alpha=False)
    im.pixels = canvas.ravel().tolist()
    im.filepath_raw = out
    im.file_format = 'PNG'
    im.save()
    print('SHEET', out)


main()
