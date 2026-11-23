"""Pack the PNGs from capture_bath_plates.gd into portraits and the one shared tile overlay.

Usage: python art-source/cabin/export_bath_plates.py <capture directory> <asset directory>
Atlas coordinates correspond to the gameplay camera at 540 × 960 and the CSS in show.css.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def export(captures, assets):
    assets.mkdir(parents=True, exist_ok=True)
    top, bottom = 348, 590
    rows = []
    for phase in ("wash", "clean"):
        for suffix in ("", "-bath-carved", "-bath", "-bath-copper", "-bath-faience"):
            name = phase + suffix
            with Image.open(captures / f"{name}-bare.png") as plain:
                plain.convert("RGB").save(assets / f"{name}.webp", quality=88, method=6)
            with Image.open(captures / f"{name}-tiles.png") as tiled:
                tile_colors = np.asarray(tiled.convert("RGB"))
            with Image.open(captures / f"{name}-mask.png") as matte:
                chroma = np.asarray(matte.convert("RGB"), dtype=np.int16)
            visible = np.minimum(chroma[:, :, 0], chroma[:, :, 2]) - chroma[:, :, 1] > 24
            if visible.shape != (960, 540) or not visible.any() or visible[:top].any() or visible[bottom:].any():
                raise ValueError(f"{name}: tile coverage changed; review the atlas bounds in show.css")
            alpha = visible[top:bottom]
            band = np.zeros((bottom - top, 540, 4), dtype=np.uint8)
            band[:, :, :3] = np.where(alpha[:, :, None], tile_colors[top:bottom], 0)
            band[:, :, 3] = alpha * 255
            rows.append(band)
    atlas = np.concatenate(rows)
    # Tiny RGB variations between frozen frames prevent WebP from reusing the identical wall.
    rgb = atlas[:, :, :3].astype(np.int16)
    atlas[:, :, :3] = ((rgb + 1) // 3) * 3
    Image.fromarray(atlas).save(assets / "wash-wall-tile.webp", lossless=True, exact=True, method=6)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captures", type=Path)
    parser.add_argument("assets", type=Path)
    args = parser.parse_args()
    export(args.captures, args.assets)
