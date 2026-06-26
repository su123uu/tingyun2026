from __future__ import annotations

import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(r"E:\AI编程\停云小程序")
SRC = ROOT / "部分图片" / "山居介绍.png"
OUT = ROOT / "输出_茶盒线稿"

DEEP_GREEN = "#0D3B1D"
GOLD = "#B88A45"
LIGHT_GOLD = "#D0A05A"


def sky_mask(rgb: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    s, v = hsv[..., 1], hsv[..., 2]
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    yy = np.indices(s.shape)[0]
    sky = ((yy < 430) & (b > g + 5) & (b > r + 15) & (s > 25) & (v > 92)) | (
        (yy < 330) & (v > 176) & (s < 65)
    )
    sky = sky.astype(np.uint8) * 255
    return cv2.morphologyEx(sky, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))


def edge_map(rgb: np.ndarray, mode: str) -> np.ndarray:
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    land = cv2.bitwise_not(sky_mask(rgb))
    land[:35, :] = 0
    if mode == "detail":
        src = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(src, 28, 82, L2gradient=True)
    else:
        src = cv2.bilateralFilter(gray, 7, 45, 45)
        edges = cv2.Canny(src, 36, 112, L2gradient=True)
    edges = cv2.bitwise_and(edges, land)
    edges = cv2.bitwise_and(edges, cv2.bitwise_not(architecture_content_mask(rgb)))
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))
    return edges


def architecture_mask(shape: tuple[int, int]) -> np.ndarray:
    h, w = shape
    mask = np.zeros((h, w), dtype=np.uint8)
    for x1, y1, x2, y2 in [
        (470, 405, 760, 585),
        (760, 535, 1165, 735),
        (1140, 430, 1715, 650),
        (1010, 690, 1325, 804),
    ]:
        mask[y1:y2, x1:x2] = 255
    return mask


def architecture_content_mask(rgb: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    region = architecture_mask(hue.shape)
    walls = ((region > 0) & (sat < 88) & (val > 108)).astype(np.uint8) * 255
    roofs = ((region > 0) & (((hue < 18) | (hue > 168)) & (sat > 48) & (val > 70))).astype(np.uint8) * 255
    content = cv2.bitwise_or(walls, roofs)
    content = cv2.morphologyEx(content, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    content = cv2.dilate(content, np.ones((9, 9), np.uint8), iterations=1)
    return content


def contour_line_paths(edges: np.ndarray, min_len: float, epsilon: float, limit: int) -> list[str]:
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    items: list[tuple[float, str]] = []
    for c in contours:
        length = cv2.arcLength(c, False)
        if length < min_len:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if w <= 2 and h <= 2:
            continue
        approx = cv2.approxPolyDP(c, epsilon, False)
        pts = approx.reshape(-1, 2)
        if len(pts) < 2:
            continue
        d = [f"M {pts[0, 0]:.1f} {pts[0, 1]:.1f}"]
        d.extend(f"L {x:.1f} {y:.1f}" for x, y in pts[1:])
        items.append((length, " ".join(d)))
    items.sort(reverse=True, key=lambda item: item[0])
    return [d for _, d in items[:limit]]


def protected_architecture_paths(rgb: np.ndarray) -> list[str]:
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    mask = architecture_mask(gray.shape)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    walls = ((mask > 0) & (sat < 88) & (val > 108)).astype(np.uint8) * 255
    walls = cv2.morphologyEx(walls, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    walls = cv2.morphologyEx(walls, cv2.MORPH_CLOSE, np.ones((4, 4), np.uint8))
    contours, _ = cv2.findContours(walls, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    wall_paths = []
    for c in contours:
        if cv2.contourArea(c) < 20 or cv2.arcLength(c, True) < 18:
            continue
        approx = cv2.approxPolyDP(c, 0.9, True)
        pts = approx.reshape(-1, 2)
        if len(pts) < 3:
            continue
        d = [f"M {pts[0, 0]:.1f} {pts[0, 1]:.1f}"]
        d.extend(f"L {x:.1f} {y:.1f}" for x, y in pts[1:])
        d.append("Z")
        wall_paths.append(" ".join(d))

    roofs = ((mask > 0) & (((hue < 18) | (hue > 168)) & (sat > 48) & (val > 70))).astype(np.uint8) * 255
    content = cv2.bitwise_or(walls, roofs)
    content = cv2.dilate(content, np.ones((11, 11), np.uint8), iterations=1)

    edges = cv2.Canny(cv2.GaussianBlur(gray, (3, 3), 0), 42, 115, L2gradient=True)
    edges = cv2.bitwise_and(edges, content)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=32, minLineLength=18, maxLineGap=4)
    if lines is None:
        return []
    paths = wall_paths[:260]
    seen = set()
    for raw in lines[:, 0, :]:
        x1, y1, x2, y2 = map(int, raw)
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if length < 18:
            continue
        angle = abs(math.degrees(math.atan2(dy, dx)))
        angle = min(angle, 180 - angle)
        # Protect walls, windows, roof eaves. Avoid most long diagonal wires.
        if not (angle < 7 or abs(angle - 90) < 8):
            continue
        key = (round(min(x1, x2) / 4), round(max(x1, x2) / 4), round((y1 + y2) / 6), round(angle / 5))
        if key in seen:
            continue
        seen.add(key)
        paths.append(f"M {x1:.1f} {y1:.1f} L {x2:.1f} {y2:.1f}")
    return paths[:780]


def red_roof_paths(rgb: np.ndarray) -> list[str]:
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    h, w = hue.shape
    mask = np.zeros((h, w), dtype=np.uint8)
    for x1, y1, x2, y2 in [
        (1140, 430, 1715, 650),
        (1010, 690, 1325, 804),
        (760, 535, 1165, 735),
    ]:
        mask[y1:y2, x1:x2] = 255
    roof = ((mask > 0) & (((hue < 18) | (hue > 168)) & (sat > 48) & (val > 70))).astype(np.uint8) * 255
    roof = cv2.morphologyEx(roof, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(roof, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    paths = []
    for c in contours:
        if cv2.contourArea(c) < 18 or cv2.arcLength(c, True) < 18:
            continue
        approx = cv2.approxPolyDP(c, 1.1, True)
        pts = approx.reshape(-1, 2)
        if len(pts) < 3:
            continue
        d = [f"M {pts[0, 0]:.1f} {pts[0, 1]:.1f}"]
        d.extend(f"L {x:.1f} {y:.1f}" for x, y in pts[1:])
        d.append("Z")
        paths.append(" ".join(d))
    return paths[:120]


def write_svg(path: Path, width: int, height: int, line_paths: list[str], arch_paths: list[str], roof_paths: list[str], quiet: bool):
    line_opacity = ".34" if quiet else ".46"
    arch_opacity = ".64" if quiet else ".72"
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">\n')
        f.write("  <title>停云山居茶盒照片线稿</title>\n")
        f.write("  <desc>Photo-traced restrained line art for tea box packaging. Architecture is separated and protected with straight strokes.</desc>\n")
        f.write("  <style>\n")
        f.write("    svg { background: transparent; }\n")
        f.write(f"    .photo_linework {{ fill: none; stroke: {GOLD}; stroke-width: .58; stroke-linecap: round; stroke-linejoin: round; opacity: {line_opacity}; }}\n")
        f.write(f"    .architecture_protected {{ fill: none; stroke: {LIGHT_GOLD}; stroke-width: .82; stroke-linecap: round; stroke-linejoin: round; opacity: {arch_opacity}; }}\n")
        f.write(f"    .red_roof_forms {{ fill: none; stroke: {LIGHT_GOLD}; stroke-width: .76; stroke-linecap: round; stroke-linejoin: round; opacity: {arch_opacity}; }}\n")
        f.write("  </style>\n")
        f.write('  <g id="photo_linework" class="photo_linework">\n')
        for d in line_paths:
            f.write(f'    <path d="{d}" />\n')
        f.write("  </g>\n")
        f.write('  <g id="architecture_protected" class="architecture_protected">\n')
        for d in arch_paths:
            f.write(f'    <path d="{d}" />\n')
        f.write("  </g>\n")
        f.write('  <g id="red_roof_forms" class="red_roof_forms">\n')
        for d in roof_paths:
            f.write(f'    <path d="{d}" />\n')
        f.write("  </g>\n")
        f.write("</svg>\n")


def draw_preview(path: Path, width: int, height: int, line_paths: list[str], arch_paths: list[str], roof_paths: list[str], quiet: bool):
    img = Image.new("RGB", (width, height), DEEP_GREEN)
    draw = ImageDraw.Draw(img, "RGBA")
    line_alpha = 84 if quiet else 116
    for paths, rgba, stroke_w in [
        (line_paths, (184, 138, 69, line_alpha), 1),
        (arch_paths, (208, 160, 90, 165 if not quiet else 140), 1),
        (roof_paths, (208, 160, 90, 155 if not quiet else 132), 1),
    ]:
        for d in paths:
            vals = d.replace("M", "").replace("L", "").replace("Z", "").split()
            pts = [(float(vals[i]), float(vals[i + 1])) for i in range(0, len(vals), 2)]
            if len(pts) > 1:
                draw.line(pts, fill=rgba, width=stroke_w, joint="curve")
                if d.endswith("Z"):
                    draw.line([pts[-1], pts[0]], fill=rgba, width=stroke_w)
    img.save(path)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rgb = np.array(Image.open(SRC).convert("RGB"))
    height, width = rgb.shape[:2]
    arch = protected_architecture_paths(rgb)
    roofs = red_roof_paths(rgb)

    quiet_edges = edge_map(rgb, "quiet")
    quiet_paths = contour_line_paths(quiet_edges, min_len=7, epsilon=0.65, limit=9500)
    write_svg(OUT / "停云山居_茶盒线稿_v3_照片描摹推荐版.svg", width, height, quiet_paths, arch, roofs, quiet=True)
    draw_preview(OUT / "停云山居_茶盒线稿_v3_照片描摹推荐版_深绿预览.png", width, height, quiet_paths, arch, roofs, quiet=True)

    detail_edges = edge_map(rgb, "detail")
    detail_paths = contour_line_paths(detail_edges, min_len=6, epsilon=0.55, limit=14000)
    write_svg(OUT / "停云山居_茶盒线稿_v3_照片描摹细节版.svg", width, height, detail_paths, arch, roofs, quiet=False)
    draw_preview(OUT / "停云山居_茶盒线稿_v3_照片描摹细节版_深绿预览.png", width, height, detail_paths, arch, roofs, quiet=False)

    print("recommended_paths", len(quiet_paths), "detail_paths", len(detail_paths), "arch", len(arch), "roofs", len(roofs))


if __name__ == "__main__":
    main()
