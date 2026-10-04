// 選擇題「選項順序 / 答案」對照 Word 原檔(2026-10-04 最終品質檢查,唯讀)
// 原檔全文來自 data/eq-text(export-eq-text.ps1 匯出,5 科都有)。依題號找區塊,
// 依 (A)(B)(C)(D) 標記切出原檔選項,與資料庫選項逐一比對(忽略空白、標籤、全半形);
// 再比對《答案》字母與資料庫 answer。題組小題(-g)與會考真題拆題結構不同,只比答案不比選項。
// 用法:node scripts/qa-vs-source.mjs [--out <json>]
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll } from "./lib/rest.mjs";

const outIdx = process.argv.indexOf("--out");
const ZH = { chinese: "國文", english: "英文", social: "社會", math: "數學", science: "自然" };

function walk(d) {
  return fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : [];
}
// 每科:題號 → 區塊(同題號可能出現在多個檔,全部保留)
const blocks = new Map();
for (const [subj, zh] of Object.entries(ZH)) {
  for (const f of walk(path.join(ROOT, "data", "eq-text", zh))) {
    const T = fs.readFileSync(f, "utf8");
    const rel = path.relative(path.join(ROOT, "data", "eq-text", zh), f).replace(/\\/g, "/");
    const src = `${rel.split("/")[0]}/${path.basename(rel).replace(/\.doc\.txt$/, "")}`;
    for (const p of T.split("題號：").slice(1)) {
      const m = p.match(/^\s*(\d+)/);
      if (!m) continue;
      const k = `${subj}-${m[1]}`;
      if (!blocks.has(k)) blocks.set(k, []);
      blocks.get(k).push({ src, text: p });
    }
  }
}

// 正規化:去掉 Word 功能變數(EQ 已補成 HTML 的部分兩邊都拿掉)、標籤、空白、全形轉半形、私用區
const stripFields = (t) => t.replace(/\x13[^\x14\x15]*(?:\x14([^\x15]*))?\x15/g, "$1");
const N = (s) => String(s ?? "")
  .replace(/<span class="(?:frac|sqrt|ovl|brace|arr|cancel|boxed)"[\s\S]*?<\/span>(?:<\/span>)*/g, "")
  .replace(/<[^>]+>/g, "").replace(/&[a-z]+;|&#\d+;/g, "")
  .replace(/[-①-⑳❶-❹⇒⇔≅°′≤≥⊥∠π±×÷−|△→]/g, "")
  .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  .replace(/[\s　\x00-\x1f。．.]/g, "")
  .replace(/[“”"']/g, "");

const rows = await fetchAll("questions?select=id,subject,source,question,options,answer&needs_review=eq.false&type=eq.single_choice&order=id");
const res = { 選項與原檔一致: 0, 答案與原檔一致: 0, 找不到原檔區塊: [], 選項不一致: [], 答案不一致: [], 原檔切不出選項: [] };
const LET = "ABCDE";
for (const q of rows) {
  const m = q.id.match(/^([a-z]+)-(\d+)(-g\d+|-\d+)?$/);
  if (!m) continue;
  const cands = (blocks.get(`${m[1]}-${m[2]}`) ?? []).filter((b) => b.src === q.source);
  if (!cands.length) { res.找不到原檔區塊.push(q.id); continue; }
  const isSub = !!m[3];
  let best = null;
  for (const b of cands) {
    const t = stripFields(b.text).replace(/[Ａ-Ｅ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    const ans = t.match(/《答案》\s*([A-E])/)?.[1];
    const body = t.split("《答案》")[0];
    const marks = [];
    let cur = 0;
    for (let i = 0; i < (q.options?.length ?? 0); i++) {
      const re = new RegExp(`[（(]\\s*${LET[i]}\\s*[）)]`, "g");
      re.lastIndex = cur;
      const mm = re.exec(body);
      if (!mm) break;
      marks.push([mm.index, mm.index + mm[0].length]);
      cur = mm.index + mm[0].length;
    }
    const opts = marks.length === q.options.length
      ? marks.map(([, e], i) => body.slice(e, i + 1 < marks.length ? marks[i + 1][0] : body.length))
      : null;
    best = { ans, opts };
    if (opts && opts.every((o, i) => N(o) === N(q.options[i]))) break;
  }
  if (best.ans) {
    if (LET.indexOf(best.ans) === q.answer) res.答案與原檔一致++;
    else res.答案不一致.push(`${q.id} 原檔${best.ans} 資料庫${LET[q.answer] ?? q.answer}`);
  }
  if (isSub) continue;
  if (!best.opts) { res.原檔切不出選項.push(q.id); continue; }
  const bad = best.opts.map((o, i) => (N(o) === N(q.options[i]) ? null : i)).filter((x) => x !== null);
  // 分類:原檔純文字讀不到 Word 方程式物件(EMBED),所以「資料庫比原檔多」是正常;
  // 「資料庫比原檔少」才代表資料庫缺字。會考出處標記/圖號另外歸類。
  const isSubseq = (a, b) => { let j = 0; for (const c of b) if (c === a[j]) j++; return j === a.length; };
  const tag = (x) => x.replace(/【[^】]*】|圖[(（][^)）]*[)）]?|[(（]\d+[)）]$/g, "");
  if (bad.length) {
    const kinds = bad.map((i) => {
      // Word 純文字裡 Symbol 字型符號會變成「(」、內嵌圖片會變成「/」→ 分類時括號、斜線都忽略
      const loose = (x) => x.replace(/[()/]/g, "");
      const so = loose(N(best.opts[i])), db = loose(N(q.options[i]));
      if (so === db) return "資料庫較完整";
      if (tag(so) === tag(db)) return "出處標記或圖號";
      if (isSubseq(so, db)) return "資料庫較完整";
      if (isSubseq(db, so)) return "資料庫缺字";
      return "內容不同";
    });
    const worst = ["資料庫缺字", "內容不同", "出處標記或圖號", "資料庫較完整"].find((k) => kinds.includes(k));
    (res[`選項差異:${worst}`] ??= []).push(`${q.id} 原檔「${N(best.opts[bad[0]]).slice(0, 24)}」 資料庫「${N(q.options[bad[0]]).slice(0, 24)}」`);
  }
  if (!bad.length) res.選項與原檔一致++;
  else res.選項不一致.push(`${q.id} (${bad.map((i) => LET[i]).join("")}) 原檔「${N(best.opts[bad[0]]).slice(0, 20)}」 資料庫「${N(q.options[bad[0]]).slice(0, 20)}」`);
}
console.log(`可見選擇題 ${rows.length} 題`);
for (const [k, v] of Object.entries(res)) console.log(`${k}:${Array.isArray(v) ? v.length + "  例:" + v.slice(0, 4).join(" ; ") : v}`);
if (outIdx !== -1) fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify(res, null, 1), "utf8");
