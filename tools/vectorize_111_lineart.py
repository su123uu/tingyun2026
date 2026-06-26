from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


SRC = Path(r"C:\Users\29726\Desktop\111.png")
OUT = Path(r"E:\AI编程\停云小程序\输出_茶盒线稿")
GOLD = "#C99442"
DEEP_GREEN = "#0D3B1D"


def make_mask(rgb: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)

    # Gold/brown strokes on a white or pale background.
    gold = (s > 28) & (v < 252) & (r > g - 18) & (g > b + 4)
    darker_line = (v < 218) & (s > 15)
    mask = (gold | darker_line).astype(np.uint8) * 255

    # Keep antialiased strokes connected without fattening them too much.
    mask = cv2.medianBlur(mask, 3)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))
    return mask


def contour_to_d(contour: np.ndarray, epsilon: float) -> str:
    approx = cv2.approxPolyDP(contour, epsilon, True)
    pts = approx.reshape(-1, 2)
    if len(pts) < 3:
        return ""
    d = [f"M {pts[0, 0]:.1f} {pts[0, 1]:.1f}"]
    d.extend(f"L {x:.1f} {y:.1f}" for x, y in pts[1:])
    d.append("Z")
    return " ".join(d)


def build_contour_paths(mask: np.ndarray, epsilon: float = 0.45) -> list[str]:
    contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    paths: list[tuple[float, str]] = []
    for c in contours:
        area = abs(cv2.contourArea(c))
        length = cv2.arcLength(c, True)
        if area < 1.2 or length < 4:
            continue
        d = contour_to_d(c, epsilon)
        if d:
            paths.append((length, d))
    paths.sort(reverse=True, key=lambda item: item[0])
    return [d for _, d in paths]


def write_svg(path: Path, width: int, height: int, paths: list[str], title: str, opacity: float = 1.0):
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">\n')
        f.write(f"  <title>{title}</title>\n")
        f.write("  <desc>Vectorized from 111.png. Compound filled paths preserve the original gold line artwork for Illustrator editing and print layout.</desc>\n")
        f.write("  <style>\n")
        f.write("    svg { background: transparent; }\n")
        f.write(f"    .lineart {{ fill: {GOLD}; fill-rule: evenodd; stroke: none; opacity: {opacity:.2f}; }}\n")
        f.write("  </style>\n")
        f.write('  <g id="tingyun_shanju_lineart" class="lineart">\n')
        compound = " ".join(paths)
        f.write(f'    <path id="linework_compound" d="{compound}" />\n')
        f.write("  </g>\n")
        f.write("</svg>\n")


def draw_preview(path: Path, mask: np.ndarray, bg: str = DEEP_GREEN):
    height, width = mask.shape
    bg_rgb = tuple(int(bg[i : i + 2], 16) for i in (1, 3, 5))
    img = Image.new("RGB", (width, height), bg_rgb)
    gold = Image.new("RGB", (width, height), (201, 148, 66))
    alpha = Image.fromarray(mask).point(lambda v: min(220, int(v * 0.86)))
    img = Image.composite(gold, img, alpha)
    img.save(path)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rgb = np.array(Image.open(SRC).convert("RGB"))
    height, width = rgb.shape[:2]
    mask = make_mask(rgb)

    full_paths = build_contour_paths(mask, epsilon=0.42)
    light_paths = build_contour_paths(mask, epsilon=0.95)

    write_svg(
        OUT / "111_停云山居线稿_保真轮廓版_AI可编辑.svg",
        width,
        height,
        full_paths,
        "111 停云山居线稿 保真轮廓版",
        opacity=1.0,
    )
    write_svg(
        OUT / "111_停云山居线稿_轻量简化版_AI可编辑.svg",
        width,
        height,
        light_paths,
        "111 停云山居线稿 轻量简化版",
        opacity=1.0,
    )

    # Transparent bitmap is useful for quick package mockups.
    transparent = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    transparent.putalpha(Image.fromarray(mask))
    color = Image.new("RGBA", (width, height), (201, 148, 66, 255))
    transparent = Image.composite(color, transparent, Image.fromarray(mask))
    transparent.save(OUT / "111_停云山居线稿_透明金线预览.png")

    draw_preview(OUT / "111_停云山居线稿_深绿底预览.png", mask)
    print(f"size={width}x{height}")
    print(f"full_paths={len(full_paths)} light_paths={len(light_paths)}")
    print(OUT)


if __name__ == "__main__":
    main()
