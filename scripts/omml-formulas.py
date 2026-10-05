# 數學:把 LibreOffice 畫成小 GIF 的 Word 公式(OMML)對回原檔,轉成題目 HTML
# 背景:數學原檔是 docx(副檔名 .doc),公式是 OMML;LO 匯出 HTML 時每個公式變成一張 GIF,負號/分數線常掉。
# 對應:原檔 document.xml 依序取出「圖片」與「公式」→ 圖片先與 lo-html 的 img 做序列對齊(長寬比+構圖,
#   同 rerender-metafiles.py,向量圖縮圖沿用 data/rerender/tmp)→ 兩個已對上的圖片之間,
#   lo-html 沒對上的 img 數量 == 原檔公式數量 才依序配對,否則整段跳過(不猜)。
# 輸出 data/rerender/formulas.json:[{p, html, src(檔)}];失敗統計印在最後。不動資料庫。
# 用法:python scripts/omml-formulas.py
import hashlib, html as htmlmod, json, math, os, re, sys, zipfile
from urllib.parse import unquote
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts", "lib"))
from omml import omml_to_html, Unsupported  # noqa: E402

WORK = os.path.join(ROOT, "data", "rerender")
QIMG = os.path.join(ROOT, "web", "public", "qimg", "math")
AR_TOL, MIN_SIM = 0.10, 0.4


def vec(path):
    try: im = Image.open(path).convert("RGBA")
    except Exception: return None
    bg = Image.new("RGBA", im.size, "white"); bg.alpha_composite(im)
    im = bg.convert("L").resize((48, 48), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.5))
    v = 255 - np.asarray(im, dtype=np.float32).ravel(); v -= v.mean(); n = np.linalg.norm(v)
    return v / n if n else None


def ar_of(path):
    try:
        with Image.open(path) as im: return im.width / im.height
    except Exception: return None


def align(H, D):
    n, m = len(H), len(D)
    def score(a, b):
        (ra, va), (rb, vb) = a, b
        if not (ra and rb and va is not None and vb is not None) or abs(math.log(ra / rb)) > AR_TOL: return None
        s = float(va @ vb); return s if s >= MIN_SIM else None
    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            best = max(dp[i + 1][j], dp[i][j + 1]); sc = score(H[i], D[j])
            if sc is not None: best = max(best, dp[i + 1][j + 1] + sc)
            dp[i][j] = best
    pairs, i, j = {}, 0, 0
    while i < n and j < m:
        sc = score(H[i], D[j])
        if sc is not None and abs(dp[i][j] - (dp[i + 1][j + 1] + sc)) < 1e-9: pairs[i] = j; i += 1; j += 1
        elif dp[i + 1][j] >= dp[i][j + 1]: i += 1
        else: j += 1
    return pairs


gaps = {}
gapsfull = []  # 數量對不上的段落:{slug, imgs:[依序的網站圖], maths:[依序的公式 HTML 或 None]}(給寬高比對齊用)
out, stat = [], dict(files=0, formulas=0, mapped=0, unsupported=0, gap_mismatch=0)
base = os.path.join(ROOT, "data", "lo-html", "數學")
for dp_, _, fs in os.walk(base):
    for f in fs:
        if not f.endswith(".html"): continue
        hp = os.path.join(dp_, f); rel = os.path.relpath(hp, base)
        slug = hashlib.md5(rel.encode("utf-8")).hexdigest()[:10]
        src = os.path.join(ROOT, "數學", os.path.splitext(rel)[0] + ".doc")
        qdir = os.path.join(QIMG, slug); tdir = os.path.join(WORK, "tmp", slug)
        if not (os.path.exists(src) and zipfile.is_zipfile(src) and os.path.isdir(qdir)): continue
        stat["files"] += 1
        z = zipfile.ZipFile(src)
        doc = z.read("word/document.xml").decode("utf-8")
        relx = z.read("word/_rels/document.xml.rels").decode("utf-8")
        rels = {}
        for r in re.findall(r"<Relationship [^>]*>", relx):
            i = re.search(r'Id="([^"]+)"', r); t = re.search(r'Target="([^"]+)"', r)
            if i and t: rels[i.group(1)] = t.group(1)
        # 依序:公式(m:oMath,不含巢狀)與圖片
        items = []
        for m in re.finditer(r'<m:oMath>.*?</m:oMath>|(?:r:embed|r:id)="(rId\d+)"', doc, flags=re.S):
            if m.group(1):
                t = rels.get(m.group(1), "")
                if t.startswith("media/"):
                    name = os.path.basename(t); p = os.path.join(tdir, name)
                    emf = os.path.join(tdir, os.path.splitext(name)[0] + ".wmfc.emf")
                    if os.path.exists(emf): p = emf
                    items.append(("pic", p))
            else:
                items.append(("math", m.group(0)))
        stat["formulas"] += sum(1 for k, _ in items if k == "math")
        srcs = re.findall(r'<img[^>]*src="([^"]+)"', open(hp, encoding="utf-8", errors="replace").read(), flags=re.I)
        qfiles = {int(os.path.splitext(x)[0]): x for x in os.listdir(qdir) if re.match(r"^\d{3}\.", x)}
        H = [(ar_of(os.path.join(qdir, qfiles[i])), vec(os.path.join(qdir, qfiles[i]))) if i in qfiles else (None, None)
             for i in range(len(srcs))]
        pic_idx = [k for k, (kind, _) in enumerate(items) if kind == "pic"]
        def feat(p):
            th = p + ".thumb.png"
            if os.path.exists(th): return (ar_of(th), vec(th))
            return (ar_of(p), vec(p)) if os.path.exists(p) else (None, None)
        D = [feat(items[k][1]) for k in pic_idx]
        pairs = align(H, D)  # html i → pic 序號
        anchors = [(-1, -1)] + sorted((hi, pic_idx[pj]) for hi, pj in pairs.items()) + [(len(srcs), len(items))]
        for (ha, ka), (hb, kb) in zip(anchors, anchors[1:]):
            hs = [h for h in range(ha + 1, hb) if h in qfiles]
            maths = [items[k][1] for k in range(ka + 1, kb) if items[k][0] == "math"]
            others = [k for k in range(ka + 1, kb) if items[k][0] == "pic"]
            if not maths: continue
            # 檔案開頭的頁首小圖(000,21×21)不是公式:數量多出來時先排除它
            if len(hs) != len(maths) + len(others) and len(hs) != len(maths) and hs and hs[0] == 0:
                with Image.open(os.path.join(qdir, qfiles[0])) as im0:
                    if im0.size == (21, 21): hs = hs[1:]
            if len(hs) == len(maths) + len(others):
                seq = [items[k] for k in range(ka + 1, kb)]
            elif len(hs) == len(maths):
                seq = [("math", x) for x in maths]
            else:
                stat["gap_mismatch"] += len(maths)
                # 數量對不上:把這段的候選公式記下來,給人工挑(data/rerender/formula-gaps.json)
                cands = []
                for x in maths:
                    try: cands.append(omml_to_html(x))
                    except Unsupported: cands.append(None)
                gapsfull.append({"slug": slug, "imgs": [f"/qimg/math/{slug}/{qfiles[h]}" for h in hs], "maths": cands})
                for r, h in enumerate(hs):
                    est = round((r + 0.5) / len(hs) * len(cands) - 0.5)  # 依相對位置估計的候選序號
                    gaps[f"/qimg/math/{slug}/{qfiles[h]}"] = {"est": est, "cands": cands}
                continue
            for h, (kind, x) in zip(hs, seq):
                if kind != "math": continue
                try:
                    out.append({"p": f"/qimg/math/{slug}/{qfiles[h]}", "html": omml_to_html(x), "src": rel})
                    stat["mapped"] += 1
                except Unsupported as e:
                    stat["unsupported"] += 1
json.dump(gapsfull, open(os.path.join(WORK, "formula-gaps-full.json"), "w", encoding="utf-8"), ensure_ascii=False)
json.dump(gaps, open(os.path.join(WORK, "formula-gaps.json"), "w", encoding="utf-8"), ensure_ascii=False)
json.dump(out, open(os.path.join(WORK, "formulas.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(stat)
bad = {x["p"] for x in json.load(open(os.path.join(ROOT, "data", "image-screen-confirmed.json"), encoding="utf-8"))}
fl = json.load(open(os.path.join(WORK, "formula-imgs.json")))
print(f"被確認壞掉的數學小公式圖 {len(fl)} 張,有轉換結果 {sum(1 for p in fl if p in {o['p'] for o in out})} 張")
