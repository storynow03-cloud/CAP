# 傳說夥伴「蘭波」三階段 Q 版圖(2026-10-14)
# 使用者提供三張參考圖(水晶王冠+泡泡小白貓、抱手機吐舌、人魚王形態);使用者指定順序:Lv.1 抱手機、Lv.2 水晶王冠、Lv.3 人魚王。
# Gemini 金鑰失效無法 AI 生圖 → 用 SVG 手繪 Q 版(大頭小身、金色長髮、藍眼、淡藍魚鰭耳、白色繃帶衣),
# 再用 Playwright 轉成 512×512 PNG,規格比照 web/public/partner/xmi-*.png。
# 用法:python scripts/draw-pet-lanbo.py  → web/public/partner/lanbo-1.png ~ lanbo-3.png(另存 SVG 在 data/pet-art/)
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SVG_DIR = ROOT / "data" / "pet-art"
OUT_DIR = ROOT / "web" / "public" / "partner"

DEFS = """
<defs>
  <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff3b8"/><stop offset=".55" stop-color="#f6d77a"/><stop offset="1" stop-color="#e8b955"/>
  </linearGradient>
  <radialGradient id="skin" cx=".5" cy=".45" r=".6">
    <stop offset="0" stop-color="#fff4ea"/><stop offset="1" stop-color="#fde0cf"/>
  </radialGradient>
  <radialGradient id="eye" cx=".5" cy=".35" r=".7">
    <stop offset="0" stop-color="#9fe2ff"/><stop offset=".6" stop-color="#3a9be0"/><stop offset="1" stop-color="#1d5fa8"/>
  </radialGradient>
  <linearGradient id="fin" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#e3f6ff"/><stop offset="1" stop-color="#8ccff5"/>
  </linearGradient>
  <linearGradient id="tail" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#bfeaff"/><stop offset=".5" stop-color="#5bb8ee"/><stop offset="1" stop-color="#2e7fd0"/>
  </linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#f2c445"/><stop offset="1" stop-color="#c98d1e"/>
  </linearGradient>
  <radialGradient id="bubble" cx=".35" cy=".3" r=".75">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset=".6" stop-color="#d8f1ff" stop-opacity=".35"/>
    <stop offset="1" stop-color="#9fd8ff" stop-opacity=".55"/>
  </radialGradient>
  <radialGradient id="glow" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="#bfe9ff" stop-opacity=".9"/><stop offset="1" stop-color="#bfe9ff" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="glow3" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="#fff6c8" stop-opacity=".95"/><stop offset=".5" stop-color="#9ed8ff" stop-opacity=".45"/>
    <stop offset="1" stop-color="#7cc4ff" stop-opacity="0"/>
  </radialGradient>
</defs>"""

INK = "#5a3e2b"


def badge(n, fancy=False):
    if fancy:
        wings = ('<path d="M190 52 q-30 -14 -44 6 q20 0 30 12 z" fill="url(#gold)" stroke="#b7862a" stroke-width="2"/>'
                 '<path d="M322 52 q30 -14 44 6 q-20 0 -30 12 z" fill="url(#gold)" stroke="#b7862a" stroke-width="2"/>'
                 '<path d="M240 26 l8 -12 l8 12 l8 -12 l8 12 v8 h-32 z" fill="url(#gold)" stroke="#b7862a" stroke-width="2"/>')
        return (wings + '<rect x="186" y="34" width="140" height="44" rx="22" fill="#2b5fa8" stroke="url(#gold)" stroke-width="5"/>'
                f'<text x="256" y="66" text-anchor="middle" font-family="Arial Rounded MT Bold,Arial,sans-serif" font-size="26" font-weight="bold" fill="#fff">Lv.{n}</text>')
    fill = "#3d4652" if n == 1 else "#3a78c2"
    return (f'<rect x="196" y="26" width="120" height="42" rx="21" fill="{fill}"/>'
            f'<text x="256" y="56" text-anchor="middle" font-family="Arial Rounded MT Bold,Arial,sans-serif" font-size="25" font-weight="bold" fill="#fff">Lv.{n}</text>')


def head(cx, cy, s=1.0, mood="calm"):
    """Q 版大頭:中心 (cx,cy),s 為縮放。mood: calm(半睜溫柔)/cheeky(吐舌)/proud(自信)"""
    g = [f'<g transform="translate({cx} {cy}) scale({s})">']
    # 後髮(長髮披到肩)
    g.append('<path d="M-98 -20 C-120 60 -112 120 -86 150 C-70 120 -60 100 -58 70 L58 70 C60 100 70 120 86 150 '
             'C112 120 120 60 98 -20 Z" fill="url(#hair)" stroke="#c99a3c" stroke-width="3"/>')
    # 魚鰭耳
    for sx in (-1, 1):
        g.append(f'<path d="M{sx*82} -2 C{sx*120} -30 {sx*138} -46 {sx*150} -40 C{sx*136} -20 {sx*128} 4 {sx*112} 22 '
                 f'C{sx*104} 14 {sx*92} 10 {sx*82} 10 Z" fill="url(#fin)" stroke="#5aa9d8" stroke-width="3"/>')
        g.append(f'<path d="M{sx*92} 2 L{sx*136} -36 M{sx*94} 10 L{sx*126} -12" stroke="#5aa9d8" stroke-width="2" opacity=".7"/>')
    # 臉
    g.append('<ellipse cx="0" cy="8" rx="86" ry="80" fill="url(#skin)" stroke="#d9a98e" stroke-width="3"/>')
    # 眼睛
    for sx in (-1, 1):
        ex = sx * 36
        if mood == "cheeky":
            g.append(f'<ellipse cx="{ex}" cy="22" rx="17" ry="16" fill="url(#eye)"/>')
            g.append(f'<path d="M{ex-22} 12 Q{ex} 2 {ex+22} 12" stroke="{INK}" stroke-width="5" fill="none" stroke-linecap="round"/>')
            g.append(f'<rect x="{ex-22}" y="4" width="44" height="12" fill="url(#skin)"/>')
            g.append(f'<path d="M{ex-22} 14 Q{ex} 6 {ex+22} 14" stroke="#b5463a" stroke-width="4" fill="none" stroke-linecap="round"/>')
            g.append(f'<circle cx="{ex-6}" cy="20" r="5" fill="#fff"/><circle cx="{ex+7}" cy="30" r="2.5" fill="#fff"/>')
        else:
            ry = 20 if mood == "proud" else 18
            top = 20 - ry
            g.append(f'<ellipse cx="{ex}" cy="20" rx="17" ry="{ry}" fill="url(#eye)"/>')
            g.append(f'<ellipse cx="{ex}" cy="22" rx="8" ry="{ry-8}" fill="#123e74"/>')
            g.append(f'<circle cx="{ex-6}" cy="{12 if mood=="proud" else 16}" r="6" fill="#fff"/><circle cx="{ex+7}" cy="28" r="3" fill="#fff"/>')
            if mood == "calm":
                # 溫柔半睜:上眼皮蓋住上 1/3
                g.append(f'<path d="M{ex-19} {top+2} Q{ex} {top-6} {ex+19} {top+2} L{ex+19} {top+13} Q{ex} {top+8} {ex-19} {top+13} Z" fill="#fde6d8"/>')
                g.append(f'<path d="M{ex-20} {top+13} Q{ex} {top+7} {ex+20} {top+13}" stroke="{INK}" stroke-width="5" fill="none" stroke-linecap="round"/>')
                g.append(f'<path d="M{ex+sx*20} {top+13} l{sx*7} 4" stroke="{INK}" stroke-width="3.5" stroke-linecap="round"/>')
            else:
                g.append(f'<path d="M{ex-20} {top+5} Q{ex} {top-5} {ex+20} {top+5}" stroke="{INK}" stroke-width="5" fill="none" stroke-linecap="round"/>')
                g.append(f'<path d="M{ex+sx*20} {top+5} l{sx*7} 3" stroke="{INK}" stroke-width="3.5" stroke-linecap="round"/>')
            # 細細的眉毛,在眼睛上方、往外微微下彎(不要像皺眉)
            g.append(f'<path d="M{ex-sx*12} {top-14} Q{ex+sx*2} {top-19} {ex+sx*16} {top-13}" stroke="#d9a94a" stroke-width="3" fill="none" stroke-linecap="round"/>')
    # 腮紅
    for sx in (-1, 1):
        g.append(f'<ellipse cx="{sx*58}" cy="48" rx="16" ry="9" fill="#ff9fa8" opacity=".55"/>')
        g.append(f'<path d="M{sx*52} 44 l-4 8 M{sx*60} 44 l-4 8 M{sx*68} 44 l-4 8" stroke="#f07c88" stroke-width="2" opacity=".6"/>')
    # 嘴
    if mood == "cheeky":
        g.append('<path d="M-14 50 Q0 62 14 50 Q10 72 0 74 Q-10 72 -14 50 Z" fill="#c9505a"/>')
        g.append('<path d="M-8 60 Q0 82 8 60 Z" fill="#ff8f9c"/>')
    elif mood == "proud":
        g.append('<path d="M-12 52 Q0 62 12 52" stroke="#b5463a" stroke-width="4" fill="none" stroke-linecap="round"/>')
    else:
        g.append('<path d="M-8 54 Q0 59 8 54" stroke="#b5463a" stroke-width="3.5" fill="none" stroke-linecap="round"/>')
    # 瀏海
    g.append('<path d="M-92 -6 C-100 -70 -50 -104 0 -104 C50 -104 100 -70 92 -6 C80 -30 66 -40 50 -44 '
             'C46 -20 30 -6 14 0 C20 -18 18 -34 10 -46 C0 -26 -24 -10 -44 -4 C-36 -20 -34 -34 -36 -46 '
             'C-58 -36 -78 -24 -92 -6 Z" fill="url(#hair)" stroke="#c99a3c" stroke-width="3" stroke-linejoin="round"/>')
    g.append('<path d="M-30 -92 Q-10 -98 6 -94" stroke="#fffbe2" stroke-width="6" fill="none" stroke-linecap="round" opacity=".9"/>')
    g.append('<path d="M-6 -104 C-2 -124 12 -130 20 -126 C10 -120 6 -112 6 -104" fill="url(#hair)" stroke="#c99a3c" stroke-width="3"/>')
    g.append('</g>')
    return "".join(g)


def crown(cx, cy, s=1.0, big=False):
    """水晶王冠(stage1 淡紫水晶;stage3 金色大王冠)"""
    if big:
        return (f'<g transform="translate({cx} {cy}) scale({s})">'
                '<path d="M-70 10 L-62 -30 L-38 -6 L-20 -50 L0 -14 L20 -50 L38 -6 L62 -30 L70 10 Z" fill="url(#gold)" stroke="#a8751c" stroke-width="3" stroke-linejoin="round"/>'
                '<rect x="-72" y="4" width="144" height="16" rx="8" fill="url(#gold)" stroke="#a8751c" stroke-width="3"/>'
                '<circle cx="0" cy="-2" r="9" fill="#5fd0ff" stroke="#fff" stroke-width="2"/>'
                '<circle cx="-38" cy="10" r="5" fill="#ff7fa8"/><circle cx="38" cy="10" r="5" fill="#ff7fa8"/>'
                '<circle cx="-20" cy="-50" r="5" fill="#fff"/><circle cx="20" cy="-50" r="5" fill="#fff"/></g>')
    gems = ""
    for x, h, c in ((-44, 26, "#e6d6ff"), (-22, 40, "#f6e9ff"), (0, 52, "#ffffff"), (22, 40, "#f6e9ff"), (44, 26, "#e6d6ff")):
        gems += f'<path d="M{x-9} 0 L{x} -{h} L{x+9} 0 Z" fill="{c}" stroke="#a88fd8" stroke-width="2"/>'
    return (f'<g transform="translate({cx} {cy}) scale({s})">{gems}'
            '<path d="M-60 0 Q0 14 60 0 L56 12 Q0 26 -56 12 Z" fill="url(#gold)" stroke="#b08a3a" stroke-width="2"/>'
            '<circle cx="-30" cy="9" r="4" fill="#ffb6d0"/><circle cx="0" cy="13" r="5" fill="#9fe2ff"/><circle cx="30" cy="9" r="4" fill="#ffb6d0"/></g>')


def bubbles(items):
    return "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="url(#bubble)" stroke="#8fd0f5" stroke-width="2"/>'
                   f'<path d="M{x-r*.5} {y-r*.25} q{r*.15} -{r*.3} {r*.45} -{r*.35}" stroke="#fff" stroke-width="2" fill="none"/>'
                   for x, y, r in items)


def sparkle(x, y, s, c="#ffd75e"):
    return f'<path d="M{x} {y-s} Q{x+s*.18} {y-s*.18} {x+s} {y} Q{x+s*.18} {y+s*.18} {x} {y+s} Q{x-s*.18} {y+s*.18} {x-s} {y} Q{x-s*.18} {y-s*.18} {x} {y-s} Z" fill="{c}"/>'


def kitten(cx, cy):
    """泡泡裡的小白貓"""
    return (f'<g transform="translate({cx} {cy})">'
            '<circle cx="0" cy="0" r="46" fill="url(#bubble)" stroke="#8fd0f5" stroke-width="3"/>'
            '<ellipse cx="0" cy="16" rx="24" ry="18" fill="#fff" stroke="#c9c4d6" stroke-width="2"/>'
            '<circle cx="0" cy="-6" r="20" fill="#fff" stroke="#c9c4d6" stroke-width="2"/>'
            '<path d="M-17 -16 L-14 -34 L-3 -22 Z M17 -16 L14 -34 L3 -22 Z" fill="#fff" stroke="#c9c4d6" stroke-width="2"/>'
            '<path d="M-14 -18 L-13 -28 L-7 -21 Z M14 -18 L13 -28 L7 -21 Z" fill="#ffc6d3"/>'
            '<circle cx="-7" cy="-6" r="3" fill="#3a4a6a"/><circle cx="7" cy="-6" r="3" fill="#3a4a6a"/>'
            '<path d="M-3 1 Q0 4 3 1" stroke="#c77" stroke-width="1.6" fill="none"/>'
            '<ellipse cx="-12" cy="2" rx="4" ry="2.4" fill="#ffb6c4" opacity=".7"/><ellipse cx="12" cy="2" rx="4" ry="2.4" fill="#ffb6c4" opacity=".7"/>'
            '<circle cx="-12" cy="28" r="6" fill="#fff" stroke="#c9c4d6" stroke-width="2"/><circle cx="12" cy="28" r="6" fill="#fff" stroke="#c9c4d6" stroke-width="2"/>'
            '<path d="M-28 -24 q8 -10 18 -12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></g>')


def wrap_body(cx, top, w, h):
    """白色繃帶上衣(Q 版小身體)"""
    s = (f'<path d="M{cx-w/2} {top+h} Q{cx-w/2-6} {top+20} {cx-w/2+14} {top+6} L{cx+w/2-14} {top+6} '
         f'Q{cx+w/2+6} {top+20} {cx+w/2} {top+h} Z" fill="#f7fbff" stroke="#b9c9dc" stroke-width="3"/>')
    for i in range(1, 5):
        y = top + i * h / 5
        s += f'<path d="M{cx-w/2+4} {y+6} Q{cx} {y-6} {cx+w/2-4} {y+2}" stroke="#c9d8ea" stroke-width="3" fill="none"/>'
    s += f'<rect x="{cx-22}" y="{top-6}" width="44" height="18" rx="8" fill="#f7fbff" stroke="#b9c9dc" stroke-width="3"/>'
    return s


def stage1():
    bg = ('<rect width="512" height="512" fill="#ffffff"/>'
          '<circle cx="256" cy="300" r="200" fill="url(#glow)"/>'
          '<path d="M408 118 a30 30 0 1 0 22 46 a24 24 0 1 1 -22 -46 z" fill="#ffe08a"/>')
    body = wrap_body(256, 352, 120, 96)
    arms = ('<path d="M206 372 Q168 400 176 430" stroke="#b9c9dc" stroke-width="22" stroke-linecap="round" fill="none"/>'
            '<path d="M206 372 Q168 400 176 430" stroke="#f7fbff" stroke-width="16" stroke-linecap="round" fill="none"/>')
    return (bg + bubbles([(96, 140, 16), (126, 104, 9), (420, 300, 14), (440, 260, 8), (380, 430, 10)])
            + sparkle(110, 300, 12) + sparkle(400, 210, 9, "#c9b8ff") + sparkle(430, 380, 7)
            + body + arms + head(256, 240, 1.0, "calm") + crown(256, 140, 0.95)
            + kitten(172, 418)
            + '<path d="M300 380 Q318 352 304 330" stroke="#b9c9dc" stroke-width="20" stroke-linecap="round" fill="none"/>'
              '<path d="M300 380 Q318 352 304 330" stroke="#f7fbff" stroke-width="14" stroke-linecap="round" fill="none"/>'
              '<circle cx="303" cy="324" r="11" fill="url(#skin)" stroke="#d9a98e" stroke-width="2.5"/>'
              '<path d="M304 314 L306 296" stroke="#d9a98e" stroke-width="7" stroke-linecap="round"/>'
              '<path d="M304 314 L306 296" stroke="#fde0cf" stroke-width="4" stroke-linecap="round"/>'
            + badge(2))


def stage2():
    bg = ('<rect width="512" height="512" fill="#ffffff"/>'
          '<circle cx="256" cy="300" r="210" fill="url(#glow)"/>')
    tail = ('<path d="M196 430 Q180 486 236 494 L276 494 Q332 486 316 430 Z" fill="url(#tail)" stroke="#2e7fd0" stroke-width="3"/>'
            + "".join(f'<path d="M{x} {y} q8 -8 16 0" stroke="#e6f7ff" stroke-width="2.5" fill="none" opacity=".8"/>'
                      for x, y in ((214, 452), (238, 446), (262, 446), (286, 452), (226, 472), (252, 470), (276, 472)))
            + "".join(sparkle(x, y, 5, "#ffffff") for x, y in ((222, 462), (290, 480), (258, 486))))
    body = wrap_body(256, 340, 132, 100)
    phone = ('<g transform="rotate(-12 300 392)"><rect x="262" y="330" width="78" height="118" rx="12" fill="#5b3f33" stroke="#3a2820" stroke-width="3"/>'
             '<rect x="304" y="344" width="18" height="30" rx="6" fill="#8a6a55"/><circle cx="313" cy="352" r="5" fill="#2a1c16"/></g>')
    hands = ('<ellipse cx="262" cy="404" rx="15" ry="13" fill="url(#skin)" stroke="#d9a98e" stroke-width="2.5"/>'
             '<ellipse cx="336" cy="372" rx="13" ry="12" fill="url(#skin)" stroke="#d9a98e" stroke-width="2.5"/>')
    return (bg + bubbles([(90, 180, 14), (430, 170, 12), (452, 210, 7), (70, 380, 9)])
            + sparkle(420, 330, 10) + sparkle(96, 270, 8, "#9fdcff")
            + tail + body + head(244, 236, 1.08, "cheeky") + phone + hands
            + '<text x="400" y="120" font-family="Arial" font-size="34" fill="#7cc4ff">♪</text>'
            + badge(1))


def stage3():
    bg = ('<rect width="512" height="512" fill="#ffffff"/>'
          '<circle cx="256" cy="290" r="236" fill="url(#glow3)"/>'
          '<ellipse cx="256" cy="470" rx="150" ry="22" fill="none" stroke="#f2c445" stroke-width="4" opacity=".8"/>'
          '<ellipse cx="256" cy="470" rx="118" ry="14" fill="none" stroke="#9ed8ff" stroke-width="3" opacity=".8"/>')
    tail = ('<path d="M206 380 C190 430 220 452 268 456 C320 460 352 470 372 444 C392 418 420 420 440 432 '
            'C432 404 404 392 380 404 C352 420 320 430 300 420 C318 404 316 384 306 370 Z" fill="url(#tail)" stroke="#2e7fd0" stroke-width="3"/>'
            '<path d="M432 430 C452 404 476 398 490 406 C476 420 470 440 474 458 C460 446 444 440 432 430 Z" fill="url(#fin)" stroke="#5aa9d8" stroke-width="3"/>'
            + "".join(f'<path d="M{x} {y} q9 -9 18 0" stroke="#e6f7ff" stroke-width="2.5" fill="none" opacity=".85"/>'
                      for x, y in ((222, 408), (246, 420), (272, 430), (300, 436), (330, 432), (356, 424), (234, 436), (262, 444)))
            + '<path d="M210 384 Q256 400 306 372" stroke="url(#gold)" stroke-width="10" fill="none" stroke-linecap="round"/>')
    cape = ('<path d="M196 330 C150 360 130 420 150 470 C180 440 196 410 204 380 Z" fill="#d9f1ff" stroke="#8cc7ec" stroke-width="3" opacity=".9"/>'
            '<path d="M316 330 C352 350 372 390 366 430 C344 410 326 390 310 372 Z" fill="#d9f1ff" stroke="#8cc7ec" stroke-width="3" opacity=".9"/>')
    torso = ('<path d="M206 330 Q200 370 210 388 L302 388 Q312 370 306 330 Z" fill="url(#skin)" stroke="#d9a98e" stroke-width="3"/>'
             '<path d="M200 330 Q256 360 312 330 L306 348 Q256 376 206 348 Z" fill="url(#gold)" stroke="#a8751c" stroke-width="2.5"/>'
             '<circle cx="256" cy="352" r="9" fill="#5fd0ff" stroke="#fff" stroke-width="2"/>'
             '<path d="M196 332 Q182 330 176 344" stroke="url(#gold)" stroke-width="16" stroke-linecap="round" fill="none"/>'
             '<path d="M316 332 Q330 330 336 344" stroke="url(#gold)" stroke-width="16" stroke-linecap="round" fill="none"/>')
    arms = ('<path d="M190 344 Q130 362 100 330" stroke="#d9a98e" stroke-width="20" stroke-linecap="round" fill="none"/>'
            '<path d="M190 344 Q130 362 100 330" stroke="#fde0cf" stroke-width="14" stroke-linecap="round" fill="none"/>'
            '<path d="M322 344 Q352 356 362 372" stroke="#d9a98e" stroke-width="20" stroke-linecap="round" fill="none"/>'
            '<path d="M322 344 Q352 356 362 372" stroke="#fde0cf" stroke-width="14" stroke-linecap="round" fill="none"/>')
    trident = ('<g transform="translate(-50 0)"><path d="M146 470 L146 200" stroke="#e2b443" stroke-width="9" stroke-linecap="round"/>'
               '<path d="M122 230 Q122 196 146 186 Q170 196 170 230 M146 186 L146 160 M122 230 L122 206 M170 230 L170 206" '
               'stroke="url(#gold)" stroke-width="8" fill="none" stroke-linecap="round"/>'
               '<path d="M146 150 l-8 14 h16 z M122 196 l-7 12 h14 z M170 196 l-7 12 h14 z" fill="#fff2a8" stroke="#a8751c" stroke-width="2"/>'
               '<circle cx="146" cy="236" r="10" fill="#5fd0ff" stroke="#fff" stroke-width="2.5"/>'
               '<ellipse cx="148" cy="328" rx="13" ry="12" fill="url(#skin)" stroke="#d9a98e" stroke-width="2.5"/></g>')
    glow_orb = ('<circle cx="370" cy="378" r="26" fill="url(#bubble)" stroke="#8fd0f5" stroke-width="3"/>'
                + sparkle(370, 378, 12, "#ffffff")
                + '<ellipse cx="362" cy="374" rx="12" ry="11" fill="url(#skin)" stroke="#d9a98e" stroke-width="2.5"/>')
    return (bg + bubbles([(80, 120, 14), (430, 120, 16), (454, 160, 8), (64, 420, 11), (450, 330, 9)])
            + "".join(sparkle(x, y, s) for x, y, s in ((100, 300, 12), (420, 250, 14), (396, 92, 8), (110, 80, 8)))
            + sparkle(256, 470, 10, "#fff6c8")
            + cape + tail + torso + arms + head(256, 226, 1.0, "proud") + trident + crown(256, 136, 1.0, big=True)
            + glow_orb + badge(3, fancy=True))


def svg(content):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">{DEFS}{content}</svg>'


if __name__ == "__main__":
    SVG_DIR.mkdir(parents=True, exist_ok=True)
    files = []
    for i, fn in enumerate((stage2, stage1, stage3), 1):  # 使用者要求:抱手機 Q 版為 Lv.1、水晶王冠為 Lv.2
        p = SVG_DIR / f"lanbo-{i}.svg"
        p.write_text(svg(fn()), encoding="utf-8")
        files.append((p, OUT_DIR / f"lanbo-{i}.png"))
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 512, "height": 512})
        for src, dst in files:
            pg.goto(src.as_uri())
            pg.screenshot(path=str(dst), omit_background=False)
            print("→", dst)
        b.close()
