// 清掉答案/詳解尾巴黏著的「下一題題號」,補回單選題答案,再把通過嚴格檢查的隱藏題放回題庫(2026-09-30)。
//
// 問題:解析器用「題號：」切題,下一題的顯示編號會黏在上一題最後一個欄位的尾巴:
//   國文單選答案「C4.」、字義答案「繞、轉。2.」、詳解「…宜作「夜郎自大」56.」
//   單選題的答案因此不是單一字母 → 解析不出答案 → 整題被隱藏(國文約 4,900 題)。
// 怎麼確定那是題號而不是答案本身的數字:同一來源檔依 id 排序後,相鄰題目的尾巴數字連續
// (…4. 5. 6.)才算。「since 2018.」「NT$5,000.」不會剛好跟鄰題連號,不會被誤刪。
// 另外處理「段落標題 + 1.」(「…選擇 1.」)與英文答案尾巴的段落標題(「…is Sam.填充」)。
//
// 放回題庫(needs_review → false)的條件,全部要成立:
//   - 國文/英語/社會(數學/自然當初是被另一套破損偵測隱藏的,這裡偵測不到那些問題,不碰)
//   - lib/question-checks.mjs 的嚴格檢查零問題(有答案、選項完整、沒有題組殘留、沒有缺圖…)
//   - 不在 hide-missing-figure-questions.mjs 人工判定缺圖的清單裡
//
// 用法:node scripts/repair-answer-tail.mjs [--dump <檔>] | --apply | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems, tailNumbers, lastField, SECTION_TAIL, EN_LABEL_TAIL } from "./lib/question-checks.mjs";

const APPLY = process.argv.includes("--apply");
const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}

const FIELDS = ["answer", "answer_text", "explanation", "needs_review"];
const UNHIDE_SUBJECTS = new Set(["chinese", "english", "social"]);
const manualBroken = new Set(
  fs.readFileSync(path.join(ROOT, "scripts", "hide-missing-figure-questions.mjs"), "utf8")
    .match(/const BROKEN = \[([\s\S]*?)\];/)[1].match(/"[a-z]+-[\d-]+"/g).map((s) => s.slice(1, -1))
);

const rows = await fetchAll("questions?select=id,subject,source,type,question,options,answer,answer_text,explanation,needs_review&order=id");
console.log(`讀取 ${rows.length} 題(人工缺圖清單 ${manualBroken.size} 題)`);
const tails = tailNumbers(rows);
const LETTER = { A: 0, B: 1, C: 2, D: 3, E: 4, Ａ: 0, Ｂ: 1, Ｃ: 2, Ｄ: 3, Ｅ: 4 };

const plan = [];
for (const q of rows) {
  const out = { ...q };
  const why = [];
  const t = tails.get(q.id);
  if (t) { out[t.field] = t.body; why.push("去尾巴題號"); }
  else {
    const f = lastField(q);
    const m = f && String(q[f]).match(SECTION_TAIL);
    if (m) { out[f] = m[1]; why.push("去段落標題"); }
  }
  if (q.subject === "english" && out.answer_text) {
    const m = String(out.answer_text).match(EN_LABEL_TAIL);
    if (m) { out.answer_text = m[1]; why.push("去段落標題"); }
  }
  // 單選題:答案欄清乾淨後只剩一個字母 → 就是答案
  if (q.type === "single_choice" && q.answer == null && out.answer_text) {
    const m = String(out.answer_text).trim().match(/^[（(]?([A-EＡ-Ｅ])[）)]?$/);
    if (m && LETTER[m[1]] < (q.options?.length ?? 0)) {
      out.answer = LETTER[m[1]];
      out.answer_text = null;
      why.push("補回單選答案");
    }
  }
  if (q.needs_review && UNHIDE_SUBJECTS.has(q.subject) && !manualBroken.has(q.id) && problems(out).length === 0) {
    out.needs_review = false;
    why.push("放回題庫");
  }
  const body = {};
  for (const f of FIELDS) if (JSON.stringify(out[f]) !== JSON.stringify(q[f])) body[f] = out[f];
  if (Object.keys(body).length) {
    plan.push({ id: q.id, subject: q.subject, type: q.type, body, before: Object.fromEntries(Object.keys(body).map((f) => [f, q[f]])), why });
  }
}

const stat = {};
for (const p of plan) for (const w of p.why) stat[`${w.padEnd(8)} ${p.subject}/${p.type}`] = (stat[`${w.padEnd(8)} ${p.subject}/${p.type}`] ?? 0) + 1;
console.log(`\n要修改 ${plan.length} 題:`);
for (const [k, v] of Object.entries(stat).sort()) console.log(`  ${String(v).padStart(6)}  ${k}`);

const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx !== -1) fs.writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(plan), "utf8");
if (!APPLY) { console.log("\n(乾跑,未寫入。加 --apply 才會寫入)"); process.exit(0); }

const backupFile = writeBackup("answer-tail", plan.map((p) => ({ id: p.id, ...p.before })));
console.log(`\n💾 已備份 → ${backupFile}`);
await runPool(plan, (p) => patchQuestion(p.id, p.body));
console.log(`✅ 已修改 ${plan.length} 題`);
console.log(`還原:node scripts/repair-answer-tail.mjs --restore "${backupFile}"`);
