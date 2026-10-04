// 處理 2026-10-04 早上孩子回報:english-0813694 題組的表格圖轉檔壞掉(字母擠成一團,「圖怪怪的」)
// 原檔是 Word 圖片(EMBED Word.Picture.8),不是文字表格,無法自動轉;內容由
//   ① 圖上清楚可讀的數字(年齡 5/2/8/3、主人年齡 18/8/25/13)
//   ② 原檔詳解:「Nick 的主人是 Helen,她 25 歲」「Lily 的寵物是 Brad」「Ann 的寵物 Molly 是一隻魚」
//   ③ 選項中的名字(Molly、Brad、Gina)
// 互相印證後重建成 HTML 表格,取代那張圖(題組大題 + 3 個小題)。回報標記為已修正。
//
// 用法:node scripts/fix-reported-2026-10-04b.mjs [--apply] | --restore <備份檔>
import { fetchAll, patchQuestion, writeBackup, restoreBackup, URL_BASE, H } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題(回報狀態不還原)`);
  process.exit(0);
}
const IMG = '<img src="/qimg/english/h/704f985bd73b4460.webp" alt="圖" />';
const rowsData = [
  ["Name", "Brad", "Molly", "Nick", "Gina"],
  ["Animal", "Dog", "Fish", "Cat", "Pig"],
  ["Age", "5", "2", "8", "3"],
  ["Owner", "Lily", "Ann", "Helen", "Peter"],
  ["Owner’s age", "18", "8", "25", "13"],
];
// 與 render-ole-tables.mjs 產生的表格同一種行內樣式
const CELL = "border:1px solid #64748b;padding:4px 8px;vertical-align:middle";
const TABLE = `<table style="border-collapse:collapse;margin:6px 0;max-width:100%">${rowsData
  .map((r) => `<tr><td style="${CELL};background:#f1f5f9"><b>${r[0]}</b></td>${r.slice(1).map((c) => `<td style="${CELL};text-align:center">${c}</td>`).join("")}</tr>`)
  .join("")}</table>`;

// 直接列題號(用 like 前綴查詢在大表上會逾時)
const IDS = ["english-0813694", "english-0813694-g1", "english-0813694-g2", "english-0813694-g3"];
const qs = await fetchAll(`questions?select=id,question&id=in.(${IDS.join(",")})&order=id`);
const changes = qs.filter((q) => q.question.includes(IMG))
  .map((q) => ({ id: q.id, before: { question: q.question }, after: { question: q.question.replace(IMG, TABLE) } }));
console.log(`要修正 ${changes.length} 題:${changes.map((c) => c.id).join(" ")}`);
console.log(TABLE);

if (process.argv.includes("--apply")) {
  const backupFile = writeBackup("reported-b", changes.map((c) => ({ id: c.id, ...c.before })));
  console.log(`備份:${backupFile}`);
  for (const c of changes) await patchQuestion(c.id, c.after);
  const r = await fetch(`${URL_BASE}/rest/v1/question_reports?question_id=in.(${IDS.join(",")})&status=eq.open`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ status: "fixed", resolved_at: new Date().toISOString() }),
  });
  console.log(r.ok ? "✅ 回報已標記為已修正" : `⚠️ 回報更新失敗 ${r.status}`);
  console.log(`還原:node scripts/fix-reported-2026-10-04b.mjs --restore "${backupFile}"`);
}
