// 修正「知識點欄位吃掉題目開頭」(2026-10-04 最終品質檢查發現,484 題)
//
// 問題:原檔「知識點:」後面是空的,解析器把下一段文字(題目開頭)當成知識點代碼抓走,例:
//   knowledge_code = "讀完新詩後,將最適當的答案填入(",題目變成「中。讓我與你握別…」(開頭被截掉)
//   knowledge_code = "(",題目本身完整(被吃掉的只是作答括號)
// 做法:用 data/eq-text 的原檔全文(依題號找區塊),找出資料庫題目在原檔中的起點,
//   起點前被吃掉的文字 = 前綴;前綴只是作答括號「( )」→ 題目不動;否則把前綴補回題目開頭。
//   一律清掉錯誤的 knowledge_code。對不上原檔、前綴過長 → 該題隱藏(不猜)。
//
// 用法:node scripts/fix-misparsed-kc.mjs [--dump <檔>] [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const dumpIdx = process.argv.indexOf("--dump");

const ZH = { chinese: "國文", english: "英文", social: "社會", math: "數學", science: "自然" };
const CODE = /^[jJ][A-Za-z]{2,3}\d/;
const rows = (await fetchAll("questions?select=id,subject,source,type,question,options,answer,answer_text,explanation,knowledge_code,needs_review&knowledge_code=not.is.null&order=id"))
  .filter((q) => !CODE.test(q.knowledge_code.trim()));
console.log(`知識點欄位不是代碼的題目:${rows.length}`);

function walk(d) {
  return fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : [];
}
const fileCache = new Map();
function sourceText(q) {
  const [cat, name] = (q.source ?? "").split("/");
  const k = `${q.subject}|${q.source}`;
  if (!fileCache.has(k)) {
    const dir = path.join(ROOT, "data", "eq-text", ZH[q.subject] ?? "", cat ?? "");
    const hits = walk(dir).filter((f) => path.basename(f) === `${name}.doc.txt`).map((f) => fs.readFileSync(f, "utf8"));
    fileCache.set(k, hits);
  }
  return fileCache.get(k);
}

// 正規化:去空白、全形英數括號轉半形;回傳字串與「正規化位置 → 原始位置」對照
const norm1 = (c) => {
  if (/[\s　 \x00-\x1f]/.test(c)) return "";
  const code = c.charCodeAt(0);
  if (code >= 0xff01 && code <= 0xff5e) return String.fromCharCode(code - 0xfee0);
  return c;
};
function normMap(raw) {
  let s = ""; const pos = [];
  for (let i = 0; i < raw.length; i++) { const n = norm1(raw[i]); if (n) { s += n; pos.push(i); } }
  return { s, pos };
}
const plainHtml = (h) => h.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const changes = [];
const stats = {};
const bump = (k) => (stats[k] = (stats[k] ?? 0) + 1);
const samples = [];
for (const q of rows) {
  const num = q.id.match(/-(\d{6,8})/)?.[1];
  let done = false;
  for (const T of sourceText(q)) {
    const i = T.indexOf(`題號：${num}`);
    if (i < 0) continue;
    const j = T.indexOf("題號：", i + 5);
    const block = T.slice(i, j < 0 ? undefined : j);
    const k = block.indexOf("知識點：");
    if (k < 0) continue;
    const body = block.slice(k + 4);
    const bm = normMap(body);
    const head = normMap(plainHtml(q.question)).s.slice(0, 24);
    if (head.length < 4) continue;
    const at = bm.s.indexOf(head);
    if (at < 0) continue;
    const prefixRaw = body.slice(0, bm.pos[at]).replace(/[\x00-\x1f]/g, "").trim();
    const prefixNorm = normMap(prefixRaw).s;
    let question = q.question;
    if (prefixNorm && !/^\(\)$/.test(prefixNorm)) {
      if (prefixRaw.length > 120) { bump("前綴過長(不猜,隱藏)"); break; }
      const pre = prefixRaw.replace(/^[（(]\s*[）)]\s*/, "");   // 開頭若是作答括號照慣例拿掉
      // 解析器吃掉了中間的空白:英文單字接縫補一個空格(「My」+「brother」)
      const gap = /[A-Za-z’'.,!?]$/.test(pre) && /^[A-Za-z]/.test(plainHtml(question)) ? " " : "";
      question = pre + gap + question;
      bump("補回題目開頭");
    } else bump("題目完整,只清知識點欄位");
    const fixed = { ...q, question, knowledge_code: null };
    const p = problems(fixed);
    const after = { knowledge_code: null };
    if (question !== q.question) after.question = question;
    if (!q.needs_review && p.length) { after.needs_review = true; bump("修正後仍有問題 → 隱藏"); }
    changes.push({ id: q.id, before: { knowledge_code: q.knowledge_code, question: q.question, needs_review: q.needs_review }, after });
    if (after.question && samples.length < 8) samples.push(`${q.id}:${plainHtml(question).slice(0, 70)}`);
    done = true;
    break;
  }
  if (!done && !stats["前綴過長(不猜,隱藏)"]) { /* noop */ }
  if (!done) {
    bump("對不上原檔");
    if (!q.needs_review) changes.push({ id: q.id, before: { needs_review: false, knowledge_code: q.knowledge_code }, after: { needs_review: true, knowledge_code: null } });
  }
}
console.log(stats);
console.log("補回開頭抽樣:\n " + samples.join("\n "));
if (dumpIdx !== -1) fs.writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(changes, null, 1), "utf8");
if (APPLY) {
  const backupFile = writeBackup("misparsed-kc", changes.map((c) => ({ id: c.id, ...c.before })));
  console.log(`備份:${backupFile}`);
  await runPool(changes, (c) => patchQuestion(c.id, c.after));
  console.log(`✅ 已更新 ${changes.length} 題`);
  console.log(`還原:node scripts/fix-misparsed-kc.mjs --restore "${backupFile}"`);
}
