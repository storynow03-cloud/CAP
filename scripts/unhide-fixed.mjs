// 把 2026-10-04 因「圖片內容壞掉」隱藏、但已修好的題目放回題庫
// 修好的方式:① 社會/英文/國文圖重畫(data/rerender/map-webp.json,需已部署)② 數學公式圖換成 HTML(apply-formulas.mjs)
// 判斷:題目(題幹/選項)裡已沒有任何「確認壞掉且沒修好」的圖、也沒有還沒換掉的公式圖,且通過 lib/question-checks 嚴格檢查。
// 安全:用到重畫圖的題目,先到正式站下載那張圖、與本機新圖逐位元組比對,不一致(還沒部署)就中止。
// 同時把 data/image-screen-confirmed.json 裡已修好的圖移除(之後 hide-qa-failures 才不會又藏回去)。
// 用法:node scripts/unhide-fixed.mjs [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, BACKUP_DIR, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const SITE = "https://cap-three-ruddy.vercel.app";
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const exclude = new Set(fs.existsSync(path.join(ROOT, "data/rerender/exclude.json")) ? read("data/rerender/exclude.json") : []);
const fixedWebp = new Set(read("data/rerender/map-webp.json").map((m) => m.p).filter((p) => !exclude.has(p)));
const formulaImgs = new Set([...read("data/rerender/formulas.json"),
  ...(fs.existsSync(path.join(ROOT, "data/rerender/formulas-manual.json")) ? read("data/rerender/formulas-manual.json") : [])].map((x) => x.p));
const confirmed = read("data/image-screen-confirmed.json");
const stillBad = new Set(confirmed.map((x) => x.p).filter((p) => !fixedWebp.has(p) && !formulaImgs.has(p)));

// 今天 hide-qa-failures 隱藏的題目(取最新一份備份)
const hdir = path.join(BACKUP_DIR, "2026-10-04-hide-qa");
const latest = fs.readdirSync(hdir).filter((f) => f.startsWith("original-")).sort().at(-1);
const ids = JSON.parse(fs.readFileSync(path.join(hdir, latest), "utf8")).map((r) => r.id);
console.log(`隱藏清單 ${latest}:${ids.length} 題`);

const rows = [];
for (let i = 0; i < ids.length; i += 100) {
  rows.push(...await fetchAll(`questions?select=id,subject,type,question,options,answer,answer_text,explanation,needs_review&id=in.(${ids.slice(i, i + 100).join(",")})`));
}
const srcsOf = (q) => [...[q.question, ...(q.options ?? []), q.answer_text ?? ""].join("\n").matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
const back = [], reasons = {};
for (const q of rows) {
  if (!q.needs_review) continue;
  const srcs = srcsOf(q);
  const r = [...problems(q)];
  if (srcs.some((s) => stillBad.has(s))) r.push("還有沒修好的壞圖");
  if (srcs.some((s) => formulaImgs.has(s))) r.push("公式圖還沒換(先跑 apply-formulas.mjs --apply)");
  if (r.length) { for (const k of r) reasons[k] = (reasons[k] ?? 0) + 1; continue; }
  back.push(q);
}
console.log(`可放回 ${back.length} 題;仍留隱藏:`, reasons);

// 部署檢查:放回的題目用到的重畫圖,線上版要等於本機新圖
const needLive = [...new Set(back.flatMap(srcsOf).filter((s) => fixedWebp.has(s)))];
let notLive = 0;
await runPool(needLive, async (s) => {
  const local = fs.readFileSync(path.join(ROOT, "data/rerender/out", s.replace(/^\/qimg\//, "")));  // 重畫後的新圖
  const res = await fetch(`${SITE}${s}?v=${Date.now()}`);
  const live = Buffer.from(await res.arrayBuffer());
  if (!res.ok || !live.equals(local)) notLive++;
}, 8);
console.log(`重畫圖線上檢查 ${needLive.length} 張,未部署 ${notLive} 張`);

if (process.argv.includes("--apply")) {
  if (notLive) { console.log("⛔ 新圖還沒部署到正式站(或本機還沒覆蓋),先 apply-rerender + commit/push,再跑一次"); process.exit(1); }
  const backupFile = writeBackup("unhide-fixed", back.map((q) => ({ id: q.id, needs_review: true })));
  console.log(`備份:${backupFile}`);
  await runPool(back, (q) => patchQuestion(q.id, { needs_review: false }));
  const fixed = confirmed.filter((x) => !stillBad.has(x.p));
  fs.writeFileSync(path.join(ROOT, "data/image-screen-confirmed.json"), JSON.stringify(confirmed.filter((x) => stillBad.has(x.p)), null, 0));
  console.log(`✅ 已放回 ${back.length} 題;confirmed 清單移除已修好的 ${fixed.length} 張圖`);
  console.log(`還原:node scripts/unhide-fixed.mjs --restore "${backupFile}"`);
}
