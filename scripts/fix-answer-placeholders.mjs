// 修正非選題「參考答案」殘留的轉檔佔位符(2026-10-04 最終品質檢查發現)
//
// 問題:數學/自然非選題的答案是一張圖,解析器 restore() 沒套用到 answer_text,
//   孩子在「非選題練習」翻答案時看到的是「[[IMG:53]]」,另有「[[SUP:6]]」上標沒還原。
// 做法:同一份來源檔的圖片都放在 /qimg/<科目>/<slug>/<編號3碼>.<副檔名>;
//   slug 取「同一來源檔其他題目已在使用的資料夾」(必須唯一),編號 = 佔位符數字,
//   圖檔實際存在才換成 <img>;找不到或有歧義 → 該題隱藏(不猜)。[[SUP:x]] → <sup>x</sup>。
//
// 用法:node scripts/fix-answer-placeholders.mjs [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const PUB = path.join(ROOT, "web", "public");

const rows = await fetchAll("questions?select=id,subject,source,question,options,explanation,answer_text,needs_review&answer_text=like.*%5B%5B*&order=id");
console.log(`answer_text 含 [[ 的題目:${rows.length}`);

const slugCache = new Map();
async function slugsOf(subject, source) {
  const k = `${subject}|${source}`;
  if (!slugCache.has(k)) {
    const sib = await fetchAll(`questions?select=question,options,explanation&subject=eq.${subject}&source=eq.${encodeURIComponent(source)}&order=id`);
    const set = new Set();
    for (const s of sib) for (const m of JSON.stringify(s).matchAll(new RegExp(`/qimg/${subject}/([0-9a-f]{10})/`, "g"))) set.add(m[1]);
    slugCache.set(k, [...set]);
  }
  return slugCache.get(k);
}

const changes = [];
const stats = {};
const bump = (k) => (stats[k] = (stats[k] ?? 0) + 1);
for (const q of rows) {
  const slugs = await slugsOf(q.subject, q.source);
  let failed = null;
  const fixed = q.answer_text
    .replace(/\[\[SUP:([\s\S]*?)\]\]/g, "<sup>$1</sup>")
    .replace(/\[\[SUB:([\s\S]*?)\]\]/g, "<sub>$1</sub>")
    .replace(/\[\[IMG:(\d+)\]\]/g, (m, n) => {
      const name = String(Number(n)).padStart(3, "0");
      const hits = slugs.flatMap((sl) => {
        const dir = path.join(PUB, "qimg", q.subject, sl);
        return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(name + ".")).map((f) => `/qimg/${q.subject}/${sl}/${f}`) : [];
      });
      if (hits.length !== 1) { failed = hits.length ? "圖片資料夾有歧義" : "找不到圖檔"; return m; }
      return `<img src="${hits[0]}" alt="式" />`;
    });
  if (failed || /\[\[|\]\]/.test(fixed)) {
    bump(`無法修正:${failed ?? "其他佔位符"}`);
    if (!q.needs_review) changes.push({ id: q.id, before: { needs_review: false }, after: { needs_review: true } });
    continue;
  }
  bump("修正成功");
  changes.push({ id: q.id, before: { answer_text: q.answer_text }, after: { answer_text: fixed } });
}
console.log(stats);
console.log("抽樣:", changes.filter((c) => c.after.answer_text).slice(0, 3).map((c) => `${c.id} → ${c.after.answer_text}`));

if (APPLY) {
  const backupFile = writeBackup("answer-placeholders", changes.map((c) => ({ id: c.id, ...c.before })));
  console.log(`備份:${backupFile}`);
  await runPool(changes, (c) => patchQuestion(c.id, c.after));
  console.log(`✅ 已更新 ${changes.length} 題`);
  console.log(`還原:node scripts/fix-answer-placeholders.mjs --restore "${backupFile}"`);
}
