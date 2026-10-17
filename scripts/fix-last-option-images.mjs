// 附圖跑進最後一個選項(2026-10-16):原檔把題目附圖排在選項下面,轉檔時黏到最後一個選項文字後面
// (例 math-0811107「如圖,長方形 ABCD…」圖卻在「(D)74 [圖]」;social-0810729「(D)屏東平原;丙。(甲)[圖](乙)[圖](丙)[圖]」)。
// 條件:最後選項 = 文字 + 結尾一串圖(可帶「(甲)」「圖(一)」等標籤),其他選項都沒有圖 → 把結尾那串搬到題幹最後面。
// 搬完若最後選項以「。」結尾、其他選項都沒有句尾標點 → 一併去掉(同 fix-last-option-period.mjs 的規則)。
// 用法:node scripts/fix-last-option-images.mjs [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const plain = (h) => String(h).replace(/<[^>]+>/g, "").trim();
const LABEL = String.raw`(?:[（(]\s*[甲乙丙丁戊己一二三四五ABCDE1-5]\s*[）)]|圖\s*[（(]?\s*[一二三四五1-5]\s*[）)]?|表\s*[（(]?\s*[一二三四五1-5]\s*[）)]?)`;
const TAIL = new RegExp(String.raw`^([\s\S]*?\S)((?:\s*${LABEL}?\s*<img[^>]*>)+)\s*$`);
const END = /[。？！.?!]\s*$/;

const all = await fetchAll("questions?select=id,subject,needs_review,question,options&options=not.is.null&order=id");
const kids = new Set(all.filter((r) => /-g\d+$/.test(r.id)).map((r) => r.id.replace(/-g\d+$/, "")));
const plan = [];
for (const r of all) {
  if (kids.has(r.id) || !Array.isArray(r.options) || r.options.length < 2) continue;
  const opts = r.options.map(String);
  const m = opts.at(-1).match(TAIL);
  if (!m || !plain(m[1]) || opts.slice(0, -1).some((o) => /<img/.test(o))) continue;
  let last = m[1].replace(/\s+$/, "");
  if (/\s*。$/.test(last) && !opts.slice(0, -1).some((o) => END.test(o))) last = last.replace(/\s*。$/, "");
  const moved = m[2].trim();
  const question = (r.question ?? "").replace(/\s+$/, "") + "\n" + moved;
  plan.push({ id: r.id, subject: r.subject, hidden: r.needs_review, before: { question: r.question, options: r.options },
    patch: { question, options: [...opts.slice(0, -1), last] } });
}
fs.writeFileSync(path.join(ROOT, "data/last-option-img-plan.json"), JSON.stringify(plan, null, 1));
const by = (f) => plan.reduce((c, p) => ((c[f(p)] = (c[f(p)] ?? 0) + 1), c), {});
console.log(`共 ${plan.length} 題(可見 ${plan.filter((p) => !p.hidden).length})`, by((p) => p.subject));
for (const p of plan.slice(0, 3)) console.log(`  ${p.id} D: ${plain(p.before.options.at(-1)).slice(-30)} → ${plain(p.patch.options.at(-1)).slice(-30)}`);
if (!APPLY) { console.log("(乾跑,未寫入)→ data/last-option-img-plan.json"); process.exit(0); }
const file = writeBackup("last-option-images", plan.map((p) => ({ id: p.id, ...p.before })));
console.log(`💾 備份 → ${file}`);
await runPool(plan, (p) => patchQuestion(p.id, p.patch));
console.log(`✅ 已寫入 ${plan.length} 題。還原:node scripts/fix-last-option-images.mjs --restore "${file}"`);
