# 社會/英文/國文的壞圖重畫(這三科的圖是 patch-lo-images.mjs 產生的 /qimg/<科>/h/<雜湊>.webp)
# 對應:data/rerender/webp-origin.json(壞圖 → 來源 lo-html 與第幾張 img,由 LO 圖檔 sha1 反查)
# 流程與 rerender-metafiles.py 相同:原檔 → docx(zip 直接讀,.doc 由 LO 轉)→ 依序取圖 → 與 lo-html img 序列對齊
#   (GDI+ 長寬比 + 構圖相似度)→ GDI+ 放大 3 倍畫 → 縮成現有 webp 的寬高 → 寫到 data/rerender/out/<科>/h/<檔名>
# 只處理 webp-origin.json 裡的圖;不動 web/public。對應表寫入 data/rerender/map-webp.json(可給 apply 用)
# 用法:python scripts/rerender-webp.py [--blips] [--only-miss] [--origin X.json --out Y.json] [--scale-out 2]   (--blips:.doc 改取原始 BLIP;--only-miss:只跑上一輪對不上的,輸出 map-webp2.json)
import json, math, os, re, shutil, struct, subprocess, zipfile, html as htmlmod
from urllib.parse import unquote
import sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts", "lib"))
from doc_blips import extract as doc_blips  # noqa: E402
WORK = os.path.join(ROOT, "data", "rerender")
SOFFICE = r"C:\Program Files\LibreOffice\program\soffice.exe"
PS = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]
SCALE, AR_TOL, MIN_SIM = 3, 0.10, 0.4
DOCX = os.path.join(WORK, "docx-webp"); os.makedirs(DOCX, exist_ok=True)
TMP = os.path.join(WORK, "tmp-webp-blips" if "--blips" in __import__("sys").argv else "tmp-webp"); os.makedirs(TMP, exist_ok=True)

ORIGIN = sys.argv[sys.argv.index("--origin") + 1] if "--origin" in sys.argv else "webp-origin.json"
origin = json.load(open(os.path.join(WORK, ORIGIN), encoding="utf-8"))
USE_BLIPS = "--blips" in sys.argv
OUT_K = float(sys.argv[sys.argv.index("--scale-out") + 1]) if "--scale-out" in sys.argv else 1.0  # 低解析圖:輸出放大倍數  # 改用 .doc 原始圖(OfficeArt BLIP)
if "--only-miss" in sys.argv:  # 只重跑上一輪對不上的
    miss = set(json.load(open(os.path.join(WORK, "miss-webp.json"))))
    origin = {k: v for k, v in origin.items() if k in miss}
by_html = {}
for p, v in origin.items(): by_html.setdefault(v["html"], []).append((v["idx"], p))

def vec(path):
    try: im = Image.open(path).convert("RGBA")
    except Exception: return None
    bg = Image.new("RGBA", im.size, "white"); bg.alpha_composite(im)
    a = np.asarray(bg.convert("RGB")).copy()
    a[(a[..., 0] > 200) & (a[..., 1] < 80) & (a[..., 2] > 200)] = 255  # LO 的洋紅「透明色」當白底
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

def docx_seq(docx_path, tmpdir):
    z = zipfile.ZipFile(docx_path)
    doc = z.read("word/document.xml").decode("utf-8"); relx = z.read("word/_rels/document.xml.rels").decode("utf-8")
    rels = {}
    for r in re.findall(r"<Relationship [^>]*>", relx):
        i = re.search(r'Id="([^"]+)"', r); t = re.search(r'Target="([^"]+)"', r)
        if i and t: rels[i.group(1)] = t.group(1)
    seq = []
    for m in re.finditer(r'(?:r:embed|r:id)="(rId\d+)"', doc):
        t = rels.get(m.group(1), "")
        if not t.startswith("media/"): continue
        name = os.path.basename(t); p = os.path.join(tmpdir, name)
        data = z.read("word/" + t)
        if name.lower().endswith(".wmf"):
            emf = embedded_emf(data)
            if emf: p = os.path.join(tmpdir, os.path.splitext(name)[0] + ".wmfc.emf"); data = emf
        if not os.path.exists(p):
            with open(p, "wb") as f: f.write(data)
        seq.append(p)
    return seq

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
        if sc is not None and abs(dp[i][j] - (dp[i + 1][j + 1] + sc)) < 1e-9: pairs[i] = (j, sc); i += 1; j += 1
        elif dp[i + 1][j] >= dp[i][j + 1]: i += 1
        else: j += 1
    return pairs

# 1. 原檔 → docx
jobs = []
for rel in by_html:
    stem = os.path.splitext(rel)[0]
    src = os.path.join(ROOT, stem + ".doc")
    if not os.path.exists(src): src = os.path.join(ROOT, stem + ".docx")
    key = re.sub(r"[^0-9a-zA-Z]", "", __import__("hashlib").md5(rel.encode("utf-8")).hexdigest())[:10]
    jobs.append(dict(rel=rel, src=src, key=key))
stage = os.path.join(WORK, "stage-webp"); shutil.rmtree(stage, ignore_errors=True); os.makedirs(stage)
for j in jobs:
    if zipfile.is_zipfile(j["src"]) and "word/document.xml" in zipfile.ZipFile(j["src"]).namelist():
        j["docx"] = j["src"]; continue
    j["docx"] = os.path.join(DOCX, j["key"] + ".docx")
    if not os.path.exists(j["docx"]): shutil.copy(j["src"], os.path.join(stage, j["key"] + ".doc"))
todo = sorted(os.listdir(stage))
for i in range(0, len(todo), 40):
    subprocess.run([SOFFICE, "--headless", "--convert-to", "docx", "--outdir", DOCX, *[os.path.join(stage, b) for b in todo[i:i + 40]]],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=1800)
shutil.rmtree(stage, ignore_errors=True)
print(f"{len(jobs)} 份原檔,新轉 docx {len(todo)} 份", flush=True)

# 2. 取圖 + GDI+ 尺寸 + 縮圖
for j in jobs:
    j["tdir"] = os.path.join(TMP, j["key"]); os.makedirs(j["tdir"], exist_ok=True)
    try:
        if USE_BLIPS and not zipfile.is_zipfile(j["src"]):
            # 直接從 .doc 取原圖(LO 轉 docx 時會把部分 WMF/EMF 改成 PNG,就對不上了)
            j["seq"] = []
            for k, (_, _, ext, data) in enumerate(doc_blips(j["src"])):
                if ext == "wmf":
                    emf = embedded_emf(data)
                    if emf: ext, data = "emf", emf
                bp = os.path.join(j["tdir"], f"blip{k:03d}.{ext}")
                if not os.path.exists(bp): open(bp, "wb").write(data)
                j["seq"].append(bp)
        else:
            j["seq"] = docx_seq(j["docx"], j["tdir"]) if os.path.exists(j["docx"]) else []
    except Exception as e:
        print("  ⚠️ 讀不了", j["rel"], e); j["seq"] = []
metas = sorted({p for j in jobs for p in j["seq"] if p.lower().endswith((".wmf", ".emf"))})
lst = os.path.join(WORK, "meta-list-webp.txt"); open(lst, "w", encoding="utf-8").write("\n".join(metas))
r = subprocess.run(PS + [os.path.join(ROOT, "scripts/lib/metafile-size.ps1"), "-List", lst], capture_output=True, text=True, encoding="utf-8", errors="replace")
wh = {}
for line in r.stdout.splitlines():
    i, w, h = line.split("\t"); wh[metas[int(i)]] = (float(w or 0), float(h or 0))
tj = []
for p, (w, h) in wh.items():
    if w and h: k = 160 / max(w, h); tj.append(f"{p}\t{p}.thumb.png\t{max(1, round(w * k))}\t{max(1, round(h * k))}")
open(os.path.join(WORK, "thumb-webp.tsv"), "w", encoding="utf-8").write("\n".join(tj))
subprocess.run(PS + [os.path.join(ROOT, "scripts/lib/render-metafile.ps1"), "-Jobs", os.path.join(WORK, "thumb-webp.tsv")], capture_output=True)

# 3. 對齊、排畫圖工作
render, mapping, miss = [], [], []
for j in jobs:
    hp = os.path.join(ROOT, "data", "lo-html", j["rel"])
    srcs = re.findall(r'<img[^>]*src="([^"]+)"', open(hp, encoding="utf-8", errors="replace").read(), flags=re.I)
    paths = [os.path.join(os.path.dirname(hp), unquote(htmlmod.unescape(s)).replace("/", os.sep)) for s in srcs]
    H = [(ar_of(p), vec(p)) if os.path.exists(p) else (None, None) for p in paths]
    D = [((wh[p][0] / wh[p][1]) if wh.get(p, (0, 0))[1] else None, vec(p + ".thumb.png")) if p in wh else (ar_of(p), vec(p)) for p in j["seq"]]
    pairs = align(H, D)
    # 第二輪:舊圖字壞太嚴重、構圖相似度過不了門檻時,若前後兩個已對上的錨點之間
    # 只有一張「沒配對、長寬比差 3% 內」的向量圖,就配它(sim 記 -1,必須人工目視確認)
    used = {d for d, _ in pairs.values()}
    for idx, _ in by_html[j["rel"]]:
        if idx in pairs or H[idx][0] is None: continue
        lo = max([(i, d) for i, (d, _) in pairs.items() if i < idx], default=(-1, -1))[1]
        hi = min([(i, d) for i, (d, _) in pairs.items() if i > idx], default=(len(H), len(D)))[1]
        cand = [k for k in range(lo + 1, hi) if k not in used and j["seq"][k].lower().endswith((".wmf", ".emf"))
                and D[k][0] and abs(math.log(H[idx][0] / D[k][0])) <= 0.03]
        if len(cand) == 1:
            pairs[idx] = (cand[0], -1.0); used.add(cand[0])
    for idx, webp in by_html[j["rel"]]:
        if idx not in pairs or not j["seq"][pairs[idx][0]].lower().endswith((".wmf", ".emf")):
            miss.append(webp); continue
        cur = os.path.join(ROOT, "web/public", webp.lstrip("/"))
        w, h = Image.open(cur).size
        w, h = round(w * OUT_K), round(h * OUT_K)
        big = os.path.join(j["tdir"], f"{idx:03d}.big.png")
        render.append(f"{j['seq'][pairs[idx][0]]}\t{big}\t{w * SCALE}\t{h * SCALE}")
        mapping.append(dict(p=webp, big=big, w=w, h=h, sim=round(pairs[idx][1], 3), src=os.path.relpath(j["seq"][pairs[idx][0]], WORK)))
open(os.path.join(WORK, "render-webp.tsv"), "w", encoding="utf-8").write("\n".join(render))
subprocess.run(PS + [os.path.join(ROOT, "scripts/lib/render-metafile.ps1"), "-Jobs", os.path.join(WORK, "render-webp.tsv")], capture_output=True)
done = []
for m in mapping:
    if not os.path.exists(m["big"]): miss.append(m["p"]); continue
    out = os.path.join(WORK, "out", m["p"].split("/qimg/")[1])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im = Image.open(m["big"]).convert("RGB").resize((m["w"], m["h"]), Image.LANCZOS)
    ext = os.path.splitext(out)[1].lower()
    if ext == ".gif": im.convert("P", palette=Image.ADAPTIVE, colors=256).save(out)
    elif ext in (".jpg", ".jpeg"): im.save(out, quality=92)
    elif ext == ".png": im.save(out)
    else: im.save(out, "WEBP", quality=90)
    done.append({k: m[k] for k in ("p", "src", "w", "h", "sim")})
OUTMAP = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else ("map-webp2.json" if "--only-miss" in sys.argv else "map-webp.json")
json.dump(done, open(os.path.join(WORK, OUTMAP), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
json.dump(miss, open(os.path.join(WORK, "miss-webp2.json" if "--only-miss" in sys.argv else "miss-webp.json"), "w", encoding="utf-8"), indent=0)
print(f"✅ 重畫 {len(done)} 張,對不上/非向量圖 {len(miss)} 張 → data/rerender/map-webp.json、miss-webp.json")
