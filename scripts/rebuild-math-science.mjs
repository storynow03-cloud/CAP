// 一鍵:解析 LibreOffice HTML → 合併 → 重建 Supabase 的數學/自然題庫
// 1) 先把 DB 中數學/自然全部設 needs_review=true(隱藏)
// 2) upsert 合併後的乾淨題庫(乾淨題會被設回 needs_review=false 顯示)
// 用法: node scripts/rebuild-math-science.mjs
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const QDIR = path.join(ROOT, "data", "questions");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SECRET_KEY;

console.log("[1/4] 解析 LibreOffice HTML…");
execSync("node scripts/parse-questions-lo.mjs", { cwd: ROOT, stdio: "inherit" });

console.log("[2/4] 合併圖片版 → 文字版題庫…");
for (const subj of ["math", "science"]) {
  const bak = path.join(QDIR, `${subj}.json.bak`);
  const htmlJson = path.join(QDIR, `${subj}.html.json`);
  if (!fs.existsSync(bak) || !fs.existsSync(htmlJson)) { console.log(`  ${subj}: 缺檔，略過`); continue; }
  const txt = JSON.parse(fs.readFileSync(bak, "utf8"));
  const html = JSON.parse(fs.readFileSync(htmlJson, "utf8"));
  const convertedSources = new Set(html.map((q) => q.source));
  const kept = txt.filter((q) => !convertedSources.has(q.source));
  const merged = [...kept, ...html];
  fs.writeFileSync(path.join(QDIR, `${subj}.json`), JSON.stringify(merged, null, 1), "utf8");
  console.log(`  ${subj}: 合併後 ${merged.length} 題(可用 ${merged.filter((q) => !q.needs_review).length}，HTML來源檔 ${convertedSources.size}）`);
}

console.log("[3/4] 將 DB 中數學/自然先全部隱藏(needs_review=true)…");
const r = await fetch(`${URL}/rest/v1/questions?subject=in.(math,science)`, {
  method: "PATCH",
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ needs_review: true }),
});
console.log(`  HTTP ${r.status}`);

console.log("[4/4] upsert 數學/自然合併題庫…");
const BATCH = 500;
for (const subj of ["math", "science"]) {
  const file = path.join(QDIR, `${subj}.json`);
  if (!fs.existsSync(file)) continue;
  const qs = JSON.parse(fs.readFileSync(file, "utf8"));
  let done = 0;
  for (let i = 0; i < qs.length; i += BATCH) {
    const batch = qs.slice(i, i + BATCH).map((q) => ({
      id: q.id, subject: q.subject, volume: q.volume, topic: q.topic, subtopic: q.subtopic,
      difficulty: q.difficulty, type: q.type, question: q.question, options: q.options,
      answer: q.answer, answer_text: q.answer_text, explanation: q.explanation, source: q.source,
      curriculum_code: q.curriculum_code, knowledge_code: q.knowledge_code, tags: q.tags, needs_review: q.needs_review,
    }));
    const res = await fetch(`${URL}/rest/v1/questions`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) { console.error(`  ${subj} 批次 ${i} 失敗 ${res.status}: ${(await res.text()).slice(0,200)}`); }
    else done += batch.length;
  }
  console.log(`  ${subj}: upsert ${done} 題`);
}
console.log("完成!數學/自然題庫已重建(含圖片版,破損題已隱藏)");
