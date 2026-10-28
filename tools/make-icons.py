#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成应用图标 PNG（纯标准库，无第三方依赖）

用法： python tools/make-icons.py
输出： assets/img/icon-180.png  (iOS 主屏)
       assets/img/icon-192.png  (PWA)
       assets/img/icon-512.png  (PWA / 应用商店)
"""

import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "assets", "img")

C0 = (0x4F, 0x7C, 0xFF)   # 左上
C1 = (0x8B, 0x5C, 0xF6)   # 右下

# 三条横杠：(中心x, 中心y, 半宽, 半高, 不透明度) —— 按 512 基准坐标
BARS = [
    (256, 171, 160, 21, 0.97),
    (198, 256, 102, 21, 0.72),
    (227, 341, 131, 21, 0.46),
]

BASE = 512.0


def sd_round_box(px, py, cx, cy, hw, hh, r):
    """圆角矩形的有符号距离（负值在内部）"""
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    ax = qx if qx > 0 else 0.0
    ay = qy if qy > 0 else 0.0
    outside = math.hypot(ax, ay)
    inside = min(max(qx, qy), 0.0)
    return outside + inside - r


def render(size):
    """返回 RGB 原始像素数据（rows 列表）"""
    scale = size / BASE
    px_data = []

    for y in range(size):
        row = bytearray()
        for x in range(size):
            # 渐变
            t = (x + y) / (2.0 * (size - 1)) if size > 1 else 0.0
            r = C0[0] + (C1[0] - C0[0]) * t
            g = C0[1] + (C1[1] - C0[1]) * t
            b = C0[2] + (C1[2] - C0[2]) * t

            # 叠加横杠
            for cx, cy, hw, hh, alpha in BARS:
                d = sd_round_box(x + 0.5, y + 0.5,
                                 cx * scale, cy * scale,
                                 hw * scale, hh * scale,
                                 hh * scale)
                cov = 0.5 - d
                if cov <= 0.0:
                    continue
                if cov > 1.0:
                    cov = 1.0
                a = cov * alpha
                r = r + (255 - r) * a
                g = g + (255 - g) * a
                b = b + (255 - b) * a

            row += bytes((int(r + 0.5), int(g + 0.5), int(b + 0.5)))
        px_data.append(bytes(row))

    return px_data


def write_png(path, size, rows):
    """写 8bit RGB PNG（color type 2）"""
    raw = bytearray()
    for row in rows:
        raw.append(0)          # filter type 0 (None)
        raw += row

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n" +
           chunk(b"IHDR", ihdr) +
           chunk(b"IDAT", zlib.compress(bytes(raw), 9)) +
           chunk(b"IEND", b""))

    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (180, 192, 512):
        path = os.path.join(OUT_DIR, "icon-%d.png" % size)
        write_png(path, size, render(size))
        print("generated %s (%d bytes)" % (path, os.path.getsize(path)))


if __name__ == "__main__":
    main()
