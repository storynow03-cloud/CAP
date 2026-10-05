# 重畫結果「新舊對照」拼圖頁:每列左邊舊圖(web/public/qimg)、右邊新圖(data/rerender/out),都放大 2 倍
# 輸出 data/rerender/compare/cmp-0001.png …,以及 index.json(頁 → [{n, p}])
# 用法:python scripts/rerender-compare.py [--flagged-only] [--list 清單.json] [--out 資料夾名] [--per-page 10]
import argparse, json, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "data", "rerender")
ap = argparse.ArgumentParser()
ap.add_argument("--flagged-only", action="store_true")
ap.add_argument("--per-page", type=int, default=10)
ap.add_argument("--list", default="", help="只看這個 JSON 清單(字串陣列或 [{p}])裡的圖")
ap.add_argument("--out", default="compare")
ap.add_argument("--map", default="map.json", help="對應表檔名(data/rerender/ 底下)")
args = ap.parse_args()

items = [m["p"] for m in json.load(open(os.path.join(WORK, args.map), encoding="utf-8"))]
if args.flagged_only:
    flagged = {f["p"] for f in json.load(open(os.path.join(ROOT, "data/image-review/flagged.json"), encoding="utf-8"))}
    items = [p for p in items if p in flagged]
if args.list:
    want = [x if isinstance(x, str) else x["p"] for x in json.load(open(args.list, encoding="utf-8"))]
    have = set(items); items = [p for p in want if p in have]
out_dir = os.path.join(WORK, args.out); os.makedirs(out_dir, exist_ok=True)
for f in os.listdir(out_dir): os.remove(os.path.join(out_dir, f))
try: font = ImageFont.truetype("arial.ttf", 18)
except Exception: font = ImageFont.load_default()

MAXW = 560  # 每邊最大寬度
index = {}
for pg in range(0, len(items), args.per_page):
    chunk = items[pg:pg + args.per_page]
    rows = []
    for p in chunk:
        old = Image.open(os.path.join(ROOT, "web/public", p.lstrip("/"))).convert("RGBA")
        bg = Image.new("RGBA", old.size, "white"); bg.alpha_composite(old); old = bg.convert("RGB")
        new = Image.open(os.path.join(WORK, "out", p.split("/qimg/")[1])).convert("RGB")
        s = min(2.0, MAXW / old.width)
        size = (max(1, int(old.width * s)), max(1, int(old.height * s)))
        rows.append((old.resize(size, Image.NEAREST), new.resize(size, Image.LANCZOS)))
    W = MAXW * 2 + 60
    H = sum(max(a.height, 20) + 34 for a, _ in rows)
    sheet = Image.new("RGB", (W, H), (226, 232, 240)); d = ImageDraw.Draw(sheet); y = 0
    name = f"cmp-{pg // args.per_page + 1:04d}"
    index[name] = []
    for n, ((a, b), p) in enumerate(zip(rows, chunk), 1):
        d.rectangle([0, y, W, y + 24], fill=(30, 41, 59))
        d.text((6, y + 2), f"#{n}  OLD | NEW", fill=(250, 204, 21), font=font)
        sheet.paste(a, (0, y + 30)); sheet.paste(b, (MAXW + 60, y + 30))
        index[name].append({"n": n, "p": p}); y += max(a.height, 20) + 34
    sheet.save(os.path.join(out_dir, name + ".png"))
json.dump(index, open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8"), indent=0)
print(f"{len(items)} 張 → {len(index)} 頁 data/rerender/{args.out}/")
