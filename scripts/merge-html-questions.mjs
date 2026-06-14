// 合併:HTML 版題目(含圖/算式)覆蓋現有文字版題庫(同一來源檔)
// 先跑 parse-questions-html.mjs 產生 data/questions/<科目>.html.json,再跑本檔合併
// 用法: node scripts/merge-html-questions.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const QDIR = path.join(ROOT, "data", "questions");

for (const subj of ["math", "science"]) {
  const txtPath = path.join(QDIR, `${subj}.json.bak`);
  const htmlPath = path.join(QDIR, `${subj}.html.json`);
  if (!fs.existsSync(txtPath) || !fs.existsSync(htmlPath)) {
    console.log(`${subj}: 缺少 ${fs.existsSync(txtPath) ? "" : "txt備份 "}${fs.existsSync(htmlPath) ? "" : "html版"}，略過`);
    continue;
  }
  const txt = JSON.parse(fs.readFileSync(txtPath, "utf8"));
  const html = JSON.parse(fs.readFileSync(htmlPath, "utf8"));

  // HTML 已轉換的來源檔集合
  const convertedSources = new Set(html.map((q) => q.source));
  // 移除文字版中「來源檔已被 HTML 轉換」的題目,改用 HTML 版
  const kept = txt.filter((q) => !convertedSources.has(q.source));
  const merged = [...kept, ...html];

  const usableBefore = txt.filter((q) => !q.needs_review).length;
  const usableAfter = merged.filter((q) => !q.needs_review).length;
  fs.writeFileSync(path.join(QDIR, `${subj}.json`), JSON.stringify(merged, null, 1), "utf8");
  console.log(
    `${subj}: 合併後 ${merged.length} 題(可用 ${usableAfter}，原 ${usableBefore}，` +
    `HTML 來源檔 ${convertedSources.size} 個，HTML 題 ${html.length}）`
  );
}
console.log("合併完成,接著跑 import-questions.mjs 匯入");
