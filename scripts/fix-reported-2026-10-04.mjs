// 處理 2026-10-03 孩子回報的題目(逐題人工確認過)
//   math-1080149-17:數線附圖被解析器放進選項 D 尾巴 → 移回題幹最後
//   math-1080313-3 :附圖轉檔損壞(A、B、C、D 標籤全變成 c)→ 隱藏
//   math-0811412   :分數已由 restore-eq-fields 補回(¼、⅜),管理者先前手動隱藏 → 放回
//   回報狀態:修好的標 fixed,隱藏的標 hidden
//
// 用法:node scripts/fix-reported-2026-10-04.mjs --apply | --restore <備份檔>
import { fetchAll, patchQuestion, writeBackup, restoreBackup, URL_BASE, H } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題(回報狀態不還原)`);
  process.exit(0);
}

const rows = await fetchAll("questions?select=id,question,options,needs_review&id=in.(math-1080149-17,math-1080313-3,math-0811412)&order=id");
const by = Object.fromEntries(rows.map((q) => [q.id, q]));
const changes = [];

const a = by["math-1080149-17"];
const img = a.options[3].match(/\s*(<img[^>]*>)\s*$/);
if (img) {
  changes.push({
    id: a.id,
    before: { question: a.question, options: a.options },
    after: { question: `${a.question} ${img[1]}`, options: [...a.options.slice(0, 3), a.options[3].slice(0, img.index).trim()] },
  });
}
changes.push({ id: "math-1080313-3", before: { needs_review: by["math-1080313-3"].needs_review }, after: { needs_review: true } });
changes.push({ id: "math-0811412", before: { needs_review: by["math-0811412"].needs_review }, after: { needs_review: false } });

for (const c of changes) console.log(c.id, JSON.stringify(c.after).slice(0, 200));
const REPORTS = { "math-0810172": "fixed", "math-1080149-17": "fixed", "math-0811412": "fixed", "math-1080313-3": "hidden", "math-0810258": "hidden" };

if (process.argv.includes("--apply")) {
  const backupFile = writeBackup("reported", changes.map((c) => ({ id: c.id, ...c.before })));
  console.log(`備份:${backupFile}`);
  for (const c of changes) await patchQuestion(c.id, c.after);
  for (const [qid, status] of Object.entries(REPORTS)) {
    const r = await fetch(`${URL_BASE}/rest/v1/question_reports?question_id=eq.${qid}&status=in.(open,hidden)`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ status, resolved_at: new Date().toISOString() }),
    });
    if (!r.ok) console.log(`⚠️ 回報 ${qid} 更新失敗 ${r.status}`);
  }
  console.log(`✅ 已處理 ${changes.length} 題、${Object.keys(REPORTS).length} 筆回報`);
  console.log(`還原:node scripts/fix-reported-2026-10-04.mjs --restore "${backupFile}"`);
}
