from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(r"E:\AI编程\停云小程序")
SRC = ROOT / "部分图片" / "山居介绍.png"
OUT = ROOT / "输出_茶盒线稿"
DEEP_GREEN = (13, 59, 29)
GOLD = (184, 138, 69)


def sky_mask(rgb):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    s, v = hsv[..., 1], hsv[..., 2]
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    yy = np.indices(s.shape)[0]
    sky = ((yy < 430) & (b > g + 5) & (b > r + 15) & (s > 25) & (v > 92)) | ((yy < 330) & (v > 176) & (s < 65))
    sky = sky.astype(np.uint8) * 255
    return cv2.morphologyEx(sky, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))


def render(edges, name):
    h, w = edges.shape
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:] = DEEP_GREEN
    alpha = (edges > 0).astype(np.float32)[:, :, None] * 0.72
    gold = np.array(GOLD, dtype=np.float32)
    img = img.astype(np.float32) * (1 - alpha) + gold * alpha
    im = Image.fromarray(img.astype(np.uint8))
    im.thumbnail((976, 402))
    canvas = Image.new("RGB", (976, 442), DEEP_GREEN)
    canvas.paste(im, (0, 40))
    draw = ImageDraw.Draw(canvas)
    draw.text((16, 12), name, fill=(220, 180, 110))
    return canvas


def main():
    rgb = np.array(Image.open(SRC).convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    land = cv2.bitwise_not(sky_mask(rgb))
    land[:35, :] = 0

    variants = {}
    blur5 = cv2.GaussianBlur(gray, (5, 5), 0)
    variants["A raw photo edges / close to source"] = cv2.bitwise_and(cv2.Canny(blur5, 28, 82, L2gradient=True), land)

    bilateral = cv2.bilateralFilter(gray, 7, 45, 45)
    variants["B quieter packaging line"] = cv2.bitwise_and(cv2.Canny(bilateral, 36, 112, L2gradient=True), land)

    blur9 = cv2.GaussianBlur(gray, (9, 9), 0)
    detail = cv2.Canny(blur9, 22, 72, L2gradient=True)
    variants["C broad mountain + houses"] = cv2.bitwise_and(detail, land)

    grayf = gray.astype(np.float32) / 255
    g1 = cv2.GaussianBlur(grayf, (0, 0), 0.75)
    g2 = cv2.GaussianBlur(grayf, (0, 0), 1.8)
    dog = np.abs(g1 - g2)
    thresh = np.percentile(dog[land > 0], 86)
    variants["D DoG sketch texture"] = cv2.bitwise_and((dog > thresh).astype(np.uint8) * 255, land)

    # Add a little line thickness for preview only.
    pages = []
    for k, e in variants.items():
        e = cv2.morphologyEx(e, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))
        pages.append(render(e, k))
    sheet = Image.new("RGB", (1952, 884), DEEP_GREEN)
    sheet.paste(pages[0], (0, 0))
    sheet.paste(pages[1], (976, 0))
    sheet.paste(pages[2], (0, 442))
    sheet.paste(pages[3], (976, 442))
    out = OUT / "线稿算法候选对比.png"
    sheet.save(out)
    print(out)


if __name__ == "__main__":
    main()
