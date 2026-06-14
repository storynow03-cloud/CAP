// 解析 data/html/**/*.htm(Word FilteredHTML)→ data/questions/<科目>.json
// 數學式/圖片 → 複製到 web/public/qimg/ 並以 <img> 內嵌;上標保留 <sup>
// 用法: node scripts/parse-questions-html.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "data", "html");
const OUT = path.join(ROOT, "data", "questions");
const IMG_OUT = path.join(ROOT, "web", "public", "qimg");
const SUBJECT_MAP = { 國文: "chinese", 英文: "english", 數學: "math", 自然: "science", 社會: "social" };

const report = { files: 0, filesNoQuestion: [], total: 0, ok: 0, needsReview: 0, images: 0 };

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.html?$/i.test(e.name)) out.push(p);
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

function deriveMeta(relPath) {
  const parts = relPath.split(path.sep);
  const fileName = parts[parts.length - 1].replace(/\.html?$/i, "");
  const sourceCat = parts[0] || "";
  const volume = parts.find((p) => /第\s*\d+\s*冊/.test(p)) || null;
  let topic = fileName.replace(/^[\d\-. ]+/, "").trim() || fileName;
  const chapter = (fileName.match(/^(\d+-\d+)/) || [])[1] || null;
  // 會考年度卷:單元統一為「NNN年會考」
  const yr = fileName.match(/^(\d{3})年度/);
  if (yr) topic = `${yr[1]}年會考`;
  return { sourceCat, volume, topic, chapter, fileName };
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** 將 Word HTML 簡化成「純文字 + [[IMG:n]] + [[SUP:x]] [[SUB:x]] 佔位符」 */
function simplify(html, images) {
  let s = html.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  // 圖片 → 佔位符(記錄原始 src)
  s = s.replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, (_, src) => {
    images.push(decodeEntities(src));
    return `[[IMG:${images.length - 1}]]`;
  });
  // 上下標
  s = s.replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_, t) => `[[SUP:${t.replace(/<[^>]+>/g, "")}]]`);
  s = s.replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_, t) => `[[SUB:${t.replace(/<[^>]+>/g, "")}]]`);
  // 段落 → 換行,其餘標籤移除
  s = s.replace(/<\/(p|div|tr|h\d)>/gi, "\n").replace(/<br[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.replace(/\r/g, "").replace(/[ \t ]+/g, (m) => (m.includes("　") ? m : " "));
  s = s.replace(/\n{2,}/g, "\n");
  return s;
}

/** 佔位符還原成 HTML(img src 已重寫) */
function restore(s, imgMap) {
  // 去掉沾到下一題的 Word 清單編號(如結尾的「12.」)
  s = s.replace(/\n\d{1,3}\.\s*$/, "");
  return s
    .replace(/\[\[IMG:(\d+)\]\]/g, (_, i) => {
      const src = imgMap[+i];
      return src ? `<img src="${src}" alt="圖" />` : "";
    })
    .replace(/\[\[SUP:([\s\S]*?)\]\]/g, "<sup>$1</sup>")
    .replace(/\[\[SUB:([\s\S]*?)\]\]/g, "<sub>$1</sub>")
    .trim();
}

const plainLen = (s) =>
  s.replace(/\[\[IMG:\d+\]\]/g, "").replace(/\[\[(SUP|SUB):([\s\S]*?)\]\]/g, "$2").trim().length;
const hasImg = (s) => /\[\[IMG:\d+\]\]/.test(s);

function parseBlock(block, ctx) {
  const numMatch = block.match(/^(\d+)\s*/);
  if (!numMatch) return null;
  const qNum = numMatch[1];
  let body = block.slice(numMatch[0].length);

  let diff = null, curr = null, know = null;
  const fieldRe = /^(?:難易度：(易|中|難)|學習內容：([^\s　]+)|學習表現：[^\s　]+|核心素養：[^\s　]+|主題：[^\s　]+|出處：[^\s　]+|知識點：([^\s　]+))[\s　]*/;
  for (let m; (m = body.match(fieldRe)); ) {
    if (m[1]) diff = m[1];
    if (m[2]) curr = m[2];
    if (m[3]) know = m[3];
    body = body.slice(m[0].length);
  }

  body = body.replace(/[Ａ-Ｅ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

  const ansMatch = body.match(/《答案》\s*([A-E]+|[^詳\n]{1,60}?)\s*(?:詳解：([\s\S]*))?$/);
  let answerLetters = null, explanation = null, answerText = null;
  if (ansMatch) {
    const raw = ansMatch[1].trim();
    explanation = (ansMatch[2] || "").trim() || null;
    if (/^[A-E]+$/.test(raw)) answerLetters = raw;
    else answerText = raw;
    body = body.slice(0, ansMatch.index);
  }

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

  const answer = answerLetters && answerLetters.length === 1 ? LETTER_IDX[answerLetters] : null;
  const type = options ? "single_choice" : "non_choice";
  const qLen = plainLen(questionText) + (hasImg(questionText) ? 10 : 0);
  const needs_review =
    qLen < 4 ||
    (type === "single_choice" &&
      (answer === null || options.some((o) => plainLen(o) === 0 && !hasImg(o)))) ||
    (type === "non_choice" && !answerText && !answerLetters);

  return {
    qNum, diff, curr, know, questionText, options, answer, answerText, answerLetters,
    explanation, type, needs_review,
  };
}

fs.mkdirSync(OUT, { recursive: true });

for (const [subjZh, subjKey] of Object.entries(SUBJECT_MAP)) {
  const dir = path.join(SRC, subjZh);
  if (!fs.existsSync(dir)) continue;
  const questions = [];
  const seen = new Map();
  const stat = { files: 0, ok: 0, needsReview: 0, dup: 0 };

  for (const file of walk(dir)) {
    report.files++; stat.files++;
    const html = fs.readFileSync(file, "utf8");
    const rel = path.relative(dir, file);
    const ctx = deriveMeta(rel);
    const images = [];
    const text = simplify(html, images);

    // 複製圖片並建立 src 對照(僅複製有被題目引用者,於還原時處理)
    const fileDir = path.dirname(file);
    const slug = crypto.createHash("md5").update(rel).digest("hex").slice(0, 10);
    const imgMap = [];
    for (let i = 0; i < images.length; i++) {
      const srcRel = decodeURIComponent(images[i]).replace(/\\/g, "/");
      const srcPath = path.join(fileDir, srcRel);
      if (!fs.existsSync(srcPath)) { imgMap[i] = null; continue; }
      const ext = path.extname(srcPath) || ".png";
      const destDir = path.join(IMG_OUT, subjKey, slug);
      fs.mkdirSync(destDir, { recursive: true });
      const destName = `${String(i).padStart(3, "0")}${ext}`;
      fs.copyFileSync(srcPath, path.join(destDir, destName));
      imgMap[i] = `/qimg/${subjKey}/${slug}/${destName}`;
      report.images++;
    }

    const blocks = text.split(/題號：/).slice(1);
    if (blocks.length === 0) { report.filesNoQuestion.push(`${subjZh}/${rel}`); continue; }

    for (const b of blocks) {
      const p = parseBlock(b, ctx);
      if (!p) continue;
      let id = `${subjKey}-${p.qNum}`;
      if (seen.has(id)) {
        stat.dup++;
        id = `${id}-${stat.dup}`;
      }
      seen.set(id, true);
      const q = {
        id,
        subject: subjKey,
        volume: ctx.volume,
        topic: ctx.topic,
        subtopic: ctx.chapter,
        difficulty: mapDifficulty(p.diff, ctx.sourceCat + ctx.fileName),
        type: p.type,
        question: restore(p.questionText, imgMap),
        options: p.options ? p.options.map((o) => restore(o, imgMap)) : null,
        answer: p.answer,
        answer_text: p.answerText || (p.answerLetters && p.answerLetters.length > 1 ? p.answerLetters : null),
        explanation: p.explanation ? restore(p.explanation, imgMap) : null,
        source: `${ctx.sourceCat}/${ctx.fileName}`,
        curriculum_code: p.curr || null,
        knowledge_code: p.know || null,
        tags: [ctx.sourceCat].filter(Boolean),
        needs_review: p.needs_review,
      };
      questions.push(q);
      report.total++;
      if (q.needs_review) { report.needsReview++; stat.needsReview++; }
      else { report.ok++; stat.ok++; }
    }
  }

  fs.writeFileSync(path.join(OUT, `${subjKey}.json`), JSON.stringify(questions, null, 1), "utf8");
  console.log(`${subjZh}: ${stat.ok + stat.needsReview} 題 (可用 ${stat.ok} / 待校 ${stat.needsReview} / 檔案 ${stat.files})`);
}

fs.writeFileSync(path.join(ROOT, "data", "conversion-report-html.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`\n總計 ${report.total} 題,可用 ${report.ok},待校 ${report.needsReview},圖片 ${report.images} 張`);
