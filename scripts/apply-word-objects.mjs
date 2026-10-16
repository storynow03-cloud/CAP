// 把 Word 匯出的內嵌物件(scripts/export-word-objects.ps1 → data/obj-export/manifest.json)放回題目(2026-10-15)
// 題目文字裡的 U+0001 = LibreOffice 沒轉出來的物件。依「U+0001 前面的文字」對上 Word 物件前文(不夠長時改比後文),
// 唯一且夠像才換成 <img>;對不上的列出來不動。
// 步驟(先部署圖片再寫 DB):
//   node scripts/apply-word-objects.mjs            乾跑:列出對應結果 → data/obj-export/plan.json
//   node scripts/apply-word-objects.mjs --stage    把用到的圖複製到 web/public/qimg/<科>/obj/(之後 commit+push 部署)
//   node scripts/apply-word-objects.mjs --apply    確認正式站圖片連得到 → 寫入題目(備份可 --restore)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, fetchAll, patchQuestion, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const STAGE = process.argv.includes("--stage"), APPLY = process.argv.includes("--apply");
const SUBJ = { chinese: "國文", english: "英文", math: "數學", science: "自然", social: "社會" };
const EXP = path.join(ROOT, "data/obj-export");
const raw = fs.readFileSync(path.join(EXP, "manifest.json"), "utf8").replace(/^﻿/, "");
const manifest = JSON.parse(raw).filter((m) => m.file);
// 正規化:去標籤、空白、控制字元、全形空白,方便比對前後文
const norm = (s) => (s ?? "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").replace(/[\s\u0000-\u001f　 ]/g, "");
const commonSuffix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++; return i; };
const commonPrefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

const all = await fetchAll("questions?select=id,subject,source,volume,needs_review,question,options,answer_text&order=id");
const kids = new Set(all.filter((r) => /-g\d+$/.test(r.id)).map((r) => r.id.replace(/-g\d+$/, "")));
const targets = all.filter((r) => !kids.has(r.id) && /\u0001/.test([r.question, JSON.stringify(r.options ?? ""), r.answer_text ?? ""].join("")));

const docOf = (r) => {
  const [folder, name] = (r.source ?? "").split("/");
  const base = path.join(ROOT, SUBJ[r.subject], folder ?? "", r.volume ?? "", name ?? "");
  return [".doc", ".docx"].map((e) => base + e).find((f) => fs.existsSync(f));
};
const imgSrc = (m, subject) => {
  const hash = crypto.createHash("sha1").update(fs.readFileSync(path.join(EXP, m.file))).digest("hex").slice(0, 16);
  return `/qimg/${subject}/obj/${hash}.png`;
};

const L = "ABCDEFGH";
const isPicOption = (o) => /^[\s\u0001]*$/.test(String(o).replace(/<[^>]+>/g, "")) && /\u0001/.test(String(o));
const plan = [], unmatched = [];
for (const r of targets) {
  const doc = docOf(r), num = r.id.match(/-(\d{7})/)?.[1];
  const cands = manifest.filter((m) => m.doc === doc && m.num === num).sort((a, b) => a.k - b.k);
  // 備援 1:整個選項就是一張圖 → 原檔物件前文以「(A)」開始一組;第 n 組給同題號第 n 個「選項全是圖」的小題
  const sets = [];
  for (const m of cands) {
    const t = norm(m.before).match(/[（(]([A-H])[）)]$/)?.[1];
    if (t === "A") sets.push([m]); else if (t && sets.length && L.indexOf(t) === sets.at(-1).length) sets.at(-1).push(m);
  }
  const picSubs = targets.filter((x) => x.id.match(/-(\d{7})/)?.[1] === num && docOf(x) === doc && Array.isArray(x.options) && x.options.some(isPicOption))
    .map((x) => x.id).sort((a, b) => (+a.match(/-g(\d+)$/)?.[1] || 0) - (+b.match(/-g(\d+)$/)?.[1] || 0));
  const mySet = sets.length === picSubs.length ? sets[picSubs.indexOf(r.id)] : null;
  // 備援 2:答案欄的圖 → 原檔「《答案》」之後的物件依序對應(數量要剛好相等)
  const ansCands = cands.filter((m) => /《答案》/.test(m.before ?? ""));
  const ansCount = ((r.answer_text ?? "").match(/\u0001/g) ?? []).length;
  let ansIdx = 0;
  const patch = {}, uses = [];
  let ok = true;
  const fixField = (s, where) => s.replace(/\u0001/g, (_, off) => {
    const before = norm(s.slice(Math.max(0, off - 200), off)), after = norm(s.slice(off + 1, off + 200));
    const scored = cands.map((m) => ({ m, sb: commonSuffix(before, norm(m.before)), sa: commonPrefix(after, norm(m.after)) }))
      .map((x) => ({ ...x, score: x.sb * 2 + x.sa }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0], second = scored[1];
    const strong = best && (best.sb >= 6 || (best.sb >= 2 && best.sa >= 6) || (before.length < 2 && best.sa >= 8));
    const oi = where.startsWith("option") ? +where.slice(6) : -1;
    if ((!strong || (second && second.score === best.score)) && oi >= 0 && mySet?.[oi] && isPicOption(s)) {
      const src = imgSrc(mySet[oi], r.subject);
      uses.push({ file: mySet[oi].file, src, rule: "選項順序" });
      return `<img src="${src}" alt="圖" />`;
    }
    if ((!strong || (second && second.score === best.score)) && where === "answer_text" && ansCands.length === ansCount) {
      const m = ansCands[ansIdx++];
      const src = imgSrc(m, r.subject);
      uses.push({ file: m.file, src, rule: "答案順序" });
      return `<img src="${src}" alt="圖" />`;
    }
    if (!strong || (second && second.score === best.score)) {
      ok = false;
      unmatched.push({ id: r.id, where, before: before.slice(-20), after: after.slice(0, 20), best: best && { file: best.m.file, sb: best.sb, sa: best.sa } });
      return "\u0001";
    }
    const src = imgSrc(best.m, r.subject);
    uses.push({ file: best.m.file, src, sb: best.sb, sa: best.sa, prog: best.m.prog });
    return `<img src="${src}" alt="圖" />`;
  });
  // 備援 3:佔位符在最後一個選項的尾巴 = 原檔「小題要用的圖放在選項下面」,轉檔時黏進最後一個選項
  //   → 找前文以最後選項文字結尾的物件(多個時用小題題幹結尾區分),把圖搬到題幹最後面,選項只留文字
  const moved = [];
  let opts = Array.isArray(r.options) ? r.options.map(String) : null;
  if (opts) {
    const li = opts.length - 1, last = opts[li];
    const m0 = last.match(/^([\s\S]*?\S)[\s]*((?:\u0001\s*)+)$/);
    if (m0 && norm(m0[1])) {
      const lastTxt = norm(m0[1]);
      const stem = norm((r.question ?? "").split(/（第\s*\d+\s*小題）/).at(-1));
      let hits = cands.filter((m) => norm(m.before).endsWith(lastTxt) && /[（(]D[）)]/.test(m.before ?? ""));
      if (hits.length > 1) hits = hits.filter((m) => stem.length >= 4 && norm(m.before).includes(stem.slice(-4)));
      const n = (m0[2].match(/\u0001/g) ?? []).length;
      if (hits.length === 1 && n === 1) {
        const src = imgSrc(hits[0], r.subject);
        uses.push({ file: hits[0].file, src, rule: "選項尾巴搬到題幹" });
        moved.push(`<img src="${src}" alt="圖" />`);
        opts[li] = m0[1];
      }
    }
  }
  let q = fixField(r.question ?? "", "question");
  if (moved.length) q = q.replace(/\s*$/, "") + "\n" + moved.join("\n");
  if (q !== r.question) patch.question = q;
  if (opts) {
    const o = opts.map((x, i) => fixField(x, `option${i}`));
    if (JSON.stringify(o) !== JSON.stringify(r.options)) patch.options = o;
  }
  if (r.answer_text && /\u0001/.test(r.answer_text)) patch.answer_text = fixField(r.answer_text, "answer_text");
  if (Object.keys(patch).length) plan.push({ id: r.id, subject: r.subject, hidden: r.needs_review, complete: ok, patch, before: { question: r.question, options: r.options, answer_text: r.answer_text }, uses });
}
fs.writeFileSync(path.join(EXP, "plan.json"), JSON.stringify({ plan, unmatched }, null, 1));
console.log(`含佔位符 ${targets.length} 題 → 有換到圖 ${plan.length} 題(全部換完 ${plan.filter((p) => p.complete).length});對不上的佔位符 ${unmatched.length} 個`);
console.log("  原檔找不到的題:", targets.filter((r) => !docOf(r)).map((r) => r.id).join(" ") || "無");

if (STAGE) {
  let n = 0;
  for (const p of plan) for (const u of p.uses) {
    const dst = path.join(ROOT, "web/public", u.src);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!fs.existsSync(dst)) { fs.copyFileSync(path.join(EXP, u.file), dst); n++; }
  }
  console.log(`🖼️ 已複製 ${n} 張圖到 web/public/qimg/*/obj/ → 請 commit + push 部署後再 --apply`);
}
if (!APPLY) process.exit(0);
// 寫入前確認正式站已經有這些圖
const SITE = "https://cap-three-ruddy.vercel.app";
const srcs = [...new Set(plan.flatMap((p) => p.uses.map((u) => u.src)))];
for (const s of srcs) {
  const res = await fetch(SITE + s, { method: "HEAD" });
  if (res.status !== 200) { console.log(`❌ 正式站還沒有 ${s}(${res.status}),先部署圖片`); process.exit(1); }
}
const file = writeBackup("word-objects", plan.map((p) => ({ id: p.id, ...Object.fromEntries(Object.keys(p.patch).map((k) => [k, p.before[k]])) })));
console.log(`💾 備份 → ${file}`);
for (const p of plan) await patchQuestion(p.id, p.patch);
console.log(`✅ 已寫入 ${plan.length} 題(題目仍維持原本的隱藏/可見狀態)。還原:node scripts/apply-word-objects.mjs --restore "${file}"`);
