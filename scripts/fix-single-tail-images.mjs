// 一般單選題「附圖黏在最後一個選項尾巴」修正(2026-10-06)
//
// 問題:選項 D =「丁。\n<img …>」,圖顯示在選項 D 裡。子代理逐題看過 69 題(data/rerender/tail-review/result-*.json):
//   全部都是「本題自己要用的圖」,不是下一題的圖。
// 修法:
//   1. 其他選項也帶圖 → 那是選項自己的配圖(例:每個選項都是「文字+圖」),不動
//   2. 尾巴圖和題幹已有的圖檔案內容相同 → 只從選項拿掉(不重複放)
//   3. 其他 → 移到題幹最後
//
// 用法:node scripts/fix-single-tail-images.mjs [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");

const hash = (src) => {
  const f = path.join(ROOT, "web", "public", src.replace(/^\//, ""));
  return fs.existsSync(f) ? crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex") : `missing:${src}`;
};
const srcsOf = (t) => [...String(t).matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
const TAIL = /^([\s\S]*?\S)\s*\n\s*((?:<img[^>]*>\s*)+)$/;

const rows = await fetchAll("questions?select=id,question,options&type=eq.single_choice&order=id");
const changes = [], stat = { 選項配圖不動: 0, 重複只移除: 0, 移到題幹: 0 };
for (const q of rows) {
  const last = q.options?.at(-1);
  const m = last?.match(TAIL);
  if (!m || /<img/.test(m[1])) continue;
  if (q.options.slice(0, -1).some((o) => /<img/.test(o))) { stat.選項配圖不動++; continue; }
  const have = new Set(srcsOf(q.question).map(hash));
  const imgs = m[2].match(/<img[^>]*>/g).filter((tag) => !have.has(hash(srcsOf(tag)[0])));
  stat[imgs.length ? "移到題幹" : "重複只移除"]++;
  changes.push({ id: q.id, before: q, question: imgs.length ? `${q.question.trim()}\n${imgs.join("\n")}` : q.question, options: [...q.options.slice(0, -1), m[1]] });
}
console.log(`要修改 ${changes.length} 題`, stat);
for (const c of changes.slice(0, 3)) console.log(`--- ${c.id}\n題尾:${c.question.slice(-120)}\n末選項:${c.options.at(-1)}`);
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }

const file = writeBackup("single-tail-images", changes.map(({ before: q }) => ({ id: q.id, question: q.question, options: q.options })));
console.log(`💾 備份 → ${file}`);
await runPool(changes, (c) => patchQuestion(c.id, { question: c.question, options: c.options }));
console.log(`✅ 已修改 ${changes.length} 題。還原:node scripts/fix-single-tail-images.mjs --restore "${file}"`);
