// Word EQ 功能變數 → HTML。
// 康軒 .doc 的分數、圈圈數字、線段上劃線、聯立方程式大括號都是 EQ 變數,
// LibreOffice/HTML 匯出時整個消失(題目變成「吃了全部的,」)。這裡把代碼轉回 HTML。
// 只處理題庫裡實際出現的語法;遇到看不懂或有歧義的,丟 EqUnsupported,呼叫端應讓該題保持隱藏。

export class EqUnsupported extends Error {}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const CLOSE = { "{": "}", "(": ")", "[": "]", "<": ">", "|": "|" };

/**
 * 解析一段 EQ 內容(去掉開頭的 "EQ")成節點:
 *   { t: "text", v } | { t: "cmd", name, mods: [{ name, arg }], args: [[節點...], ...] }
 */
function parse(src) {
  let i = 0;
  function seq(stopAtComma) {
    const out = [];
    let text = "";
    const flush = () => { if (text) out.push({ t: "text", v: text }); text = ""; };
    while (i < src.length) {
      const c = src[i];
      if (c === ")" || (stopAtComma && c === ",")) break;
      if (c === "\\") {
        const nx = src[i + 1];
        if (nx && /[a-zA-Z]/.test(nx)) { flush(); out.push(cmd()); continue; }
        // 跳脫字元:\, \( \) \\
        text += nx ?? ""; i += 2; continue;
      }
      if (c === "(") { // 沒有指令的括號:當一般文字
        // 括號必須成對;Word 純文字裡 Symbol 字型的符號(≦ 等)也會變成 "(",不成對就不能猜
        flush(); i++; const inner = seq(false);
        if (src[i] !== ")") throw new EqUnsupported(`括號不成對: ${src}`);
        i++;
        out.push({ t: "text", v: "(" }, ...inner, { t: "text", v: ")" }); continue;
      }
      text += c; i++;
    }
    flush();
    return out;
  }
  function word() {
    let w = ""; while (i < src.length && /[a-zA-Z]/.test(src[i])) w += src[i++];
    return w.toLowerCase();
  }
  function cmd() {
    i++; // '\'
    const name = word();
    const mods = [];
    // 修飾:\lc\{  \bc\|  \to  \ac  \up 6  \co2 …,直到 '('
    for (;;) {
      while (src[i] === " ") i++;
      if (src[i] === "\\" && /[a-zA-Z]/.test(src[i + 1] ?? "")) {
        i++; const m = word(); let arg = "";
        if (["lc", "rc", "bc"].includes(m) && src[i] === "\\") { arg = src[i + 1]; i += 2; }
        else { while (src[i] === " ") i++; while (/[0-9]/.test(src[i] ?? "")) arg += src[i++]; }
        mods.push({ name: m, arg });
        continue;
      }
      break;
    }
    const args = [];
    if (src[i] === "(") {
      i++;
      for (;;) {
        args.push(seq(true));
        if (src[i] === ",") { i++; continue; }
        if (src[i] !== ")") throw new EqUnsupported(`括號不成對: ${src}`);
        i++;
        break;
      }
    }
    return { t: "cmd", name, mods, args };
  }
  const nodes = seq(false);
  if (i < src.length) throw new EqUnsupported(`多出的右括號: ${src}`);
  return nodes;
}

const textOf = (nodes) => nodes.map((n) => (n.t === "text" ? n.v : "\u0000")).join("");
const isBlank = (nodes) => nodes.every((n) => n.t === "text" && !n.v.trim());

// 參數裡「字母/右括號後面緊接數字」可能是上標(x2 = x²)遺失格式 → 有歧義
function checkAmbiguous(nodes) {
  for (const n of nodes) {
    if (n.t === "text" && /[a-zA-Z)）][0-9]/.test(n.v)) throw new EqUnsupported(`可能含上標: ${n.v}`);
    if (n.t === "cmd") n.args.forEach(checkAmbiguous);
  }
}

function render(nodes) {
  return nodes.map((n) => (n.t === "text" ? esc(n.v.replace(/^\s+|\s+$/g, (m) => (m ? " " : "")).replace(/\s+/g, " ")) : renderCmd(n))).join("");
}

function renderCmd(n) {
  const mod = (k) => n.mods.find((m) => m.name === k);
  switch (n.name) {
    case "f": {
      if (n.args.length !== 2) throw new EqUnsupported("分數參數數量");
      return `<span class="frac"><span class="num">${render(n.args[0]).trim()}</span><span class="den">${render(n.args[1]).trim()}</span></span>`;
    }
    case "r": {
      if (n.args.length === 1) return `<span class="sqrt">√<span class="rad">${render(n.args[0]).trim()}</span></span>`;
      if (n.args.length === 2 && isBlank(n.args[0])) return `<span class="sqrt">√<span class="rad">${render(n.args[1]).trim()}</span></span>`;
      if (n.args.length === 2) return `<span class="sqrt"><sup>${render(n.args[0]).trim()}</sup>√<span class="rad">${render(n.args[1]).trim()}</span></span>`;
      throw new EqUnsupported("根號參數數量");
    }
    case "o": { // 疊字:\o\ac(○,1) 圈圈數字;\o(,)\F(…) 空疊字(排版用)
      const nonBlank = n.args.filter((a) => !isBlank(a));
      if (nonBlank.length === 0) return "";
      if (nonBlank.length === 2 && textOf(nonBlank[0]).trim() === "○") {
        const v = textOf(nonBlank[1]).trim();
        const num = Number(v);
        if (/^\d+$/.test(v) && num >= 1 && num <= 20) return CIRCLED[num - 1];
        throw new EqUnsupported(`圈圈內容: ${v}`);
      }
      // 疊一條斜線 = 約分時把數字劃掉(\o\ac(＼,－12) 或 \o\ac(3,＼))
      const SLASH = /^[＼／\/]$/;
      if (nonBlank.length === 2 && nonBlank.some((a) => SLASH.test(textOf(a).trim()))) {
        const other = nonBlank.find((a) => !SLASH.test(textOf(a).trim()));
        if (other) return `<span class="cancel">${render(other).trim()}</span>`;
      }
      // 疊一個方框 = 框起來的字(\o\ac(□,x))
      if (nonBlank.length === 2 && /^[□口]$/.test(textOf(nonBlank[0]).trim())) {
        return `<span class="boxed">${render(nonBlank[1]).trim()}</span>`;
      }
      // 疊一條橫線 = 線段上劃線(\o\ac(¯¯¯, AB))
      if (nonBlank.length === 2 && /^[¯‾￣—─－]+$/.test(textOf(nonBlank[0]).trim())) {
        return `<span class="ovl">${render(nonBlank[1]).trim()}</span>`;
      }
      // 疊一個弧形(︵ 或 \s\up8(︵))= 弧 AB:跨過字母的弧線
      const arcOf = (a) => {
        if (/^[︵⌒⏜]$/.test(textOf(a).trim())) return true;
        const cmd = a.filter((x) => !(x.t === "text" && !x.v.trim()));
        return cmd.length === 1 && cmd[0].t === "cmd" && cmd[0].name === "s" && cmd[0].args.length === 1 && /^[︵⌒⏜]$/.test(textOf(cmd[0].args[0]).trim());
      };
      if (nonBlank.length === 2 && arcOf(nonBlank[0])) {
        return `<span style="display:inline-block;border-top:1.5px solid currentColor;border-radius:50% 50% 0 0/6px 6px 0 0;padding:1px 1px 0;line-height:1.1">${render(nonBlank[1]).trim()}</span>`;
      }
      // 疊一個箭頭(\s\up8(←→) = 直線、\s\up8(－→) / ( →) = 射線,2026-10-08):字母上方畫箭頭。
      // 用行內樣式(不必改網站 CSS / 部署),寫法比照上面的弧。
      const arrowOf = (a) => {
        const cmd = a.filter((x) => !(x.t === "text" && !x.v.trim()));
        const s = cmd.length === 1 && cmd[0].t === "cmd" && cmd[0].name === "s" && cmd[0].args.length === 1 ? textOf(cmd[0].args[0]) : textOf(a);
        const v = s.replace(/[\s　]/g, "");
        if (/^(←→|↔)$/.test(v)) return "↔";
        if (/^(－→|-→|—→|→)$/.test(v)) return "→";
        return null;
      };
      if (nonBlank.length === 2 && arrowOf(nonBlank[0])) {
        return `<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:bottom;line-height:1"><span style="font-size:0.75em;line-height:0.7">${arrowOf(nonBlank[0])}</span><span>${render(nonBlank[1]).trim()}</span></span>`;
      }
      // ＝ 與 ～ 疊在一起 = 全等符號
      if (nonBlank.length === 2 && new Set(nonBlank.map((a) => textOf(a).trim())).size === 2 &&
          nonBlank.every((a) => /^[＝=～~]$/.test(textOf(a).trim()))) return "≅";
      // 疊一個全形空白與內容(\o\ac(　,\F(1,4)))= 只是內容
      const visible = nonBlank.filter((a) => textOf(a).replace(/[\s　]/g, "") !== "");
      if (visible.length === 1) return render(visible[0]);
      throw new EqUnsupported("多層疊字");
    }
    case "x": { // 框線:只支援 \to(上劃線 = 線段 AB)
      if (n.mods.length === 1 && /^to/.test(n.mods[0].name) && n.args.length === 1) return `<span class="ovl">${render(n.args[0]).trim()}</span>`;
      throw new EqUnsupported("框線樣式");
    }
    case "b": { // 括號:\b\lc\{(…) 左大括號、\b\bc\|(…) 絕對值
      if (n.args.length !== 1) throw new EqUnsupported("括號參數數量");
      const lc = mod("lc")?.arg, rc = mod("rc")?.arg, bc = mod("bc")?.arg;
      const L = bc ?? lc ?? "(";
      const R = bc ? CLOSE[bc] ?? bc : rc ?? (lc ? "" : ")");
      const inner = render(n.args[0]);
      if (/class="arr"/.test(inner)) {
        return `<span class="brace">${L === "{" ? `<span class="lb">{</span>` : esc(L)}${inner}${R ? esc(R) : ""}</span>`;
      }
      return `${esc(L)}${inner}${R ? esc(R) : ""}`;
    }
    case "a": { // 陣列:\a\al(列1,列2) 聯立方程式
      if (mod("co")) throw new EqUnsupported("多欄陣列");
      return `<span class="arr">${n.args.map((r) => `<span>${render(r).trim()}</span>`).join("")}</span>`;
    }
    case "s": { // \s\up n(x) 上標;\s\do n(x) 下標(單獨出現時)
      if (n.args.length !== 1) throw new EqUnsupported("上下標參數");
      if (mod("up")) return `<sup>${render(n.args[0]).trim()}</sup>`;
      if (mod("do")) return `<sub>${render(n.args[0]).trim()}</sub>`;
      throw new EqUnsupported("\\s 樣式");
    }
    default:
      throw new EqUnsupported(`不支援的指令 \\${n.name}`);
  }
}

/** EQ 代碼(含或不含開頭 "EQ")→ HTML;看不懂丟 EqUnsupported */
export function eqToHtml(code) {
  const body = code.trim().replace(/^\\?eq\s*/i, "");
  const nodes = parse(body);
  checkAmbiguous(nodes);
  return render(nodes).trim();
}
