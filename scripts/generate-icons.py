"""Generate packaged toolbar icons using only the Python standard library."""
from pathlib import Path
import struct
import zlib

OUTPUT = Path(__file__).resolve().parent.parent / "icons"
OUTPUT.mkdir(exist_ok=True)


def rounded_rect(x, y, left, top, right, bottom, radius):
    if not (left <= x <= right and top <= y <= bottom):
        return False
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def pixel(x, y, active):
    color = (0, 0, 0, 0)
    if rounded_rect(x, y, 0.75, 0.75, 15.25, 15.25, 3):
        color = (23, 60, 97, 255)
    for top in (3, 6, 9):
        if rounded_rect(x, y, 3, top, 12.5, top + 2, 0.65):
            color = (235, 244, 250, 255)
        if (x - 4.5) ** 2 + (y - top - 1) ** 2 <= 0.35 ** 2:
            color = (23, 60, 97, 255)
    distance = (x - 12) ** 2 + (y - 12) ** 2
    if distance <= 3.6 ** 2:
        color = (255, 255, 255, 255)
    if distance <= 2.65 ** 2:
        color = (22, 163, 74, 255) if active else (139, 155, 172, 255)
    return color


def chunk(kind, data):
    payload = kind + data
    return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)


def image(size, active):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            samples = [pixel((x + (sx + 0.5) / 4) * 16 / size,
                             (y + (sy + 0.5) / 4) * 16 / size, active)
                       for sy in range(4) for sx in range(4)]
            alpha = sum(p[3] for p in samples)
            rows.extend(round(sum(p[channel] * p[3] for p in samples) / alpha) if alpha else 0
                        for channel in range(3))
            rows.append(round(alpha / 16))
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")


for state in ("neutral", "green"):
    for size in (16, 32, 48, 128):
        (OUTPUT / f"toolkit-{state}-{size}.png").write_bytes(image(size, state == "green"))
