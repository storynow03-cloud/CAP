# 用 Windows GDI+ 重畫 LibreOffice 畫壞的題目向量圖(數學/自然)
#
# 背景:原始 Word 檔裡的 WMF/EMF 本身正常,是 LibreOffice 把它們轉成 GIF 時字型與細線壞掉
#   (A→Λ、B→Z、負號消失)。GDI+ 重畫同一張圖就正確。
# 對應:LO 把 .doc 轉 .docx → document.xml 依序取圖 → 與 lo-html 的 <img> 順序做序列對齊
#   (長寬比相近才算同一張;lo-html 偶爾多一張頁首小圖,對齊會自動跳過)。
# 輸出:data/rerender/out/<subject>/<slug>/<NNN>.<原副檔名>,與 web/public/qimg 同檔名、同像素大小
#   (前端依原始像素顯示,DB 不用改)。先放大 SCALE 倍畫再縮小,避免細負號消失。
#   對應表 data/rerender/map.json。這支腳本不會動 web/public/qimg。
#
# 用法:python scripts/rerender-metafiles.py [--only <html 相對路徑關鍵字>] [--limit N] [--skip-convert]
import argparse, hashlib, html as htmlmod, json, math, os, re, shutil, struct, subprocess, sys, zipfile
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LO_HTML = os.path.join(ROOT, "data", "lo-html")
QIMG = os.path.join(ROOT, "web", "public", "qimg")
WORK = os.path.join(ROOT, "data", "rerender")
SOFFICE = r"C:\Program Files\LibreOffice\program\soffice.exe"
SUBJECTS = {"數學": "math", "自然": "science"}
SCALE = 3
AR_TOL = 0.10  # |log(長寬比比值)| 容許值
MIN_SIM = 0.4  # 構圖相似度下限(已確認正確、但舊圖字壞很嚴重的配對最低約 0.55;配錯的多半 < 0.3)

ap = argparse.ArgumentParser()
ap.add_argument("--only", default="")
ap.add_argument("--limit", type=int, default=0)
ap.add_argument("--skip-convert", action="store_true")
ap.add_argument("--pairs-only", action="store_true", help="只輸出 data/rerender/pic-pairs.json,不重畫")
args = ap.parse_args()

os.makedirs(WORK, exist_ok=True)
DOCX = os.path.join(WORK, "docx"); os.makedirs(DOCX, exist_ok=True)
TMP = os.path.join(WORK, "tmp"); os.makedirs(TMP, exist_ok=True)
OUT = os.path.join(WORK, "out")

# ---- 1. 列出要處理的檔案 ----
jobs = []
for zh, key in SUBJECTS.items():
    base = os.path.join(LO_HTML, zh)
    for dp, _, fs in os.walk(base):
        for f in fs:
            if not f.lower().endswith(".html"): continue
            full = os.path.join(dp, f)
            rel = os.path.relpath(full, base)  # Windows 下是反斜線,與 parse-questions-lo.mjs 的 path.relative 一致
            if args.only and args.only not in rel: continue
            slug = hashlib.md5(rel.encode("utf-8")).hexdigest()[:10]
            src = os.path.join(ROOT, zh, os.path.splitext(rel)[0] + ".doc")
            if not os.path.exists(src):
                src = os.path.join(ROOT, zh, os.path.splitext(rel)[0] + ".docx")
            if not os.path.exists(os.path.join(QIMG, key, slug)): continue
            jobs.append(dict(subject=key, rel=rel, slug=slug, html=full, src=src))
jobs.sort(key=lambda j: (j["subject"], j["rel"]))
if args.limit: jobs = jobs[: args.limit]
print(f"要處理 {len(jobs)} 個檔案", flush=True)

# ---- 2. 原始檔轉 docx(LO 只負責換容器,圖檔原樣保留)----
if not args.skip_convert:
    todo = [j for j in jobs if os.path.exists(j["src"]) and not os.path.exists(os.path.join(DOCX, j["slug"] + ".docx"))]
    stage = os.path.join(WORK, "stage"); shutil.rmtree(stage, ignore_errors=True); os.makedirs(stage)
    for j in todo:
        if j["src"].lower().endswith(".docx"):
            shutil.copy(j["src"], os.path.join(DOCX, j["slug"] + ".docx"))
        else:
            shutil.copy(j["src"], os.path.join(stage, j["slug"] + ".doc"))
    batch = sorted(os.listdir(stage))
    for i in range(0, len(batch), 40):
        part = [os.path.join(stage, b) for b in batch[i:i + 40]]
        subprocess.run([SOFFICE, "--headless", "--convert-to", "docx", "--outdir", DOCX, *part],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=1800)
        print(f"  docx {min(i + 40, len(batch))}/{len(batch)}", flush=True)
    shutil.rmtree(stage, ignore_errors=True)

# ---- 3. 對齊 ----
def ar_of(path):
    try:
        with Image.open(path) as im:
            return im.width / im.height if im.height else None
    except Exception:
        return None

def docx_seq(docx_path, tmpdir):
    z = zipfile.ZipFile(docx_path)
    doc = z.read("word/document.xml").decode("utf-8")
    relx = z.read("word/_rels/document.xml.rels").decode("utf-8")
    rels = {}
    for r in re.findall(r"<Relationship [^>]*>", relx):
        i = re.search(r'Id="([^"]+)"', r); t = re.search(r'Target="([^"]+)"', r)
        if i and t: rels[i.group(1)] = t.group(1)
    seq = []
    for m in re.finditer(r'(?:r:embed|r:id)="(rId\d+)"', doc):
        t = rels.get(m.group(1), "")
        if not t.startswith("media/"): continue
        name = os.path.basename(t)
        p = os.path.join(tmpdir, name)
        if not os.path.exists(p):
            data = z.read("word/" + t)
            emf = embedded_emf(data) if name.lower().endswith(".wmf") else None
            if emf:  # Word 的 WMF 夾帶完整 EMF:改畫 EMF(WMF 本體是簡化版,虛線會變實線)
                p = os.path.join(tmpdir, os.path.splitext(name)[0] + ".wmfc.emf"); data = emf
            with open(p, "wb") as f: f.write(data)
        elif name.lower().endswith(".wmf") and os.path.exists(os.path.join(tmpdir, os.path.splitext(name)[0] + ".wmfc.emf")):
            p = os.path.join(tmpdir, os.path.splitext(name)[0] + ".wmfc.emf")
        seq.append(p)
    return seq

def embedded_emf(wmf):
    """取出 WMF 裡 META_ESCAPE(MFCOMMENT) 的 WMFC 區塊(Word/Office 存 WMF 時夾帶的原始 EMF)。沒有就回傳 None。"""
    off = 22 if wmf[:4] == b"\xd7\xcd\xc6\x9a" else 0
    if len(wmf) < off + 18: return None
    p = off + struct.unpack_from("<H", wmf, off + 2)[0] * 2
    chunks, total = [], None
    while p + 6 <= len(wmf):
        size, fn = struct.unpack_from("<IH", wmf, p)
        if size == 0: break
        if fn == 0x0626 and struct.unpack_from("<H", wmf, p + 6)[0] == 15 and wmf[p + 10:p + 14] == b"WMFC":
            # WMFC:Identifier(4) CommentType(4) Version(4) Checksum(2) Flags(4) RecordCount(4)
            #       CurrentRecordSize(4) RemainingBytes(4) EnhancedMetafileDataSize(4) 然後資料
            b = p + 10
            cur = struct.unpack_from("<I", wmf, b + 22)[0]
            total = struct.unpack_from("<I", wmf, b + 30)[0]
            chunks.append(wmf[b + 34:b + 34 + cur])
        p += size * 2
    data = b"".join(chunks)
    if total and len(data) == total and data[40:44] == b" EMF": return data
    return None

def vec(path):
    """縮成 48×48 灰階、模糊後的單位向量,用來比「構圖」(字壞掉不太影響)。"""
    try:
        im = Image.open(path).convert("RGBA")
    except Exception:
        return None
    bg = Image.new("RGBA", im.size, "white"); bg.alpha_composite(im)
    im = bg.convert("L").resize((48, 48), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.5))
    v = 255 - np.asarray(im, dtype=np.float32).ravel()
    v -= v.mean(); n = np.linalg.norm(v)
    return v / n if n else None

def align(H, D):
    """H、D 是 (長寬比, 構圖向量) 清單;動態規劃求「相似度總和最大」且順序不交錯的配對 [(hi, di, sim)]。
    長寬比差太多或構圖相似度 < MIN_SIM 的不配(LO 自己產生的公式圖在 docx 裡沒有對應圖,要能跳過)。"""
    n, m = len(H), len(D)
    def score(a, b):
        (ra, va), (rb, vb) = a, b
        if not (ra and rb and va is not None and vb is not None): return None
        if abs(math.log(ra / rb)) > AR_TOL: return None
        sim = float(va @ vb)
        return sim if sim >= MIN_SIM else None
    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            best = max(dp[i + 1][j], dp[i][j + 1])
            sc = score(H[i], D[j])
            if sc is not None: best = max(best, dp[i + 1][j + 1] + sc)
            dp[i][j] = best
    pairs, i, j = [], 0, 0
    while i < n and j < m:
        sc = score(H[i], D[j])
        if sc is not None and abs(dp[i][j] - (dp[i + 1][j + 1] + sc)) < 1e-9:
            pairs.append((i, j, sc)); i += 1; j += 1
        elif dp[i + 1][j] >= dp[i][j + 1]: i += 1
        else: j += 1
    return pairs

unmatched = []
pic_pairs = {}
render_jobs, mapping, stats = [], [], dict(files=0, nodocx=0, html_imgs=0, meta_pairs=0, unmatched_meta_gif=0)
# 先取出所有原始圖,向量圖的長寬比一次用 GDI+ 讀(PIL 讀 EMF 的邊界和 LO/GDI+ 不同)
for j in jobs:
    # 原檔若本身就是 docx(數學的 .doc 其實是 zip),直接讀原檔:LO 轉出的 docx 會重新產生向量圖
    dx = j["src"] if zipfile.is_zipfile(j["src"]) else os.path.join(DOCX, j["slug"] + ".docx")
    j["tdir"] = os.path.join(TMP, j["slug"]); os.makedirs(j["tdir"], exist_ok=True)
    try:
        j["seq"] = docx_seq(dx, j["tdir"]) if os.path.exists(dx) else None
    except Exception as e:
        print("  ⚠️ docx 讀不了", j["rel"], e); j["seq"] = None
metas = sorted({p for j in jobs for p in (j["seq"] or []) if p.lower().endswith((".wmf", ".emf"))})
list_txt = os.path.join(WORK, "meta-list.txt")
with open(list_txt, "w", encoding="utf-8") as f: f.write("\n".join(metas))
r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                    os.path.join(ROOT, "scripts", "lib", "metafile-size.ps1"), "-List", list_txt],
                   capture_output=True, text=True, encoding="utf-8", errors="replace")
meta_ar, meta_wh = {}, {}
for line in r.stdout.splitlines():
    i, w, h = line.split("\t")
    w, h = float(w or 0), float(h or 0)
    meta_ar[metas[int(i)]] = w / h if h else None
    meta_wh[metas[int(i)]] = (w, h)

# 每張向量圖畫一張小縮圖(長邊 160px)給構圖比對用
thumb_jobs = []
for p, (w, h) in meta_wh.items():
    if not (w and h): continue
    k = 160 / max(w, h)
    thumb_jobs.append(f"{p}\t{p}.thumb.png\t{max(1, round(w * k))}\t{max(1, round(h * k))}")
with open(os.path.join(WORK, "thumb-jobs.tsv"), "w", encoding="utf-8") as f: f.write("\n".join(thumb_jobs))
subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                os.path.join(ROOT, "scripts", "lib", "render-metafile.ps1"), "-Jobs", os.path.join(WORK, "thumb-jobs.tsv")],
               capture_output=True, text=True, encoding="utf-8", errors="replace")
print(f"縮圖 {len(thumb_jobs)} 張", flush=True)

for j in jobs:
    stats["files"] += 1
    seq = j["seq"]
    if seq is None: stats["nodocx"] += 1; continue
    srcs = re.findall(r'<img[^>]*src="([^"]+)"', open(j["html"], encoding="utf-8", errors="replace").read(), flags=re.I)
    qdir = os.path.join(QIMG, j["subject"], j["slug"])
    qfiles = {int(os.path.splitext(f)[0]): f for f in os.listdir(qdir) if re.match(r"^\d{3}\.", f)}
    H = [(ar_of(os.path.join(qdir, qfiles[i])), vec(os.path.join(qdir, qfiles[i]))) if i in qfiles else (None, None)
         for i in range(len(srcs))]
    tdir = j["tdir"]
    D = [(meta_ar.get(p), vec(p + ".thumb.png")) if p in meta_ar else (ar_of(p), vec(p)) for p in seq]
    stats["html_imgs"] += len(srcs)
    aligned = align(H, D)
    pic_pairs[j["slug"]] = {di: hi for hi, di, _ in aligned}  # docx 圖序號 → lo-html img 序號(rebuild-math-hidden 用)
    pairs = {hi: di for hi, di, _ in aligned}
    sims = {hi: sc for hi, _, sc in aligned}
    for hi in range(len(srcs)):
        if hi not in qfiles: continue
        q = qfiles[hi]
        if hi not in pairs:
            if q.endswith(".gif"):
                stats["unmatched_meta_gif"] += 1
                unmatched.append(f"/qimg/{j['subject']}/{j['slug']}/{q}")
            continue
        src = seq[pairs[hi]]
        if not src.lower().endswith((".wmf", ".emf")): continue
        with Image.open(os.path.join(qdir, q)) as im: w, h = im.size
        out_dir = os.path.join(OUT, j["subject"], j["slug"]); os.makedirs(out_dir, exist_ok=True)
        big = os.path.join(tdir, f"{hi:03d}.big.png")
        render_jobs.append(f"{src}\t{big}\t{w * SCALE}\t{h * SCALE}")
        mapping.append(dict(p=f"/qimg/{j['subject']}/{j['slug']}/{q}", src=os.path.relpath(src, WORK), big=big,
                            out=os.path.join(out_dir, q), w=w, h=h, sim=round(sims[hi], 3)))
        stats["meta_pairs"] += 1
print(stats, flush=True)
with open(os.path.join(WORK, "pic-pairs.json"), "w", encoding="utf-8") as f: json.dump(pic_pairs, f)
if args.pairs_only: sys.exit(0)
with open(os.path.join(WORK, "unmatched.json"), "w", encoding="utf-8") as f: json.dump(unmatched, f, indent=0)

# ---- 4. GDI+ 放大畫 → 縮回原尺寸 ----
jobs_tsv = os.path.join(WORK, "render-jobs.tsv")
with open(jobs_tsv, "w", encoding="utf-8") as f: f.write("\n".join(render_jobs))
ps1 = os.path.join(ROOT, "scripts", "lib", "render-metafile.ps1")
r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Jobs", jobs_tsv],
                   capture_output=True, text=True, encoding="utf-8", errors="replace")
fails = [l for l in r.stdout.splitlines() if l.startswith("fail")]
print(f"GDI+ 畫圖 {len(render_jobs)} 張,失敗 {len(fails)}", flush=True)
for l in fails[:10]: print("  ", l)

done = []
for m in mapping:
    if not os.path.exists(m["big"]): continue
    im = Image.open(m["big"]).convert("RGB").resize((m["w"], m["h"]), Image.LANCZOS)
    ext = os.path.splitext(m["out"])[1].lower()
    if ext == ".gif": im.convert("P", palette=Image.ADAPTIVE, colors=256).save(m["out"])
    elif ext in (".jpg", ".jpeg"): im.save(m["out"], quality=92)
    else: im.save(m["out"])
    done.append({k: m[k] for k in ("p", "src", "w", "h", "sim")})
with open(os.path.join(WORK, "map.json"), "w", encoding="utf-8") as f: json.dump(done, f, ensure_ascii=False, indent=0)
print(f"✅ 輸出 {len(done)} 張到 data/rerender/out,對應表 data/rerender/map.json")
