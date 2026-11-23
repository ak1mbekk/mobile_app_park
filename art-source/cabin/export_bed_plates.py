"""Encode the game camera renders from capture_bed_plates.gd into WebP backgrounds and overlays.

Usage: python art-source/cabin/export_bed_plates.py <scratch PNG directory> <demo assets>
The basic kit frame is shared. Each transparent overlay replaces changed pixels at the
same screen coordinates, including hats, the growth morph, its silhouette and its shadow.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def export(frames, assets):
    wardrobe=assets/"fallback-wardrobe"
    wardrobe.mkdir(exist_ok=True)
    for bed in ("bed","bed-willow","settee","bed-oak","bed-daybed"):
        with Image.open(frames/f"{bed}-kit-bare.png") as source:
            reference=source.convert("RGB")
        reference.save(assets/f"sleep-{bed}-curled.webp",quality=88,method=6)
        base=np.asarray(reference,dtype=np.int16)
        for age in ("kit","young","adult"):
            for hat in ("bare","cap","ranger","crown"):
                if age=="kit" and hat=="bare":
                    continue
                with Image.open(frames/f"{bed}-{age}-{hat}.png") as source:
                    frame=np.asarray(source.convert("RGB"),dtype=np.uint8)
                changed=np.abs(frame.astype(np.int16)-base).max(axis=2)>3
                mask=Image.fromarray(np.uint8(changed)*255).filter(ImageFilter.MaxFilter(5))
                if not mask.getbbox():
                    raise ValueError(f"Missing age or headwear variation in {bed}-{age}-{hat}")
                alpha=np.asarray(mask)
                layer=np.zeros((*alpha.shape,4),dtype=np.uint8)
                layer[:,:,:3]=np.where(alpha[:,:,None]!=0,frame,0)
                layer[:,:,3]=alpha
                Image.fromarray(layer).save(wardrobe/f"sleep-{bed}-{age}-{hat}.webp",quality=88,method=6)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("frames",type=Path)
    parser.add_argument("assets",type=Path)
    args=parser.parse_args()
    export(args.frames,args.assets)
