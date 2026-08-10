#!/usr/bin/env python3
"""Trim a 4x2 alpha sprite atlas while keeping every frame on one baseline."""

from pathlib import Path
from collections import deque
import sys

from PIL import Image


COLS = 4
ROWS = 2
PADDING = 18


def keep_largest_component(frame: Image.Image) -> Image.Image:
    alpha = frame.getchannel("A")
    width, height = alpha.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components: list[list[tuple[int, int]]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] < 12:
                continue
            visited[index] = 1
            queue = deque([(x, y)])
            component: list[tuple[int, int]] = []
            while queue:
                px, py = queue.popleft()
                component.append((px, py))
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    neighbor = ny * width + nx
                    if visited[neighbor] or pixels[nx, ny] < 12:
                        continue
                    visited[neighbor] = 1
                    queue.append((nx, ny))
            components.append(component)

    if not components:
        return frame
    keep = set(max(components, key=len))
    cleaned = frame.copy()
    cleaned_alpha = cleaned.getchannel("A")
    cleaned_pixels = cleaned_alpha.load()
    for y in range(height):
        for x in range(width):
            if (x, y) not in keep:
                cleaned_pixels[x, y] = 0
    cleaned.putalpha(cleaned_alpha)
    return cleaned


def frame_box(width: int, height: int, column: int, row: int) -> tuple[int, int, int, int]:
    return (
        round(column * width / COLS),
        round(row * height / ROWS),
        round((column + 1) * width / COLS),
        round((row + 1) * height / ROWS),
    )


def normalize(source: Path, destination: Path, largest_component: bool = False) -> None:
    atlas = Image.open(source).convert("RGBA")
    frames: list[Image.Image] = []
    trimmed: list[Image.Image] = []

    for row in range(ROWS):
        for column in range(COLS):
            frame = atlas.crop(frame_box(atlas.width, atlas.height, column, row))
            if largest_component:
                frame = keep_largest_component(frame)
            alpha_box = frame.getchannel("A").getbbox()
            if alpha_box is None:
                raise ValueError(f"empty frame at row {row}, column {column}: {source}")
            frames.append(frame)
            trimmed.append(frame.crop(alpha_box))

    target_width = max(frame.width for frame in trimmed) + PADDING * 2
    target_height = max(frame.height for frame in trimmed) + PADDING * 2
    normalized_frames: list[Image.Image] = []

    for frame in trimmed:
        canvas = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
        x = (target_width - frame.width) // 2
        y = target_height - PADDING - frame.height
        canvas.alpha_composite(frame, (x, y))
        normalized_frames.append(canvas)

    output = Image.new("RGBA", (target_width * COLS, target_height * ROWS), (0, 0, 0, 0))
    for index, frame in enumerate(normalized_frames):
        output.alpha_composite(frame, ((index % COLS) * target_width, (index // COLS) * target_height))

    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination, optimize=True)


if __name__ == "__main__":
    args = [arg for arg in sys.argv[1:] if arg != "--largest-component"]
    if len(args) != 2:
        raise SystemExit("usage: normalize_sprite_atlas.py [--largest-component] SOURCE DESTINATION")
    normalize(Path(args[0]), Path(args[1]), "--largest-component" in sys.argv)
