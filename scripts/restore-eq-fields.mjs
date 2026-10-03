// 補回數學/自然題目中「靜默消失」的 Word EQ 算式(分數、圈圈數字、線段上劃線、聯立大括號…)(2026-10-03)
//
// 問題:康軒 .doc 的分數等是 Word EQ 功能變數,LibreOffice/HTML 匯出時整個消失,題目變成
//   「小龍吃了全部的，小文吃了全部的，…」「(B) 的相反數是4」,舊的掉字偵測抓不到,孩子看得到這些壞題。
// 做法:
//   1. export-eq-text.ps1 用 Word 匯出「含功能變數代碼」的全文 → data/eq-text/
//   2. 本檔依「題號：」切塊,對每題的題幹/各選項/詳解:把來源文字去掉 EQ 後,必須與資料庫現有文字
//      逐字相同(忽略空白),才把 EQ 轉成 HTML(lib/eq-field.mjs)插回原位置。
//      所以除了補上的算式,題目其他文字一個字都不會變。
//   3. 題幹/選項裡有任何 EQ 補不回(對不上、語法不支援、可能含上標)→ 該題隱藏(needs_review=true)。
//   4. 補完後通過 lib/question-checks.mjs 嚴格檢查、且不是管理者手動隱藏的題 → 放回題庫。
//
// 用法:node scripts/restore-eq-fields.mjs [--dump <檔>] | --apply | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";
import { eqToHtml, EqUnsupported } from "./lib/eq-field.mjs";

const APPLY = process.argv.includes("--apply");
const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const dumpIdx = process.argv.indexOf("--dump");
const DUMP = dumpIdx !== -1 ? process.argv[dumpIdx + 1] : null;

const EQ_DIR = path.join(ROOT, "data", "eq-text");
const SUBJ = { 數學: "math", 自然: "science" };

// ── 1. 讀 Word 全文,解析功能變數(可巢狀)成 token:{ c } 字元 或 { eq } 算式代碼 ──
function tokenize(T) {
  let i = 0;
  function field() { // 進來時 T[i] === \x13
    i++;
    let code = "", nestedBad = false;
    const result = [];
    let inResult = false;
    while (i < T.length) {
      const ch = T[i];
      if (ch === "\x13") {
        const sub = field();
        if (inResult) result.push(...sub.tokens);
        else if (sub.isEq) code += " " + sub.code.replace(/^\s*\\?eq\s*/i, "");
        else nestedBad = true;
        continue;
      }
      if (ch === "\x14") { inResult = true; i++; continue; }
      if (ch === "\x15") { i++; break; }
      if (inResult) result.push(...plainTok(ch)); else code += ch;
      i++;
    }
    const isEq = /^\s*\\?eq\b/i.test(code) || /^\s*\\?eq\\/i.test(code);
    if (isEq) return { isEq, code, tokens: [{ eq: code.trim(), bad: nestedBad }] };
    return { isEq: false, code, tokens: result }; // 其他變數(EMBED 圖片等):只留結果文字
  }
  function plainTok(ch) {
    if (ch === "\x01" || ch === "\x08" || ch === "\x1f" || ch === "\x05") return [];
    if (/[\x00-\x1f]/.test(ch)) return [{ c: " " }];
    return [{ c: ch }];
  }
  const out = [];
  while (i < T.length) {
    if (T[i] === "\x13") { out.push(...field().tokens); continue; }
    out.push(...plainTok(T[i])); i++;
  }
  return out;
}

// 比對用的正規化:去空白、全形括號/A-E 轉半形(解析器對題目做過同樣轉換)。
// Symbol/Wingdings 字型的符號(⇒ ≦ …):Word 純文字讀成 "(",資料庫裡是私用區字元 U+F0xx → 視為相同
const norm = (ch) => {
  if (/[\s　 ]/.test(ch)) return "";
  if (/[-]/.test(ch)) return "(";
  if (ch === "（") return "(";
  if (ch === "）") return ")";
  if (/[Ａ-Ｅ]/.test(ch)) return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  return ch;
};

/** token 陣列 → { s: 正規化字串, eqAt: Map<位置, EQ代碼[]> }(EQ 記在它後面那個字的位置) */
function flatten(tokens) {
  let s = "";
  const eqAt = new Map();
  for (const t of tokens) {
    if (t.eq !== undefined) {
      if (!eqAt.has(s.length)) eqAt.set(s.length, []);
      eqAt.get(s.length).push(t);
    } else s += norm(t.c);
  }
  return { s, eqAt };
}

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
}

// 題號 → 來源區塊
const blocks = new Map(); // key `${subj}-${qNum}` → [{ rel, fileName, sourceCat, flat }]
let eqFiles = 0;
for (const [zh, subj] of Object.entries(SUBJ)) {
  const dir = path.join(EQ_DIR, zh);
  if (!fs.existsSync(dir)) continue;
  for (const f of walk(dir)) {
    const T = fs.readFileSync(f, "utf8");
    if (!T.includes("\x13")) continue;
    eqFiles++;
    const rel = path.relative(dir, f).replace(/\\/g, "/");
    const sourceCat = rel.split("/")[0];
    const fileName = path.basename(rel).replace(/\.doc\.txt$/i, "");
    const parts = T.split("題號：").slice(1);
    for (const p of parts) {
      const m = p.match(/^\s*(\d+)/);
      if (!m) continue;
      const flat = flatten(tokenize(p.slice(m[0].length)));
      if (flat.eqAt.size === 0) continue;
      const key = `${subj}-${m[1]}`;
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key).push({ rel, sourceCat, fileName, flat });
    }
  }
}
console.log(`來源檔含 EQ:${eqFiles} 個;含 EQ 的題號區塊:${blocks.size}`);

// ── 2. 資料庫 HTML ↔ 正規化字串 的位置對照 ──
const decode = (e) =>
  ({ "&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'" })[e] ??
  (e.startsWith("&#x") ? String.fromCodePoint(parseInt(e.slice(3, -1), 16)) : e.startsWith("&#") ? String.fromCodePoint(+e.slice(2, -1)) : e);

/** html → { s, ends: 第 k 個正規化字元在 html 中的結束位置, starts } */
function mapHtml(html) {
  let s = "";
  const starts = [], ends = [];
  const re = /<[^>]*>|&[#a-z0-9]+;|[\s\S]/gi;
  for (let m; (m = re.exec(html)); ) {
    const tok = m[0];
    if (tok.startsWith("<") && tok.length > 1) continue;
    const ch = tok.length > 1 && tok.startsWith("&") ? decode(tok) : tok;
    const n = norm(ch);
    if (!n) continue;
    s += n;
    starts.push(m.index);
    ends.push(m.index + tok.length);
  }
  return { s, starts, ends };
}

/** 在 html 中「第 j 個字之前」插入:位置 = 前一字結束處,再跳過緊接的結束標籤(避免算式被包進 <sup>) */
function insertPos(html, map, j) {
  if (j === 0) return map.starts.length ? map.starts[0] : html.length;
  let p = map.ends[j - 1];
  for (let m; (m = /^<\/[^>]+>/.exec(html.slice(p))); ) p += m[0].length;
  return p;
}

class AlignFail extends Error {}

/**
 * 把 flat 中 [from, to) 範圍、對應到 html 的 EQ 插回 html。
 * from..to 是 flat.s 中與 html 正規化字串完全相同的區段;
 * includeLead/includeTail:區段前/後緊鄰的 EQ 也算這個欄位的。
 */
function weave(html, flat, from, to, { lead = true, tail = true } = {}) {
  const map = mapHtml(html);
  if (flat.s.slice(from, to) !== map.s) throw new AlignFail("文字不一致");
  const ins = [];
  for (const [pos, eqs] of flat.eqAt) {
    const inside = pos > from && pos < to;
    const atLead = pos === from && lead;
    const atTail = pos === to && tail && pos !== from;
    if (!inside && !atLead && !atTail) continue;
    let h = "";
    for (const t of eqs) {
      if (t.bad) throw new EqUnsupported("巢狀非 EQ 變數");
      h += eqToHtml(t.eq);
    }
    ins.push({ at: insertPos(html, map, pos - from), h, pos });
  }
  ins.sort((a, b) => b.at - a.at);
  let out = html;
  for (const { at, h } of ins) out = out.slice(0, at) + h + out.slice(at);
  return { html: out, used: new Set(ins.map((x) => x.pos)) };
}

// 選項標記 (A)…(E) 在 flat.s 的位置(從 start 之後依序找)
function optionMarkers(s, start, n) {
  const pos = [];
  let cur = start;
  for (let k = 0; k < n; k++) {
    const mk = `(${"ABCDE"[k]})`;
    const p = s.indexOf(mk, cur);
    if (p === -1) return null;
    pos.push(p);
    cur = p + mk.length;
  }
  return pos;
}

function restoreQuestion(q, flat) {
  const used = new Set();
  const markUsed = (r) => r.used.forEach((p) => used.add(p));
  const out = {};
  const s = flat.s;
  const ans = s.indexOf("《答案》");
  const blockEnd = ans === -1 ? s.length : ans;

  // 題幹
  const qMap = mapHtml(q.question ?? "");
  const qs = qMap.s ? s.indexOf(qMap.s) : -1;
  if (qs === -1 || qs >= blockEnd) throw new AlignFail("題幹找不到");
  const qe = qs + qMap.s.length;
  let optPos = null;
  if (q.type === "single_choice" && q.options?.length) {
    optPos = optionMarkers(s, qe, q.options.length);
    if (!optPos) throw new AlignFail("選項標記找不到");
  }
  const qRegionEnd = optPos ? optPos[0] : blockEnd;
  // 題幹後面到選項/答案之間如果還有別的字,尾端的 EQ 就不能確定屬於題幹
  const tailClean = s.slice(qe, qRegionEnd) === "";
  const rq = weave(q.question ?? "", flat, qs, qe, { lead: true, tail: tailClean });
  markUsed(rq);
  out.question = rq.html;

  // 選項
  if (optPos) {
    out.options = q.options.map((o, k) => {
      const segStart = optPos[k] + 3;
      const segEnd = k + 1 < optPos.length ? optPos[k + 1] : blockEnd;
      const oMap = mapHtml(o ?? "");
      let os = segStart;
      if (s.slice(segStart, segEnd) !== oMap.s) {
        // 選項尾巴可能夾著別的東西(例如題組的下一小題);至少開頭要對上
        if (!s.startsWith(oMap.s, segStart) || !oMap.s) throw new AlignFail(`選項${"ABCDE"[k]}對不上`);
      }
      const oe = os + oMap.s.length;
      const r = weave(o ?? "", flat, os, oe, { lead: true, tail: oe === segEnd });
      markUsed(r);
      return r.html;
    });
  }

  // 題幹+選項範圍內所有 EQ 都要用到,否則表示有算式掉在無法確定的位置
  for (const pos of flat.eqAt.keys()) {
    if (pos >= qs && pos <= (optPos ? blockEnd : qRegionEnd) && !used.has(pos)) {
      throw new AlignFail(`有算式無法定位(位置 ${pos})`);
    }
  }

  // 詳解(失敗不影響題目本身,只是不更新詳解)
  out.explanationStatus = "unchanged";
  const ex = q.explanation;
  if (ex && ans !== -1) {
    const exMap = mapHtml(ex);
    const ds = s.indexOf("詳解：", ans);
    const es = ds === -1 ? -1 : s.indexOf(exMap.s, ds);
    const hasEq = [...flat.eqAt.keys()].some((p) => p > ans);
    if (!hasEq) out.explanationStatus = "no-eq";
    else if (es === -1 || !exMap.s) out.explanationStatus = "fail";
    else {
      try {
        const r = weave(ex, flat, es, es + exMap.s.length);
        const missed = [...flat.eqAt.keys()].filter((p) => p > ds && !r.used.has(p));
        if (missed.length) out.explanationStatus = "fail";
        else { out.explanation = r.html; out.explanationStatus = "restored"; }
      } catch { out.explanationStatus = "fail"; }
    }
  }
  return out;
}

// ── 3. 逐題處理 ──
const rows = await fetchAll("questions?select=id,subject,source,type,question,options,answer,answer_text,explanation,needs_review&subject=in.(math,science)&order=id");
const adminHidden = new Set((await fetchAll("question_reports?select=question_id,status&status=eq.hidden")).map((r) => r.question_id));
// 人工判定缺圖的題目(hide-missing-figure-questions.mjs)也不能放回
for (const id of fs.readFileSync(path.join(ROOT, "scripts", "hide-missing-figure-questions.mjs"), "utf8")
  .match(/const BROKEN = \[([\s\S]*?)\];/)[1].match(/"[a-z]+-[\d-]+"/g).map((s) => s.slice(1, -1))) adminHidden.add(id);
console.log(`讀取數學/自然 ${rows.length} 題;管理者手動隱藏+人工缺圖 ${adminHidden.size} 題`);

const stats = {};
const bump = (k) => (stats[k] = (stats[k] ?? 0) + 1);
const changes = [];
const samples = [];
for (const q of rows) {
  const m = q.id.match(/^(math|science)-(\d+)/);
  if (!m) continue;
  const cands = (blocks.get(`${m[1]}-${m[2]}`) ?? []).filter(
    (b) => q.source === `${b.sourceCat}/${b.fileName}`
  );
  if (!cands.length) continue; // 這題的來源沒有 EQ → 不受影響
  let res = null, err = null;
  for (const b of cands) {
    try { res = restoreQuestion(q, b.flat); break; } catch (e) { err = e; }
  }
  const wasVisible = !q.needs_review;
  if (!res) {
    const kind = err instanceof EqUnsupported ? "算式語法不支援" : err?.message?.replace(/\(.*\)/, "") ?? "?";
    bump(`補不回:${kind}`);
    if (wasVisible) {
      bump("→ 原本可見,改為隱藏");
      changes.push({ id: q.id, before: { needs_review: q.needs_review }, after: { needs_review: true }, why: kind });
    }
    continue;
  }
  const changedQ = res.question !== q.question || JSON.stringify(res.options ?? q.options) !== JSON.stringify(q.options);
  const fixed = { ...q, question: res.question, options: res.options ?? q.options, explanation: res.explanation ?? q.explanation };
  const p = problems(fixed);
  const visible = p.length === 0 && !adminHidden.has(q.id);
  bump(`補回成功${changedQ ? "" : "(題目本身沒缺,只補詳解)"}`);
  bump(`詳解:${res.explanationStatus}`);
  bump(`${wasVisible ? "原本可見" : "原本隱藏"} → ${visible ? "可見" : "隱藏"}`);
  const after = {}, before = {};
  if (changedQ) { after.question = fixed.question; before.question = q.question; after.options = fixed.options; before.options = q.options; }
  if (res.explanation && res.explanation !== q.explanation) { after.explanation = fixed.explanation; before.explanation = q.explanation; }
  if (visible === q.needs_review) { after.needs_review = !visible; before.needs_review = q.needs_review; }
  if (Object.keys(after).length) changes.push({ id: q.id, before, after, problems: p });
  if (changedQ && samples.length < 4000) samples.push({ id: q.id, wasVisible, visible, problems: p, question: fixed.question, options: fixed.options, explanation: fixed.explanation });
}
console.log(stats);
console.log(`要更新 ${changes.length} 題`);
if (DUMP) fs.writeFileSync(DUMP, JSON.stringify({ stats, changes, samples }, null, 1), "utf8");

if (APPLY) {
  const backupFile = writeBackup("eq-restore", changes.map((c) => ({ id: c.id, ...c.before })));
  console.log(`備份:${backupFile}`);
  await runPool(changes, (c) => patchQuestion(c.id, c.after));
  console.log(`✅ 已更新 ${changes.length} 題`);
  console.log(`還原:node scripts/restore-eq-fields.mjs --restore "${backupFile}"`);
}
