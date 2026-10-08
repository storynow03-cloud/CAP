# 把 make-recheck-page.mjs 產生的複核頁逐題截圖(2026-10-07)→ data/rerender/<資料夾>/shots/<id>.png
# 每張 = 左:資料庫內容(網站 CSS)、右:Word 原檔裁圖。用法:python scripts/shoot-recheck.py <資料夾名>
import glob, os, re, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = os.path.join(ROOT, "data", "rerender", sys.argv[1])
out = os.path.join(d, "shots"); os.makedirs(out, exist_ok=True)
n = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 900})
    for f in sorted(glob.glob(os.path.join(d, "page-*.html"))):
        pg.goto("file:///" + f.replace("\\", "/"))
        pg.wait_for_load_state("networkidle")
        for s in pg.query_selector_all("section"):
            m = re.search(r"#\d+ (\S+)", s.query_selector("h2").inner_text())
            s.screenshot(path=os.path.join(out, m.group(1) + ".png"))
            n += 1
    b.close()
print(f"{n} 張 → {out}")
