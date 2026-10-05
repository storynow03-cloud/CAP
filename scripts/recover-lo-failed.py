# 救回 LibreOffice 匯出失敗的圖(lo-html 裡 <img src> 指回 .html 本身)— 社會/國文/英文(2026-10-05)
# 做法:原始 .doc 直接取圖(scripts/lib/doc_blips.py,OfficeArt BLIP)→ 與 lo-html 的 img 序列對齊:
#   1. 能讀的 LO 圖 ↔ 原始圖 用「長寬比 + 構圖相似度」做 DP 序列對齊(同 rerender-webp)
#   2. 兩個對上的錨點之間,「匯出失敗的 img」數量 == 「沒配到的原始圖」數量 → 依序配對,
#      且 img 標籤上的 width/height 長寬比要和原始圖相差 15% 內
# 輸出:data/rerender/recovered/<subject>/<sha1>.png(向量圖用 GDI+ 以顯示寬度 2 倍畫)
#       data/rerender/recovered.json:{ "<lo-html 絕對路徑>|<img 序號>": "<png 絕對路徑>" }(patch-lo-images 會讀)
# 用法:python scripts/recover-lo-failed.py [--subjects 社會,國文,英文]
import hashlib, html as htmlmod, json, math, os, re, struct, subprocess, sys, zipfile
from urllib.parse import unquote
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts", "lib"))
from doc_blips import extract as doc_blips  # noqa: E402

WORK = os.path.join(ROOT, "data", "rerender")
OUT = os.path.join(WORK, "recovered"); os.makedirs(OUT, exist_ok=True)
TMP = os.path.join(WORK, "tmp-recover"); os.makedirs(TMP, exist_ok=True)
PS = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]
SUBJ = {"社會": "social", "國文": "chinese", "英文": "english"}
want = sys.argv[sys.argv.index("--subjects") + 1].split(",") if "--subjects" in sys.argv else list(SUBJ)
AR_TOL, MIN_SIM, GAP_AR = 0.10, 0.4, 0.15


def vec(path):
    try: im = Image.open(path).convert("RGBA")
    except Exception: return None
    bg = Image.new("RGBA", im.size, "white"); bg.alpha_composite(im)
    a = np.asarray(bg.convert("RGB")).copy()
    a[(a[..., 0] > 200) & (a[..., 1] < 80) & (a[..., 2] > 200)] = 255
    im = Image.fromarray(a).convert("L").resize((48, 48), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.5))
    v = 255 - np.asarray(im, dtype=np.float32).ravel(); v -= v.mean(); n = np.linalg.norm(v)
    return v / n if n else None


def ar_of(path):
    try:
        with Image.open(path) as im: return im.width / im.height
    except Exception: return None


def embedded_emf(wmf):
    off = 22 if wmf[:4] == b"\xd7\xcd\xc6\x9a" else 0
    if len(wmf) < off + 18: return None
    p = off + struct.unpack_from("<H", wmf, off + 2)[0] * 2; chunks, total = [], None
    while p + 6 <= len(wmf):
        size, fn = struct.unpack_from("<IH", wmf, p)
        if size == 0: break
        if fn == 0x0626 and struct.unpack_from("<H", wmf, p + 6)[0] == 15 and wmf[p + 10:p + 14] == b"WMFC":
            b = p + 10; cur = struct.unpack_from("<I", wmf, b + 22)[0]; total = struct.unpack_from("<I", wmf, b + 30)[0]
            chunks.append(wmf[b + 34:b + 34 + cur])
        p += size * 2
    data = b"".join(chunks)
    return data if total and len(data) == total and data[40:44] == b" EMF" else None


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


jobs = []
for zh in want:
    base = os.path.join(ROOT, "data", "lo-html", zh)
    for dp_, _, fs in os.walk(base):
        for f in fs:
            if not f.endswith(".html"): continue
            hp = os.path.join(dp_, f)
            h = open(hp, encoding="utf-8", errors="replace").read()
            tags = re.findall(r"<img[^>]*>", h, flags=re.I)
            if not any(re.search(r'src="[^"]*\.html"', t, flags=re.I) for t in tags): continue
            src = os.path.join(ROOT, zh, os.path.splitext(os.path.relpath(hp, base))[0] + ".doc")
            if os.path.exists(src): jobs.append((zh, hp, src, tags))
print(f"有匯出失敗圖的檔案 {len(jobs)} 個", flush=True)

# 1. 取原始圖
items = []
for zh, hp, src, tags in jobs:
    key = hashlib.md5(hp.encode("utf-8")).hexdigest()[:10]
    tdir = os.path.join(TMP, key); os.makedirs(tdir, exist_ok=True)
    try:
        if zipfile.is_zipfile(src): continue  # 這三科都是真 .doc;docx 另案
        blips = doc_blips(src)
    except Exception as e:
        print("  ⚠️", os.path.basename(src), e); continue
    seq = []
    for k, (_, _, ext, data) in enumerate(blips):
        if ext == "wmf":
            emf = embedded_emf(data)
            if emf: ext, data = "emf", emf
        bp = os.path.join(tdir, f"blip{k:03d}.{ext}")
        if not os.path.exists(bp): open(bp, "wb").write(data)
        seq.append(bp)
    items.append(dict(zh=zh, hp=hp, tags=tags, seq=seq, tdir=tdir))

metas = [p for it in items for p in it["seq"] if p.endswith((".emf", ".wmf"))]
lst = os.path.join(WORK, "recover-meta.txt"); open(lst, "w", encoding="utf-8").write("\n".join(metas))
r = subprocess.run(PS + [os.path.join(ROOT, "scripts/lib/metafile-size.ps1"), "-List", lst], capture_output=True, text=True, encoding="utf-8", errors="replace")
wh = {}
for line in r.stdout.splitlines():
    i, w, h = line.split("\t"); wh[metas[int(i)]] = (float(w or 0), float(h or 0))
tj = [f"{p}\t{p}.thumb.png\t{max(1, round(w * 160 / max(w, h)))}\t{max(1, round(h * 160 / max(w, h)))}" for p, (w, h) in wh.items() if w and h]
open(os.path.join(WORK, "recover-thumb.tsv"), "w", encoding="utf-8").write("\n".join(tj))
subprocess.run(PS + [os.path.join(ROOT, "scripts/lib/render-metafile.ps1"), "-Jobs", os.path.join(WORK, "recover-thumb.tsv")], capture_output=True)

# 2. 對齊 + 配對失敗的圖
recovered, render, stat = {}, [], dict(failed_imgs=0, paired=0, gap_mismatch=0, ar_bad=0)
for it in items:
    H, failed, tag_ar = [], [], []
    for i, t in enumerate(it["tags"]):
        s = re.search(r'src="([^"]+)"', t); s = s.group(1) if s else ""
        w = re.search(r'width="(\d+)"', t); h = re.search(r'height="(\d+)"', t)
        tag_ar.append(int(w.group(1)) / int(h.group(1)) if w and h and int(h.group(1)) else None)
        if s.lower().endswith(".html"):
            H.append((None, None)); failed.append(i); stat["failed_imgs"] += 1
        else:
            p = os.path.join(os.path.dirname(it["hp"]), unquote(htmlmod.unescape(s)).replace("/", os.sep))
            H.append((ar_of(p), vec(p)) if os.path.exists(p) else (None, None))
    D = []
    for p in it["seq"]:
        if p in wh:
            w, h = wh[p]; D.append((w / h if h else None, vec(p + ".thumb.png")))
        else: D.append((ar_of(p), vec(p)))
    pairs = align(H, D)
    anchors = [(-1, -1)] + sorted(pairs.items()) + [(len(H), len(D))]
    fset = set(failed)
    for (ha, da), (hb, db) in zip(anchors, anchors[1:]):
        hs = [i for i in range(ha + 1, hb) if i in fset]
        if not hs: continue
        ds = list(range(da + 1, db))
        if len(hs) == len(ds): pairs_g = list(zip(hs, ds))
        else:
            # 數量對不上:只用 img 標籤的長寬比,在這段裡做順序不交錯的配對(差 5% 內),每張失敗圖都要配到才採用
            ok = lambda h, d: tag_ar[h] and D[d][0] and abs(math.log(tag_ar[h] / D[d][0])) <= 0.05
            n, m = len(hs), len(ds)
            best = [[0] * (m + 1) for _ in range(n + 1)]
            for a in range(n - 1, -1, -1):
                for b in range(m - 1, -1, -1):
                    best[a][b] = max(best[a + 1][b], best[a][b + 1], best[a + 1][b + 1] + 1 if ok(hs[a], ds[b]) else 0)
            if best[0][0] != n: stat["gap_mismatch"] += n; continue
            pairs_g, a, b = [], 0, 0
            while a < n and b < m:
                if ok(hs[a], ds[b]) and best[a][b] == best[a + 1][b + 1] + 1: pairs_g.append((hs[a], ds[b])); a += 1; b += 1
                else: b += 1
            if len(pairs_g) != n: stat["gap_mismatch"] += n; continue
            stat["gap_ar"] = stat.get("gap_ar", 0) + n
        for hi, di in pairs_g:
            p = it["seq"][di]
            if tag_ar[hi] and D[di][0] and abs(math.log(tag_ar[hi] / D[di][0])) > GAP_AR: stat["ar_bad"] += 1; continue
            tw = re.search(r'width="(\d+)"', it["tags"][hi]); tw = int(tw.group(1)) if tw else 300
            out = os.path.join(OUT, SUBJ[it["zh"]], f"{hashlib.sha1((it['hp'] + str(hi)).encode()).hexdigest()[:16]}.png")
            os.makedirs(os.path.dirname(out), exist_ok=True)
            if p.endswith((".emf", ".wmf")):
                ar = D[di][0] or 1
                W = tw * 2; Hh = max(1, round(W / ar))
                render.append(f"{p}\t{out}\t{W}\t{Hh}")
            else:
                try: Image.open(p).convert("RGB").save(out)
                except Exception: continue
            recovered[f"{it['hp']}|{hi}"] = out
            stat["paired"] += 1
open(os.path.join(WORK, "recover-render.tsv"), "w", encoding="utf-8").write("\n".join(render))
subprocess.run(PS + [os.path.join(ROOT, "scripts/lib/render-metafile.ps1"), "-Jobs", os.path.join(WORK, "recover-render.tsv")], capture_output=True)
recovered = {k: v for k, v in recovered.items() if os.path.exists(v)}
json.dump(recovered, open(os.path.join(WORK, "recovered.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(stat, f"→ 救回 {len(recovered)} 張,data/rerender/recovered.json")
