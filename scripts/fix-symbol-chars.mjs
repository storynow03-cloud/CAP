// 把數學/自然題目裡的「Symbol/Wingdings 字型私用區字元」換成正確的 Unicode 符號(2026-10-03)
//
// 問題:Word 用 Symbol 字型插入的 ⇒ ≦ ° ∠ ⊥ π …,LibreOffice 轉出來是私用區字元 U+F0xx
//   (例:⇒ 存成 U+F0DE),瀏覽器沒有對應字型 → 顯示成空白或方框,孩子看到「x＝4  x＝4×5×3」。
// 對照表:Symbol 字型標準碼表 + Wingdings(①② ❶❷❸ →)+ Wingdings 3(△),
//   每個碼位都對過題庫中的上下文(見 2026-10-03 進度日誌)。
// 題幹/選項裡有對照表以外的私用區字元 → 不猜,該題隱藏;詳解裡的不認得字元保持原樣。
//
// 用法:node scripts/fix-symbol-chars.mjs [--dump <檔>] | --apply | --restore <備份檔>
import fs from "node:fs";
import { fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const APPLY = process.argv.includes("--apply");
const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const dumpIdx = process.argv.indexOf("--dump");
const DUMP = dumpIdx !== -1 ? process.argv[dumpIdx + 1] : null;

// U+F0xx → 正確符號(只收上下文確認過的)
const MAP = {
  0xde: "⇒", 0xdb: "⇔", 0x40: "≅", 0xb0: "°", 0xa2: "′", 0xa3: "≤", 0xb3: "≥",
  0x5e: "⊥", 0xd0: "∠", 0x70: "π", 0xb1: "±", 0xb4: "×", 0xb8: "÷", 0x2d: "−",
  0xbd: "|", 0x7c: "|", 0x3e: ">", 0x3c: "<", 0x2b: "+",
  0x72: "△", // Wingdings 3
  0xe0: "→", // Wingdings(自然:醣類→脂質→蛋白質)
  0x81: "①", 0x82: "②", 0x8c: "❶", 0x8d: "❷", 0x8e: "❸", 0x8f: "❹", // Wingdings
};
const PUA = /[-]/g;
const fix = (s) => (s == null ? s : s.replace(PUA, (c) => {
  const cp = c.codePointAt(0);
  return cp >= 0xf000 && cp <= 0xf0ff && MAP[cp - 0xf000] ? MAP[cp - 0xf000] : c;
}));
const hasPUA = (s) => s != null && /[-]/.test(s);

const rows = await fetchAll("questions?select=id,subject,question,options,answer_text,explanation,needs_review&subject=in.(math,science)&order=id");
const changes = [];
const stats = {};
const bump = (k) => (stats[k] = (stats[k] ?? 0) + 1);
const leftovers = {};
for (const q of rows) {
  const fields = { question: q.question, options: q.options, answer_text: q.answer_text, explanation: q.explanation };
  if (![q.question, ...(q.options ?? []), q.answer_text, q.explanation].some(hasPUA)) continue;
  const after = {
    question: fix(q.question),
    options: q.options?.map(fix) ?? null,
    answer_text: fix(q.answer_text),
    explanation: fix(q.explanation),
  };
  const before = {};
  const out = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(after[k]) !== JSON.stringify(fields[k])) { out[k] = after[k]; before[k] = fields[k]; }
  }
  const stillBad = [after.question, ...(after.options ?? []), after.answer_text].some(hasPUA);
  if (stillBad) {
    for (const c of [after.question, ...(after.options ?? []), after.answer_text].join("").match(PUA) ?? []) {
      const k = c.codePointAt(0).toString(16); leftovers[k] = (leftovers[k] ?? 0) + 1;
    }
    bump(q.needs_review ? "題目仍有不認得的符號(本來就隱藏)" : "題目仍有不認得的符號 → 隱藏");
    if (!q.needs_review) { out.needs_review = true; before.needs_review = false; }
  } else bump(q.needs_review ? "已修好(題目本來就隱藏,不動可見狀態)" : "已修好(可見題)");
  if (Object.keys(out).length) changes.push({ id: q.id, before, after: out });
}
console.log(stats);
console.log("題目/選項中仍不認得的碼位:", leftovers);
console.log(`要更新 ${changes.length} 題`);
if (DUMP) fs.writeFileSync(DUMP, JSON.stringify(changes, null, 1), "utf8");

if (APPLY) {
  const backupFile = writeBackup("symbol-chars", changes.map((c) => ({ id: c.id, ...c.before })));
  console.log(`備份:${backupFile}`);
  await runPool(changes, (c) => patchQuestion(c.id, c.after));
  console.log(`✅ 已更新 ${changes.length} 題`);
  console.log(`還原:node scripts/fix-symbol-chars.mjs --restore "${backupFile}"`);
}
