// 數學隱藏題(公式消失/控制字元)直接從原始 docx 重建題幹與選項(2026-10-05)
// 依「題號：NNNNNNN」切出這一題 → 題幹 = 知識點之後到 (A) 或《答案》為止;選項 = (A)…(D);
// 公式:EQ → eq-field、OMML → omml.py;圖片依 docx 順序對回網站圖(data/rerender/map.json 的 src 與 docx 媒體同序)。
// 安全:重建後選項數必須等於資料庫原選項數、答案不變;題幹去掉公式後要與資料庫題幹「去掉控制字元後」的文字
//   有 80% 以上相同(確認是同一題);通過 question-checks;圖都看過/重畫過;不在人工缺圖/回報清單 → 放回。
// 用法:node scripts/rebuild-math-hidden.mjs [--ids <JSON>] [--dump <檔>] [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";
import { visibleProblems } from "./lib/visible-checks.mjs";
import { readDocx, tokens, toHtml, convertOmml, slugOf } from "./docx-question.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const ids = read(arg("--ids", "data/rerender/item3-ids.json"));
const bad = new Set(read("data/image-screen-confirmed.json").map((x) => x.p));
const seen = new Set([...read("data/image-screen-list.json").map((x) => x.p), ...read("data/rerender/map.json").map((x) => x.p),
  ...read("data/rerender/map-webp.json").map((x) => x.p)]);
const manual = new Set(fs.readFileSync(path.join(ROOT, "scripts/hide-missing-figure-questions.mjs"), "utf8")
  .match(/const BROKEN = \[([\s\S]*?)\];/)[1].match(/"[a-z]+-[\d-]+"/g).map((s) => s.slice(1, -1)));
const reported = new Set((await fetchAll("question_reports?select=question_id")).map((r) => r.question_id));

// 網站圖:slug → docx 媒體序號 → 網站路徑(由 rerender-metafiles 的對應:src 檔名 imageN.* 依 docx 出現順序)
// 改用 lo-html img 序號 ↔ docx 圖序號的對齊結果(map.json 只有向量圖),非向量圖用同一份對齊的 pairs
const pairsAll = read("data/rerender/pic-pairs.json"); // slug → { docxIndex: htmlIndex }(由 rerender-metafiles 另存)

const rows = [];
await runPool(ids, async (id) => {
  rows.push(...await fetchAll(`questions?select=id,subject,source,type,question,options,answer,answer_text,explanation,needs_review&id=eq.${encodeURIComponent(id)}`));
}, 8);

const plain = (h) => String(h ?? "").replace(/<[^>]+>/g, "").replace(/[\x00-\x1f\s　]/g, "").replace(/&[a-z]+;/g, "");
function similar(a, b) { // 以字元雙字組的重疊率估計
  if (!a || !b) return 0;
  const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const A = grams(a), B = grams(b); let hit = 0, tot = 0;
  for (const [g, n] of B) { tot += n; hit += Math.min(n, A.get(g) ?? 0); }
  return tot ? hit / tot : 0;
}

const stat = {}, plan = [], pending = [];
const bump = (k) => (stat[k] = (stat[k] ?? 0) + 1);
for (const q of rows) {
  const num = q.id.match(/^math-(\d+)/)?.[1];
  const rel = q.source + ".doc"; // 例:01.康軒精選題/1-2比例線段 → 但實際檔在 冊 子資料夾下
  pending.push({ q, num });
}
// 找原檔:source = 類別/檔名(不含冊),實際路徑在 數學/類別/第 N 冊/檔名.doc,題號只會出現在其中一份
const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".doc") && files.push(path.join(d, e.name))));
walk(path.join(ROOT, "數學"));
const allOmml = [];
const parsed = [];
for (const { q, num } of pending) {
  const [cat, name] = q.source.split("/");
  const cand = files.filter((f) => f.includes(cat) && path.basename(f, ".doc") === name);
  let got = null;
  for (const f of cand) {
    const { doc, relMap } = readDocx(f);
    const at = doc.indexOf(`題號：${num}`) !== -1 ? doc.indexOf(`題號：${num}`) : doc.indexOf(num);
    if (at === -1) continue;
    const toks = tokens(doc, relMap);
    // 找到題號所在 token 位置
    let i = toks.findIndex((t, k) => t.t === "text" && toks.slice(Math.max(0, k - 3), k + 1).filter((x) => x.t === "text").map((x) => x.v).join("").includes(num));
    if (i === -1) continue;
    let j = toks.findIndex((t, k) => k > i && t.t === "text" && /題號：/.test(t.v));
    if (j === -1) j = toks.length;
    got = { file: f, rel: path.relative(path.join(ROOT, "數學"), f).replace(/\.doc$/, ".html"), toks: toks.slice(i + 1, j), allToks: toks };
    break;
  }
  if (!got) { bump("原檔找不到題號"); continue; }
  for (const t of got.toks) if (t.t === "omml") allOmml.push(t.xml);
  parsed.push({ q, got });
}
const ommlMap = convertOmml(allOmml);

for (const { q, got } of parsed) {
  const slug = slugOf(got.rel);
  const pp = pairsAll[slug] ?? {};
  const imgUrl = (n) => {
    const h = pp[n];
    if (h == null) return null;
    const dir = path.join(ROOT, "web/public/qimg/math", slug);
    const f = fs.readdirSync(dir).find((x) => x.startsWith(String(h).padStart(3, "0") + "."));
    return f ? `/qimg/math/${slug}/${f}` : null;
  };
  // 切段:知識點行之後 = 題幹;(A)(B)(C)(D) = 選項;《答案》之後不處理
  const toks = got.toks;
  const flat = toks.map((t) => (t.t === "text" ? t.v : t.t === "br" ? "\n" : "\u0000"));
  const joined = flat.join("");
  const kcEnd = (() => { const m = joined.match(/知識點：[A-Z0-9]+/); return m ? m.index + m[0].length : 0; })();
  const ansAt = joined.indexOf("《答案》");
  // 將字元位置對回 token(只在 text token 內切)
  const cut = (from, to) => {
    const out = []; let pos = 0;
    for (const t of toks) {
      const len = t.t === "text" ? t.v.length : 1;
      const s = Math.max(from, pos), e = Math.min(to, pos + len);
      if (e > s) out.push(t.t === "text" ? { ...t, v: t.v.slice(s - pos, e - pos) } : t);
      pos += len;
    }
    return out;
  };
  const end = ansAt === -1 ? joined.length : ansAt;
  let qEnd = end, opts = null;
  if (q.type === "single_choice" && q.options?.length) {
    const marks = [];
    let cur = kcEnd;
    for (let k = 0; k < q.options.length; k++) {
      const re = new RegExp(`[（(]${"ABCDE"[k]}[）)]`, "g"); re.lastIndex = cur;
      const m = re.exec(joined);
      if (!m || m.index >= end) { marks.length = 0; break; }
      marks.push([m.index, m.index + m[0].length]); cur = m.index + m[0].length;
    }
    if (marks.length !== q.options.length) { bump("選項標記數量不符"); continue; }
    qEnd = marks[0][0];
    opts = marks.map(([s0, e0], k) => [e0, k + 1 < marks.length ? marks[k + 1][0] : end]);
  }
  let qHtml, oHtml;
  try {
    qHtml = toHtml(cut(kcEnd, qEnd), { imgUrl, ommlMap }).replace(/^[（(]\s*[）)]\s*/, "")
      .replace(/\s*【(?:會|仿會|補考|特)?\s*\d{2,3}[^】]*】/g, "").trim();  // 出處標記(可見題都已清掉)
    oHtml = opts ? opts.map(([a, b]) => toHtml(cut(a, b), { imgUrl, ommlMap }).replace(/[　\s]+$/, "")) : q.options;
  } catch (e) { bump(`重建失敗:${e.message.replace(/#\d+/, "")}`); continue; }
  // 公式完整性:公式消失後常見的斷點(「的，」「＝。」「：＝」…)出現就不放回;「＝？」是正常問法不算
  const HOLE = /[的為是][，。]|＝[，。]|：＝|，，/;
  const allText = plain(qHtml) + "|" + (oHtml ?? []).map(plain).join("|");
  if (HOLE.test(allText)) { bump(`疑似公式消失(${allText.match(HOLE)[0]})`); continue; }
  // 圖片安全:重建後用到的每張圖都必須原本就在這一題裡(防止圖片序號錯位換成別題的圖)
  const imgsOf = (h) => [...String(h ?? "").matchAll(/<img[^>]*src="([^"]+)"/g)].map((x) => x[1]);
  const oldImgs = new Set([q.question, ...(q.options ?? [])].flatMap(imgsOf));
  if ([qHtml, ...(oHtml ?? [])].flatMap(imgsOf).some((u) => !oldImgs.has(u))) { bump("圖片和原題不同"); continue; }
  const sim = similar(plain(qHtml), plain(q.question));
  if (sim < 0.8) { bump("題幹文字差太多"); continue; }
  const fixed = { ...q, question: qHtml, options: oHtml };
  const p = [...problems(fixed), ...visibleProblems(fixed)];
  const srcs = [...[qHtml, ...(oHtml ?? [])].join("\n").matchAll(/<img[^>]*src="([^"]+)"/g)].map((x) => x[1]);
  if (srcs.some((s) => bad.has(s))) p.push("有確認壞掉的圖");
  if (srcs.some((s) => !seen.has(s))) p.push("有沒看過的圖");
  if (manual.has(q.id)) p.push("人工缺圖清單");
  if (reported.has(q.id)) p.push("有題目回報");
  const after = { question: qHtml };
  if (opts) after.options = oHtml;
  if (!p.length) { after.needs_review = false; bump("可放回"); } else p.forEach((r) => bump(`仍隱藏:${r}`));
  bump("重建成功");
  plan.push({ id: q.id, sim: +sim.toFixed(2), before: Object.fromEntries(Object.keys(after).map((k) => [k, q[k]])), after });
}
console.log(`處理 ${rows.length} 題`, stat);
const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx !== -1) fs.writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(plan), "utf8");
if (process.argv.includes("--apply")) {
  const backupFile = writeBackup("rebuild-math", plan.map((p) => ({ id: p.id, ...p.before })));
  console.log(`備份:${backupFile}`);
  await runPool(plan, (p) => patchQuestion(p.id, p.after));
  console.log(`✅ 已寫入 ${plan.length} 題`);
  console.log(`還原:node scripts/rebuild-math-hidden.mjs --restore "${backupFile}"`);
}
