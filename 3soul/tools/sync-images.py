#!/usr/bin/env python3
"""
Point image slots at files that actually exist.

Every .img slot in priceit.html knows the filename it wants. A slot whose
file has not been delivered yet keeps the name in data-src instead of src,
so the browser never requests it: no 404, no wasted round trip, and the
labelled placeholder shows exactly as designed.

Run after dropping new files into assets/img/ :

    python3 tools/sync-images.py

Idempotent. Prints what changed.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, 'priceit.html')
IMGDIR = os.path.join(ROOT, 'assets', 'img')

html = open(PAGE, encoding='utf-8').read()
have = set(os.listdir(IMGDIR)) if os.path.isdir(IMGDIR) else set()

# match either form: src="assets/img/x.jpg" or data-src="assets/img/x.jpg"
pat = re.compile(r'(?P<attr>\bdata-src|\bsrc)="assets/img/(?P<file>[^"]+)"')
live, pending = [], []

def fix(m):
    f = m.group('file')
    want = 'src' if f in have else 'data-src'
    (live if f in have else pending).append(f)
    return '%s="assets/img/%s"' % (want, f)

out = pat.sub(fix, html)
changed = out != html
if changed:
    open(PAGE, 'w', encoding='utf-8').write(out)

print('delivered : %d' % len(live))
for f in sorted(live):
    print('   src      %s' % f)
print('pending   : %d  (kept as data-src, no request made)' % len(pending))
print('page %s' % ('updated' if changed else 'already in sync'))
