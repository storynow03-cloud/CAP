# 檢查重畫圖與舊圖「構圖」是否一致(防止配對錯圖):兩張都縮成 48×48 灰階、模糊後算相關係數
# 輸出 data/rerender/similarity.json:[{p, sim}],由低到高;低分的要人工看
# 用法:python scripts/rerender-similarity.py
import json, os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "data", "rerender")

def vec(im):
    im = im.convert("L").resize((48, 48), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.5))
    v = 255 - np.asarray(im, dtype=np.float32).ravel()
    v -= v.mean(); n = np.linalg.norm(v)
    return v / n if n else v

def load_old(p):
    im = Image.open(os.path.join(ROOT, "web/public", p.lstrip("/"))).convert("RGBA")
    bg = Image.new("RGBA", im.size, "white"); bg.alpha_composite(im)
    return bg

out = []
for m in json.load(open(os.path.join(WORK, "map.json"), encoding="utf-8")):
    p = m["p"]
    new = Image.open(os.path.join(WORK, "out", p.split("/qimg/")[1]))
    out.append({"p": p, "sim": round(float(vec(load_old(p)) @ vec(new)), 3)})
out.sort(key=lambda x: x["sim"])
json.dump(out, open(os.path.join(WORK, "similarity.json"), "w", encoding="utf-8"), indent=0)
s = np.array([x["sim"] for x in out])
for t in (0.3, 0.5, 0.7, 0.8):
    print(f"相似度 < {t}: {int((s < t).sum())} 張")
print(f"共 {len(out)} 張,中位數 {np.median(s):.3f}")
