# 自然科題目「原檔片段」截圖(2026-10-07):用來逐題對照資料庫內容的公式、上下標、化學式是否完整
# 輸入:JSON [{id, num, volume, source}](num = 7 位題號,題組小題用母題題號)
# 做法:原檔(自然/<資料夾>/<冊>/<檔名>.doc)用 LibreOffice 轉 PDF(快取在 data/sci-pdf/,只留本機)→
#       PyMuPDF 找「題號：<num>」位置,裁到下一個「題號：」為止(可跨頁,上下接起來)→ data/rerender/sci-crops/<id>.png
# 用法:python scripts/sci-source-crops.py <輸入.json>
import json, os, subprocess, sys
import pymupdf
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOFFICE = r"C:\Program Files\LibreOffice\program\soffice.exe"
# 第 2、3 個參數:PDF 資料夾、輸出資料夾(預設 LibreOffice 版)。
# ⚠ LibreOffice 轉 PDF 會漏掉 Word 方程式物件 → 對照公式一定要用 Word 轉的 PDF(data/sci-pdf-word,2026-10-07)
PDF_DIR = os.path.join(ROOT, "data", sys.argv[2] if len(sys.argv) > 2 else "sci-pdf")
OUT = os.path.join(ROOT, "data", "rerender", sys.argv[3] if len(sys.argv) > 3 else "sci-crops")
os.makedirs(PDF_DIR, exist_ok=True); os.makedirs(OUT, exist_ok=True)

items = json.load(open(sys.argv[1], encoding="utf-8"))
pdf_cache, report = {}, {"ok": [], "no_doc": [], "no_num": []}

def doc_path(it):
    folder, name = it["source"].split("/")[:2]
    subj = {"science": "自然", "math": "數學"}.get(it.get("subject", "science"), "自然")
    base = os.path.join(ROOT, subj, folder, it["volume"] or "", name)
    for ext in (".doc", ".docx"):
        if os.path.exists(base + ext): return base + ext
    return None

def to_pdf(src):
    rel = os.path.relpath(src, ROOT)
    key = (rel[3:] if rel.startswith("自然" + os.sep) else rel).replace(os.sep, "_")  # 自然維持舊檔名;數學為「數學_…」
    pdf = os.path.join(PDF_DIR, os.path.splitext(key)[0] + ".pdf")
    if not os.path.exists(pdf) and "word" in os.path.basename(PDF_DIR):
        return None  # Word 版 PDF 要先用 Word 轉好(不能用 LibreOffice 補,會漏方程式)
    if not os.path.exists(pdf):
        tmp = os.path.join(PDF_DIR, "_tmp"); os.makedirs(tmp, exist_ok=True)
        subprocess.run([SOFFICE, "--headless", "--convert-to", "pdf", "--outdir", tmp, src], capture_output=True, timeout=300)
        made = os.path.join(tmp, os.path.splitext(os.path.basename(src))[0] + ".pdf")
        if not os.path.exists(made): return None
        os.replace(made, pdf)
    return pdf

for it in items:
    src = doc_path(it)
    if not src: report["no_doc"].append(it["id"]); continue
    pdf = pdf_cache.get(src) or to_pdf(src)
    if not pdf: report["no_doc"].append(it["id"]); continue
    pdf_cache[src] = pdf
    doc = pymupdf.open(pdf)
    # 原檔多為雙欄排版:位置記成 (頁, 欄, y),閱讀順序 = 左欄上→下、右欄上→下、下一頁
    mid = doc[0].rect.x0 + doc[0].rect.width / 2
    def col(r): return 0 if (r.x0 + r.x1) / 2 < mid else 1
    marks = []
    for pno, page in enumerate(doc):
        for r in page.search_for("題號："):
            marks.append((pno, col(r), r.y0))
    marks.sort()
    hit = None
    for pno, page in enumerate(doc):
        rs = page.search_for(f"題號：{it['num']}")
        if rs: hit = (pno, col(rs[0]), rs[0].y0); break
    if not hit: report["no_num"].append(it["id"]); continue
    nxt = next((m for m in marks if m > (hit[0], hit[1], hit[2] + 1)), None)
    # 從題號所在的(頁,欄)開始,依閱讀順序取區塊,直到下一個題號;最多 3 段
    segs, cur = [], (hit[0], hit[1])
    while len(segs) < 3:
        pno, c = cur
        page = doc[pno]
        x0, x1 = (page.rect.x0, mid) if c == 0 else (mid, page.rect.x1)
        top = hit[2] - 4 if cur == (hit[0], hit[1]) else page.rect.y0 + 20
        if nxt and (nxt[0], nxt[1]) == cur:
            segs.append((pno, x0, x1, top, nxt[2] - 2)); break
        segs.append((pno, x0, x1, top, page.rect.y1 - 20))
        cur = (pno, 1) if c == 0 else (pno + 1, 0)
        if cur[0] >= len(doc): break
    tiles = []
    for pno, x0, x1, top, bot in segs:
        if bot - top < 8: continue
        pix = doc[pno].get_pixmap(matrix=pymupdf.Matrix(2.5, 2.5), clip=pymupdf.Rect(x0, top, x1, bot))
        tile = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        # 去掉上下空白(題目在欄位尾端時會帶到大片空白);整塊空白就不要
        box = ImageOps.invert(tile.convert("L")).point(lambda v: 255 if v > 40 else 0).getbbox()
        if box and box[3] - box[1] > 30: tiles.append(tile.crop((0, max(0, box[1] - 6), tile.width, min(tile.height, box[3] + 6))))
    if not tiles: report["no_num"].append(it["id"]); continue
    w = max(t.width for t in tiles); h = sum(t.height for t in tiles)
    img = Image.new("RGB", (w, h), "white"); y = 0
    for t in tiles: img.paste(t, (0, y)); y += t.height
    img.save(os.path.join(OUT, f"{it['id']}.png"))
    report["ok"].append(it["id"])

json.dump(report, open(os.path.join(OUT, "_report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print({k: len(v) for k, v in report.items()})
