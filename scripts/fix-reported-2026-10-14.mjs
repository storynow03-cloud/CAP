// 孩子回報的 2 題(2026-10-13)修正:答案都正確(已對照附圖核對),問題是「承上題」看不懂 + 詳解錯位/空白
// - science-0811652-g2「哪來的abcd」:a~d 定義只在第 1 小題 → 網站改為自動附前面小題(PrevSubQuestions.tsx);兩小題原本無詳解 → 補上
// - science-0821309:第 1 小題詳解只剩「(1)」、第 2 小題詳解其實在解第 1 小題 → 各歸各位
// 並把兩筆回報標成已修正。用法:node scripts/fix-reported-2026-10-14.mjs [--apply] | --restore <備份檔>
import { fetchAll, patchQuestion, writeBackup, restoreBackup, URL_BASE, H } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題(回報狀態不會還原)`);
  process.exit(0);
}
const FIX = {
  "science-0811652-g1": "由附表：甲有細胞壁、沒有葉綠體 → 葉的表皮細胞(c)；乙有細胞壁和葉綠體 → 葉肉細胞(d)；丙沒有細胞壁 → 動物細胞(b 人類的神經細胞)。",
  "science-0811652-g2": "具有保護功能的是 a 人類的口腔皮膜細胞(上皮組織)和 c 葉的表皮細胞(保護組織)。",
  "science-0821309-g1": "(1)胎兒細胞代謝產生的廢物，可藉由胎盤(丙)和臍帶(丁)送入母體代為排出。",
  "science-0821309-g2": "(2)附圖中丙為胎盤、丁為臍帶。",
};
const REPORTED = ["science-0811652-g2", "science-0821309-g2"];
const rows = await fetchAll(`questions?select=id,explanation&id=in.(${Object.keys(FIX).join(",")})&order=id`);
for (const r of rows) console.log(r.id, "\n  原:", r.explanation, "\n  新:", FIX[r.id]);
if (!process.argv.includes("--apply")) { console.log("(乾跑,未寫入)"); process.exit(0); }
const file = writeBackup("reported-2026-10-14", rows.map((r) => ({ id: r.id, explanation: r.explanation })));
console.log(`💾 備份 → ${file}`);
for (const [id, explanation] of Object.entries(FIX)) await patchQuestion(id, { explanation });
const r = await fetch(`${URL_BASE}/rest/v1/question_reports?status=eq.open&question_id=in.(${REPORTED.join(",")})`, {
  method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
  body: JSON.stringify({ status: "fixed", resolved_at: new Date().toISOString() }),
});
console.log(`✅ 已寫入 ${Object.keys(FIX).length} 題詳解;回報標記已修正 → ${r.status}`);
