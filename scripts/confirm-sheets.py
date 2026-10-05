# 待複核壞圖拼圖頁:讀 data/image-review/to-confirm.json([{p, why}]),目前網站上的圖(web/public)每頁 12 張(3×4)
# 輸出 data/image-review/confirm/sheet-XXX.png 與 index.json(頁 → [{n, p, why}])
import json, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RD = os.path.join(ROOT, "data", "image-review")
import sys
# 用法:python scripts/confirm-sheets.py [輸入 JSON(字串陣列或 [{p, why}])] [輸出資料夾名]
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RD, "to-confirm.json")
items = [x if isinstance(x, dict) else {"p": x, "why": ""} for x in json.load(open(src, encoding="utf-8"))]
out = os.path.join(RD, sys.argv[2] if len(sys.argv) > 2 else "confirm"); os.makedirs(out, exist_ok=True)
for f in os.listdir(out): os.remove(os.path.join(out, f))
font = ImageFont.truetype("arial.ttf", 18)
CW, CH, COLS, ROWS = 390, 300, 3, 4
index = {}
for pg in range(0, len(items), COLS * ROWS):
    chunk = items[pg:pg + COLS * ROWS]
    sheet = Image.new("RGB", (CW * COLS, CH * ROWS), (226, 232, 240)); d = ImageDraw.Draw(sheet)
    name = f"sheet-{pg // (COLS * ROWS) + 1:03d}"; index[name] = []
    for k, it in enumerate(chunk):
        x, y = (k % COLS) * CW, (k // COLS) * CH
        d.rectangle([x, y, x + CW - 4, y + 24], fill=(30, 41, 59)); d.text((x + 6, y + 2), f"#{k + 1}", fill=(250, 204, 21), font=font)
        try:
            im = Image.open(os.path.join(ROOT, "web/public", it["p"].lstrip("/"))).convert("RGBA")
            bg = Image.new("RGBA", im.size, "white"); bg.alpha_composite(im); im = bg.convert("RGB")
            s = min(2.0, (CW - 8) / im.width, (CH - 32) / im.height)
            im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS if s < 1 else Image.NEAREST)
        except Exception:
            im = Image.new("RGB", (60, 30), (255, 105, 180))
        sheet.paste(im, (x + 2, y + 28))
        index[name].append({"n": k + 1, **it})
    sheet.save(os.path.join(out, name + ".png"))
json.dump(index, open(os.path.join(out, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(f"{len(items)} 張 → {len(index)} 頁 data/image-review/confirm/")
