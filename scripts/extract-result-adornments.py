from collections import deque
from pathlib import Path

from PIL import Image


SOURCE = Path("/Users/yurikoochi/.codex/generated_images/019fea34-748b-7c40-ae4b-3446bc01c521/exec-e05a6f8e-5736-41d6-9ae0-cd7f469c0fef.png")
OUTPUT = Path("public/assets/ui/result")

# Small approved ornaments are kept as artwork instead of being approximated
# with browser-drawn symbols. Coordinates are from the accepted 942x1674 comp.
CROPS = {
    "complete-left.png": (180, 245, 226, 320),
    "complete-right.png": (696, 245, 742, 320),
    "divider-paw.png": (430, 742, 500, 805),
    "hair-doodle.png": (721, 920, 792, 990),
    "row-paw.png": (125, 956, 181, 1010),
    "remaining-fluff.png": (397, 1158, 522, 1220),
    "footprints-left.png": (77, 1220, 177, 1322),
    "footprints-right.png": (764, 1220, 864, 1322),
    "button-paw.png": (223, 1351, 281, 1412),
    "share-mark.png": (296, 1472, 342, 1520),
}


def remove_connected_background(crop: Image.Image) -> Image.Image:
    image = crop.convert("RGBA")
    pixels = image.load()
    candidates = set()
    for y in range(image.height):
        left = tuple(sum(pixels[x, y][channel] for x in range(min(5, image.width))) / min(5, image.width) for channel in range(3))
        right = tuple(sum(pixels[image.width - 1 - x, y][channel] for x in range(min(5, image.width))) / min(5, image.width) for channel in range(3))
        for x in range(image.width):
            red, green, blue, _ = pixels[x, y]
            ratio = x / max(1, image.width - 1)
            bg = tuple(left[channel] * (1 - ratio) + right[channel] * ratio for channel in range(3))
            distance = ((red - bg[0]) ** 2 + (green - bg[1]) ** 2 + (blue - bg[2]) ** 2) ** 0.5
            if distance < 30:
                candidates.add((x, y))
    transparent = set()
    queue = deque()
    for x in range(image.width):
        queue.extend(((x, 0), (x, image.height - 1)))
    for y in range(image.height):
        queue.extend(((0, y), (image.width - 1, y)))
    while queue:
        point = queue.popleft()
        if point in transparent or point not in candidates:
            continue
        transparent.add(point)
        x, y = point
        for neighbour in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= neighbour[0] < image.width and 0 <= neighbour[1] < image.height:
                queue.append(neighbour)
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, _ = pixels[x, y]
            pixels[x, y] = (red, green, blue, 0 if (x, y) in transparent else 255)
    return image


OUTPUT.mkdir(parents=True, exist_ok=True)
source = Image.open(SOURCE)
for filename, bounds in CROPS.items():
    remove_connected_background(source.crop(bounds)).save(OUTPUT / filename, optimize=True)
