// 數學非選題:答案/詳解被一起匯進題幹(「…題目… 《答案》…答案… 詳解：…詳解…」)而被隱藏的題目,
// 拆回 question / answer_text / explanation 三個欄位,通過 lib/question-checks 嚴格檢查才放回題庫。
// 安全規則:只處理隱藏中的 non_choice;題幹裡「《答案》」剛好一次;答案段落不可空;
//   原本 answer_text 已有內容的不動;「詳解：」只在《答案》之後出現才切;原本已有詳解就不覆蓋。
// 建議先跑 apply-formulas.mjs(公式圖換文字)再跑這支。
// 用法:node scripts/split-embedded-answers.mjs [--subject math|science|social|english|chinese] [--dump <檔>] [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
// 隱藏題的圖不在 2026-10-04 看圖檢查範圍內 → 每張圖必須是「已重畫」「已看過且沒壞」或「會換成文字的公式圖」才放回
const readJ = (f) => fs.existsSync(path.join(ROOT, f)) ? JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")) : [];
const formula = new Map([...readJ("data/rerender/formulas.json"), ...readJ("data/rerender/formulas-manual.json")].map((x) => [x.p, x.html]));
const bad = new Set(readJ("data/rerender/still-bad.json"));
const okImg = new Set([...readJ("data/rerender/map.json").map((x) => x.p), ...readJ("data/image-screen-list.json").map((x) => x.p)]
  .filter((p) => !bad.has(p)));
const swapF = (s) => String(s ?? "").replace(/<img[^>]*src="([^"]+)"[^>]*>/g, (m, src) => (formula.has(src) ? formula.get(src) : m));
const unsafeImgs = (...ss) => [...ss.map(swapF).join("\n").matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !okImg.has(s));
const SEL = "id,subject,type,question,options,answer,answer_text,explanation,needs_review";
const SUBJ = process.argv.includes("--subject") ? process.argv[process.argv.indexOf("--subject") + 1] : "math";
const rows = await fetchAll(`questions?select=${SEL}&subject=eq.${SUBJ}&type=eq.non_choice&needs_review=eq.true&order=id`);
const tidy = (s) => s.replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/g, "").trim();
// 答案/詳解結尾黏到原檔下一段的分類標題或題號(「…距離平方 題組」「…罷了！選詞 1.」「…地方。2.」「…計算」)
const TAIL = /(?:\s|<br\s*\/?>)*(?:題組|選詞\s*\d*\.?|計算|(?<=[。！？」』）)])\s*\d{1,2}\.)\s*$/;
const cutTail = (s) => { let t = s; for (let i = 0; i < 3 && TAIL.test(t); i++) t = tidy(t.replace(TAIL, "")); return t; };
const plan = [], stat = { 隱藏非選: rows.length, 有答案標記: 0, 拆分: 0, 放回: 0, 跳過: {}, 拆了但仍不合格: {} };
const skip = (k) => (stat.跳過[k] = (stat.跳過[k] ?? 0) + 1);
for (const q of rows) {
  const parts = q.question.split("《答案》");
  if (parts.length === 1) continue;
  stat.有答案標記++;
  if (parts.length !== 2) { skip("答案標記不只一個"); continue; }
  if ((q.answer_text ?? "").trim()) { skip("已有答案"); continue; }
  const question = tidy(parts[0]);
  let ans = parts[1], exp = null;
  const k = ans.indexOf("詳解：");
  if (k !== -1) { exp = cutTail(tidy(ans.slice(k + 3))); ans = ans.slice(0, k); }
  ans = cutTail(tidy(ans));
  if (!ans || !question) { skip("答案或題目空白"); continue; }
  const after = { question, answer_text: ans };
  if (exp && !(q.explanation ?? "").trim()) after.explanation = exp;
  stat.拆分++;
  const p = problems({ ...q, ...after });
  if (unsafeImgs(after.question, ...(q.options ?? []), after.answer_text).length) p.push("含未檢查過的圖");
  if (p.length) { for (const r of p) stat.拆了但仍不合格[r] = (stat.拆了但仍不合格[r] ?? 0) + 1; }
  else { after.needs_review = false; stat.放回++; }
  plan.push({ id: q.id, before: Object.fromEntries(Object.keys(after).map((f) => [f, q[f]])), after });
}
console.log(stat);
const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx !== -1) fs.writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(plan), "utf8");
if (process.argv.includes("--apply")) {
  const backupFile = writeBackup(`split-answers-${SUBJ}`, plan.map((p) => ({ id: p.id, ...p.before })));
  console.log(`備份:${backupFile}`);
  await runPool(plan, (p) => patchQuestion(p.id, p.after));
  console.log(`✅ 已拆分 ${plan.length} 題(放回 ${stat.放回} 題)`);
  console.log(`還原:node scripts/split-embedded-answers.mjs --restore "${backupFile}"`);
}
