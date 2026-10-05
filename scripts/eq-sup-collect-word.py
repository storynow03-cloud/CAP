# 把 scripts/export-eq-sup-word.ps1 的輸出(data/eq-sup-word/<科目>/**/*.jsonl)合併成
# data/rerender/eq-sup-<subject>.json,給 fix-eq-superscripts.mjs --subject <subject> 用
# 用法:python scripts/eq-sup-collect-word.py science
import glob, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
subj = sys.argv[1] if len(sys.argv) > 1 else "science"
zh = {"science": "自然", "math": "數學"}[subj]
out = []
for f in glob.glob(os.path.join(ROOT, "data", "eq-sup-word", zh, "**", "*.jsonl"), recursive=True):
    for line in open(f, encoding="utf-8-sig"):
        if line.strip():
            o = json.loads(line)
            if o.get("q"): out.append({"q": o["q"], "file": os.path.relpath(f, ROOT), "plain": o["plain"], "marked": o["marked"]})
json.dump(out, open(os.path.join(ROOT, "data", "rerender", f"eq-sup-{subj}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(f"{subj}:含上標 EQ {len(out)} 個,題號 {len({o['q'] for o in out})} 個")
