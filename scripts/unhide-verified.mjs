// 放回「已和原檔逐題比對一致」的隱藏題(2026-10-07,自然科)
//
// 輸入:JSON 陣列 [id, …](例:data/rerender/sci-review/verified.json,只收子代理判 same 且 Claude 抽查過的)
// 放回前再檢查一次:question-checks + visible-checks、圖片不在壞圖清單;任一不過就不放回、列出來。
// 題組小題(-gN)若資料庫還沒有(尚未拆題),略過並提示要先跑 split-groups。
//
// --drop-expl <ids.json>:這些題目的詳解缺公式/混入別題/有雜字 → 放回時一併把詳解清空(題目本身已比對一致)
// 用法:node scripts/unhide-verified.mjs <ids.json> [--drop-expl <ids.json>] [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";
import { visibleProblems } from "./lib/visible-checks.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const ids = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const deIdx = process.argv.indexOf("--drop-expl");
const DROP = new Set(deIdx !== -1 ? JSON.parse(fs.readFileSync(process.argv[deIdx + 1], "utf8")) : []);
const bad = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "data/image-screen-confirmed.json"), "utf8")).map((x) => x.p));

const rows = [];
for (let i = 0; i < ids.length; i += 100) rows.push(...(await fetchAll(`questions?select=*&id=in.(${ids.slice(i, i + 100).map(encodeURIComponent).join(",")})&order=id`)));
const byId = new Map(rows.map((q) => [q.id, q]));
const ok = [], skip = [];
for (const id of ids) {
  const q = byId.get(id);
  if (!q) { skip.push([id, "資料庫沒有(題組小題要先跑 split-groups)"]); continue; }
  if (!q.needs_review) { skip.push([id, "本來就可見"]); continue; }
  const p = [...problems(q), ...visibleProblems(q)];
  const srcs = [...[q.question, ...(q.options ?? [])].join(" ").matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  if (srcs.some((s) => bad.has(s))) p.push("用到壞圖");
  if (DROP.has(id)) q._dropExpl = true;
  if (p.length) { skip.push([id, p.join("、")]); continue; }
  ok.push(q);
}
console.log(`要放回 ${ok.length} 題(其中清空詳解 ${ok.filter((q) => q._dropExpl).length} 題);不放回 ${skip.length} 題`);
for (const [id, why] of skip) console.log(`  不放回 ${id}:${why}`);
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }
const file = writeBackup("unhide-verified", ok.map((q) => ({ id: q.id, needs_review: q.needs_review, explanation: q.explanation })));
console.log(`💾 備份 → ${file}`);
await runPool(ok, (q) => patchQuestion(q.id, q._dropExpl ? { needs_review: false, explanation: null } : { needs_review: false }));
console.log(`✅ 已放回 ${ok.length} 題。還原:node scripts/unhide-verified.mjs x --restore "${file}"`);
