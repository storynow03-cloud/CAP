// 放回「只因低解析圖而隱藏」、且低解析圖已用 2 倍解析度重畫並上線的題目(2026-10-05)
// 條件:題目用到的每張低解析圖都在 data/rerender/map-lowres.json 且不在 exclude.json;
//   去掉「低解析圖」後通過 lib/question-checks 嚴格檢查;不在人工缺圖清單/題目回報;
//   每張新圖都要先從正式站下載、與本機 data/rerender/out 逐位元組相同(未部署就中止)。
// 用法:node scripts/unhide-lowres.mjs [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const SITE = "https://cap-three-ruddy.vercel.app";
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const ex = new Set(read("data/rerender/exclude.json"));
const fixed = new Set(read("data/rerender/map-lowres.json").map((x) => x.p).filter((p) => !ex.has(p)));
const lowres = new Set(read("data/lowres-images.json").map((u) => u.url));
const bad = new Set(read("data/image-screen-confirmed.json").map((x) => x.p));
const manual = new Set(fs.readFileSync(path.join(ROOT, "scripts/hide-missing-figure-questions.mjs"), "utf8")
  .match(/const BROKEN = \[([\s\S]*?)\];/)[1].match(/"[a-z]+-[\d-]+"/g).map((s) => s.slice(1, -1)));
const reported = new Set((await fetchAll("question_reports?select=question_id")).map((r) => r.question_id));

const back = [], why = {}, need = new Set();
const skip = (k) => (why[k] = (why[k] ?? 0) + 1);
for (const s of ["social", "chinese", "english"]) {
  const rows = await fetchAll(`questions?select=id,subject,type,question,options,answer,answer_text,explanation,needs_review&subject=eq.${s}&needs_review=eq.true`);
  for (const q of rows) {
    const p = problems(q);
    if (!p.includes("低解析圖")) continue;
    if (p.some((x) => x !== "低解析圖")) { skip("還有其他問題"); continue; }
    if (manual.has(q.id)) { skip("人工缺圖清單"); continue; }
    if (reported.has(q.id)) { skip("有題目回報"); continue; }
    const srcs = [...[q.question, ...(q.options ?? []), q.answer_text ?? ""].join("\n").matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    if (srcs.some((u) => bad.has(u))) { skip("有確認壞掉的圖"); continue; }
    if (srcs.some((u) => lowres.has(u) && !fixed.has(u))) { skip("有低解析圖沒重畫/被排除"); continue; }
    srcs.filter((u) => fixed.has(u)).forEach((u) => need.add(u));
    back.push(q.id);
  }
}
let notLive = 0;
await runPool([...need], async (u) => {
  const local = fs.readFileSync(path.join(ROOT, "data/rerender/out", u.replace(/^\/qimg\//, "")));
  const r = await fetch(`${SITE}${u}?v=${Date.now()}`);
  if (!r.ok || !Buffer.from(await r.arrayBuffer()).equals(local)) notLive++;
}, 8);
console.log(`可放回 ${back.length} 題;跳過:`, why, `;新圖線上檢查 ${need.size} 張,未部署 ${notLive} 張`);
if (process.argv.includes("--apply")) {
  if (notLive) { console.log("⛔ 新圖還沒部署,先 commit/push 再跑"); process.exit(1); }
  const backupFile = writeBackup("unhide-lowres", back.map((id) => ({ id, needs_review: true })));
  console.log(`備份:${backupFile}`);
  await runPool(back, (id) => patchQuestion(id, { needs_review: false }));
  console.log(`✅ 已放回 ${back.length} 題`);
  console.log(`還原:node scripts/unhide-lowres.mjs --restore "${backupFile}"`);
}
