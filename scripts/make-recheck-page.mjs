// 公式複核頁(2026-10-07):左 = 資料庫內容用網站實際 CSS(.frac/.sqrt/.ovl…)顯示,右 = Word 原檔裁圖。
// 起因:sci-compare-sheets.py 的 conv() 只處理 sup/sub,把 .frac 標籤直接拿掉 → 6/35 看起來像「635」,造成誤判。
// 用法:node scripts/make-recheck-page.mjs <輸出資料夾名> <裁圖資料夾名> <items.json…>
//   items.json = {items:[{id, verdict?, why?}]} 或 [{id}];輸出 data/rerender/<輸出>/page-NN.html(每頁 12 題)
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll } from "./lib/rest.mjs";

const [outName, cropName, ...files] = process.argv.slice(2);
const items = files.flatMap((f) => { const j = JSON.parse(fs.readFileSync(f, "utf8")); return Array.isArray(j) ? j : j.items; });
const css = fs.readFileSync(path.join(ROOT, "web/src/app/globals.css"), "utf8");
const eqCss = css.slice(css.indexOf(".qhtml sup"), css.indexOf("/* 清單預覽"));
const pub = "file:///" + path.join(ROOT, "web/public").replace(/\\/g, "/");
const fix = (h) => (h ?? "").replace(/src="\//g, `src="${pub}/`);

// ROWS_JSON=<檔>:改用本機題目陣列(例如套用修正計畫、補上的公式包 <mark class="ins"> 的版本),不查資料庫
const rows = process.env.ROWS_JSON ? JSON.parse(fs.readFileSync(process.env.ROWS_JSON, "utf8")) : [];
for (let i = 0; !process.env.ROWS_JSON && i < items.length; i += 80) {
  const ids = items.slice(i, i + 80).map((x) => encodeURIComponent(x.id));
  rows.push(...(await fetchAll(`questions?select=*&id=in.(${ids.join(",")})`)));
}
const byId = new Map(rows.map((q) => [q.id, q]));
// EXPL_FROM=<備份.json>:資料庫詳解已清空時,改顯示備份裡的原詳解(標〔備份詳解〕)
const bak = process.env.EXPL_FROM ? new Map(JSON.parse(fs.readFileSync(process.env.EXPL_FROM, "utf8")).map((r) => [r.id, r.explanation])) : new Map();
const outDir = path.join(ROOT, "data/rerender", outName);
fs.mkdirSync(outDir, { recursive: true });
const L = "ABCDEFGH";
const card = (it, n) => {
  const q = byId.get(it.id);
  if (!q) return `<section><h2>#${n} ${it.id} — 資料庫找不到</h2></section>`;
  const opts = (q.options ?? []).map((o, k) => `<li${k === q.answer ? ' class="ans"' : ""}>(${L[k]}) ${fix(o)}</li>`).join("");
  return `<section><h2>#${n} ${q.id} ${q.needs_review ? "〔隱藏〕" : "〔可見〕"}${it.verdict ? ` 上次:${it.verdict}/${it.expl ?? ""}` : ""}</h2>
<div class="row"><div class="db qhtml">
${q.passage ? `<div class="psg">${fix(q.passage)}</div>` : ""}<div>${fix(q.question)}</div><ol>${opts}</ol>
${q.answer_text ? `<div>答:${fix(q.answer_text)}</div>` : ""}<div class="ex">詳解:${q.explanation ? fix(q.explanation) : bak.get(q.id) ? "〔備份詳解〕" + fix(bak.get(q.id)) : "(無)"}</div></div>
<div class="src"><img src="../${cropName}/${q.id}.png"></div></div></section>`;
};
const PER = 12;
for (let p = 0; p * PER < items.length; p++) {
  const body = items.slice(p * PER, (p + 1) * PER).map((it, k) => card(it, p * PER + k + 1)).join("\n");
  fs.writeFileSync(path.join(outDir, `page-${String(p + 1).padStart(2, "0")}.html`), `<!doctype html><meta charset="utf-8"><style>
body{font:16px/1.6 "Microsoft JhengHei",sans-serif;margin:8px;background:#fff;color:#000}
section{border-top:3px solid #333;padding:4px 0 10px}h2{font-size:15px;margin:2px 0;color:#a00}
.row{display:flex;gap:10px}.db{flex:1;min-width:0}.src{flex:1}.src img{max-width:100%}
.db img{max-width:100%}ol{list-style:none;padding-left:0;margin:4px 0}.ans{background:#ffe08a}.ex{color:#035;font-size:14px;margin-top:4px}
.psg{background:#f3f3f3}mark.ins{background:#ffe600;outline:1px solid #e0a800}
${eqCss}</style>${body}`);
}
console.log(`${items.length} 題 → ${outDir}(${Math.ceil(items.length / PER)} 頁);資料庫找不到 ${items.filter((x) => !byId.has(x.id)).length}`);
