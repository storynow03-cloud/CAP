// 題庫最終品質檢查(2026-10-04,唯讀):掃描所有「孩子看得到」(needs_review = false)的題目。
//   缺字:lib/question-checks 嚴格檢查、殘留 Word 算式代碼、私用區空白符號、控制字元、佔位符
//   缺圖:每張 <img> 的檔案是否存在於 web/public,且已進 git(= 已部署)
//   排列:選項數、答案範圍、選項內夾帶其他選項標記、重複選項
//   章節:知識點代碼前綴 vs 科目、冊別/單元缺漏、單元名稱 vs 來源檔名、社會分科矛盾
// 用法:node scripts/final-qa.mjs [--out <json>]   (輸出每一類的題號,供後續隱藏或修正)
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT, fetchAll } from "./lib/rest.mjs";
import { problems, plain } from "./lib/question-checks.mjs";

const outIdx = process.argv.indexOf("--out");
const OUT = outIdx !== -1 ? process.argv[outIdx + 1] : null;

const rows = await fetchAll(
  "questions?select=id,subject,type,volume,topic,subtopic,source,knowledge_code,curriculum_code,question,options,answer,answer_text,explanation&needs_review=eq.false&order=id"
);
console.log(`可見題目 ${rows.length} 題`);

const tracked = new Set(
  execSync("git ls-files web/public/qimg", { cwd: ROOT, maxBuffer: 1 << 28 }).toString().split("\n").filter(Boolean).map((p) => "/" + p.replace(/^web\/public\//, ""))
);

const issues = {};
const add = (k, q, detail = "") => (issues[k] ??= []).push(detail ? `${q.id} ${detail}` : q.id);
const PREFIX = { math: ["JMA"], science: ["JNA"], chinese: ["JCH"], english: ["JEN"], social: ["JSG", "JSH", "JSC"] };
const SOCIAL_SUB = { JSG: "01", JSH: "02", JSC: "03" };
const imgSeen = new Set();

for (const q of rows) {
  const texts = [q.question, ...(q.options ?? []), q.answer_text, q.explanation].filter(Boolean);
  const all = texts.join("\n");
  const qo = [q.question, ...(q.options ?? [])].join("\n");

  // ── 缺字 ──
  for (const p of problems(q)) add(`缺字/結構:${p}`, q);
  if (/EQ\s*\\|\\[FfRrOoXxBbAaSs]\s*\(|〖EQ|\\ac\(/.test(plain(qo))) add("缺字:題幹/選項殘留 Word 算式代碼", q);
  if (/[-]/.test(qo)) add("缺字:題幹/選項有無法顯示的符號", q);
  if (/[-]/.test(q.explanation ?? "")) add("缺字(輕微):詳解有無法顯示的符號", q);
  if (/\[\[|\]\]/.test(all)) add("缺字:殘留轉檔佔位符 [[ ]]", q);

  // ── 缺圖 ──
  for (const m of all.matchAll(/<img[^>]*src="([^"]*)"/g)) {
    const src = m[1];
    if (!src || !src.startsWith("/")) { add("缺圖:圖片網址異常", q, src); continue; }
    if (!imgSeen.has(src)) {
      imgSeen.add(src);
    }
    if (!fs.existsSync(path.join(ROOT, "web", "public", src))) add("缺圖:圖檔不存在", q, src);
    else if (!tracked.has(src)) add("缺圖:圖檔沒進 git(正式站沒有)", q, src);
  }

  // ── 排列 ──
  if (q.type === "single_choice" && q.options) {
    q.options.forEach((o, i) => {
      if (/[（(]\s*[A-EＡ-Ｅ]\s*[）)]/.test(plain(o))) add("排列:選項內夾帶其他選項標記", q, `(${"ABCDE"[i]})`);
    });
    if (q.options.length !== 4) add(`排列(資訊):選項數 = ${q.options.length}`, q);
  }

  // ── 章節分類 ──
  const kc = (q.knowledge_code ?? "").toUpperCase();
  const pre = kc.slice(0, 3);
  if (!kc) add("章節:沒有知識點代碼", q);
  else if (!(PREFIX[q.subject] ?? []).includes(pre)) add("章節:知識點代碼與科目不符", q, kc.slice(0, 15));
  if (!q.volume) add("章節(資訊):沒有冊別(多為會考真題/綜合卷)", q);
  if (["math", "science", "social"].includes(q.subject) && !q.subtopic && !/會考|特招/.test(q.source ?? "")) add("章節:沒有單元編號", q);
  const file = (q.source ?? "").split("/").pop() ?? "";
  if (q.subtopic && file && !file.replace(/\s/g, "").startsWith(q.subtopic.replace(/\s/g, ""))) add("章節:單元編號與來源檔名不符", q, `${q.subtopic} vs ${file}`);
  if (q.topic && file && !/會考|特招|年度/.test(file) && !file.includes(q.topic.replace(/^L\d+_/, "").slice(0, 4))) add("章節:單元名稱與來源檔名不符", q, `${q.topic} vs ${file}`);
  if (q.subject === "social" && SOCIAL_SUB[pre] && q.subtopic && !q.subtopic.startsWith(SOCIAL_SUB[pre])) add("章節:社會分科矛盾(知識點 vs 單元編號)", q, `${kc.slice(0, 3)} vs ${q.subtopic}`);
}

const keys = Object.keys(issues).sort();
console.log("\n=== 結果(題數)===");
for (const k of keys) console.log(`${String(issues[k].length).padStart(6)}  ${k}   例:${issues[k].slice(0, 3).join(" ; ")}`);
console.log(`\n不重複圖片 ${imgSeen.size} 張;git 追蹤的題目圖檔 ${tracked.size} 張`);
if (OUT) fs.writeFileSync(OUT, JSON.stringify(issues, null, 1), "utf8");
