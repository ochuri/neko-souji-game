from pathlib import Path
from collections import deque

from PIL import Image


SOURCE = Path("/Users/yurikoochi/.codex/generated_images/019fea34-748b-7c40-ae4b-3446bc01c521/exec-dd5ebc60-36b0-4dce-9db5-30c47d7dec9b.png")
OUTPUT = Path("public/assets/ui")

# Approved start-screen comp: crop only the icon columns, excluding labels and
# divider rules, then softly remove the translucent panel colour.
CROPS = {
    "guide-vacuum.png": (172, 760, 322, 902),
    "guide-hair.png": (185, 944, 320, 1056),
    "guide-scratch.png": (187, 1070, 307, 1190),
}


def make_transparent(crop: Image.Image) -> Image.Image:
    rgba = crop.convert("RGBA")
    pixels = rgba.load()
    candidates = set()
    for y in range(rgba.height):
        left = tuple(sum(pixels[x, y][channel] for x in range(5)) / 5 for channel in range(3))
        right = tuple(sum(pixels[rgba.width - 1 - x, y][channel] for x in range(5)) / 5 for channel in range(3))
        for x in range(rgba.width):
            red, green, blue, _ = pixels[x, y]
            ratio = x / max(1, rgba.width - 1)
            bg = tuple(left[channel] * (1 - ratio) + right[channel] * ratio for channel in range(3))
            distance = ((red - bg[0]) ** 2 + (green - bg[1]) ** 2 + (blue - bg[2]) ** 2) ** 0.5
            if distance < 32:
                candidates.add((x, y))
    transparent = set()
    queue = deque()
    for x in range(rgba.width):
        queue.extend(((x, 0), (x, rgba.height - 1)))
    for y in range(rgba.height):
        queue.extend(((0, y), (rgba.width - 1, y)))
    while queue:
        point = queue.popleft()
        if point in transparent or point not in candidates:
            continue
        transparent.add(point)
        x, y = point
        for neighbour in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= neighbour[0] < rgba.width and 0 <= neighbour[1] < rgba.height:
                queue.append(neighbour)
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, _ = pixels[x, y]
            pixels[x, y] = (red, green, blue, 0 if (x, y) in transparent else 255)
    return rgba


def remove_dark_panel_residue(icon: Image.Image) -> Image.Image:
    """Keep the approved pale linework while removing dark comp artefacts."""
    pixels = icon.load()
    for y in range(icon.height):
        for x in range(icon.width):
            red, green, blue, alpha = pixels[x, y]
            luminance = red * 0.299 + green * 0.587 + blue * 0.114
            if not alpha:
                continue
            cleaned_alpha = max(0, min(255, round((luminance - 150) / 80 * 255)))
            pixels[x, y] = (red, green, blue, cleaned_alpha)
    return icon


OUTPUT.mkdir(parents=True, exist_ok=True)
source = Image.open(SOURCE)
for filename, bounds in CROPS.items():
    icon = make_transparent(source.crop(bounds))
    if filename == "guide-scratch.png":
        icon = remove_dark_panel_residue(icon)
    icon.save(OUTPUT / filename, optimize=True)
