from __future__ import annotations

import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(r"E:\AI编程\停云小程序")
SRC = ROOT / "部分图片" / "山居介绍.png"
OUT = ROOT / "输出_茶盒线稿"

GOLD = "#B88A45"
LIGHT_GOLD = "#D0A05A"
DEEP_GREEN = "#0D3B1D"


def points_to_path(points: list[tuple[float, float]] | np.ndarray, close: bool = False) -> str:
    pts = np.asarray(points, dtype=float).reshape(-1, 2)
    if len(pts) < 2:
        return ""
    d = [f"M {pts[0, 0]:.1f} {pts[0, 1]:.1f}"]
    for x, y in pts[1:]:
        d.append(f"L {x:.1f} {y:.1f}")
    if close:
        d.append("Z")
    return " ".join(d)


def contour_paths(
    mask: np.ndarray,
    min_len: float,
    epsilon: float,
    min_area: float = 0,
    limit: int | None = None,
    external: bool = False,
) -> list[str]:
    mode = cv2.RETR_EXTERNAL if external else cv2.RETR_LIST
    contours, _ = cv2.findContours(mask, mode, cv2.CHAIN_APPROX_NONE)
    items: list[tuple[float, str]] = []
    for c in contours:
        length = cv2.arcLength(c, True)
        area = abs(cv2.contourArea(c))
        x, y, w, h = cv2.boundingRect(c)
        if length < min_len or area < min_area or (w < 4 and h < 4):
            continue
        approx = cv2.approxPolyDP(c, epsilon, True)
        p = points_to_path(approx, close=True)
        if p:
            items.append((max(length, area), p))
    items.sort(reverse=True, key=lambda item: item[0])
    paths = [p for _, p in items]
    return paths[:limit] if limit else paths


def open_path_contours(edge: np.ndarray, min_len: float, epsilon: float, limit: int) -> list[str]:
    contours, _ = cv2.findContours(edge, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    items: list[tuple[float, str]] = []
    for c in contours:
        length = cv2.arcLength(c, False)
        if length < min_len:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if w < 10 and h < 10:
            continue
        approx = cv2.approxPolyDP(c, epsilon, False)
        p = points_to_path(approx, close=False)
        if p:
            items.append((length, p))
    items.sort(reverse=True, key=lambda item: item[0])
    return [p for _, p in items[:limit]]


def make_sky_mask(rgb: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    yy = np.indices(h.shape)[0]
    blue_sky = (yy < 430) & (b > g + 4) & (b > r + 16) & (s > 28) & (v > 95)
    cloud = (yy < 330) & (v > 178) & (s < 65)
    sky = (blue_sky | cloud).astype(np.uint8) * 255
    sky = cv2.morphologyEx(sky, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    return sky


def skyline_path(sky: np.ndarray, width: int, height: int) -> str:
    land = sky < 128
    ys = []
    last = 160
    for x in range(width):
        col = np.where(land[:520, x])[0]
        if len(col):
            last = int(col[0])
        ys.append(last)
    arr = np.asarray(ys, dtype=float)
    # Median first to remove tree pinholes, then moving average for a print-friendly ridge line.
    padded = np.pad(arr, (13, 13), mode="edge")
    med = np.array([np.median(padded[i : i + 27]) for i in range(width)])
    kernel = np.ones(29) / 29
    smooth = np.convolve(med, kernel, mode="same")
    pts = [(x, float(smooth[x])) for x in range(0, width, 8)]
    pts.append((width - 1, float(smooth[-1])))
    return points_to_path(pts)


def hough_paths(edge: np.ndarray, min_len: int, threshold: int, max_gap: int, angle_filter) -> list[str]:
    lines = cv2.HoughLinesP(edge, 1, np.pi / 180, threshold=threshold, minLineLength=min_len, maxLineGap=max_gap)
    if lines is None:
        return []
    paths: list[str] = []
    seen = set()
    for raw in lines[:, 0, :]:
        x1, y1, x2, y2 = map(int, raw)
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if length < min_len:
            continue
        angle = abs(math.degrees(math.atan2(dy, dx)))
        angle = min(angle, 180 - angle)
        if not angle_filter(angle):
            continue
        key = (round(min(x1, x2) / 6), round(max(x1, x2) / 6), round((y1 + y2) / 8), round(angle / 6))
        if key in seen:
            continue
        seen.add(key)
        paths.append(f"M {x1:.1f} {y1:.1f} L {x2:.1f} {y2:.1f}")
    return paths


def make_preview(width: int, height: int, groups: dict[str, list[str]], out_file: Path):
    img = Image.new("RGB", (width, height), DEEP_GREEN)
    draw = ImageDraw.Draw(img, "RGBA")
    colors = {
        "skyline": (210, 160, 86, 128),
        "rock_forms": (205, 160, 92, 120),
        "architecture": (218, 170, 96, 165),
        "red_roof_forms": (218, 170, 96, 145),
        "terraces": (184, 138, 69, 98),
        "vegetation_texture": (184, 138, 69, 58),
        "distant_land": (184, 138, 69, 42),
    }
    for group, paths in groups.items():
        rgba = colors[group]
        width_px = 2 if group in {"skyline", "architecture", "red_roof_forms"} else 1
        for d in paths:
            vals = d.replace("M", "").replace("L", "").replace("Z", "").split()
            pts = [(float(vals[i]), float(vals[i + 1])) for i in range(0, len(vals), 2)]
            if len(pts) > 1:
                draw.line(pts, fill=rgba, width=width_px, joint="curve")
                if d.endswith("Z"):
                    draw.line([pts[-1], pts[0]], fill=rgba, width=width_px)
    img.save(out_file)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    image = Image.open(SRC).convert("RGB")
    rgb = np.array(image)
    h, w = rgb.shape[:2]
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    sky = make_sky_mask(rgb)
    land = cv2.bitwise_not(sky)
    land[:35, :] = 0

    groups: dict[str, list[str]] = {"skyline": [skyline_path(sky, w, h)]}

    # Rock forms are a key identifier in this photo; use color, not just edge noise.
    yy = np.indices((h, w))[0]
    rock_mask = (
        (land > 0)
        & (yy < 430)
        & (sat < 96)
        & (val > 58)
        & ~((hue > 38) & (hue < 92) & (sat > 35))
    ).astype(np.uint8) * 255
    rock_mask = cv2.morphologyEx(rock_mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    rock_mask = cv2.morphologyEx(rock_mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    groups["rock_forms"] = contour_paths(rock_mask, min_len=22, epsilon=1.6, min_area=18, limit=650, external=True)

    # Buildings: combine color-shape outlines with straight architectural strokes.
    arch_mask = np.zeros((h, w), dtype=np.uint8)
    for x1, y1, x2, y2 in [
        (455, 385, 755, 590),
        (760, 520, 1165, 735),
        (1140, 400, 1710, 650),
        (990, 680, 1335, 804),
    ]:
        arch_mask[y1:y2, x1:x2] = 255

    red_roof = (
        (arch_mask > 0)
        & ((hue < 18) | (hue > 168))
        & (sat > 55)
        & (val > 75)
    ).astype(np.uint8) * 255
    red_roof = cv2.morphologyEx(red_roof, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    groups["red_roof_forms"] = contour_paths(red_roof, min_len=18, epsilon=1.2, min_area=20, limit=120, external=True)

    white_wall = ((arch_mask > 0) & (sat < 82) & (val > 112)).astype(np.uint8) * 255
    white_wall = cv2.morphologyEx(white_wall, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    white_wall = cv2.morphologyEx(white_wall, cv2.MORPH_CLOSE, np.ones((4, 4), np.uint8))
    wall_paths = contour_paths(white_wall, min_len=20, epsilon=1.0, min_area=18, limit=260, external=True)

    arch_gray = cv2.GaussianBlur(gray, (3, 3), 0)
    arch_edges = cv2.Canny(arch_gray, 45, 120, L2gradient=True)
    arch_edges = cv2.bitwise_and(arch_edges, arch_mask)
    straight_arch = hough_paths(
        arch_edges,
        min_len=20,
        threshold=30,
        max_gap=5,
        angle_filter=lambda a: a < 10 or abs(a - 90) < 10 or 17 < a < 40,
    )[:620]
    groups["architecture"] = wall_paths + straight_arch

    # Terraces and retaining walls should read as the residence landscape.
    terrain_edges = cv2.Canny(cv2.GaussianBlur(gray, (7, 7), 0), 42, 110, L2gradient=True)
    terrain_edges = cv2.bitwise_and(terrain_edges, land)
    terrain_edges[:300, :] = 0
    terrain_edges = cv2.bitwise_and(terrain_edges, cv2.bitwise_not(arch_mask))
    groups["terraces"] = hough_paths(
        terrain_edges,
        min_len=48,
        threshold=42,
        max_gap=12,
        angle_filter=lambda a: a < 9,
    )[:560]

    # Broad, slow contours give the mountains shape without turning leaves into static.
    broad = cv2.GaussianBlur(gray, (15, 15), 0)
    distant_paths: list[str] = []
    for level in [65, 82, 99, 116, 136, 156]:
        mask = ((broad < level) & (land > 0) & (yy < 560)).astype(np.uint8) * 255
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((4, 4), np.uint8))
        distant_paths.extend(contour_paths(mask, min_len=90, epsilon=3.2, min_area=160, limit=90, external=True))
    groups["distant_land"] = distant_paths[:360]

    texture_src = cv2.GaussianBlur(gray, (9, 9), 0)
    texture = cv2.Canny(texture_src, 35, 90, L2gradient=True)
    texture = cv2.bitwise_and(texture, land)
    texture = cv2.bitwise_and(texture, cv2.bitwise_not(arch_mask))
    texture[:170, :] = 0
    # Keep texture sparse, biased toward long strokes.
    groups["vegetation_texture"] = open_path_contours(texture, min_len=54, epsilon=2.4, limit=850)

    style = """
  <style>
    svg { background: transparent; }
    .skyline { fill: none; stroke: #D0A05A; stroke-width: 1.15; stroke-linecap: round; stroke-linejoin: round; opacity: .54; }
    .rock_forms { fill: none; stroke: #C99A55; stroke-width: .85; stroke-linecap: round; stroke-linejoin: round; opacity: .48; }
    .architecture { fill: none; stroke: #D8AA60; stroke-width: .95; stroke-linecap: round; stroke-linejoin: round; opacity: .70; }
    .red_roof_forms { fill: none; stroke: #D8AA60; stroke-width: .9; stroke-linecap: round; stroke-linejoin: round; opacity: .62; }
    .terraces { fill: none; stroke: #B88A45; stroke-width: .72; stroke-linecap: round; stroke-linejoin: round; opacity: .42; }
    .distant_land { fill: none; stroke: #B88A45; stroke-width: .58; stroke-linecap: round; stroke-linejoin: round; opacity: .22; }
    .vegetation_texture { fill: none; stroke: #B88A45; stroke-width: .52; stroke-linecap: round; stroke-linejoin: round; opacity: .24; }
  </style>
"""
    svg_path = OUT / "停云山居_茶盒线稿_v2_按原图结构.svg"
    with svg_path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">\n')
        f.write("  <title>停云山居茶盒线稿 v2</title>\n")
        f.write("  <desc>Structured line art from the source photo: skyline, rock forms, architecture, terraces, restrained vegetation texture.</desc>\n")
        f.write(style)
        for group, paths in groups.items():
            f.write(f'  <g id="{group}" class="{group}">\n')
            for p in paths:
                if p:
                    f.write(f'    <path d="{p}" />\n')
            f.write("  </g>\n")
        f.write("</svg>\n")

    make_preview(w, h, groups, OUT / "停云山居_茶盒线稿_v2_按原图结构_深绿预览.png")
    print("written", svg_path)
    print({k: len(v) for k, v in groups.items()})


if __name__ == "__main__":
    main()
