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
DEEP_GREEN = "#0D3B1D"


def svg_path(points: np.ndarray) -> str:
    pts = points.reshape(-1, 2)
    if len(pts) < 2:
        return ""
    d = [f"M {pts[0][0]:.1f} {pts[0][1]:.1f}"]
    for x, y in pts[1:]:
        d.append(f"L {x:.1f} {y:.1f}")
    return " ".join(d)


def clip_line_to_rect(x1, y1, x2, y2, rect):
    rx1, ry1, rx2, ry2 = rect
    ok, p1, p2 = cv2.clipLine(
        (int(rx1), int(ry1), int(rx2 - rx1), int(ry2 - ry1)),
        (int(x1), int(y1)),
        (int(x2), int(y2)),
    )
    if not ok:
        return None
    return p1[0], p1[1], p2[0], p2[1]


def contour_paths(edge: np.ndarray, min_len: float, epsilon: float, y_min=0, y_max=None):
    if y_max is None:
        y_max = edge.shape[0]
    contours, _ = cv2.findContours(edge, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    paths = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if y + h < y_min or y > y_max:
            continue
        length = cv2.arcLength(c, False)
        if length < min_len:
            continue
        if w < 3 and h < 3:
            continue
        approx = cv2.approxPolyDP(c, epsilon, False)
        if len(approx) < 2:
            continue
        paths.append((length, svg_path(approx)))
    paths.sort(reverse=True, key=lambda item: item[0])
    return [p for _, p in paths]


def make_sky_mask(rgb: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    yy = np.indices(h.shape)[0]
    blue_sky = (yy < 360) & (b > g + 8) & (b > r + 22) & (s > 35) & (v > 105)
    white_cloud = (yy < 310) & (v > 182) & (s < 70)
    sky = blue_sky | white_cloud
    return sky.astype(np.uint8) * 255


def draw_preview(width: int, height: int, groups: dict[str, list[str]], out_file: Path, calm: bool = False):
    img = Image.new("RGB", (width, height), DEEP_GREEN)
    draw = ImageDraw.Draw(img, "RGBA")
    color_map = (
        {
            "mountain_ridge": (184, 138, 69, 76),
            "terrain_detail": (184, 138, 69, 46),
            "architecture_protected": (205, 158, 83, 105),
            "terrace_lines": (184, 138, 69, 60),
        }
        if calm
        else {
            "mountain_ridge": (184, 138, 69, 110),
            "terrain_detail": (184, 138, 69, 72),
            "architecture_protected": (205, 158, 83, 155),
            "terrace_lines": (184, 138, 69, 88),
        }
    )
    for group, paths in groups.items():
        rgba = color_map.get(group, (184, 138, 69, 90))
        for d in paths:
            vals = d.replace("M", "").replace("L", "").split()
            pts = [(float(vals[i]), float(vals[i + 1])) for i in range(0, len(vals), 2)]
            if len(pts) > 1:
                draw.line(pts, fill=rgba, width=1, joint="curve")
    img.save(out_file)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    image = Image.open(SRC).convert("RGB")
    rgb = np.array(image)
    height, width = rgb.shape[:2]

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    gray = cv2.bilateralFilter(gray, 9, 55, 55)
    gray = cv2.equalizeHist(gray)

    sky = make_sky_mask(rgb)
    keep = cv2.bitwise_not(cv2.dilate(sky, np.ones((3, 3), np.uint8), iterations=1))

    # Broad landscape lines: restrained density, no cloud texture.
    edges_soft = cv2.Canny(gray, 55, 135, apertureSize=3, L2gradient=True)
    edges_soft = cv2.bitwise_and(edges_soft, keep)
    edges_soft[:75, :] = 0
    edges_soft = cv2.morphologyEx(edges_soft, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))

    # Lower terrain keeps a little more detail, still simplified for packaging.
    terrain_mask = np.zeros_like(edges_soft)
    terrain_mask[250:, :] = 255
    terrain_edges = cv2.bitwise_and(edges_soft, terrain_mask)
    terrain_edges = cv2.morphologyEx(terrain_edges, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))

    # Mountain ridge/top rocks need longer, calmer paths.
    ridge_mask = np.zeros_like(edges_soft)
    ridge_mask[70:430, :] = 255
    ridge_edges = cv2.bitwise_and(edges_soft, ridge_mask)
    ridge_edges = cv2.morphologyEx(ridge_edges, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))

    # Architecture zones are protected: add Canny contours plus straight Hough segments.
    arch_mask = np.zeros_like(edges_soft)
    arch_rects = [
        (470, 405, 760, 585),   # white house on the left slope
        (760, 540, 1150, 720),  # center lodging cluster
        (1150, 430, 1690, 650), # right buildings and red roofs
        (1010, 690, 1310, 800), # lower red roof foreground
    ]
    for x1, y1, x2, y2 in arch_rects:
        arch_mask[y1:y2, x1:x2] = 255

    arch_gray = cv2.GaussianBlur(gray, (3, 3), 0)
    arch_edges = cv2.Canny(arch_gray, 35, 105, apertureSize=3, L2gradient=True)
    arch_edges = cv2.bitwise_and(arch_edges, arch_mask)
    arch_edges = cv2.morphologyEx(arch_edges, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))

    groups = {
        "mountain_ridge": contour_paths(ridge_edges, min_len=42, epsilon=1.4, y_min=75, y_max=430)[:1500],
        "terrain_detail": contour_paths(terrain_edges, min_len=24, epsilon=1.65, y_min=250)[:2200],
        "architecture_protected": contour_paths(arch_edges, min_len=13, epsilon=0.75, y_min=400)[:900],
        "terrace_lines": [],
    }

    lines = cv2.HoughLinesP(
        arch_edges,
        rho=1,
        theta=np.pi / 180,
        threshold=34,
        minLineLength=18,
        maxLineGap=5,
    )
    protected_segments = []
    if lines is not None:
        seen = set()
        for raw in lines[:, 0, :]:
            x1, y1, x2, y2 = map(int, raw)
            dx, dy = x2 - x1, y2 - y1
            length = math.hypot(dx, dy)
            if length < 18:
                continue
            angle = abs(math.degrees(math.atan2(dy, dx)))
            angle = min(angle, 180 - angle)
            # Prioritize roof, wall, window, terrace-like straight lines.
            if not (angle < 12 or abs(angle - 90) < 12 or 18 < angle < 42):
                continue
            key = tuple(round(v / 3) for v in (x1, y1, x2, y2))
            if key in seen:
                continue
            seen.add(key)
            protected_segments.append(f"M {x1:.1f} {y1:.1f} L {x2:.1f} {y2:.1f}")
    groups["architecture_protected"].extend(protected_segments[:520])

    # Terraces: sparse, mostly horizontal lines that give "mountain residence" identity without noise.
    line_edges = cv2.bitwise_and(edges_soft, cv2.bitwise_not(arch_mask))
    h_lines = cv2.HoughLinesP(
        line_edges,
        rho=1,
        theta=np.pi / 180,
        threshold=58,
        minLineLength=42,
        maxLineGap=8,
    )
    terraces = []
    if h_lines is not None:
        seen = set()
        for raw in h_lines[:, 0, :]:
            x1, y1, x2, y2 = map(int, raw)
            if y1 < 300 and y2 < 300:
                continue
            dx, dy = x2 - x1, y2 - y1
            length = math.hypot(dx, dy)
            if length < 42:
                continue
            angle = abs(math.degrees(math.atan2(dy, dx)))
            angle = min(angle, 180 - angle)
            if angle > 11:
                continue
            key = (round(min(x1, x2) / 8), round(max(x1, x2) / 8), round((y1 + y2) / 12))
            if key in seen:
                continue
            seen.add(key)
            terraces.append(f"M {x1:.1f} {y1:.1f} L {x2:.1f} {y2:.1f}")
    groups["terrace_lines"] = terraces[:520]

    style = """
    <style>
      svg { background: transparent; }
      .mountain_ridge { fill: none; stroke: #B88A45; stroke-width: 0.72; stroke-linecap: round; stroke-linejoin: round; opacity: .42; }
      .terrain_detail { fill: none; stroke: #B88A45; stroke-width: 0.55; stroke-linecap: round; stroke-linejoin: round; opacity: .28; }
      .architecture_protected { fill: none; stroke: #D0A05A; stroke-width: 0.82; stroke-linecap: round; stroke-linejoin: round; opacity: .58; }
      .terrace_lines { fill: none; stroke: #B88A45; stroke-width: 0.62; stroke-linecap: round; stroke-linejoin: round; opacity: .34; }
    </style>
    """

    minimal_groups = {
        "mountain_ridge": groups["mountain_ridge"][:260],
        "terrain_detail": groups["terrain_detail"][:720],
        "architecture_protected": groups["architecture_protected"][:560] + protected_segments[:360],
        "terrace_lines": groups["terrace_lines"][:260],
    }

    def write_svg(path: Path, calm: bool = False, source_groups: dict[str, list[str]] | None = None):
        source_groups = source_groups or groups
        calm_style = style
        if calm:
            calm_style = style.replace("opacity: .42", "opacity: .30")
            calm_style = calm_style.replace("opacity: .28", "opacity: .18")
            calm_style = calm_style.replace("opacity: .58", "opacity: .42")
            calm_style = calm_style.replace("opacity: .34", "opacity: .24")
        with path.open("w", encoding="utf-8", newline="\n") as f:
            f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">\n')
            f.write("  <title>停云山居茶盒背景线稿</title>\n")
            f.write("  <desc>From source photo, simplified for quiet Chinese-style tea packaging. Groups are editable in Illustrator.</desc>\n")
            f.write(calm_style)
            for group, paths in source_groups.items():
                f.write(f'  <g id="{group}" class="{group}">\n')
                for d in paths:
                    if d:
                        f.write(f'    <path d="{d}" />\n')
                f.write("  </g>\n")
            f.write("</svg>\n")

    write_svg(OUT / "停云山居_茶盒线稿_AI可编辑.svg", calm=False)
    write_svg(OUT / "停云山居_茶盒线稿_淡版_不抢文字.svg", calm=True)
    write_svg(OUT / "停云山居_茶盒线稿_推荐极简留白版.svg", calm=True, source_groups=minimal_groups)

    draw_preview(width, height, groups, OUT / "停云山居_茶盒线稿_深绿底预览.png", calm=False)
    draw_preview(width, height, groups, OUT / "停云山居_茶盒线稿_淡版_深绿底预览.png", calm=True)
    draw_preview(width, height, minimal_groups, OUT / "停云山居_茶盒线稿_推荐极简留白版预览.png", calm=True)

    # Also save transparent raster proof for quick placement checks.
    transparent = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    draw = ImageDraw.Draw(transparent, "RGBA")
    for group, paths in groups.items():
        rgba = (184, 138, 69, 85)
        width_px = 1
        if group == "architecture_protected":
            rgba = (208, 160, 90, 140)
        if group == "terrain_detail":
            rgba = (184, 138, 69, 55)
        for d in paths:
            vals = d.replace("M", "").replace("L", "").split()
            pts = [(float(vals[i]), float(vals[i + 1])) for i in range(0, len(vals), 2)]
            if len(pts) > 1:
                draw.line(pts, fill=rgba, width=width_px, joint="curve")
    transparent.save(OUT / "停云山居_茶盒线稿_透明预览.png")

    counts = {key: len(val) for key, val in groups.items()}
    print(f"source={SRC}")
    print(f"size={width}x{height}")
    print(f"paths={counts}")
    print(f"out={OUT}")


if __name__ == "__main__":
    main()
