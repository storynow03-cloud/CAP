// 最終品質檢查後,把「孩子看得到、但沒通過嚴格檢查」的題目隱藏(2026-10-04)
// 執行當下重新檢查(請在 fix-answer-placeholders、fix-misparsed-kc 之後執行):
//   lib/question-checks 的 problems()(疑似掉字、說有圖沒圖、選項重複、非選無答案…)
//   題幹/選項殘留無法顯示的符號、選項內夾帶其他選項標記、殘留 [[ ]] 佔位符
// 隱藏的題目可以在管理後台「題目管理」(只看隱藏的)找到、修正後放回。
//
// 用法:node scripts/hide-qa-failures.mjs [--apply] | --restore <備份檔>
import { fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems, plain } from "./lib/question-checks.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");

const rows = await fetchAll("questions?select=id,subject,type,question,options,answer,answer_text,explanation&needs_review=eq.false&order=id");
const hide = [];
const why = {};
for (const q of rows) {
  const qo = [q.question, ...(q.options ?? [])].join("\n");
  const r = [...problems(q)];
  if (/[-]/.test(qo)) r.push("無法顯示的符號");
  if ((q.options ?? []).some((o) => /[（(]\s*[A-EＡ-Ｅ]\s*[）)]/.test(plain(o)))) r.push("選項夾帶選項標記");
  if (/\[\[|\]\]/.test([qo, q.answer_text ?? ""].join("\n"))) r.push("殘留佔位符");
  if (!r.length) continue;
  hide.push(q.id);
  for (const k of r) why[k] = (why[k] ?? 0) + 1;
}
console.log(`可見 ${rows.length} 題,要隱藏 ${hide.length} 題`, why);
console.log("例:", hide.slice(0, 12).join(" "));
if (APPLY) {
  const backupFile = writeBackup("hide-qa", hide.map((id) => ({ id, needs_review: false })));
  console.log(`備份:${backupFile}`);
  await runPool(hide, (id) => patchQuestion(id, { needs_review: true }));
  console.log(`✅ 已隱藏 ${hide.length} 題`);
  console.log(`還原:node scripts/hide-qa-failures.mjs --restore "${backupFile}"`);
}
