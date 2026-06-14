// 匯入 data/questions/*.json → Supabase questions 表(REST 分批 upsert)
// 用法: node scripts/import-questions.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const QDIR = path.join(ROOT, "data", "questions");

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SECRET_KEY;

const BATCH = 500;
let grand = 0;

for (const file of fs.readdirSync(QDIR).filter((f) => f.endsWith(".json"))) {
  const questions = JSON.parse(fs.readFileSync(path.join(QDIR, file), "utf8"));
  console.log(`${file}: ${questions.length} 題`);
  for (let i = 0; i < questions.length; i += BATCH) {
    const batch = questions.slice(i, i + BATCH).map((q) => ({
      id: q.id,
      subject: q.subject,
      volume: q.volume,
      topic: q.topic,
      subtopic: q.subtopic,
      difficulty: q.difficulty,
      type: q.type,
      question: q.question,
      options: q.options,
      answer: q.answer,
      answer_text: q.answer_text,
      explanation: q.explanation,
      source: q.source,
      curriculum_code: q.curriculum_code,
      knowledge_code: q.knowledge_code,
      tags: q.tags,
      needs_review: q.needs_review,
    }));
    const res = await fetch(`${URL}/rest/v1/questions`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      console.error(`  批次 ${i} 失敗: ${res.status} ${await res.text()}`);
      process.exitCode = 1;
    } else {
      grand += batch.length;
      process.stdout.write(`  已匯入 ${Math.min(i + BATCH, questions.length)}/${questions.length}  \r`);
    }
  }
  console.log("");
}
console.log(`完成,共匯入 ${grand} 題`);
