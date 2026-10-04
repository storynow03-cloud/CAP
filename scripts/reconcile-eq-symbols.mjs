// 修正 2026-10-04 restore-eq-fields 與 fix-symbol-chars「同時」執行造成的互相覆蓋。
//
// 兩支腳本都從同一份原始資料計算,各自整欄寫回 question/options/explanation;
// 兩邊都改到的題目,後寫的會蓋掉先寫的(分數又不見,或 ⇒ 又變回私用區字元)。
// 正確結果 = 先補 EQ 算式、再換符號。做法:
//   1. 從兩份備份(修改前的原始值)重建原始資料
//   2. 對原始資料依序套用 EQ 補回結果(restore-eq-fields 的 dump)與符號對照
//   3. 與資料庫現況比對,不同的才寫回;隱藏狀態 = 兩支腳本任一要求隱藏就隱藏
//
// 用法:node scripts/reconcile-eq-symbols.mjs --eq-dump <restore-eq-fields --dump 的檔>
//         --eq-backup <eq 備份檔> --sym-backup <符號備份檔> [--apply] | --restore <備份檔>
import fs from "node:fs";
import { fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { fixSymbols, hasPUA } from "./lib/symbol-chars.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i === -1 ? null : process.argv[i + 1]; };
if (arg("--restore")) {
  console.log(`✅ 已還原 ${await restoreBackup(arg("--restore"))} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const eqDump = JSON.parse(fs.readFileSync(arg("--eq-dump"), "utf8"));
const eqBackup = JSON.parse(fs.readFileSync(arg("--eq-backup"), "utf8"));
const symBackup = JSON.parse(fs.readFileSync(arg("--sym-backup"), "utf8"));

const eqAfter = new Map(eqDump.changes.map((c) => [c.id, c.after]));
if (eqAfter.size !== eqBackup.length) throw new Error(`EQ dump ${eqAfter.size} 題 ≠ 備份 ${eqBackup.length} 題,dump 不是同一次的結果`);
const symOrig = new Map(symBackup.map(({ id, ...b }) => [id, b]));
const eqOrig = new Map(eqBackup.map(({ id, ...b }) => [id, b]));

const ids = [...new Set([...eqAfter.keys(), ...symOrig.keys()])];
const rows = [];
for (let i = 0; i < ids.length; i += 150) {
  rows.push(...(await fetchAll(`questions?select=id,question,options,answer_text,explanation,needs_review&id=in.(${ids.slice(i, i + 150).join(",")})&order=id`)));
}
const FIELDS = ["question", "options", "answer_text", "explanation"];
const changes = [];
const stats = { 兩支都改到: 0, 需要修正: 0, 分數被蓋掉: 0, 符號被蓋掉: 0 };
for (const cur of rows) {
  const ea = eqAfter.get(cur.id), so = symOrig.get(cur.id), eo = eqOrig.get(cur.id);
  if (ea && so) stats.兩支都改到++;
  // 原始值:兩份備份都記錄修改前的值;沒被任何一支改到的欄位,現況就是原始值
  const orig = { ...cur, ...so, ...eo };
  const want = {};
  for (const f of FIELDS) {
    const base = ea && f in ea ? ea[f] : orig[f];
    want[f] = f === "options" ? base?.map(fixSymbols) ?? null : fixSymbols(base);
  }
  // 隱藏:EQ 的決定(沒有就維持原始),加上符號仍認不得 → 隱藏
  const eqHidden = ea && "needs_review" in ea ? ea.needs_review : orig.needs_review;
  want.needs_review = eqHidden || [want.question, ...(want.options ?? []), want.answer_text].some(hasPUA);

  const after = {}, before = {};
  for (const f of [...FIELDS, "needs_review"]) {
    if (JSON.stringify(want[f]) !== JSON.stringify(cur[f])) { after[f] = want[f]; before[f] = cur[f]; }
  }
  if (!Object.keys(after).length) continue;
  stats.需要修正++;
  if (/class="(frac|sqrt|ovl|brace|arr|cancel|boxed)"/.test(JSON.stringify(after)) && !/class="(frac|sqrt|ovl|brace|arr|cancel|boxed)"/.test(JSON.stringify(before))) stats.分數被蓋掉++;
  if (/[-]/.test(JSON.stringify(before))) stats.符號被蓋掉++;
  changes.push({ id: cur.id, before, after });
}
console.log(stats);
console.log(`要修正 ${changes.length} 題`);
if (process.argv.includes("--dump")) fs.writeFileSync(arg("--dump"), JSON.stringify(changes, null, 1), "utf8");

if (APPLY) {
  const backupFile = writeBackup("reconcile", changes.map((c) => ({ id: c.id, ...c.before })));
  console.log(`備份:${backupFile}`);
  await runPool(changes, (c) => patchQuestion(c.id, c.after));
  console.log(`✅ 已修正 ${changes.length} 題`);
  console.log(`還原:node scripts/reconcile-eq-symbols.mjs --restore "${backupFile}"`);
}
