#!/usr/bin/env python3
"""Crop transparent padding from one PNG while retaining a small safe border."""

from pathlib import Path
import sys

from PIL import Image


def crop_alpha(source: Path, destination: Path, padding: int = 4) -> None:
    image = Image.open(source).convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError(f"image has no visible pixels: {source}")
    left, top, right, bottom = bounds
    box = (
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.crop(box).save(destination, optimize=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: crop_alpha.py SOURCE DESTINATION")
    crop_alpha(Path(sys.argv[1]), Path(sys.argv[2]))
