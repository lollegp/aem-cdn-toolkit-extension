"""Render store artwork from the extension's own vector-like icon primitives."""
from pathlib import Path
import importlib.util
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('icons', ROOT / 'scripts/generate-icons.py')
icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(icons)
OUTPUT = ROOT / 'docs/store'
OUTPUT.mkdir(parents=True, exist_ok=True)

def png(width, height, painter):
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            samples = [painter(x + (sx + .5) / 2, y + (sy + .5) / 2) for sy in range(2) for sx in range(2)]
            rows.extend(round(sum(c[i] for c in samples) / 4) for i in range(4))
    return b'\x89PNG\r\n\x1a\n' + icons.chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) + icons.chunk(b'IDAT', zlib.compress(rows, 9)) + icons.chunk(b'IEND', b'')

def store_icon(x, y):
    return icons.pixel((x - 11) * 16 / 106, (y - 11) * 16 / 106, False)

def tile(x, y):
    color = (8, 80 + round(y / 28), 77 + round(x / 44), 255)
    for top in (57, 112, 167):
        if icons.rounded_rect(x, y, 280, top, 396, top + 38, 8): color = (38, 118, 112, 255)
        if 244 < x < 280 and top + 18 < y < top + 20: color = (119, 185, 175, 255)
        if 308 < x < 376 and top + 12 < y < top + 15: color = (180, 221, 212, 255)
        if 308 < x < 353 and top + 23 < y < top + 26: color = (119, 185, 175, 255)
        if (x - 294) ** 2 + (y - top - 19) ** 2 < 16: color = (169, 220, 155, 255)
    icon = icons.pixel((x - 43) * 16 / 196, (y - 38) * 16 / 196, True)
    return icon if icon[3] else color

(ROOT / 'icons/toolkit-store-128.png').write_bytes(png(128, 128, store_icon))
(OUTPUT / 'promo-440x280.png').write_bytes(png(440, 280, tile))
print('Rendered padded store icon and 440x280 promotional tile.')
