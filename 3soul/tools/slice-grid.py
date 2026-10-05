#!/usr/bin/env python3
"""
Cut a 2x2 grid image into four images and install them in assets/img.

Gemini returns one image per prompt, so each batch prompt in
IMAGE-PROMPTS.md asks for a 2x2 grid of four square panels. This
slices that grid, crops each panel to its slot's aspect ratio and
compresses it.

    python3 tools/slice-grid.py grid.png name1 name2 name3 name4

Order is reading order: top-left, top-right, bottom-left, bottom-right.
Names are without the .jpg extension.

No image libraries are installed on this machine and sips only crops
from the centre, so the grid is routed through an uncompressed BMP,
sliced with plain struct arithmetic, and converted back. That keeps
the tool dependency-free.
"""
import os, struct, subprocess, sys, tempfile

if len(sys.argv) != 6:
    print(__doc__); sys.exit(1)

src, names = sys.argv[1], sys.argv[2:6]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'img')
os.makedirs(OUT, exist_ok=True)
tmp = tempfile.mkdtemp()

def sips(*a):
    subprocess.run(['sips'] + list(a), check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# ---- decode to a flat pixel grid ----
bmp = os.path.join(tmp, 'grid.bmp')
sips('-s', 'format', 'bmp', src, '--out', bmp)
d = open(bmp, 'rb').read()
if d[:2] != b'BM':
    sys.exit('not a BMP after conversion')
off = struct.unpack('<I', d[10:14])[0]
W, H = struct.unpack('<ii', d[18:26])
bpp = struct.unpack('<H', d[28:30])[0]
top_down = H < 0
H = abs(H)
if bpp not in (24, 32):
    sys.exit('unexpected bit depth: %d' % bpp)
px = bpp // 8
stride = ((W * px + 3) // 4) * 4
print('grid %dx%d, %d-bit -> quadrants %dx%d' % (W, H, bpp, W // 2, H // 2))

def row(y):
    """pixel row y counted from the top, whichever way the BMP stores it"""
    sy = y if top_down else (H - 1 - y)
    start = off + sy * stride
    return d[start:start + W * px]

qw, qh = W // 2, H // 2

def write_quadrant(col, rw, path):
    out_stride = ((qw * px + 3) // 4) * 4
    pad = b'\x00' * (out_stride - qw * px)
    body = bytearray()
    # write bottom-up, the conventional BMP order
    for y in range(qh - 1, -1, -1):
        r = row(rw * qh + y)
        body += r[col * qw * px:(col + 1) * qw * px] + pad
    hdr_size = 40
    file_size = 14 + hdr_size + len(body)
    hdr = b'BM' + struct.pack('<IHHI', file_size, 0, 0, 14 + hdr_size)
    hdr += struct.pack('<IiiHHIIiiII', hdr_size, qw, qh, 1, bpp, 0,
                       len(body), 2835, 2835, 0, 0)
    open(path, 'wb').write(hdr + bytes(body))

# aspect ratio each slot needs, so the square panel is cropped once here
RATIO = {'avatar': 1.0, 'story': 0.8, 'founders': 0.8}
def ratio_for(name):
    for k, v in RATIO.items():
        if name.startswith(k):
            return v
    return 4 / 3.0

# Gemini lays the grid out with a pale gutter between panels and a frame
# around the outside. Cropping on exact quarters leaves a white lip on two
# sides of every panel, so each quadrant is inset before use.
INSET = 0.030

# The avatar panels come back as a circle centred on a square of flat
# colour. The page masks them to a circle again, so without a tighter
# crop the face ends up small inside a ring of background. Zooming in
# fills the frame with the face.
ZOOM = {'avatar': 0.78}
def zoom_for(name):
    for k, v in ZOOM.items():
        if name.startswith(k):
            return v
    return 1.0

# Output width per slot, sized to what the page actually renders at 2x
# device pixel ratio. 32 of the 34 slots live in horizontal rails, which
# browsers will not lazy-defer — the rail is in view even when the card
# is not — so every image is effectively eager and its weight is paid on
# first load. Shipping 1200px files for a 44px avatar is the difference
# between a 1.5 MB page and a 5.7 MB one.
WIDTH = {
    'avatar':   200,   # rendered at 44px, circular
    'story':    700,   # rail card ~210px, desktop column ~380px
    'founders': 900,   # desktop column ~520px
    'film':    1000,   # ~560px
    'hero-backdrop': 1600,
    'og-share': 1200,
}
QUALITY = {'hero-backdrop': 58, 'avatar': 74}
def width_for(name):
    for k, v in WIDTH.items():
        if name.startswith(k):
            return v
    return 800         # cases, reviews, who-uses: ~380px column at 2x
def quality_for(name):
    for k, v in QUALITY.items():
        if name.startswith(k):
            return v
    return 76

for i, name in enumerate(names):
    rw, col = i // 2, i % 2
    q = os.path.join(tmp, 'q%d.bmp' % i)
    write_quadrant(col, rw, q)

    # trim the gutter, then zoom if this slot wants it
    keep = (1.0 - INSET * 2) * zoom_for(name)
    iw, ih = int(qw * keep), int(qh * keep)
    inset = os.path.join(tmp, 'i%d.bmp' % i)
    sips('-c', str(ih), str(iw), q, '--out', inset)
    q = inset

    r = ratio_for(name)
    if r >= 1:
        cw, ch = iw, int(iw / r)
    else:
        cw, ch = int(ih * r), ih
    if cw > iw: cw, ch = iw, int(iw / r)
    if ch > ih: ch, cw = ih, int(ih * r)
    cropped = os.path.join(tmp, 'c%d.bmp' % i)
    sips('-c', str(ch), str(cw), q, '--out', cropped)
    dst = os.path.join(OUT, name + '.jpg')
    sips('-Z', str(width_for(name)), '-s', 'format', 'jpeg',
         '-s', 'formatOptions', str(quality_for(name)), cropped, '--out', dst)
    print('  %-40s %4d KB' % (name + '.jpg', os.path.getsize(dst) // 1024))

print('\nnow run:  python3 tools/sync-images.py')
