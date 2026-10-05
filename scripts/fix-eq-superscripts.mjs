// 補回 Word EQ 算式裡遺失的上標(2026-10-04)
// restore-eq-fields.mjs 用純文字還原 EQ,上標格式不見:\F(1,4×10⁴) 變成分母「4×104」、√(25²−7²) 變「√252−72」。
// data/rerender/eq-sup.json(scripts/eq-sup-extract.py 從 docx 原檔抽出,含題號)→ 用 lib/eq-field.mjs
// 產生「舊的錯誤 HTML」與「補上 <sup> 的正確 HTML」,只在同題號的題目(含題組小題)裡、逐字找到舊 HTML 才替換。
// 用法:node scripts/fix-eq-superscripts.mjs [--subject science] [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { eqToHtml } from "./lib/eq-field.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const SUBJ = process.argv.includes("--subject") ? process.argv[process.argv.indexOf("--subject") + 1] : "math";
const items = JSON.parse(fs.readFileSync(path.join(ROOT, SUBJ === "math" ? "data/rerender/eq-sup.json" : `data/rerender/eq-sup-${SUBJ}.json`), "utf8"));
const strip = (c) => c.replace(/^\s*eq\s*/i, "");
const pairs = new Map(); // 題號 → [[wrong, right]]
let bad = 0;
for (const it of items) {
  let wrong, right;
  try {
    wrong = eqToHtml(strip(it.plain));
    right = eqToHtml(strip(it.marked)).replace(/([^]*)/g, "<sup>$1</sup>");
  } catch { bad++; continue; }
  if (wrong === right || /[]/.test(right)) { bad++; continue; }
  // 沒有公式結構(<span>)的錯誤字串太普通(例:單一個「+」),split/join 會換到題目裡其他地方 → 不處理
  if (!wrong.includes("<span")) { bad++; continue; }
  if (!pairs.has(it.q)) pairs.set(it.q, []);
  const list = pairs.get(it.q);
  if (!list.some(([w]) => w === wrong)) list.push([wrong, right]);
}
const rows = await fetchAll(`questions?select=id,question,options,explanation,answer_text&subject=eq.${SUBJ}&order=id`);
const changes = [];
let hit = 0;
const found = new Set();
for (const q of rows) {
  const num = q.id.replace(/^[a-z]+-/, "").replace(/-g\d+$/, "");
  const list = pairs.get(num);
  if (!list) continue;
  const fix = (s) => {
    if (typeof s !== "string") return s;
    for (const [w, r] of list) if (s.includes(w)) { s = s.split(w).join(r); hit++; found.add(num + w); }
    return s;
  };
  const after = { question: fix(q.question), options: q.options ? q.options.map(fix) : q.options, explanation: fix(q.explanation), answer_text: fix(q.answer_text) };
  const diff = {};
  for (const k of Object.keys(after)) if (JSON.stringify(after[k]) !== JSON.stringify(q[k])) diff[k] = after[k];
  if (Object.keys(diff).length) changes.push({ id: q.id, before: Object.fromEntries(Object.keys(diff).map((k) => [k, q[k]])), after: diff });
}
const total = [...pairs.values()].reduce((a, l) => a + l.length, 0);
console.log(`含上標 EQ ${items.length} 個(轉不了 ${bad});不重複 ${total} 組,在題目裡找到 ${found.size} 組;要改 ${changes.length} 題(替換 ${hit} 處)`);
console.log("例:", changes.slice(0, 2).map((c) => `${c.id} ${JSON.stringify(c.after).slice(0, 220)}`).join("\n    "));
if (process.argv.includes("--apply")) {
  const backupFile = writeBackup(`eq-sup-${SUBJ}`, changes.map((c) => ({ id: c.id, ...c.before })));
  console.log(`備份:${backupFile}`);
  await runPool(changes, (c) => patchQuestion(c.id, c.after));
  console.log(`✅ 已更新 ${changes.length} 題`);
  console.log(`還原:node scripts/fix-eq-superscripts.mjs --restore "${backupFile}"`);
}
