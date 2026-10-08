// 局部補回遺失的 Word EQ 公式(2026-10-07 全面稽核)
// 背景:restore-eq-fields.mjs 要求整個欄位「去掉 EQ 後與原檔逐字相同」才補,有一點差異就整題跳過;
//       而且「答案」欄(answer_text)是後來才從題幹拆出來的,從來沒補過 → 可見題有大量分數/線段/根號整段不見。
// 做法(每個欄位獨立):
//   原檔區段(data/eq-text 的 Word 全文,EQ 不算字元)切成 題幹 | 各選項 | 《答案》~詳解 | 詳解 之後;
//   欄位文字與對應區段做「最長共同子字串」遞迴對齊(同 difflib);
//   某個 EQ 位置 pos 若 左邊字(pos-1)與右邊字(pos)在資料庫裡正好相鄰(或在區段頭尾)→ 這裡缺了公式 → 插入 eqToHtml(代碼)。
//   公式本來就在的地方,左右字之間夾著公式內容,不相鄰 → 不會重複插入。
// 輸出 data/rerender/formula-audit/repair-plan.json:[{id, field, before, after, inserted:[代碼], skipped:[原因]}]
// 用法:node scripts/repair-formula-gaps.mjs [--subject math|science] [--ids a,b] → 只產生計畫(乾跑)
//       寫入由 scripts/apply-formula-repair.mjs 處理(要先看圖驗證)
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/rest.mjs";
import { eqToHtml } from "./lib/eq-field.mjs";
import { MAP } from "./lib/symbol-chars.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i === -1 ? null : process.argv[i + 1]; };
const SUBJ = arg("--subject");
const IDS = arg("--ids") ? new Set(arg("--ids").split(",")) : null;
const OUT = path.join(ROOT, "data/rerender/formula-audit");

// ── 與 eq-restore-core 相同的正規化與 HTML 位置對照 ──
const norm = (ch) => {
  if (/[\s　 ]/.test(ch)) return "";
  if (/[-]/.test(ch)) return "(";
  if (ch === "（") return "(";
  if (ch === "）") return ")";
  if (/[Ａ-Ｅ]/.test(ch)) return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  return ch;
};
const decode = (e) =>
  ({ "&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'" })[e] ??
  (e.startsWith("&#x") ? String.fromCodePoint(parseInt(e.slice(3, -1), 16)) : e.startsWith("&#") ? String.fromCodePoint(+e.slice(2, -1)) : e);
function mapHtml(html) {
  let s = "";
  const starts = [], ends = [];
  const re = /<[^>]*>|&[#a-z0-9]+;|[\s\S]/gi;
  for (let m; (m = re.exec(html)); ) {
    const tok = m[0];
    if (tok.startsWith("<") && tok.length > 1) continue;
    const n = norm(tok.length > 1 && tok.startsWith("&") ? decode(tok) : tok);
    if (!n) continue;
    s += n; starts.push(m.index); ends.push(m.index + tok.length);
  }
  return { s, starts, ends };
}
// 插在「第 j 個字之前」:j=0 → 第一個字開始處;否則前一字結束處並跳過緊接的結束標籤(避免包進 <sup>)
function insertPos(html, map, j) {
  if (j === 0) return map.starts.length ? map.starts[0] : html.length;
  let p = map.ends[j - 1];
  for (let m; (m = /^<\/[^>]+>/.exec(html.slice(p))); ) p += m[0].length;
  return p;
}

// Word 純文字把 Symbol 字型符號(⇒ ≦ ∠ …)讀成 "(",資料庫已換成正確符號 → 原檔的 "(" 可對到這些符號
const SYM = new Set(Object.values(MAP));
const same = (x, y) => x === y || (x === "(" && SYM.has(y));
// ── 最長共同子字串遞迴對齊(Ratcliff/Obershelp,同 Python difflib)→ a 的每個位置對到 b 的位置或 -1 ──
function align(a, b) {
  const ma = new Array(a.length).fill(-1);
  const rec = (alo, ahi, blo, bhi) => {
    if (alo >= ahi || blo >= bhi) return;
    let best = 0, bi = 0, bj = 0;
    let prev = new Array(bhi - blo + 1).fill(0);
    for (let i = alo; i < ahi; i++) {
      const cur = new Array(bhi - blo + 1).fill(0);
      for (let j = blo; j < bhi; j++) {
        if (same(a[i], b[j])) {
          const v = prev[j - blo] + 1;
          cur[j - blo + 1] = v;
          if (v > best) { best = v; bi = i - v + 1; bj = j - v + 1; }
        }
      }
      prev = cur;
    }
    if (!best) return;
    for (let k = 0; k < best; k++) ma[bi + k] = bj + k;
    rec(alo, bi, blo, bj);
    rec(bi + best, ahi, bj + best, bhi);
  };
  rec(0, a.length, 0, b.length);
  return ma;
}

// 選項標記 (A)…(H) 在 s 的位置
function optionMarkers(s, start, end, n) {
  const pos = [];
  let cur = start;
  for (let k = 0; k < n; k++) {
    const p = s.indexOf(`(${"ABCDEFGH"[k]})`, cur);
    if (p === -1 || p >= end) return null;
    pos.push(p); cur = p + 3;
  }
  return pos;
}

// EQ 代碼 → 畫面上會出現的內容字元(去掉開關、跳脫、語法用的括號逗號),用來判斷公式是否已經在資料庫裡
const eqContent = (code) =>
  [...code.replace(/^\s*\\?eq\s*/i, "").replace(/\\[a-zA-Z]+-?\d*/g, "").replace(/\\/g, "")]
    .map(norm).join("").replace(/[(),]/g, "");

// ── 原檔 token(scripts/export-formula-tokens.py 從 docx 匯出):字串 | {eq: 代碼(上標以 \ue000…\ue001 標出)} | {om: OMML 轉好的 HTML}
const TOKENS = JSON.parse(fs.readFileSync(path.join(OUT, "tokens.json"), "utf8"));
/** token 陣列 → { s: 正規化字串, eqAt: Map<位置, 公式 token[]> }(公式記在它後面那個字的位置) */
function flatten(tokens) {
  let s = "";
  const eqAt = new Map();
  let space = false; // 上一個公式之後只隔著空白/換行(正規化後同一位置)→ 補回時中間留一個空格,避免「BC」「AC」黏成一條線段
  for (const t of tokens) {
    if (typeof t === "string") {
      const before = s.length;
      for (const c of t.replace(/[\ue000-\ue003]/g, "")) s += norm(c); // 上下標標記不參與對齊
      space = s.length === before ? space || /\s/.test(t) : false;
      continue;
    }
    if (!eqAt.has(s.length)) eqAt.set(s.length, []);
    const list = eqAt.get(s.length);
    list.push(list.length && space ? { ...t, sp: true } : t);
    space = false;
  }
  return { s, eqAt };
}
const label = (t) => t.eq ?? (t.om ? "OMML" : `OMML?${t.omx}`);
/** 公式 token → 畫面上會出現的內容字元(判斷公式是否已在資料庫裡用) */
// 全等符號 ≅ = EQ 把「＝」「～」疊在一起(\O(＝,～)、\o\ac(＝,～),全庫 75 個)
const IS_CONG = (t) => t.eq && /^\s*\\?eq\s*\\o(\\ac)?\(\s*[＝=]\s*,\s*[～~]\s*\)\s*$/i.test(t.eq);
function tokContent(t) {
  if (IS_CONG(t)) return "≅"; // 不用「＝～」比對,否則資料庫殘留的「＝」會被當成公式已存在
  if (t.om) return [...t.om.replace(/<[^>]+>/g, "").replace(/&[#a-z0-9]+;/gi, " ")].map(norm).join("");
  if (t.eq) return eqContent(t.eq.replace(/[\ue000\ue001]/g, ""));
  return "";
}
/** 公式 token → HTML */
function tokHtml(t) {
  if (t.om) return t.om;
  if (!t.eq) throw new Error(`OMML 轉不了:${t.omx}`);
  const h = eqToHtml(t.eq.replace(/^\s*\\?eq\s*/i, "EQ ")).replace(/\ue000([^\ue001]*)\ue001/g, "<sup>$1</sup>");
  if (/[\ue000\ue001]/.test(h)) throw new Error("上標標記無法轉換");
  return h;
}

function repairField(html, flat, from, to) {
  // 公式遺失處常留下看不見的控制字元(\x07\x03\x08 等,數學詳解/答案 691 處)→ 先清掉,左右字才會相鄰
  const raw = html;
  html = html.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]+/g, "");
  const map = mapHtml(html);
  if (!map.s) {
    // 欄位只剩控制字元(例:答案「\x07\x03\x08」):原檔這段如果「全部都是公式、沒有任何一般字」→ 整段補回
    const plain = flat.s.slice(from, to);
    const eqs = [...flat.eqAt].filter(([p]) => p >= from && p <= to).flatMap(([, l]) => l);
    if (plain || !eqs.length || html.trim()) return { html: raw, inserted: [], skipped: [] };
    try {
      const h = eqs.map((t, i) => (i && t.sp ? " " : "") + tokHtml(t)).join("");
      return { html: h, marked: `<mark class="ins">${h}</mark>`, inserted: eqs.map(label), skipped: [] };
    } catch (e) { return { html: raw, inserted: [], skipped: [`${eqs.map(label).join(" ")}:${e.message}`] }; }
  }
  // 原檔區段「含公式內容字元」:ch 陣列 + 每個字屬於第幾個公式(-1 = 一般字)
  const ch = [], grp = [], groups = [];
  for (let pos = from; pos <= to; pos++) {
    const eqs = flat.eqAt.get(pos);
    if (eqs) {
      const g = groups.length;
      const content = eqs.map(tokContent).join("");
      groups.push({ eqs, start: ch.length, len: content.length });
      for (const c of content) { ch.push(c); grp.push(g); }
    }
    if (pos < to) { ch.push(flat.s[pos]); grp.push(-1); }
  }
  const m = align(ch, map.s); // 區段位置 → 欄位位置
  if (process.env.DEBUG_REPAIR) console.log(JSON.stringify({ region: ch.join(""), field: map.s, m: m.join(","), groups: groups.map((g) => [g.start, g.len]) }));
  // 一般字至少要有一半對得到,才算「這個欄位就是這段」
  const plainHit = m.filter((x, i) => x >= 0 && grp[i] === -1).length;
  const plainN = grp.filter((g) => g === -1).length;
  if (plainHit < Math.min(map.s.length, plainN) * 0.5) return { html: raw, inserted: [], skipped: [`欄位與原檔區段對不上(${plainHit}/${map.s.length})`] };
  // 備援:只用一般字對齊一次(公式內容字元不參與)。用途:「－4[¾]、」對「－4、」時,含內容的對齊會把 ¾ 的 4
  // 對到資料庫的 4,誤判公式已存在;只看一般字時 4 與「、」相鄰 → 確實缺。為防重複,插入點前後不可已有同樣內容。
  const pIdx = grp.map((g, i) => (g === -1 ? i : -1)).filter((i) => i >= 0);
  const mpRaw = align(pIdx.map((i) => ch[i]), map.s);
  const mP = new Array(ch.length).fill(-1);
  pIdx.forEach((i, k) => { mP[i] = mpRaw[k]; });
  const ins = [], skipped = [];
  for (const { eqs, start, len } of groups) {
    if (!len) continue; // 沒有內容字元,無法判斷是否已存在
    const li = start - 1, ri = start + len; // 左右鄰字(必須是一般字)
    let mm = m, fallback = false;
    if (m.slice(start, start + len).some((x) => x >= 0)) {
      // 公式(至少一部分)看起來已在資料庫裡 → 用只看一般字的對齊再確認
      const l = li < 0 ? null : (grp[li] === -1 ? mP[li] : -2), r = ri >= ch.length ? null : (grp[ri] === -1 ? mP[ri] : -2);
      if (!(l !== null && r !== null && l >= 0 && r === l + 1)) continue;
      // 只用在短的單一分數(帶分數 −4¾ 這種);長公式(聯立式等)備援會重複插入(試過:14 題多出字)
      if (eqs.length !== 1 || !eqs[0].eq || !/^\s*\\?eq\s*\\f\(/i.test(eqs[0].eq) || len > 6) continue;
      // 再收緊成「帶分數」:左鄰字是數字(整數部分)、分數內容全是數字(試過不限:0942216 等 4 題補錯位置)
      if (!/[0-9]/.test(ch[li] ?? "") || !/^[0-9]+$/.test(ch.slice(start, start + len).join(""))) continue;
      const c = ch.slice(start, start + len).join("");
      if (map.s.slice(r - c.length, r) === c || map.s.slice(r, r + c.length) === c || map.s.slice(Math.max(0, r - 12), r + 12).includes(c)) continue;
      mm = mP; fallback = true;
    }
    const left = li < 0 ? null : (grp[li] === -1 ? mm[li] : -2);
    const right = ri >= ch.length ? null : (grp[ri] === -1 ? mm[ri] : -2);
    // ≅ 被轉成「＝」:左右鄰字在資料庫中間正好夾一個「＝」→ 把它換成 ≅(取代,不是插入)
    if (eqs.length === 1 && IS_CONG(eqs[0]) && left !== null && right !== null && left >= 0 && right === left + 2 && /[＝=]/.test(map.s[left + 1])) {
      const k = left + 1;
      ins.push({ at: map.starts[k], del: map.ends[k] - map.starts[k], h: "≅", code: label(eqs[0]) + "(取代＝)" });
      continue;
    }
    let j = null;
    // 注意:JS 的 null >= 0 是 true,一定要先排除 null
    if (left !== null && right !== null && left >= 0 && right >= 0) { if (right === left + 1) j = right; }
    else if (left === null && right === 0) j = 0;                         // 區段開頭
    else if (right === null && left === map.s.length - 1) j = map.s.length; // 區段結尾
    // 原檔公式後面還有資料庫已拿掉的字(例「【會112】」),但那些字一個都沒對到 → 等同欄位結尾;開頭同理
    else if (left !== null && left === map.s.length - 1 && mm.slice(ri).every((x) => x < 0)) j = map.s.length;
    else if (right === 0 && mm.slice(0, Math.max(0, li + 1)).every((x) => x < 0)) j = 0;
    if (j === null) continue; // 位置不確定
    // (試過「左右鄰字要錨定」規則:擋掉 55% 正確插入,改靠逐題看圖複核把放錯的題目排除)
    // 缺口裡夾著圖片(公式可能是以圖片呈現)→ 不插,避免同一個公式出現兩次
    const gapFrom = j === 0 ? 0 : map.ends[j - 1], gapTo = j === map.s.length ? html.length : map.starts[j];
    if (/<img/i.test(html.slice(gapFrom, gapTo))) { skipped.push(`缺口有圖片:${eqs.map(label).join(" ")}`); continue; }
    let h = "";
    try {
      for (const t of eqs) h += (t.sp ? " " : "") + tokHtml(t);
    } catch (e) { skipped.push(`${eqs.map(label).join(" ")}:${e.message}`); continue; }
    if (!h) continue;
    ins.push({ at: insertPos(html, map, j), h, code: eqs.map(label).join(" ") + (fallback ? "(備援對齊)" : "") });
  }
  ins.sort((a, b) => b.at - a.at);
  let out = html;
  let marked = html; // 複核用:補進去的公式包 <mark class="ins">
  for (const { at, h, del = 0 } of ins) { out = out.slice(0, at) + h + out.slice(at + del); marked = marked.slice(0, at) + `<mark class="ins">${h}</mark>` + marked.slice(at + del); }
  return { html: out, marked, inserted: ins.map((x) => x.code).reverse(), skipped };
}

const db = JSON.parse(fs.readFileSync(path.join(OUT, "db.json"), "utf8"));
// 指定 --ids 時連隱藏題也處理(救回之前因公式缺漏而隱藏的題目)
// --with-hidden <json 陣列檔>:可見題之外,再加入這些(已隱藏)題目一起處理
const WITH = arg("--with-hidden") ? new Set(JSON.parse(fs.readFileSync(arg("--with-hidden"), "utf8"))) : new Set();
const rows = db.filter((q) => (IDS ? IDS.has(q.id) : !q.needs_review || WITH.has(q.id)) && (!SUBJ || q.subject === SUBJ));
const plan = [];
const stat = { 題目: 0, 有原檔: 0, 有補: 0, 欄位補: 0, 公式: 0, 跳過: 0 };
for (const q of rows) {
  const mm = q.id.match(/^(math|science)-(\d{7})/);
  if (!mm) continue;
  stat.題目++;
  const [folder, name] = (q.source ?? "").split("/");
  const toks = TOKENS[`${mm[1]}|${folder}|${q.volume ?? ""}|${name}`]?.[mm[2]];
  if (!toks) continue; // 找不到原檔或題號
  const flat = flatten(toks), s = flat.s;
  if (!flat.eqAt.size) continue; // 這題原檔沒有公式
  stat.有原檔++;
  const ans = s.indexOf("《答案》");
  const ds = ans === -1 ? -1 : s.indexOf("詳解：", ans);
  const qEnd = ans === -1 ? s.length : ans;
  const isGroupChild = /-g\d+$/.test(q.id);
  const fields = [];
  const optPos = !isGroupChild && q.options?.length ? optionMarkers(s, 0, qEnd, q.options.length) : null;
  if (q.question) fields.push(["question", null, 0, optPos ? optPos[0] : qEnd]);
  if (q.passage) fields.push(["passage", null, 0, qEnd]);
  if (optPos) q.options.forEach((o, k) => fields.push(["options", k, optPos[k] + 3, k + 1 < optPos.length ? optPos[k + 1] : qEnd]));
  if (q.answer_text && ans !== -1) fields.push(["answer_text", null, ans + 4, ds === -1 ? s.length : ds]);
  if (q.explanation && ds !== -1) fields.push(["explanation", null, ds + 3, s.length]);
  let any = false;
  for (const [f, k, from, to] of fields) {
    const before = k === null ? q[f] : q[f][k];
    if (!before) continue;
    const r = repairField(before, flat, from, to);
    stat.跳過 += r.skipped.length;
    if (!r.inserted.length && !r.skipped.length) continue;
    if (r.inserted.length) { stat.欄位補++; stat.公式 += r.inserted.length; any = true; }
    plan.push({ id: q.id, field: f, k, before, after: r.html, marked: r.marked, inserted: r.inserted, skipped: r.skipped });
  }
  if (any) stat.有補++;
}
fs.writeFileSync(path.join(OUT, `repair-plan${SUBJ ? "-" + SUBJ : ""}.json`), JSON.stringify(plan, null, 1));
console.log(stat);
