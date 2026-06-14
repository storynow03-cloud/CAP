// 解析 data/lo-html/{數學,自然}/**/*.html(LibreOffice 輸出)
// → data/questions/{math,science}.html.json,圖片複製到 web/public/qimg/
// 之後用 merge-html-questions.mjs 合併進主題庫
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "data", "lo-html");
const OUT = path.join(ROOT, "data", "questions");
const IMG_OUT = path.join(ROOT, "web", "public", "qimg");
const SUBJECT_MAP = { 數學: "math", 自然: "science" };

const report = { files: 0, filesNoQuestion: [], total: 0, ok: 0, needsReview: 0, images: 0 };

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
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
  return d;
}

function deriveMeta(relPath) {
  const parts = relPath.split(path.sep);
  const fileName = parts[parts.length - 1].replace(/\.html?$/i, "");
  const sourceCat = parts[0] || "";
  const volume = parts.find((p) => /第\s*\d+\s*冊/.test(p)) || null;
  let topic = fileName.replace(/^[\d\-. ]+/, "").trim() || fileName;
  const chapter = (fileName.match(/^(\d+-\d+)/) || [])[1] || null;
  const yr = fileName.match(/(\d{3})年度/);
  if (yr) topic = `${yr[1]}年會考`;
  return { sourceCat, volume, topic, chapter, fileName };
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

function simplify(html, images) {
  let s = html.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, (_, src) => {
    images.push(decodeEntities(src));
    return `[[IMG:${images.length - 1}]]`;
  });
  s = s.replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_, t) => `[[SUP:${t.replace(/<[^>]+>/g, "")}]]`);
  s = s.replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_, t) => `[[SUB:${t.replace(/<[^>]+>/g, "")}]]`);
  s = s.replace(/<\/(p|div|tr|h\d)>/gi, "\n").replace(/<br[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.replace(/\r/g, "").replace(/[ \t ]+/g, " ");
  s = s.replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{2,}/g, "\n");
  return s;
}

function restore(s, imgMap) {
  s = s.replace(/\n\d{1,3}\.\s*$/, "");
  s = s
    .replace(/\[\[IMG:(\d+)\]\]/g, (_, i) => {
      const src = imgMap[+i];
      return src ? `<img src="${src}" alt="式" />` : "";
    })
    .replace(/\[\[SUP:([\s\S]*?)\]\]/g, "<sup>$1</sup>")
    .replace(/\[\[SUB:([\s\S]*?)\]\]/g, "<sub>$1</sub>");
  // 清掉被選項切割破壞的殘留佔位符碎片
  s = s.replace(/\[\[(?:SUP|SUB|IMG):?/g, "").replace(/\]\]/g, "");
  return s.replace(/[ \t]*\n[ \t]*/g, " ").trim();
}

// 偵測轉換缺漏(線段名稱/次方掉字造成的破損題)
function looksDegraded(question, options) {
  const qPlain = question.replace(/<[^>]+>/g, "");
  // 句中運算子/比較符前缺左運算元(如「若＝10」「中，//」)
  if (/[，。：若則為與和（(]\s*(＝|＜|＞|／／|\/\/|≧|≦)/.test(qPlain)) return true;
  if (/[一-鿿]\s*(／／|\/\/)/.test(qPlain)) return true;
  // 線段/點名稱掉字:出現「在、上」「於、的」「，、」「、，」等缺名詞徵兆
  if (/[在於]\s*[、，]/.test(qPlain)) return true;
  if (/[、，]\s*[上中內下]([，。、\s）)]|$)/.test(qPlain)) return true;
  if (/[，。]\s*[、，]|[、，]\s*[，。]/.test(qPlain)) return true;
  if (/[（(]\s*[、，]|[、，]\s*[）)]/.test(qPlain)) return true;
  // 殘留未還原碎片
  if (/\[\[|\]\]/.test(question) || (options || []).some((o) => /\[\[|\]\]/.test(o))) return true;
  // 選項重複(掉字導致)
  const plainOpts = (options || []).map((o) => o.replace(/<[^>]+>/g, "").trim());
  if (plainOpts.length >= 2 && plainOpts.every((o) => o.length > 0)) {
    if (new Set(plainOpts).size < plainOpts.length) return true;
  }
  return false;
}

const plainLen = (s) => s.replace(/\[\[IMG:\d+\]\]/g, "").replace(/\[\[(SUP|SUB):([\s\S]*?)\]\]/g, "$2").trim().length;
const imgCount = (s) => (s.match(/\[\[IMG:\d+\]\]/g) || []).length;

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

  const ansMatch = body.match(/《答案》\s*([A-E]+|[^詳\n]{1,60}?)\s*(?:【[^】]*】)?\s*(?:詳解：([\s\S]*))?$/);
  let answerLetters = null, explanation = null, answerText = null;
  if (ansMatch) {
    const raw = ansMatch[1].trim();
    explanation = (ansMatch[2] || "").trim() || null;
    if (/^[A-E]+$/.test(raw)) answerLetters = raw;
    else answerText = raw;
    body = body.slice(0, ansMatch.index);
  }

  // 去掉題尾的【會NNN】等標記
  body = body.replace(/【[^】]*】/g, "");

  const optSplit = body.split(/[（(]([A-E])[）)]/);
  let questionText, options = null;
  if (optSplit.length >= 5) {
    questionText = optSplit[0];
    options = [];
    for (let i = 1; i < optSplit.length; i += 2) options.push((optSplit[i + 1] || "").replace(/[　\s]+$/g, "").trim());
  } else {
    questionText = body;
  }
  questionText = questionText.replace(/^[（(]?[\s　]*[）)]\s*/, "").trim();

  const answer = answerLetters && answerLetters.length === 1 ? LETTER_IDX[answerLetters] : null;
  const type = options ? "single_choice" : "non_choice";
  const qScore = plainLen(questionText) + imgCount(questionText) * 6;
  const needs_review =
    qScore < 4 ||
    (type === "single_choice" &&
      (answer === null || options.some((o) => plainLen(o) === 0 && imgCount(o) === 0))) ||
    (type === "non_choice" && !answerText && !answerLetters);

  return { qNum, diff, curr, know, questionText, options, answer, answerText, answerLetters, explanation, type, needs_review };
}

fs.mkdirSync(OUT, { recursive: true });

for (const [subjZh, subjKey] of Object.entries(SUBJECT_MAP)) {
  const dir = path.join(SRC, subjZh);
  if (!fs.existsSync(dir)) { console.log(`${subjZh}: 尚無 lo-html`); continue; }
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

    const fileDir = path.dirname(file);
    const slug = crypto.createHash("md5").update(rel).digest("hex").slice(0, 10);
    const imgMap = [];
    for (let i = 0; i < images.length; i++) {
      const srcRel = decodeURIComponent(images[i]).replace(/\\/g, "/");
      const srcPath = path.join(fileDir, srcRel);
      if (!fs.existsSync(srcPath)) { imgMap[i] = null; continue; }
      const ext = path.extname(srcPath) || ".gif";
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
      if (seen.has(id)) { stat.dup++; id = `${id}-${stat.dup}`; }
      seen.set(id, true);
      const qText = restore(p.questionText, imgMap);
      const qOptions = p.options ? p.options.map((o) => restore(o, imgMap)) : null;
      const degraded = !p.needs_review && p.type === "single_choice" && looksDegraded(qText, qOptions);
      const q = {
        id, subject: subjKey, volume: ctx.volume, topic: ctx.topic, subtopic: ctx.chapter,
        difficulty: mapDifficulty(p.diff, ctx.sourceCat + ctx.fileName),
        type: p.type, question: qText,
        options: qOptions,
        answer: p.answer,
        answer_text: p.answerText || (p.answerLetters && p.answerLetters.length > 1 ? p.answerLetters : null),
        explanation: p.explanation ? restore(p.explanation, imgMap) : null,
        source: `${ctx.sourceCat}/${ctx.fileName}`,
        curriculum_code: p.curr || null, knowledge_code: p.know || null,
        tags: [ctx.sourceCat].filter(Boolean), needs_review: p.needs_review || degraded,
      };
      questions.push(q);
      report.total++;
      if (q.needs_review) { report.needsReview++; stat.needsReview++; } else { report.ok++; stat.ok++; }
    }
  }

  fs.writeFileSync(path.join(OUT, `${subjKey}.html.json`), JSON.stringify(questions, null, 1), "utf8");
  console.log(`${subjZh}: ${stat.ok + stat.needsReview} 題(可用 ${stat.ok} / 待校 ${stat.needsReview} / 檔案 ${stat.files})`);
}

fs.writeFileSync(path.join(ROOT, "data", "conversion-report-lo.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`\n總計 ${report.total} 題,可用 ${report.ok},待校 ${report.needsReview},圖片 ${report.images} 張`);
