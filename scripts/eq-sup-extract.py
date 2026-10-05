# 找出數學原檔(.doc 其實是 docx)裡「含上標」的 Word EQ 功能變數,記下所屬題號
# 背景:restore-eq-fields.mjs 用 Word 匯出的純文字還原 EQ,純文字沒有上標格式 → 10⁶ 變 106、25² 變 252。
# 輸出 data/rerender/eq-sup.json:[{q: 題號, plain: EQ 代碼(無標記), marked: 上標字元前後加  }]
# 巢狀欄位的處理與 restore-eq-fields.mjs 的 tokenize 一致(子 EQ 代碼去掉開頭 EQ 接到父代碼)。
import glob, json, os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUN = re.compile(r'<w:r(?:\s[^>]*)?>((?:(?!</w:r>).)*?)</w:r>', re.S)
FLD = re.compile(r'<w:fldChar w:fldCharType="(begin|separate|end)"')
# 用法:python scripts/eq-sup-extract.py [math|science]
#   math:數學原檔本身就是 docx;science:先在自己的終端機跑 scripts/export-docx-word.ps1(Word 另存 docx)
SUBJ = sys.argv[1] if len(sys.argv) > 1 else "math"
SRC = os.path.join(ROOT, "數學", "**", "*.doc") if SUBJ == "math" else os.path.join(ROOT, "data", "word-docx", "自然", "**", "*.docx")
out = []
for f in sorted(glob.glob(SRC, recursive=True)):
    try:
        doc = zipfile.ZipFile(f).read("word/document.xml").decode("utf-8")
    except Exception:
        continue
    qnum, textbuf, stack = None, "", []  # stack 元素:{code, sup, inResult}
    for m in RUN.finditer(doc):
        run = m.group(1)
        fm = FLD.search(run)
        kind = fm.group(1) if fm else None
        if kind == "begin":
            stack.append({"code": "", "marked": "", "res": False, "sup": False})
            continue
        if kind == "separate":
            if stack: stack[-1]["res"] = True
            continue
        if kind == "end":
            if not stack: continue
            fld = stack.pop()
            is_eq = fld["code"].strip().upper().startswith("EQ")
            if is_eq and stack and not stack[-1]["res"]:
                stack[-1]["code"] += " " + re.sub(r"^\s*\\?eq\s*", "", fld["code"], flags=re.I)
                stack[-1]["marked"] += " " + re.sub(r"^\s*\\?eq\s*", "", fld["marked"], flags=re.I)
                stack[-1]["sup"] |= fld["sup"]
            elif is_eq and not stack and fld["sup"]:
                out.append({"q": qnum, "file": os.path.relpath(f, ROOT), "plain": fld["code"], "marked": fld["marked"]})
            continue
        # 一般 run(含 fldChar 的 run 已被上面的分支吃掉;這裡是 instrText 或 w:t)
        # 一般 run:instrText(欄位代碼)或 w:t(文字)
        instr = "".join(re.findall(r"<w:instrText[^>]*>([^<]*)</w:instrText>", run))
        text = "".join(re.findall(r"<w:t(?:\s[^>]*)?>([^<]*)</w:t>", run))
        sup = 'w:vertAlign w:val="superscript"' in run
        if instr and stack and not stack[-1]["res"]:
            stack[-1]["code"] += instr
            if sup and instr.strip():
                stack[-1]["marked"] += "" + instr + ""; stack[-1]["sup"] = True
            else:
                stack[-1]["marked"] += instr
        if text and (not stack or stack[-1]["res"]):
            textbuf = (textbuf + text)[-200:]
            mm = re.findall(r"題號：\s*(\d{7})", textbuf)
            if mm: qnum = mm[-1]
json.dump(out, open(os.path.join(ROOT, "data", "rerender", "eq-sup.json" if SUBJ == "math" else f"eq-sup-{SUBJ}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(f"含上標的 EQ:{len(out)} 個,題號 {len({o['q'] for o in out})} 個,無題號 {sum(1 for o in out if not o['q'])}")
