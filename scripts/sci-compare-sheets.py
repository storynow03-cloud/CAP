# 自然科「資料庫內容 vs 原檔」並排對照圖(2026-10-07)
# 左:資料庫的題目、選項、答案、詳解(上標/下標轉成 ⁶ ₂ 字元,無法轉的寫成 ^(…) _(…),圖片依序貼上)
# 右:原檔片段(scripts/sci-source-crops.py 產生的 data/rerender/sci-crops/<id>.png)
# 輸入 JSON:資料庫題目陣列;輸出 data/rerender/sci-compare/<id>.png
# ⚠ 2026-10-07 教訓:這支原本把 .frac/.sqrt/.ovl 的標籤直接拿掉(6/35 畫成「635」)→ 23 題中 15 題誤判壞題。
#   已改成轉成 (6)/(35)、√(…)、‾AB‾;但比對公式請優先用 make-recheck-page.mjs + shoot-recheck.py(網站實際 CSS)。
import json, os, re, sys, html, textwrap
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CROPS = os.path.join(ROOT, "data", "rerender", sys.argv[2] if len(sys.argv) > 2 else "sci-crops")
OUT = os.path.join(ROOT, "data", "rerender", sys.argv[3] if len(sys.argv) > 3 else "sci-compare")
os.makedirs(OUT, exist_ok=True)
font = ImageFont.truetype("C:/Windows/Fonts/msjh.ttc", 19)
bold = ImageFont.truetype("C:/Windows/Fonts/msjhbd.ttc", 20)
SUP = str.maketrans("0123456789+-=()n", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ")
SUB = str.maketrans("0123456789+-=()", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎")
L = "ABCDEFGH"
COLW = 820

def conv(t):
    # 微軟正黑體沒有 ⁶ ₂ 這類字元(會變方塊)→ 上標寫成 ^3、^(…),下標寫成 _2、_(…),審核時一眼看得出有沒有上下標
    t = str(t or "")
    # 公式結構先轉成看得出來的文字,否則標籤被拿掉後分子分母會黏在一起(6/35 → 「635」);由內而外反覆處理巢狀
    for _ in range(4):
        t = re.sub(r'<span class="frac"><span class="num">((?:(?!<span class="frac">).)*?)</span><span class="den">((?:(?!<span class="frac">).)*?)</span></span>', r"(\1)/(\2)", t)
        t = re.sub(r'<span class="sqrt">√<span class="rad">((?:(?!<span class="sqrt">).)*?)</span></span>', r"√(\1)", t)
        t = re.sub(r'<span class="ovl">(.*?)</span>', r"‾\1‾", t)
    t = re.sub(r"<sup>(.*?)</sup>", lambda m: f"^{m.group(1)}" if re.fullmatch(r"[0-9A-Za-z+\-]{1,3}", m.group(1)) else f"^({m.group(1)})", t)
    t = re.sub(r"<sub>(.*?)</sub>", lambda m: f"_{m.group(1)}" if re.fullmatch(r"[0-9A-Za-z+\-]{1,3}", m.group(1)) else f"_({m.group(1)})", t)
    return t

def render_left(q):
    parts = [("題目", q["question"])] + [(f"({L[i]})", o) for i, o in enumerate(q.get("options") or [])]
    parts.append(("答案", L[q["answer"]] if q.get("answer") is not None else (q.get("answer_text") or "")))
    if q.get("explanation"): parts.append(("詳解", q["explanation"]))
    blocks = []  # ("text", line) / ("img", Image)
    n = [0]
    for label, raw in parts:
        raw = conv(raw)
        srcs = re.findall(r'<img[^>]*src="([^"]+)"', raw)
        def rep(m): n[0] += 1; return f"[圖{n[0]}]"
        t = re.sub(r"<img[^>]*>", rep, raw)
        t = html.unescape(re.sub(r"<[^>]+>", "", re.sub(r"<br\s*/?>", "\n", t)))
        first = True
        for para in t.split("\n"):
            for line in textwrap.wrap(para, 38) or [""]:
                blocks.append(("text", (f"{label} " if first else "    ") + line)); first = False
        for s in srcs:
            try:
                im0 = Image.open(os.path.join(ROOT, "web", "public", s.lstrip("/"))).convert("RGBA")
                im = Image.new("RGB", im0.size, "white"); im.paste(im0, mask=im0.split()[3])  # 透明底貼在白底(網頁也是白底)
                if im.width > COLW - 20: im = im.resize((COLW - 20, int(im.height * (COLW - 20) / im.width)))
                elif im.width < 200: im = im.resize((im.width * 2, im.height * 2))
                blocks.append(("img", im))
            except Exception as e:
                blocks.append(("text", f"    [圖片讀取失敗 {s}]"))
    h = 10 + sum(26 if k == "text" else v.height + 8 for k, v in blocks)
    img = Image.new("RGB", (COLW, h), "white"); d = ImageDraw.Draw(img); y = 6
    for k, v in blocks:
        if k == "text": d.text((8, y), v, fill=(20, 20, 20), font=font); y += 26
        else: img.paste(v, (10, y)); y += v.height + 8
    return img

rows = json.load(open(sys.argv[1], encoding="utf-8"))
made = 0
for q in rows:
    crop = os.path.join(CROPS, f"{q['id']}.png")
    if not os.path.exists(crop): continue
    left = render_left(q)
    right = Image.open(crop).convert("RGB")
    if right.width > COLW: right = right.resize((COLW, int(right.height * COLW / right.width)))
    H = max(left.height, right.height) + 40
    sheet = Image.new("RGB", (COLW * 2 + 20, H), (230, 230, 230))
    d = ImageDraw.Draw(sheet)
    d.rectangle([0, 0, COLW * 2 + 20, 32], fill=(30, 41, 59))
    d.text((8, 4), f"{q['id']}    左:資料庫(孩子會看到的內容)    右:康軒原檔(Word 轉檔)", fill=(250, 204, 21), font=bold)
    sheet.paste(left, (0, 38)); sheet.paste(right, (COLW + 20, 38))
    sheet.save(os.path.join(OUT, f"{q['id']}.png")); made += 1
print("對照圖", made)
