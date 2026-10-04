# 掃描 data/rerender/tmp 裡的 WMF/EMF,找出真的設定成虛線/點線畫筆的圖,確認重畫後仍是虛線
# 輸出 data/rerender/dashed.json:[{p(網站圖路徑), src}]
import json, os, struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "data", "rerender")

def emf_dashed(d):
    p = 0
    while p + 8 <= len(d):
        t, s = struct.unpack_from("<II", d, p)
        if s < 8: break
        if t == 38 and (struct.unpack_from("<I", d, p + 12)[0] & 0xF) in (1, 2, 3, 4, 7): return True   # EMR_CREATEPEN
        if t == 95 and (struct.unpack_from("<I", d, p + 28)[0] & 0xF) in (1, 2, 3, 4, 7): return True   # EMR_EXTCREATEPEN
        if t == 14: break
        p += s
    return False

def wmf_dashed(d):
    off = 22 if d[:4] == b"\xd7\xcd\xc6\x9a" else 0
    if len(d) < off + 18: return False
    p = off + struct.unpack_from("<H", d, off + 2)[0] * 2
    while p + 6 <= len(d):
        size, fn = struct.unpack_from("<IH", d, p)
        if size == 0: break
        if fn == 0x02FA and (struct.unpack_from("<H", d, p + 6)[0] & 0xF) in (1, 2, 3, 4): return True
        p += size * 2
    return False

m = json.load(open(os.path.join(WORK, "map.json"), encoding="utf-8"))
out = []
for x in m:
    d = open(os.path.join(WORK, x["src"]), "rb").read()
    if (emf_dashed(d) if x["src"].lower().endswith(".emf") else wmf_dashed(d)):
        out.append({"p": x["p"], "src": x["src"]})
json.dump(out, open(os.path.join(WORK, "dashed.json"), "w", encoding="utf-8"), indent=0)
print(f"{len(m)} 張中,原圖有虛線畫筆的 {len(out)} 張 → data/rerender/dashed.json")
