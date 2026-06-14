// 解析 data/extracted/**/*.txt → data/questions/<科目>.json + 轉換報告
// 用法: node scripts/parse-questions.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "data", "extracted");
const OUT = path.join(ROOT, "data", "questions");
const SUBJECT_MAP = { 國文: "chinese", 英文: "english", 數學: "math", 自然: "science", 社會: "social" };

const report = { files: 0, filesNoQuestion: [], total: 0, ok: 0, needsReview: 0, bySubject: {} };

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".txt")) out.push(p);
  }
  return out;
}

const LETTER_IDX = { A: 0, B: 1, C: 2, D: 3, E: 4 };

function mapDifficulty(diffText, source) {
  let d = diffText === "易" ? 2 : diffText === "中" ? 3 : diffText === "難" ? 4 : 3;
  if (/會考|特招/.test(source)) d = Math.min(5, d + 1);
  if (/補救/.test(source)) d = 1;
  return d;
}

// 從檔案路徑推導:冊次 / 單元 / 來源分類
function deriveMeta(relPath) {
  const parts = relPath.split(path.sep);
  const fileName = parts[parts.length - 1].replace(/\.txt$/, "");
  const sourceCat = parts[0] || "";
  const volume = parts.find((p) => /第\s*\d+\s*冊/.test(p)) || null;
  // 檔名如 "1-1負數與數線" 或 "01夏夜" 或 "103年度會考"
  let topic = fileName.replace(/^[\d\-. ]+/, "").trim() || fileName;
  const chapter = (fileName.match(/^(\d+-\d+)/) || [])[1] || null;
  return { sourceCat, volume, topic, chapter, fileName };
}

function parseBlock(block, ctx) {
  const numMatch = block.match(/^(\d+)\s*/);
  if (!numMatch) return null;
  const qNum = numMatch[1];
  let body = block.slice(numMatch[0].length).replace(//g, "\n");

  // 標頭欄位順序不固定(各科不同),逐一吃掉
  let diff = null, curr = null, know = null;
  const fieldRe = /^(?:難易度：(易|中|難)|學習內容：([^\s　]+)|學習表現：[^\s　]+|核心素養：[^\s　]+|主題：[^\s　]+|出處：[^\s　]+|知識點：([^\s　]+))[\s　]*/;
  for (let m; (m = body.match(fieldRe)); ) {
    if (m[1]) diff = m[1];
    if (m[2]) curr = m[2];
    if (m[3]) know = m[3];
    body = body.slice(m[0].length);
  }

  // 全形選項字母正規化
  body = body.replace(/[Ａ-Ｅ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

  // 答案與詳解
  const ansMatch = body.match(/《答案》\s*([A-E]+|[^詳\r\n]{1,40}?)\s*(?:詳解：([\s\S]*))?$/);
  let answerLetters = null, explanation = null, answerText = null;
  if (ansMatch) {
    const raw = ansMatch[1].trim();
    explanation = (ansMatch[2] || "").trim() || null;
    if (/^[A-E]+$/.test(raw)) answerLetters = raw;
    else answerText = raw;
    body = body.slice(0, ansMatch.index);
  }

  // 選項 (A)...(B)... 或全形 （A）...（B）...
  const optSplit = body.split(/[（(]([A-E])[）)]/);
  let questionText, options = null;
  if (optSplit.length >= 5) {
    questionText = optSplit[0];
    options = [];
    for (let i = 1; i < optSplit.length; i += 2) options.push(optSplit[i + 1].replace(/[　\s]+$/g, "").trim());
  } else {
    questionText = body;
  }
  questionText = questionText.replace(/^[（(]?[\s　]*[）)]\s*/, "").trim();

  const needsImage = /如圖|下圖|附圖|右圖|左圖|圖\(|如下表|下表|附表|如附件/.test(questionText) || ctx.inlineShapes > 0 && /圖|表/.test(questionText);
  const answer = answerLetters && answerLetters.length === 1 ? LETTER_IDX[answerLetters] : null;
  const type = options ? "single_choice" : "non_choice";
  const needs_review =
    !questionText || questionText.length < 4 ||
    (type === "single_choice" && (answer === null || options.some((o) => !o))) ||
    (type === "non_choice" && !answerText && !answerLetters) ||
    needsImage;

  return {
    id: `${ctx.subjKey}-${qNum}`,
    subject: ctx.subjKey,
    volume: ctx.volume,
    topic: ctx.topic,
    subtopic: ctx.chapter,
    difficulty: mapDifficulty(diff, ctx.sourceCat + ctx.fileName),
    type,
    question: questionText,
    options,
    answer,
    answer_text: answerText || (answerLetters && answerLetters.length > 1 ? answerLetters : null),
    explanation,
    source: `${ctx.sourceCat}/${ctx.fileName}`,
    curriculum_code: curr || null,
    knowledge_code: know || null,
    tags: [ctx.sourceCat].filter(Boolean),
    needs_review,
  };
}

fs.mkdirSync(OUT, { recursive: true });
const seen = new Set();

for (const [subjZh, subjKey] of Object.entries(SUBJECT_MAP)) {
  const dir = path.join(SRC, subjZh);
  if (!fs.existsSync(dir)) continue;
  const questions = [];
  const stat = { files: 0, ok: 0, needsReview: 0, dup: 0 };
  for (const file of walk(dir)) {
    report.files++; stat.files++;
    const text = fs.readFileSync(file, "utf8");
    const headerMatch = text.match(/^###META inline_shapes=(\d+)/);
    const inlineShapes = headerMatch ? Number(headerMatch[1]) : 0;
    const rel = path.relative(dir, file);
    const ctx = { subjKey, inlineShapes, ...deriveMeta(rel) };
    const blocks = text.split(/題號：/).slice(1);
    if (blocks.length === 0) { report.filesNoQuestion.push(`${subjZh}/${rel}`); continue; }
    for (const b of blocks) {
      const q = parseBlock(b.replace(/\r/g, ""), ctx);
      if (!q) continue;
      if (seen.has(q.id)) { stat.dup++; q.id = `${q.id}-${stat.dup}`; }
      seen.add(q.id);
      questions.push(q);
      report.total++;
      if (q.needs_review) { report.needsReview++; stat.needsReview++; }
      else { report.ok++; stat.ok++; }
    }
  }
  fs.writeFileSync(path.join(OUT, `${subjKey}.json`), JSON.stringify(questions, null, 1), "utf8");
  report.bySubject[subjZh] = { ...stat, total: stat.ok + stat.needsReview };
  console.log(`${subjZh}: ${stat.ok + stat.needsReview} 題 (可用 ${stat.ok} / 待校 ${stat.needsReview} / 檔案 ${stat.files})`);
}

fs.writeFileSync(path.join(ROOT, "data", "conversion-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`\n總計 ${report.total} 題,可用 ${report.ok},待校 ${report.needsReview}`);
console.log(`無法解析的檔案 ${report.filesNoQuestion.length} 個(清單見 data/conversion-report.json)`);
