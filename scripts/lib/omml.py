# Word OMML 公式 → 題目 HTML(沿用 web/src/app/globals.css 的 .frac/.sqrt/.ovl/.brace/.arr/.boxed 樣式,
# 與 scripts/lib/eq-field.mjs 產生的格式一致)。不支援的元素丟 Unsupported,呼叫端就不替換那張圖。
import html
import xml.etree.ElementTree as ET

M = "http://schemas.openxmlformats.org/officeDocument/2006/math"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = f'xmlns:m="{M}" xmlns:w="{W}"'


ARC = ('<span style="display:inline-block;border-top:1.5px solid currentColor;'
       'border-radius:50% 50% 0 0/6px 6px 0 0;padding:1px 1px 0;line-height:1.1">{}</span>')


class Unsupported(Exception):
    pass


def q(tag): return f"{{{M}}}{tag}"


def val(el, path):
    x = el.find(path)
    return None if x is None else x.get(q("val"))


def kids(el):
    return "".join(conv(c) for c in el)


def part(el, name):
    x = el.find(q(name))
    return "" if x is None else kids(x)


def conv(el):
    t = el.tag
    if t in (q("rPr"), q("ctrlPr"), q("fPr"), q("radPr"), q("barPr"), q("accPr"), q("sSupPr"), q("sSubPr"),
             q("sSubSupPr"), q("dPr"), q("eqArrPr"), q("boxPr"), q("borderBoxPr"), q("funcPr"), q("groupChrPr"),
             q("limLowPr"), q("limUppPr"), q("naryPr"), q("sPrePr"), q("mPr"), q("phantPr"), q("argPr"), q("mcs")) or t.startswith(f"{{{W}}}"):
        return ""
    if t == q("r"):
        return "".join(html.escape(x.text or "") for x in el.iter(q("t")))
    if t in (q("e"), q("num"), q("den"), q("deg"), q("sup"), q("sub"), q("fName"), q("lim"), q("oMath")):
        return kids(el)
    if t == q("f"):
        if val(el, f"{q('fPr')}/{q('type')}") in ("lin", "skw"):
            return f"{part(el, 'num')}/{part(el, 'den')}"
        return f'<span class="frac"><span class="num">{part(el, "num")}</span><span class="den">{part(el, "den")}</span></span>'
    if t == q("rad"):
        deg = part(el, "deg")
        pre = f"<sup>{deg}</sup>" if deg else ""
        return f'<span class="sqrt">{pre}√<span class="rad">{part(el, "e")}</span></span>'
    if t == q("bar"):
        if val(el, f"{q('barPr')}/{q('pos')}") == "bot":
            return f'<span style="text-decoration:underline">{part(el, "e")}</span>'
        return f'<span class="ovl">{part(el, "e")}</span>'
    if t == q("acc"):
        ch = val(el, f"{q('accPr')}/{q('chr')}") or "̂"
        e = part(el, "e")
        if ch in ("̅", "¯", "‾", "―", "—", "-", "̄"):
            return f'<span class="ovl">{e}</span>'
        # 射線(→)、直線(↔):組合用箭頭字元多數字型不支援會變方框,改成把箭頭疊在字母上方
        if ch in ("→", "⃗", "⃡", "↔"):
            arrow = "↔" if ch in ("⃡", "↔") else "→"
            return ('<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:bottom;line-height:1">'
                    f'<span style="font-size:.7em;line-height:.8">{arrow}</span><span>{e}</span></span>')
        if ch in ("⌢", "⏜", "̑", "⌒"):
            return ARC.format(e)  # 弧:跨過字母的弧線
        raise Unsupported(f"acc {ch!r}")
    if t == q("sSup"):
        return f"{part(el, 'e')}<sup>{part(el, 'sup')}</sup>"
    if t == q("sSub"):
        return f"{part(el, 'e')}<sub>{part(el, 'sub')}</sub>"
    if t == q("sSubSup"):
        return f"{part(el, 'e')}<sub>{part(el, 'sub')}</sub><sup>{part(el, 'sup')}</sup>"
    if t == q("d"):
        pr = el.find(q("dPr"))
        beg = "(" if pr is None or pr.find(q("begChr")) is None else (pr.find(q("begChr")).get(q("val")) or "")
        end = ")" if pr is None or pr.find(q("endChr")) is None else (pr.find(q("endChr")).get(q("val")) or "")
        es = el.findall(q("e"))
        if len(es) == 1 and es[0].find(q("eqArr")) is not None and len(list(es[0])) == 1 and beg == "{" and end == "":
            rows = "".join(f"<span>{kids(r)}</span>" for r in es[0].find(q("eqArr")).findall(q("e")))
            return f'<span class="brace"><span class="lb">{{</span><span class="arr">{rows}</span></span>'
        if beg == "{" and end == "":  # 聯立式:左大括號 + 多列(eqArr 外面還夾別的元素時)
            return f'<span class="brace"><span class="lb">{{</span>{"".join(kids(e) for e in es)}</span>'
        sep = "," if pr is None or pr.find(q("sepChr")) is None else pr.find(q("sepChr")).get(q("val"))
        return html.escape(beg) + sep.join(kids(e) for e in es) + html.escape(end)
    if t == q("groupChr"):  # 例:弧 ⏜ 疊在字母上方
        ch = val(el, f"{q('groupChrPr')}/{q('chr')}") or "⏟"
        pos = val(el, f"{q('groupChrPr')}/{q('pos')}") or "bot"
        mark = {"⏜": "⌒", "⌢": "⌒", "⏞": "⏞", "⏟": "⏟"}.get(ch, ch)
        e = part(el, "e")
        if mark == "⌒" and pos == "top": return ARC.format(e)
        top, bot = (mark, e) if pos == "top" else (e, mark)
        return ('<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:bottom;line-height:1">'
                f'<span style="font-size:.7em;line-height:.8">{top}</span><span>{bot}</span></span>') if pos == "top" else                ('<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:top;line-height:1">'
                f'<span>{top}</span><span style="font-size:.7em;line-height:.8">{bot}</span></span>')
    if t == q("m"):  # 矩陣:每列一行(聯立式常用)
        rows = []
        for mr in el.findall(q("mr")):
            rows.append("<span>" + "&nbsp;".join(kids(e) for e in mr.findall(q("e"))) + "</span>")
        return '<span class="arr">' + "".join(rows) + "</span>"
    if t == q("eqArr"):
        return '<span class="arr">' + "".join(f"<span>{kids(r)}</span>" for r in el.findall(q("e"))) + "</span>"
    if t in (q("box"), q("phant")):
        return part(el, "e")
    if t == q("borderBox"):
        return f'<span class="boxed">{part(el, "e")}</span>'
    if t == q("func"):
        return f"{part(el, 'fName')}{part(el, 'e')}"
    if t == q("oMathPara"):
        return "".join(conv(c) for c in el.findall(q("oMath")))
    raise Unsupported(t.split("}")[1])


def omml_to_html(xml_str):
    root = ET.fromstring(f"<root {NS}>{xml_str}</root>")
    out = "".join(conv(c) for c in root)
    if not out.strip():
        raise Unsupported("empty")
    return out
