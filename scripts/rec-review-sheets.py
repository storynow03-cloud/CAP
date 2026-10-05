# 救回圖片的「題目文字 + 圖」檢查頁(PNG,給子代理看):每頁 4 題,圖用 [圖1][圖2] 標在文字裡、下面依序貼圖
# 輸入 data/rerender/rec-review-items.json;輸出 data/rerender/rec-review/p001.png …、index.json
import json, os, re, html, textwrap
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "data", "rerender")
items = json.load(open(os.path.join(WORK, "rec-review-items.json"), encoding="utf-8"))
out = os.path.join(WORK, "rec-review"); os.makedirs(out, exist_ok=True)
for f in os.listdir(out): os.remove(os.path.join(out, f))
font = ImageFont.truetype("C:/Windows/Fonts/msjh.ttc", 17)
bold = ImageFont.truetype("C:/Windows/Fonts/msjhbd.ttc", 18)
W, PER = 1200, 4
index = {}
for pg in range(0, len(items), PER):
    blocks = []
    for n, it in enumerate(items[pg:pg + PER], 1):
        srcs = re.findall(r'src="([^"]+)"', it["html"])
        k = [0]
        def rep(m): k[0] += 1; return f"[圖{k[0]}]"
        t = re.sub(r"<img[^>]*>", rep, it["html"])
        t = re.sub(r"<br\s*/?>", "\n", t); t = html.unescape(re.sub(r"<[^>]+>", "", t))
        lines = []
        for para in t.split("\n"):
            lines += textwrap.wrap(para, 62) or [""]
        lines = lines[:28]
        ims = []
        for i, s in enumerate(srcs, 1):
            try:
                im = Image.open(os.path.join(ROOT, "web/public", s.lstrip("/"))).convert("RGBA")
                bg = Image.new("RGBA", im.size, "white"); bg.alpha_composite(im); im = bg.convert("RGB")
                sc = min(1.0, 560 / im.width, 340 / im.height); im = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))))
            except Exception:
                im = Image.new("RGB", (80, 30), (255, 105, 180))
            ims.append((i, im))
        # 排版:文字 + 圖(兩欄)
        th = 30 + 22 * len(lines)
        rows, x, y, rh = [], 0, 0, 0
        for i, im in ims:
            if x + im.width > W - 20: x = 0; y += rh + 26; rh = 0
            rows.append((i, im, x, y)); x += im.width + 16; rh = max(rh, im.height)
        h = th + (y + rh + 30 if ims else 0) + 10
        blk = Image.new("RGB", (W, h), "white"); d = ImageDraw.Draw(blk)
        d.rectangle([0, 0, W, 26], fill=(30, 41, 59)); d.text((8, 3), f"#{n}  {it['id']}", fill=(250, 204, 21), font=bold)
        for li, line in enumerate(lines): d.text((8, 30 + 22 * li), line, fill="black", font=font)
        for i, im, x0, y0 in rows:
            d.text((10 + x0, th + y0), f"[圖{i}]", fill=(200, 0, 0), font=bold); blk.paste(im, (10 + x0, th + y0 + 22))
        blocks.append(blk)
    H = sum(b.height + 6 for b in blocks)
    sheet = Image.new("RGB", (W, H), (180, 180, 180)); y = 0
    for b in blocks: sheet.paste(b, (0, y)); y += b.height + 6
    name = f"p{pg // PER + 1:03d}"
    sheet.save(os.path.join(out, name + ".png"))
    index[name] = [{"n": i + 1, "id": it["id"]} for i, it in enumerate(items[pg:pg + PER])]
json.dump(index, open(os.path.join(out, "index.json"), "w", encoding="utf-8"), indent=0)
print(f"{len(items)} 題 → {len(index)} 頁 data/rerender/rec-review/")
