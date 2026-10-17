# 擦掉物件圖裡的「□」缺字方框(2026-10-16)
# 背景:內嵌 Word 文件物件(文字方塊)的預覽圖,是當初存檔的電腦畫的;段首全形空白縮排在那台電腦缺字 → 畫成兩個灰色空心方框。
#       連 Word 自己輸出也一樣(方框直接畫在預覽圖裡)。那兩格本來就是空白,所以塗白即可還原。
# 判斷(很嚴格,避免動到國字「口」):空心正方形(12~60px、長寬差 ≤20%)、內部全白、筆畫像素占外框面積 < 40%、
#       而且整個框是同一個淺灰色(最深的像素 > 120;正常文字是黑色,最深接近 0)。
# 用法:python scripts/fix-tofu-boxes.py [--apply] <圖片或資料夾> ...   (乾跑只列出;--apply 才覆寫,原檔另存 .orig.png)
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

APPLY = "--apply" in sys.argv
paths = [p for p in sys.argv[1:] if p != "--apply"]
files = []
for p in paths:
    if os.path.isdir(p): files += [os.path.join(p, f) for f in sorted(os.listdir(p)) if f.endswith(".png") and not f.endswith(".orig.png")]
    else: files.append(p)

def boxes(gray):
    dark = gray < 200
    lab, _ = ndimage.label(dark, structure=np.ones((3, 3)))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None: continue
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if not (12 <= w <= 60 and 12 <= h <= 60 and abs(w - h) <= 0.2 * max(w, h)): continue
        comp = lab[sl] == i
        inner = comp[3:-3, 3:-3]
        if not inner.size or inner.mean() >= 0.05 or comp.mean() >= 0.4: continue
        if gray[sl][comp].min() <= 120: continue  # 黑色筆畫 = 真正的字(例如「口」)
        out.append(sl)
    return out

hit = 0
for f in files:
    im = Image.open(f).convert("RGB")
    g = np.asarray(im.convert("L")).astype(int)
    bs = boxes(g)
    if not bs: continue
    hit += 1
    print(f"{os.path.basename(f)}: {len(bs)} 個方框 " + " ".join(f"({b[1].start},{b[0].start})" for b in bs))
    if APPLY:
        a = np.asarray(im).copy()
        for b in bs: a[b[0].start:b[0].stop, b[1].start:b[1].stop] = 255
        orig = f[:-4] + ".orig.png"
        if not os.path.exists(orig): im.save(orig)
        Image.fromarray(a).save(f)
print(f"共 {len(files)} 張,有方框 {hit} 張" + ("(已塗白,原圖存 .orig.png)" if APPLY else "(乾跑)"))
