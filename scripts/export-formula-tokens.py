# 原檔 docx → 每題的 token 序列(2026-10-07,給 repair-formula-gaps.mjs 用)
# 取代 data/eq-text(Word 純文字匯出)的缺點:
#   ① Symbol 字型符號在純文字裡變成 "(",EQ 代碼括號不成對(\o\ac(　,() )→ 這裡讀 <w:sym> 依 symbol-chars 對照表換成正確符號
#   ② EQ 內的上標在純文字裡消失 → 這裡直接在代碼中用 \ue000…\ue001 標出上標
#   ③ OMML 方程式在純文字裡只是一串字 → 這裡用 scripts/lib/omml.py 轉成 HTML
# 輸出 data/rerender/formula-audit/tokens.json:{ "<subject>|<資料夾>|<冊>|<檔名>": { "<題號>": [token…] } }
#   token:字串(一般文字)| {"eq": 代碼} | {"om": html} | {"omx": 轉不了的原因}
# 用法:python scripts/export-formula-tokens.py
import glob, html, json, os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts", "lib"))
from omml import omml_to_html, Unsupported  # noqa: E402

# 與 scripts/lib/symbol-chars.mjs 的 MAP 相同(U+F0xx 低位元組 → 符號)
SYM = {0xde: "⇒", 0xdb: "⇔", 0x40: "≅", 0xb0: "°", 0xa2: "′", 0xa3: "≤", 0xb3: "≥", 0x5e: "⊥", 0xd0: "∠", 0x70: "π",
       0xb1: "±", 0xb4: "×", 0xb8: "÷", 0x2d: "−", 0xbd: "|", 0x7c: "|", 0x3e: ">", 0x3c: "<", 0x2b: "+", 0x72: "△",
       0xe0: "→", 0x81: "①", 0x82: "②", 0x8c: "❶", 0x8d: "❷", 0x8e: "❸", 0x8f: "❹"}
SYM_EL = re.compile(r'<w:sym [^>]*w:char="([0-9A-Fa-f]{4})"')
ITEM = re.compile(r"<w:r(?:\s[^>]*)?>(?:(?!</w:r>).)*?</w:r>|<m:oMathPara(?:\s[^>]*)?>.*?</m:oMathPara>|<m:oMath>.*?</m:oMath>", re.S)
FLD = re.compile(r'<w:fldChar w:fldCharType="(begin|separate|end)"')
PIECE = re.compile(r"<w:t(?:\s[^>]*)?>([^<]*)</w:t>|<w:instrText(?:\s[^>]*)?>([^<]*)</w:instrText>|<w:sym [^>]*w:char=\"([0-9A-Fa-f]{4})\"[^>]*/>|<w:(tab|br|cr)\b")
IS_EQ = re.compile(r"^\s*\\?eq\b", re.I)
# 「eq」後面直接接開關、沒有空白(\eq\f(…)):Word 不會畫出來(全庫 12 個,都緊貼著同樣的公式,是隱形重複)
INVISIBLE_EQ = re.compile(r"^\s*\\?eq\\", re.I)
SUP = 'w:vertAlign w:val="superscript"'

def sym_char(hexcode):
    cp = int(hexcode, 16)
    low = cp - 0xF000 if cp >= 0xF000 else cp
    return SYM.get(low, chr(cp))

def run_pieces(r):
    """run → (文字, 欄位代碼),Symbol 字元換成正確符號"""
    text, instr = "", ""
    # Symbol 字型的一般字元(例:¢ U+00A2 在 Symbol 字型畫成 ′)→ 依同一張對照表換成正確符號
    symfont = re.search(r'<w:rFonts [^>]*w:(?:ascii|hAnsi)="Symbol"', r) is not None
    # 0x72 在對照表是 Wingdings 3 的 △,Symbol 字型的 r 是 ρ → 不換
    fix = (lambda t: "".join(SYM.get(ord(c), c) if ord(c) < 0x100 and ord(c) != 0x72 else c for c in t)) if symfont else (lambda t: t)
    for m in PIECE.finditer(r):
        if m.group(1) is not None: text += fix(html.unescape(m.group(1)))
        elif m.group(2) is not None: instr += fix(html.unescape(m.group(2)))
        if m.group(3):
            c = sym_char(m.group(3))
            # <w:sym> 本身不分文字或代碼:看它在欄位代碼區(由呼叫端決定)→ 兩邊都放,呼叫端擇一
            text += c; instr += c
        elif m.group(4): text += " "
    return text, instr

def parse(path):
    x = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    toks = []  # 字串 | dict
    stack = []  # {code, res, eq?}
    def emit_text(s, r=""):
        # 一般文字的上/下標格式(m/s²、H₂O)用標記保留:上標 \ue000…\ue001、下標 \ue002…\ue003
        if s and r and s.strip():
            if SUP in r: s = "\ue000" + s + "\ue001"
            elif 'w:vertAlign w:val="subscript"' in r: s = "\ue002" + s + "\ue003"
        if s: toks.append(s)
    for m in ITEM.finditer(x):
        r = m.group(0)
        if r.startswith("<m:oMath"):
            if stack: continue
            try: toks.append({"om": omml_to_html(r)})
            except Unsupported as e: toks.append({"omx": str(e)})
            except Exception as e: toks.append({"omx": type(e).__name__})
            continue
        fm = FLD.search(r)
        if fm:
            k = fm.group(1)
            if k == "begin": stack.append({"code": "", "res": False})
            elif k == "separate" and stack: stack[-1]["res"] = True
            elif k == "end" and stack:
                f = stack.pop()
                if IS_EQ.match(f["code"]):
                    if stack and not stack[-1]["res"]:  # 巢狀 EQ:去掉開頭 eq 併進父代碼
                        stack[-1]["code"] += " " + re.sub(r"^\s*\\?eq\s*", "", f["code"], flags=re.I)
                    elif stack:
                        stack[-1].setdefault("result_eq", []).append(f["code"])
                    else:
                        if not INVISIBLE_EQ.match(f["code"]): toks.append({"eq": f["code"].strip()})
                elif f.get("result_eq") and not stack:
                    toks += [{"eq": c.strip()} for c in f["result_eq"]]
            continue
        text, instr = run_pieces(r)
        if stack:
            top = stack[-1]
            if not top["res"]:
                if instr:
                    top["code"] += ("\ue000" + instr + "\ue001") if (SUP in r and instr.strip()) else instr
            elif not IS_EQ.match(top["code"]) and len(stack) == 1:
                emit_text(text, r)  # 非 EQ 欄位(EMBED 圖等):只留結果文字
            continue
        emit_text(text, r)
    # 依「題號：」切題
    out, cur_num, buf, pending = {}, None, [], ""
    flat_text = ""
    segs = []  # (題號, tokens)
    for t in toks:
        if isinstance(t, str):
            flat_text += t
            while True:
                mm = re.search(r"題號：\s*(\d{7})", flat_text)
                if not mm: break
                # 題號之前的文字屬於上一題
                pre = flat_text[: mm.start()]
                if cur_num is not None and pre: buf.append(pre)
                if cur_num is not None: segs.append((cur_num, buf))
                cur_num, buf = mm.group(1), []
                flat_text = flat_text[mm.end():]
            continue
        if flat_text:
            if cur_num is not None: buf.append(flat_text)
            flat_text = ""
        if cur_num is not None: buf.append(t)
    if cur_num is not None:
        if flat_text: buf.append(flat_text)
        segs.append((cur_num, buf))
    for num, b in segs:
        out.setdefault(num, b)
    return out

def key_of(path, subj):
    base = os.path.join(ROOT, "數學") if subj == "math" else os.path.join(ROOT, "data", "word-docx", "自然")
    rel = os.path.relpath(path, base).replace("\\", "/")
    parts = rel.split("/")
    folder, name = parts[0], os.path.splitext(parts[-1])[0]
    vol = parts[1] if len(parts) == 3 else ""
    return f"{subj}|{folder}|{vol}|{name}"

result, n_om, n_omx, n_eq = {}, 0, 0, 0
for subj, pat in (("math", os.path.join(ROOT, "數學", "**", "*.doc")), ("science", os.path.join(ROOT, "data", "word-docx", "自然", "**", "*.docx"))):
    for f in sorted(glob.glob(pat, recursive=True)):
        try: d = parse(f)
        except Exception as e: print("ERR", f, e); continue
        for v in d.values():
            for t in v:
                if isinstance(t, dict):
                    n_om += "om" in t; n_omx += "omx" in t; n_eq += "eq" in t
        result[key_of(f, subj)] = d
        # 自然會考原檔在「國中教育會考/自然科學/」,但資料庫這些題目沒有冊別(volume = null)→ 另存一份空冊別的 key
        k = key_of(f, subj)
        if k.startswith("science|國中教育會考|自然科學|"): result[k.replace("|自然科學|", "||")] = d
json.dump(result, open(os.path.join(ROOT, "data", "rerender", "formula-audit", "tokens.json"), "w", encoding="utf-8"), ensure_ascii=False)
print(f"檔案 {len(result)};EQ {n_eq}、OMML {n_om}(轉不了 {n_omx})")
