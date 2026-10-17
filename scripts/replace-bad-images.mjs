// 壞圖/低解析圖改用 Word 重新匯出的版本(2026-10-16)
// 對象:data/badimg-targets-2026-10-16.json(用到確認壞圖 data/image-screen-confirmed.json 或低解析 data/lowres-images.json 的隱藏題)
// 來源:scripts/export-word-objects.ps1 → data/badimg-export/(manifest.json + PNG)
// 比對:同題號的 Word 物件中,長寬比與舊圖相差 3% 以內;多個符合時取「在題目圖片順序中位置最接近」者,仍不唯一就不換。
//       新圖解析度要比舊圖高(寬度 ≥ 舊圖 1.3 倍)才算有改善,否則列為「原檔就是低解析」。
// 用法:node scripts/replace-bad-images.mjs           乾跑 → data/badimg-export/plan.json + 新舊對照拼圖 data/badimg-export/compare/*.png
//       node scripts/replace-bad-images.mjs --stage   複製新圖到 web/public/qimg/<科>/rx/(之後 commit+push)
//       node scripts/replace-bad-images.mjs --apply   確認正式站有圖 → 寫入(題目維持隱藏,審查後再用 unhide-verified 放回)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { ROOT, fetchAll, patchQuestion, writeBackup, restoreBackup } from "./lib/rest.mjs";

const sharp = createRequire(path.join(ROOT, "web", "package.json"))("sharp");
const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const STAGE = process.argv.includes("--stage"), APPLY = process.argv.includes("--apply");
const SUBJ = { chinese: "國文", english: "英文", math: "數學", science: "自然", social: "社會" };
const EXP = path.join(ROOT, "data/badimg-export");
const manifest = JSON.parse(fs.readFileSync(path.join(EXP, "manifest.json"), "utf8").replace(/^﻿/, "")).filter((m) => m.file);
const accFile = path.join(EXP, "accepted.json");
const ACCEPTED = fs.existsSync(accFile) ? new Set(JSON.parse(fs.readFileSync(accFile, "utf8")).map((x) => `${x.id}|${x.src}`)) : null;
const targets = JSON.parse(fs.readFileSync(path.join(ROOT, "data/badimg-targets-2026-10-16.json"), "utf8"));

const rows = [];
for (let i = 0; i < targets.length; i += 150)
  rows.push(...await fetchAll(`questions?select=id,subject,source,volume,needs_review,question,options,answer_text&id=in.(${targets.slice(i, i + 150).map((x) => x.id).join(",")})&order=id`));
const docOf = (r) => {
  const [folder, name] = (r.source ?? "").split("/");
  const base = path.join(ROOT, SUBJ[r.subject], folder ?? "", r.volume ?? "", name ?? "");
  return [".doc", ".docx"].map((e) => base + e).find((f) => fs.existsSync(f));
};
const dims = async (f) => { try { const m = await sharp(f, { animated: false }).metadata(); return { w: m.width, h: m.height }; } catch { return null; } };

const plan = [], fail = [];
fs.mkdirSync(path.join(EXP, "compare"), { recursive: true });
for (const r of rows) {
  const t = targets.find((x) => x.id === r.id);
  const doc = docOf(r), num = r.id.match(/-(\d{7})/)?.[1];
  const cands = manifest.filter((m) => m.doc === doc && m.num === num).sort((a, b) => a.k - b.k);
  const fields = [r.question ?? "", ...(r.options ?? []).map(String), r.answer_text ?? ""];
  const allSrc = [...fields.join(" ").matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  const repl = {};
  for (const src of [...new Set([...t.bad, ...t.low])]) {
    // 有逐張看圖的審查結果(data/badimg-export/accepted.json)時,只換審查通過的(新圖是同一張且明顯更清楚)
    if (ACCEPTED && !ACCEPTED.has(`${r.id}|${src}`)) { fail.push([r.id, src, "審查未通過(沒有變清楚/內容不同)"]); continue; }
    const old = await dims(path.join(ROOT, "web/public", src));
    if (!old) { fail.push([r.id, src, "舊圖讀不到"]); continue; }
    const ar = old.w / old.h, pos = allSrc.indexOf(src) / Math.max(1, allSrc.length - 1);
    const ok = cands.filter((c) => Math.abs(c.w / c.h - ar) / ar < 0.03);
    let pick = ok.length === 1 ? ok[0] : null;
    if (ok.length > 1) {
      const sc = ok.map((c) => ({ c, d: Math.abs((c.k - 1) / Math.max(1, cands.length - 1) - pos) })).sort((a, b) => a.d - b.d);
      if (sc[1].d - sc[0].d > 0.15) pick = sc[0].c;
    }
    if (!pick) { fail.push([r.id, src, ok.length ? `長寬比相符 ${ok.length} 個分不出` : `沒有長寬比相符的物件(候選 ${cands.length})`]); continue; }
    if (pick.w < old.w * 1.3) { fail.push([r.id, src, `原檔也只有 ${pick.w}px(舊圖 ${old.w}px),沒改善`]); continue; }
    const hash = crypto.createHash("sha1").update(fs.readFileSync(path.join(EXP, pick.file))).digest("hex").slice(0, 16);
    repl[src] = { file: pick.file, src: `/qimg/${r.subject}/rx/${hash}.png`, old, neu: { w: pick.w, h: pick.h } };
  }
  if (!Object.keys(repl).length) continue;
  const rep = (s) => s.replace(/src="([^"]+)"/g, (m, s0) => (repl[s0] ? `src="${repl[s0].src}"` : m));
  const patch = {};
  if (rep(r.question ?? "") !== r.question) patch.question = rep(r.question);
  if (Array.isArray(r.options) && JSON.stringify(r.options.map((o) => rep(String(o)))) !== JSON.stringify(r.options)) patch.options = r.options.map((o) => rep(String(o)));
  if (r.answer_text && rep(r.answer_text) !== r.answer_text) patch.answer_text = rep(r.answer_text);
  const complete = [...t.bad, ...t.low].every((s) => repl[s]);
  plan.push({ id: r.id, subject: r.subject, complete, repl, patch, before: { question: r.question, options: r.options, answer_text: r.answer_text } });
}
fs.writeFileSync(path.join(EXP, "plan.json"), JSON.stringify({ plan, fail }, null, 1));
const why = fail.reduce((c, f) => ((c[f[2].replace(/\d+/g, "N")] = (c[f[2].replace(/\d+/g, "N")] ?? 0) + 1), c), {});
console.log(`目標 ${rows.length} 題 → 換得到 ${plan.length} 題(全部換完 ${plan.filter((p) => p.complete).length});換不了 ${fail.length} 張`, why);
console.log("  找不到原檔:", rows.filter((r) => !docOf(r)).map((r) => r.id).join(" ") || "無");

// 新舊對照拼圖(左舊右新),給人/子代理看
if (!STAGE && !APPLY) {
  let n = 0;
  for (const p of plan) for (const [src, x] of Object.entries(p.repl)) {
    const H = 260;
    const a = await sharp(path.join(ROOT, "web/public", src), { animated: false }).flatten({ background: "#fff" }).resize({ height: H, width: 480, fit: "inside" }).png().toBuffer();
    const b = await sharp(path.join(EXP, x.file)).flatten({ background: "#fff" }).resize({ height: H, width: 480, fit: "inside" }).png().toBuffer();
    const [ma, mb] = [await sharp(a).metadata(), await sharp(b).metadata()];
    await sharp({ create: { width: ma.width + mb.width + 30, height: H + 10, channels: 3, background: "#ddd" } })
      .composite([{ input: a, left: 5, top: 5 }, { input: b, left: ma.width + 25, top: 5 }]).png()
      .toFile(path.join(EXP, "compare", `${p.id}-${++n}.png`));
  }
  console.log(`🖼️ 對照圖 ${n} 張 → data/badimg-export/compare/(左舊右新)`);
}
if (STAGE) {
  let n = 0;
  for (const p of plan) for (const x of Object.values(p.repl)) {
    const dst = path.join(ROOT, "web/public", x.src);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!fs.existsSync(dst)) { fs.copyFileSync(path.join(EXP, x.file), dst); n++; }
  }
  console.log(`🖼️ 已複製 ${n} 張圖到 web/public/qimg/*/rx/ → commit + push 部署後再 --apply`);
}
if (!APPLY) process.exit(0);
const SITE = "https://cap-three-ruddy.vercel.app";
for (const s of [...new Set(plan.flatMap((p) => Object.values(p.repl).map((x) => x.src)))]) {
  const res = await fetch(SITE + s, { method: "HEAD" });
  if (res.status !== 200) { console.log(`❌ 正式站還沒有 ${s}(${res.status}),先部署圖片`); process.exit(1); }
}
const file = writeBackup("replace-bad-images", plan.map((p) => ({ id: p.id, ...Object.fromEntries(Object.keys(p.patch).map((k) => [k, p.before[k]])) })));
console.log(`💾 備份 → ${file}`);
for (const p of plan) await patchQuestion(p.id, p.patch);
console.log(`✅ 已寫入 ${plan.length} 題(仍隱藏)。還原:node scripts/replace-bad-images.mjs --restore "${file}"`);
