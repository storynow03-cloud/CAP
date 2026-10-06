// 單一選擇題「答案尾巴黏著分類標題」修正(2026-10-06)
//
// 問題:原檔答案欄後面接著下一段的分類標題,匯入時變成 answer_text =「A配合題」「C問答」「B　　 是非」,
//   answer 沒有填 → 題目一直被隱藏。題目本身是普通的單選題。
// 修法:answer = 字母位置、answer_text = null;通過 question-checks + visible-checks、圖片都看過且不在壞圖清單,
//   且不在 --exclude 清單,才設為可見,其餘只補答案、維持隱藏。
//
// 用法:node scripts/fix-label-answers.mjs [--dump <檔>] [--exclude <id,id>] [--apply] | --restore <備份檔>
import fs from "node:fs";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";
import { visibleProblems } from "./lib/visible-checks.mjs";
import path from "node:path";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const exIdx = process.argv.indexOf("--exclude");
const EXCLUDE = new Set(exIdx !== -1 ? process.argv[exIdx + 1].split(",") : []);

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const bad = new Set(read("data/image-screen-confirmed.json").map((x) => x.p));
const seen = new Set([...read("data/image-screen-list.json").map((x) => x.p), ...read("data/rerender/item2-imgs.json"),
  ...read("data/rerender/map.json").map((x) => x.p), ...read("data/rerender/map-webp.json").map((x) => x.p),
  ...read("data/rerender/reviewed-2026-10-06.json")]);

const LABEL = String.raw`(?:簡答|問答|題組|選詞|選擇|計算|配合|填充|是非|閱讀測驗|非選擇?|證明|應用|作圖|綜合|填空|克漏字|閱讀)題?\s*[0-9０-９]*[.．]?`;
const RE = new RegExp(String.raw`^\s*[（(]?\s*([A-EＡ-Ｅ])\s*[）)]?\s*[。.]?\s*${LABEL}\s*$`);
const IDX = { A: 0, B: 1, C: 2, D: 3, E: 4, Ａ: 0, Ｂ: 1, Ｃ: 2, Ｄ: 3, Ｅ: 4 };

const rows = await fetchAll("questions?select=*&needs_review=eq.true&type=eq.single_choice&answer=is.null&order=id");
const out = [];
for (const q of rows) {
  const m = String(q.answer_text ?? "").match(RE);
  if (!m) continue;
  const fixed = { ...q, answer: IDX[m[1]], answer_text: null };
  // 題目附圖黏在最後一個選項尾巴(「貧富差距擴大\n<img>」)→ 移回題幹
  const t = q.options?.at(-1)?.match(/^([\s\S]*?\S)\s*\n\s*((?:<img[^>]*>\s*)+)$/);
  if (t && !/<img/.test(t[1])) { fixed.options = [...q.options.slice(0, -1), t[1]]; fixed.question = `${q.question.trim()}\n${t[2].trim()}`; }
  const p = [...problems(fixed), ...visibleProblems(fixed)];
  if (fixed.answer >= (q.options?.length ?? 0)) p.push("答案超出選項");
  const srcs = [...[q.question, ...(q.options ?? [])].join(" ").matchAll(/src="([^"]+)"/g)].map((x) => x[1]);
  if (srcs.some((s) => bad.has(s))) p.push("用到壞圖");
  if (srcs.some((s) => !seen.has(s))) p.push("有沒看過的圖");
  if (EXCLUDE.has(q.id)) p.push("人工排除");
  out.push({ id: q.id, answer: fixed.answer, question: fixed.question, options: fixed.options, visible: !p.length, why: p, q });
}
console.log(`答案尾巴黏標題:${out.length} 題;可放回 ${out.filter((x) => x.visible).length} 題`);
for (const x of out) console.log(`  ${x.id} ${"ABCDE"[x.answer]} ${x.visible ? "放回" : "維持隱藏:" + x.why.join("、")}`);
const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx !== -1) fs.writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(out), "utf8");
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }

const file = writeBackup("label-answers", out.map(({ q }) => ({ id: q.id, question: q.question, options: q.options, answer: q.answer, answer_text: q.answer_text, needs_review: q.needs_review })));
console.log(`💾 備份 → ${file}`);
await runPool(out, (x) => patchQuestion(x.id, { question: x.question, options: x.options, answer: x.answer, answer_text: null, needs_review: !x.visible }));
console.log(`✅ 已修改 ${out.length} 題(放回 ${out.filter((x) => x.visible).length})。還原:node scripts/fix-label-answers.mjs --restore "${file}"`);
