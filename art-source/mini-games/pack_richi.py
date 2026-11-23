"""Pack approved, independently painted parts into Godot regions. No runtime drawing."""
from math import sqrt
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
OUT = ROOT.parents[1] / "Godot/Scenes/Characters/Cutout/Art/richi-parts.webp"
SHEET = Image.new("RGBA", (512, 256))


def piece(name, width=None, height=None):
    image = Image.open(ROOT / "sources" / f"richi-{name}.webp").convert("RGBA")
    ratio = width / image.width if width else height / image.height
    return image.resize((round(image.width * ratio), round(image.height * ratio)), Image.Resampling.LANCZOS)


def pack(name, image, left, top):
    if left + image.width > SHEET.width or top + image.height > SHEET.height:
        raise ValueError(f"{name} extends outside the atlas")
    SHEET.paste(image, (left, top))
    print(name, left, top, image.width, image.height)


def round_cut(segment, center_y, top):
    """Curve only the cut edges around the joint; keep the original fur silhouette."""
    alpha = segment.getchannel("A")
    row = alpha.crop((0, center_y, segment.width, center_y + 1)).point(lambda a: 255 if a > 64 else 0)
    bounds = row.getbbox()
    if not bounds:
        return
    left, _, right, _ = bounds
    radius = (right - left) * 0.5
    center = (left + right) * 0.5
    radius_y = center_y + 0.5 if top else segment.height - center_y - 0.5
    pixels = alpha.load()
    rows = range(center_y) if top else range(center_y + 1, segment.height)
    for y in rows:
        span = radius * sqrt(max(0, 1 - ((y - center_y) / radius_y) ** 2))
        for x in range(segment.width):
            coverage = max(0.0, min(1.0, span + 0.5 - abs(x + 0.5 - center)))
            pixels[x, y] = round(pixels[x, y] * coverage)
    segment.putalpha(alpha)


def limb(name, height, intervals, left, hinges):
    source = piece(name, height=height)
    # Overlap adjoining segments in the pixels around each pivot.
    for index, (part, start, end, column) in enumerate(intervals):
        segment = source.crop((0, start, source.width, end))
        if index:
            round_cut(segment, hinges[index - 1] - start, True)
        if index < len(hinges):
            round_cut(segment, hinges[index] - start, False)
        pack(part, segment, left + column, 148)


pack("head", piece("head", width=150), 2, 2)
pack("torso", piece("torso", height=132), 156, 2)
pack("tail", piece("tail", width=104), 254, 2)
limb("arm", 106, [("upper_arm", 0, 56, 0), ("forearm", 40, 87, 40), ("hand", 74, 106, 80)], 2, [48, 81])
limb("leg", 104, [("thigh", 0, 65, 0), ("shin", 40, 92, 57), ("foot", 78, 104, 114)], 135, [53, 85])
OUT.parent.mkdir(parents=True, exist_ok=True)
SHEET.save(OUT, lossless=True, method=6)
