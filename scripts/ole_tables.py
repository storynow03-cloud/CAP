# 把 Word 內嵌物件(OLE)裡的「純表格」轉成 HTML 表格(供 render-ole-tables.mjs 使用)。
#
# 背景:社會/國文/英語題目裡很多表格是 Word「內嵌文件物件」,LibreOffice 轉 HTML 時只輸出
# 依顯示大小點陣化的預覽圖,字糊到讀不出來。但轉成 .odt 後,每個物件的原始內容
# (Object N/content.xml)都還在,文字是真的文字 → 直接轉成清楚、可縮放的 HTML 表格。
#
# 只處理「內容只有表格」的物件(允許空段落);物件裡有文字框、圖片、圖表、公式就回傳 None,
# 題目繼續隱藏,不冒險。保留底線、粗體、上下標(「畫線處」之類的題目要靠底線判斷)。
#
# 用法:python scripts/ole_tables.py <清單.json> <輸出.json>
#   清單:[{ "odt": "...odt 路徑", "names": ["物件8", ...] }, ...]
#   輸出:{ "odt 路徑": { "物件8": "<table…>" 或 null, ... }, ... }
import json, sys, zipfile, re, html
import xml.etree.ElementTree as ET

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "draw": "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
    "style": "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
    "fo": "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
    "xlink": "http://www.w3.org/1999/xlink",
}
q = lambda p, n: "{%s}%s" % (NS[p], n)

CELL_STYLE = "border:1px solid #64748b;padding:4px 8px;vertical-align:middle"
TABLE_STYLE = "border-collapse:collapse;margin:6px 0;max-width:100%"


def text_styles(root):
    """automatic-styles 裡的文字樣式 → {名稱: {"u","b","sup","sub"}}"""
    out = {}
    for st in root.iter(q("style", "style")):
        props = st.find(q("style", "text-properties"))
        if props is None:
            continue
        f = set()
        u = props.get(q("style", "text-underline-style"))
        if u and u != "none":
            f.add("u")
        if props.get(q("fo", "font-weight")) == "bold":
            f.add("b")
        # text-position:「super 58%」「33% 58%」= 上標;「sub 58%」「-33% 58%」= 下標;「0% 100%」= 一般
        pos = (props.get(q("style", "text-position")) or "").strip()
        m = re.match(r"^(-?\d+)%", pos)
        if pos.startswith("super") or (m and int(m.group(1)) > 0):
            f.add("sup")
        elif pos.startswith("sub") or (m and int(m.group(1)) < 0):
            f.add("sub")
        out[st.get(q("style", "name"))] = f
    return out


class Unsupported(Exception):
    pass


def inline(el, styles, inherited=frozenset()):
    """段落/文字片段 → HTML(只允許文字、空白、換行、tab 與帶樣式的 span)"""
    parts = []
    if el.text:
        parts.append(html.escape(el.text))
    for ch in el:
        tag = ch.tag
        if tag == q("text", "span"):
            f = inherited | styles.get(ch.get(q("text", "style-name")), set())
            inner = inline(ch, styles, f)
            for t in ("sub", "sup", "b", "u"):
                if t in f and t not in inherited:
                    inner = "<%s>%s</%s>" % (t, inner, t)
            parts.append(inner)
        elif tag == q("text", "s"):
            parts.append("&nbsp;" * int(ch.get(q("text", "c"), "1")))
        elif tag == q("text", "tab"):
            parts.append("&emsp;")
        elif tag == q("text", "line-break"):
            parts.append("<br>")
        elif tag in (q("text", "soft-page-break"), q("text", "bookmark"), q("text", "bookmark-start"), q("text", "bookmark-end")):
            pass
        else:
            raise Unsupported(tag)  # 文字框、圖片、欄位…都不處理
        if ch.tail:
            parts.append(html.escape(ch.tail))
    return "".join(parts)


def cell_html(cell, styles, tagname):
    paras = []
    for ch in cell:
        if ch.tag in (q("text", "p"), q("text", "h")):
            f = styles.get(ch.get(q("text", "style-name")), set())
            inner = inline(ch, styles, frozenset(f))
            for t in ("sub", "sup", "b", "u"):
                if t in f:
                    inner = "<%s>%s</%s>" % (t, inner, t)
            paras.append(inner)
        else:
            raise Unsupported(ch.tag)  # 巢狀表格、清單…不處理
    attrs = ""
    cs = cell.get(q("table", "number-columns-spanned"))
    rs = cell.get(q("table", "number-rows-spanned"))
    if cs and cs != "1":
        attrs += ' colspan="%s"' % cs
    if rs and rs != "1":
        attrs += ' rowspan="%s"' % rs
    return '<%s%s style="%s">%s</%s>' % (tagname, attrs, CELL_STYLE, "<br>".join(paras), tagname)


def rows_html(container, styles, tagname="td"):
    out = []
    for ch in container:
        if ch.tag == q("table", "table-row"):
            cells = []
            for c in ch:
                if c.tag == q("table", "table-cell"):
                    cells.append(cell_html(c, styles, tagname))
                elif c.tag == q("table", "covered-table-cell"):
                    pass
                else:
                    raise Unsupported(c.tag)
            out.append("<tr>%s</tr>" % "".join(cells))
        elif ch.tag == q("table", "table-header-rows"):
            out.extend(rows_html(ch, styles, "th"))
        elif ch.tag in (q("table", "table-column"), q("table", "table-columns")):
            pass
        else:
            raise Unsupported(ch.tag)
    return out


def object_to_html(content_xml):
    root = ET.fromstring(content_xml)
    styles = text_styles(root)
    body = root.find("office:body/office:text", NS)
    if body is None:
        return None
    tables = []
    for ch in body:
        if ch.tag == q("table", "table"):
            tables.append('<table style="%s">%s</table>' % (TABLE_STYLE, "".join(rows_html(ch, styles))))
        elif ch.tag in (q("text", "sequence-decls"), q("text", "soft-page-break")):
            pass
        elif ch.tag == q("text", "p") and not "".join(ch.itertext()).strip() and len(ch) == 0:
            pass  # 空段落
        else:
            raise Unsupported(ch.tag)
    if not tables:
        return None
    return "".join(tables)


def frames(z):
    """主文件 content.xml:物件框名稱 → 內嵌物件資料夾(同名出現兩次以上的不收,避免對錯)"""
    root = ET.fromstring(z.read("content.xml"))
    seen, out = {}, {}
    for fr in root.iter(q("draw", "frame")):
        name = fr.get(q("draw", "name"))
        obj = fr.find(q("draw", "object"))
        seen[name] = seen.get(name, 0) + 1
        if obj is not None:
            out[name] = obj.get(q("xlink", "href")).lstrip("./").rstrip("/")
    return {k: v for k, v in out.items() if seen[k] == 1}


def main(list_path, out_path):
    jobs = json.load(open(list_path, encoding="utf-8"))
    result, stat = {}, {"ok": 0, "unsupported": 0, "missing": 0}
    for job in jobs:
        res = result.setdefault(job["odt"], {})
        try:
            z = zipfile.ZipFile(job["odt"])
        except Exception:
            for n in job["names"]:
                res[n] = None
                stat["missing"] += 1
            continue
        fm = frames(z)
        for n in job["names"]:
            path = fm.get(n)
            if not path:
                res[n] = None
                stat["missing"] += 1
                continue
            try:
                h = object_to_html(z.read(path + "/content.xml"))
            except (Unsupported, KeyError):
                h = None
            res[n] = h
            stat["ok" if h else "unsupported"] += 1
    json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    print(json.dumps(stat, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
