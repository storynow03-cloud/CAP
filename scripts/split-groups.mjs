// 題組拆題(2026-09-30):把被合併成一題的「文章 + (1)(2)(3) 小題」拆回一題一題。
//
// 問題:解析器用選項標記 (A)(B)(C)(D) 切選項,題組的第 2、3 小題題幹就黏在上一小題最後一個選項尾巴:
//   題幹:「附圖為臺灣某處海岸地區的地圖。請問：\n(　)(1)這張地圖上的比例尺是用下列何種表示方式來呈現？」
//   選項:["圖示法", …, "實物顯示法\n(　)(2)若此圖要改用…", "涵蓋地表範圍變大", …]
//   答案:「(1)A　(2)B」→ 不是單一字母 → 整組被隱藏。
// 拆法:找小題標記「(　)(2)」「（　）２」「（　）2.」,切出文章、各小題題幹與各自的選項。
// 只有「小題數 = 答案數、每小題選項數 3~5 且一致、答案落在選項範圍內」全部成立才拆,否則不動。
// 每個小題成為新題:id = 原 id + "-g" + 小題號,題目 = 文章 + 小題題幹;原題組維持隱藏。
// 小題通過 lib/question-checks.mjs 嚴格檢查才設為可見,其餘先建但隱藏。
//
// 用法:node scripts/split-groups.mjs [--dump <檔>]  乾跑
//       node scripts/split-groups.mjs --apply           新增小題(備份新增的 id,可 --undo 刪除)
//       node scripts/split-groups.mjs --undo <備份檔>
import fs from "node:fs";
import { URL_BASE, H, fetchAll, runPool, BACKUP_DIR } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const undoIdx = process.argv.indexOf("--undo");
if (undoIdx !== -1) {
  const ids = JSON.parse(fs.readFileSync(process.argv[undoIdx + 1], "utf8"));
  // 小題可能已經有作答紀錄(attempts 參照 questions),刪不掉就改成隱藏
  let del = 0, hid = 0;
  await runPool(ids, async (id) => {
    const r = await fetch(`${URL_BASE}/rest/v1/questions?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: H });
    if (r.ok) { del++; return; }
    await fetch(`${URL_BASE}/rest/v1/questions?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: H, body: JSON.stringify({ needs_review: true }) });
    hid++;
  });
  console.log(`✅ 已刪除 ${del} 題,${hid} 題因已有作答紀錄改為隱藏`);
  process.exit(0);
}

const toN = (s) => Number(String(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
const LETTER = { A: 0, B: 1, C: 2, D: 3, E: 4, Ａ: 0, Ｂ: 1, Ｃ: 2, Ｄ: 3, Ｅ: 4 };
const DIG = "[0-9０-９]{1,2}";
// 小題標記:作答括號 +「(2)」或「２」或「2.」
const MARKER = new RegExp(String.raw`[（(][\s　]*[）)]\s*(?:[（(]\s*(${DIG})\s*[）)]|(${DIG})(?![0-9０-９])\s*[.．]?)\s*`, "g");

/** 解析「(1)C　(2)B」「1. D　2. C」「１C　２A」→ 依小題號排好的答案字母;格式不對回 null */
function parseAnswers(t) {
  if (!t) return null;
  const s = String(t).trim();
  const re = new RegExp(String.raw`[（(]?\s*(${DIG})\s*[）).．]?\s*([A-EＡ-Ｅ])(?![A-Za-z])`, "g");
  const found = [...s.matchAll(re)];
  if (found.length < 2) return null;
  // 整串除了這些「號碼+字母」之外只能剩空白,避免把「(1)A (2)從氣候…」這種混合非選的也當成選擇題組
  if (s.replace(re, "").replace(/[\s　、,，;；]/g, "")) return null;
  const ans = found.map((m) => ({ n: toN(m[1]), a: LETTER[m[2]] }));
  if (ans.some((x, i) => x.n !== i + 1)) return null;
  return ans.map((x) => x.a);
}

/** 找出字串中「編號為 k」的小題標記(取最後一個) */
function findMarker(s, k) {
  let hit = null;
  for (const m of String(s).matchAll(MARKER)) if (toN(m[1] ?? m[2]) === k) hit = m;
  return hit;
}

const tidyOpt = (o) => o.replace(/\s+\(\s[^()（）]*$/, "").replace(/[\s　]+$/, "").trim(); // 去掉英文字彙註解殘段「( learn 學習」

/** 詳解拆成各小題:「(1)…(2)…」或「１（D）…２（B）…」或「1. …2. …」;拆不乾淨就每小題都給完整詳解 */
function splitExplanation(ex, n) {
  if (!ex) return Array(n).fill(null);
  const s = String(ex);
  const pos = [];
  let from = 0;
  for (let k = 1; k <= n; k++) {
    // 用 lookbehind:前一句的句號/括號不要被切進這一小題的詳解(否則會變成「。(3)紅色物體…」)
    const re = new RegExp(String.raw`(?<=^|[\s　。）)])(?:[（(]\s*${k}\s*[）)]|[${k}${String.fromCharCode(0xff10 + k)}](?![0-9０-９])\s*[.．]?)`, "g");
    re.lastIndex = from;
    const m = re.exec(s);
    if (!m) return Array(n).fill(s);
    pos.push(m.index);
    from = m.index + m[0].length;
  }
  if (pos[0] > 3) return Array(n).fill(s);
  return pos.map((p, i) => s.slice(p, pos[i + 1] ?? s.length).trim());
}

function split(q) {
  const answers = parseAnswers(q.answer_text);
  if (!answers || !q.options?.length) return { fail: "答案格式" };
  const n = answers.length;
  const m1 = findMarker(q.question, 1);
  if (!m1) return { fail: "找不到第 1 小題" };
  const passage = q.question.slice(0, m1.index).trim();
  const stems = [q.question.slice(m1.index + m1[0].length).trim()];
  const groups = [[]];
  for (const o of q.options) {
    const k = groups.length + 1;
    const mk = k <= n ? findMarker(o, k) : null;
    if (mk) {
      groups[groups.length - 1].push(o.slice(0, mk.index));
      stems.push(o.slice(mk.index + mk[0].length).trim());
      groups.push([]);
    } else groups[groups.length - 1].push(o);
  }
  if (groups.length !== n) return { fail: `小題數 ${groups.length}≠答案數 ${n}` };
  const size = groups[0].length;
  if (size < 3 || size > 5 || groups.some((g) => g.length !== size)) return { fail: "選項數不一致" };
  if (answers.some((a) => a >= size)) return { fail: "答案超出選項" };
  const exps = splitExplanation(q.explanation, n);
  return {
    subs: groups.map((g, i) => {
      let opts = g.map(tidyOpt);
      // 小題最後一個選項常帶著分隔用的「。」,其他選項沒有 → 拿掉
      const last = opts.length - 1;
      if (/。$/.test(opts[last]) && !opts.slice(0, last).some((o) => /。$/.test(o))) opts[last] = opts[last].slice(0, -1);
      return {
        id: `${q.id}-g${i + 1}`,
        subject: q.subject, volume: q.volume, topic: q.topic, subtopic: q.subtopic, difficulty: q.difficulty,
        type: "single_choice",
        // 克漏字的小題沒有題幹(文章裡就是第 N 格空格),補一句說明,孩子才知道要看哪一格
        question: `${passage}\n\n（第 ${i + 1} 小題）${stems[i].replace(/\s+\(\s[^()（）]*$/, "").trim() || `請選出最適合填入文中第（${i + 1}）格的答案。`}`,
        options: opts, answer: answers[i], answer_text: null, explanation: exps[i],
        source: q.source, curriculum_code: q.curriculum_code, knowledge_code: q.knowledge_code,
        tags: [...(q.tags ?? []), "題組"],
      };
    }),
  };
}

const rows = await fetchAll("questions?select=*&needs_review=eq.true&type=eq.single_choice&answer=is.null&order=id");
const existing = new Set((await fetchAll("questions?select=id&id=like.*-g*&order=id")).map((r) => r.id));
console.log(`候選(隱藏、單選、沒答案):${rows.length} 題`);
const fails = {}, out = [];
let groupsOk = 0;
for (const q of rows) {
  const r = split(q);
  if (r.fail) { fails[`${q.subject}|${r.fail}`] = (fails[`${q.subject}|${r.fail}`] ?? 0) + 1; continue; }
  groupsOk++;
  for (const s of r.subs) {
    if (existing.has(s.id)) continue;
    const p = problems(s);
    out.push({ ...s, needs_review: p.length > 0, _problems: p, _parent: q.id });
  }
}
const stat = {};
for (const s of out) { const k = `${s.subject} ${s.needs_review ? "建立但隱藏" : "可見"}`; stat[k] = (stat[k] ?? 0) + 1; }
console.log(`可拆題組 ${groupsOk} 組 → 小題 ${out.length} 題`, stat);
console.log("拆不了的原因:", Object.fromEntries(Object.entries(fails).sort((a, b) => b[1] - a[1]).slice(0, 15)));
const hidReasons = {};
for (const s of out) for (const p of s._problems) hidReasons[`${s.subject}|${p}`] = (hidReasons[`${s.subject}|${p}`] ?? 0) + 1;
console.log("小題隱藏原因:", hidReasons);

const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx !== -1) fs.writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(out), "utf8");
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }

const dir = path.join(BACKUP_DIR, `${new Date().toISOString().slice(0, 10)}-split-groups`);
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `inserted-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify(out.map((s) => s.id)), "utf8");
console.log(`💾 新增的 id 清單 → ${file}`);
const clean = out.map(({ _problems, _parent, ...s }) => s);
for (let i = 0; i < clean.length; i += 500) {
  const r = await fetch(`${URL_BASE}/rest/v1/questions`, {
    method: "POST", headers: { ...H, Prefer: "return=minimal,resolution=ignore-duplicates" }, body: JSON.stringify(clean.slice(i, i + 500)),
  });
  if (!r.ok) throw new Error(`POST ${r.status} ${await r.text()}`);
}
console.log(`✅ 已新增 ${clean.length} 題小題`);
console.log(`復原:node scripts/split-groups.mjs --undo "${file}"`);
