# 把重畫好的圖(data/rerender/out)覆蓋到 web/public/qimg;覆蓋前把原圖備份到 D:\Claude\國中會考-DB備份\<日期>-qimg-rerender\
# 只換 data/rerender/map.json 裡、且不在排除清單(data/rerender/exclude.json,字串陣列)裡的圖。DB 不用改(同檔名、同尺寸)。
# 用法:python scripts/apply-rerender.py            → 只列出會換幾張
#       python scripts/apply-rerender.py --apply    → 備份 + 覆蓋
#       python scripts/apply-rerender.py --restore <備份資料夾>  → 從備份還原
import datetime, json, os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "data", "rerender")
PUB = os.path.join(ROOT, "web", "public")
BK_ROOT = os.path.join(os.path.dirname(ROOT), "國中會考-DB備份")

if "--restore" in sys.argv:
    src = sys.argv[sys.argv.index("--restore") + 1]
    n = 0
    for dp, _, fs in os.walk(src):
        for f in fs:
            rel = os.path.relpath(os.path.join(dp, f), src)
            shutil.copy2(os.path.join(dp, f), os.path.join(PUB, rel)); n += 1
    print(f"已還原 {n} 張"); sys.exit(0)

items = json.load(open(os.path.join(WORK, "map.json"), encoding="utf-8"))
ex_path = os.path.join(WORK, "exclude.json")
exclude = set(json.load(open(ex_path, encoding="utf-8"))) if os.path.exists(ex_path) else set()
todo = [m["p"] for m in items if m["p"] not in exclude]
print(f"重畫 {len(items)} 張,排除 {len(exclude & {m['p'] for m in items})} 張,要覆蓋 {len(todo)} 張")

if "--apply" in sys.argv:
    bk = os.path.join(BK_ROOT, datetime.date.today().isoformat() + "-qimg-rerender")
    for p in todo:
        rel = p.lstrip("/").replace("/", os.sep)
        os.makedirs(os.path.dirname(os.path.join(bk, rel)), exist_ok=True)
        shutil.copy2(os.path.join(PUB, rel), os.path.join(bk, rel))
    for p in todo:
        rel = p.lstrip("/").replace("/", os.sep)
        shutil.copy2(os.path.join(WORK, "out", rel.split(os.sep, 1)[1]), os.path.join(PUB, rel))
    print(f"✅ 已覆蓋 {len(todo)} 張;備份在 {bk}")
    print(f"還原:python scripts/apply-rerender.py --restore \"{bk}\"")
