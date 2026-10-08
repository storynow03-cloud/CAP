# 全面稽核:可見數學/自然題的 Word 公式是否遺失(2026-10-07)
# 背景:LibreOffice 轉檔會漏掉 Word 方程式(EQ 功能變數、OMML、OLE Equation),之前的還原腳本要求逐字對齊,對不上就跳過
#       → 有些題目的分數/線段/根號整段不見(常見在「答案」欄,例:答 (1) (2) 裡的分數全空)。
# 做法:原檔 docx(數學本身是 docx;自然先跑 scripts/word-to-docx.ps1)依「題號：」切題,
#       逐 run 取文字;EQ 變數取代碼裡的內容字元、OMML 取 m:t → 每個字元記錄是否來自公式。
#       資料庫該題(題組小題合併)各欄去標籤 → 兩邊只留「有意義字元」(英數、中文、運算符)做 difflib 比對,
#       統計原檔「公式字元」在資料庫對不到的數量。另外檢查分數:原檔 \f / m:f 在資料庫對應位置要有 .frac 或 /。
# 輸入:data/rerender/formula-audit/db.json(node 匯出);輸出 data/rerender/formula-audit/audit.json
# 用法:python scripts/audit-formula-loss.py [math|science|all]
import difflib, glob, html, json, os, re, sys, zipfile, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "rerender", "formula-audit")
SUBJ = sys.argv[1] if len(sys.argv) > 1 else "all"

KEEP = re.compile(r"[0-9A-Za-z\u4e00-\u9fff+\-×÷=<>≥≤≠√°%∠△⊥∥πθ≅]")
TRANS = str.maketrans({"－": "-", "−": "-", "＋": "+", "＝": "=", "＜": "<", "＞": ">", "≧": "≥", "≦": "≤", "％": "%",
                       **{chr(0xFF10 + i): str(i) for i in range(10)},
                       **{chr(0xFF21 + i): chr(0x41 + i) for i in range(26)}, **{chr(0xFF41 + i): chr(0x61 + i) for i in range(26)}})

def norm_chars(s, tag):
    """回傳 [(字元, 標記)],只留有意義字元"""
    s = s.translate(TRANS)
    return [(c, tag) for c in s if KEEP.match(c)]

RUN = re.compile(r"<w:r(?:\s[^>]*)?>(?:(?!</w:r>).)*?</w:r>|<m:oMath>.*?</m:oMath>", re.S)
FLD = re.compile(r'<w:fldChar w:fldCharType="(begin|separate|end)"')
WT = re.compile(r"<w:t(?:\s[^>]*)?>([^<]*)</w:t>")
INSTR = re.compile(r"<w:instrText(?:\s[^>]*)?>([^<]*)</w:instrText>")
MT = re.compile(r"<m:t(?:\s[^>]*)?>([^<]*)</m:t>")
IS_EQ = re.compile(r"^\s*\\?eq\b", re.I)  # 代碼可能寫成「EQ …」或「\eq …」
SWITCH = re.compile(r"\\[a-zA-Z]+-?\d*")
VALIGN = re.compile(r'<w:vertAlign w:val="(superscript|subscript)"')
TEXT_TAGS = ("t", "ts", "tb")  # 一般文字、上標格式、下標格式(不是公式)

def run_text(r):
    """一般 run → [(字元, 't'|'ts'|'tb')];OLE 方程式物件 → [('◇', 'ole')]"""
    if re.search(r'ProgID="Equation', r): return [("\u25c7", "ole")]
    v = VALIGN.search(r)
    tag = "t" if not v else ("ts" if v.group(1) == "superscript" else "tb")
    return [(c, tag) for c in html.unescape("".join(WT.findall(r)))]

def eq_content(code):
    """EQ 代碼 → 內容字元(去掉開關與跳脫)"""
    if re.match(r"^\s*\\?eq\s*\\o(\\ac)?\(\s*[＝=]\s*,\s*[～~]\s*\)\s*$", code, re.I): return "≅"  # 全等符號
    code = re.sub(r"^\s*\\?EQ\s*", "", code, flags=re.I)
    code = SWITCH.sub("", code)
    return code.replace("\\", "")

def parse_doc(path):
    """回傳 {題號: [(字元, 標記)]},標記:'t' 一般、'eq' EQ 公式、'eqf' EQ 分數、'om' OMML、'omf' OMML 分數"""
    x = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    stream = []  # (字元, 標記)
    stack = []
    for m in RUN.finditer(x):
        r = m.group(0)
        if r.startswith("<m:oMath>"):
            if stack: continue
            tag = "omf" if "<m:f>" in r or "<m:f " in r else "om"
            stream += [(c, tag) for c in html.unescape("".join(MT.findall(r)))]
            continue
        fm = FLD.search(r)
        if fm:
            k = fm.group(1)
            if k == "begin": stack.append({"code": "", "res": False})
            elif k == "separate" and stack: stack[-1]["res"] = True
            elif k == "end" and stack:
                f = stack.pop()
                code = html.unescape(f["code"])
                if IS_EQ.match(code):
                    if stack and not stack[-1]["res"]:  # 巢狀 EQ:併進父代碼
                        stack[-1]["code"] += " " + re.sub(r"^\s*\\?EQ\s*", "", code, flags=re.I)
                    else:
                        tag = "eqf" if re.search(r"\\f\s*\(", code, re.I) else "eq"
                        if not re.match(r"^\s*\\?eq\\", code, re.I):  # 「\eq\f(」沒空白:Word 不畫(隱形重複)
                            stream += [(c, tag) for c in eq_content(code)]
            continue
        if stack:
            top = stack[-1]
            if not top["res"]:
                top["code"] += "".join(INSTR.findall(r))
            elif not IS_EQ.match(top["code"]):
                if len(stack) == 1: stream += run_text(r)
            continue
        stream += run_text(r)
    text = "".join(c for c, _ in stream)
    out = {}
    marks = [mm.start() for mm in re.finditer(r"題號：", text)]
    for i, st in enumerate(marks):
        en = marks[i + 1] if i + 1 < len(marks) else len(stream)
        num = text[st + 3: st + 10]
        seg = stream[st + 10: en]
        # 去掉下一題的題號前綴(「12.」)不影響;但要去掉本題標頭「難易度…知識點：XXXXX」
        segtext = "".join(c for c, _ in seg)
        k = segtext.find("知識點：")
        if 0 <= k < 80:
            j = k + 4
            while j < len(seg) and re.match(r"[A-Z0-9]", seg[j][0]): j += 1
            seg = seg[j:]
        out.setdefault(num, seg)  # 同檔同題號只取第一個
    return out

def doc_path(q):
    folder, name = (q["source"] or "").split("/")[:2] if q.get("source") and "/" in q["source"] else (None, None)
    if not folder: return None
    if q["subject"] == "math":
        p = os.path.join(ROOT, "數學", folder, q["volume"] or "", name + ".doc")
    else:
        # 會考原檔在「國中教育會考/自然科學/」,資料庫沒有冊別
        p = os.path.join(ROOT, "data", "word-docx", "自然", folder, q["volume"] or ("自然科學" if folder == "國中教育會考" else ""), name + ".docx")
    return p if os.path.exists(p) else None

def clean(h):
    """去標籤 → [(字元, 格式)],格式 ''|'sup'|'sub';.frac 開頭標成 ⟦(不在 KEEP 內,另外處理)"""
    h = re.sub(r'<span class="frac">', "⟦", h)
    h = h.replace("<sup>", "\x01").replace("</sup>", "\x02").replace("<sub>", "\x03").replace("</sub>", "\x04")
    h = html.unescape(re.sub(r"<[^>]+>", "", h))
    out, fmt = [], ""
    for c in h:
        if c == "\x01": fmt = "sup"
        elif c == "\x03": fmt = "sub"
        elif c in "\x02\x04": fmt = ""
        else: out.append((c, fmt))
    return out

def db_fields(q):
    """[(欄位名, 去標籤文字)],欄位名:passage/question/options/answer_text/explanation"""
    out = [(k, clean(q[k])) for k in ("passage", "question") if q.get(k)]
    out += [("options", clean(o)) for o in (q.get("options") or [])]
    out += [(k, clean(q[k])) for k in ("answer_text", "explanation") if q.get(k)]
    return out

# --db <檔名>:改讀別的匯出檔(例如套用修正計畫後的 db-patched.json)
DBF = sys.argv[sys.argv.index("--db") + 1] if "--db" in sys.argv else "db.json"
rows = json.load(open(os.path.join(OUT, DBF), encoding="utf-8"))
# --ids <檔>:只跑指定題號(含隱藏題,用來以人工確認過的好/壞題校正偵測器)
ONLY = set(json.load(open(sys.argv[sys.argv.index("--ids") + 1], encoding="utf-8"))) if "--ids" in sys.argv else None
rows = [r for r in rows if (r["id"] in ONLY if ONLY else not r["needs_review"]) and (SUBJ == "all" or r["subject"] == SUBJ)]
groups = collections.OrderedDict()
for q in rows:
    m = re.match(r"(math|science)-(\d{7})", q["id"])
    if not m: continue
    groups.setdefault((doc_path(q), m.group(2)), []).append(q)

doc_cache, results, stat = {}, [], collections.Counter()
extras = {}
for (path, num), qs in groups.items():
    if not path: stat["找不到原檔"] += len(qs); continue
    if path not in doc_cache:
        try: doc_cache[path] = parse_doc(path)
        except Exception as e: doc_cache[path] = {}; print("ERR", path, e)
    seg = doc_cache[path].get(num)
    if seg is None: stat["原檔找不到題號"] += len(qs); continue
    # 資料庫沒有的欄位(詳解/答案被清空或本來就沒有),原檔對應段落不比對,否則整段公式都會被當成「遺失」
    segtext = "".join(c for c, _ in seg)
    a_at, d_at = segtext.find("《答案》"), segtext.find("詳解：")
    if d_at != -1 and not any(q.get("explanation") for q in qs):
        seg = seg[:d_at]
    # 選擇題答案是選項字母(存在 answer 欄),原檔《答案》段不比對;非選題沒有 answer_text = 答案整段遺失,要比對
    if a_at != -1 and not any(q.get("answer_text") for q in qs) and all(q.get("type") == "single_choice" for q in qs):
        seg = seg[:a_at] + (seg[d_at:] if d_at > a_at and any(q.get("explanation") for q in qs) else [])
    n_ole = sum(1 for _, t in seg if t == "ole")
    w = [(c, t) for c0, t in seg for c, _ in norm_chars(c0, t)]
    d = [(c2, f, fmt) for q in qs for f, t in db_fields(q) for c, fmt in t for c2 in c.translate(TRANS) if KEEP.match(c2) or c2 == "\u27e6"]
    d_field = [f for c, f, _ in d if c != "\u27e6"]
    d_fmt = [fmt for c, _, fmt in d if c != "\u27e6"]
    d = [c for c, _, _ in d]
    d_chars = [c for c in d if c != "\u27e6"]
    # d 中 ⟦ 的位置對應到 d_chars 索引
    frac_at, k = set(), 0
    for c in d:
        if c == "\u27e6": frac_at.add(k)
        else: k += 1
    n_eq = sum(1 for _, t in w if t not in TEXT_TAGS)
    n_fmt = sum(1 for _, t in w if t in ("ts", "tb"))
    if n_eq == 0 and n_fmt == 0 and n_ole == 0: stat["無公式"] += len(qs); continue
    sm = difflib.SequenceMatcher(None, [c for c, _ in w], d_chars, autojunk=False)
    matched = [None] * len(w)
    for a, b, size in sm.get_matching_blocks():
        for i in range(size): matched[a + i] = b + i
    miss = [i for i, (c, t) in enumerate(w) if t not in TEXT_TAGS and matched[i] is None]
    # 資料庫多出來(原檔沒有)的字數:補公式後若變多,代表插錯位置或重複插入
    hit_d = set(x for x in matched if x is not None)  # √ 是 eqToHtml 畫根號加上的,原檔 EQ 代碼裡沒有 → 不算
    extras[",".join(q["id"] for q in qs)] = sum(1 for k, c in enumerate(d_chars) if k not in hit_d and c != "√")
    # 上下標格式:原檔是上標/下標的字,資料庫對應字元也要在 <sup>/<sub> 裡(只看英數與正負號)
    fmt_lost = [i for i, (c, t) in enumerate(w) if t in ("ts", "tb") and matched[i] is not None and re.match(r"[0-9A-Za-z+\-]", c)
                and d_fmt[matched[i]] != ("sup" if t == "ts" else "sub")]
    # 分數:每段連續 eqf/omf 字元,對應到資料庫位置附近(前後 2 字)要有 ⟦ 或 /
    flat = 0; i = 0
    while i < len(w):
        if w[i][1] in ("eqf", "omf"):
            j = i
            while j < len(w) and w[j][1] == w[i][1]: j += 1
            pos = [matched[x] for x in range(i, j) if matched[x] is not None]
            if pos and (j - i) >= 2:
                lo, hi = min(pos), max(pos)
                near = any(p in frac_at for p in range(lo - 2, hi + 2)) or "/" in "".join(d_chars[max(0, lo - 3): hi + 3]) or "÷" in "".join(d_chars[max(0, lo - 3): hi + 3])
                if not near: flat += 1
            i = j
        else: i += 1
    stat["有公式"] += len(qs)
    if miss or flat or fmt_lost or n_ole:
        missed_text = "".join(w[i][0] for i in miss)
        # 缺字落在資料庫哪個欄位:取前一個對到的字元所在欄位(題首則取後一個)
        def field_of(i):
            for k in range(i - 1, -1, -1):
                if matched[k] is not None: return d_field[matched[k]]
            for k in range(i + 1, len(w)):
                if matched[k] is not None: return d_field[matched[k]]
            return "?"
        miss_fields = collections.Counter(field_of(i) for i in miss)
        results.append({"ids": [q["id"] for q in qs], "file": os.path.relpath(path, ROOT), "num": num,
                        "eq_chars": n_eq, "missing": len(miss), "missing_text": missed_text[:200], "fields": dict(miss_fields), "flat_fracs": flat, "ole": n_ole, "fmt_lost": len(fmt_lost),
                        "fmt_lost_text": "".join(w[i][0] for i in fmt_lost)[:80],
                        "ratio": round(len(miss) / max(n_eq, 1), 3)})
results.sort(key=lambda r: (-r["missing"], -r["flat_fracs"]))
json.dump(extras, open(os.path.join(OUT, f"extras-{SUBJ}-{os.path.splitext(DBF)[0]}.json"), "w", encoding="utf-8"))
json.dump(results, open(os.path.join(OUT, f"audit-{SUBJ}{'-cal' if ONLY else ''}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(dict(stat), "可疑", len(results), "題組;缺字>0:", sum(1 for r in results if r["missing"]), "分數變平:", sum(1 for r in results if r["flat_fracs"]),
      "上下標掉:", sum(1 for r in results if r["fmt_lost"]), "OLE 方程式:", sum(1 for r in results if r["ole"]))
