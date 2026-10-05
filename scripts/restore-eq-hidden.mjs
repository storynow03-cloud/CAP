// 數學/自然「隱藏中、公式消失」的題目重跑 EQ 還原(2026-10-05)
// 這些題目在 2026-10-03 restore-eq-fields 當時對不上(之後其他腳本修過文字,現在對得上了)。
// 沿用 restore-eq-fields.mjs 的解析/對齊/重建(scripts/lib/eq-restore-core.mjs 由它抽出),
// 再把殘留的 OMML 公式圖換成文字(formulas.json)。重建後通過 question-checks 嚴格檢查、
// 圖都安全(看過/重畫過/非壞圖)、不在人工缺圖清單與題目回報 → 放回。
// 用法:node scripts/restore-eq-hidden.mjs [--ids <JSON 檔>] [--dump <檔>] [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";
import { blocks, restoreQuestion } from "./lib/eq-restore-core.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const idsFile = process.argv.includes("--ids") ? process.argv[process.argv.indexOf("--ids") + 1] : "data/rerender/item3-ids.json";
const ids = read(idsFile);
const formula = new Map([...read("data/rerender/formulas.json"), ...read("data/rerender/formulas-manual.json")].map((x) => [x.p, x.html]));
const swapF = (s) => typeof s !== "string" ? s : s.replace(/<img[^>]*src="([^"]+)"[^>]*>/g, (m, src) => (formula.has(src) ? formula.get(src) : m));
const bad = new Set(read("data/image-screen-confirmed.json").map((x) => x.p));
const seen = new Set([...read("data/image-screen-list.json").map((x) => x.p), ...read("data/rerender/map.json").map((x) => x.p),
  ...read("data/rerender/map-webp.json").map((x) => x.p)]);
const manual = new Set(fs.readFileSync(path.join(ROOT, "scripts/hide-missing-figure-questions.mjs"), "utf8")
  .match(/const BROKEN = \[([\s\S]*?)\];/)[1].match(/"[a-z]+-[\d-]+"/g).map((s) => s.slice(1, -1)));
const reported = new Set((await fetchAll("question_reports?select=question_id")).map((r) => r.question_id));

const rows = [];
await runPool(ids, async (id) => {
  rows.push(...await fetchAll(`questions?select=id,subject,source,type,question,options,answer,answer_text,explanation,needs_review&id=eq.${encodeURIComponent(id)}`));
}, 8);
const plan = [], stat = {};
const bump = (k) => (stat[k] = (stat[k] ?? 0) + 1);
for (const q of rows) {
  const m = q.id.match(/^(math|science)-(\d+)/);
  const cands = m ? (blocks.get(`${m[1]}-${m[2]}`) ?? []).filter((b) => q.source === `${b.sourceCat}/${b.fileName}`) : [];
  let res = null, err = null;
  for (const b of cands) { try { res = restoreQuestion(q, b.flat); break; } catch (e) { err = e; } }
  const base = res ? { ...q, question: res.question, options: res.options ?? q.options, explanation: res.explanation ?? q.explanation } : { ...q };
  const fixed = { ...base, question: swapF(base.question), options: base.options ? base.options.map(swapF) : base.options,
    explanation: swapF(base.explanation), answer_text: swapF(base.answer_text) };
  if (!cands.length) bump("原檔沒有這題的 EQ");
  else if (!res) bump(`EQ 對不上:${(err?.message ?? "?").replace(/\(.*\)/, "")}`);
  const p = problems(fixed);
  const srcs = [...[fixed.question, ...(fixed.options ?? []), fixed.answer_text ?? ""].join("\n").matchAll(/<img[^>]*src="([^"]+)"/g)].map((x) => x[1]);
  if (srcs.some((s) => bad.has(s))) p.push("有確認壞掉的圖");
  if (srcs.some((s) => !seen.has(s))) p.push("有沒看過的圖");
  if (manual.has(q.id)) p.push("人工缺圖清單");
  if (reported.has(q.id)) p.push("有題目回報");
  const after = {};
  for (const k of ["question", "options", "explanation", "answer_text"]) if (JSON.stringify(fixed[k]) !== JSON.stringify(q[k])) after[k] = fixed[k];
  if (!p.length) after.needs_review = false;
  for (const r of p) bump(`仍隱藏:${r}`);
  if (!p.length) bump("可放回");
  if (Object.keys(after).length) plan.push({ id: q.id, before: Object.fromEntries(Object.keys(after).map((k) => [k, q[k]])), after });
}
console.log(`處理 ${rows.length} 題;要寫入 ${plan.length} 題`, stat);
const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx !== -1) fs.writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(plan), "utf8");
if (process.argv.includes("--apply")) {
  const backupFile = writeBackup("eq-hidden", plan.map((p) => ({ id: p.id, ...p.before })));
  console.log(`備份:${backupFile}`);
  await runPool(plan, (p) => patchQuestion(p.id, p.after));
  console.log(`✅ 已寫入 ${plan.length} 題`);
  console.log(`還原:node scripts/restore-eq-hidden.mjs --restore "${backupFile}"`);
}
