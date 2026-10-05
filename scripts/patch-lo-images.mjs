// 把 LibreOffice 轉出的圖片補回「圖片遺失」的題目(國文/英語/社會,2026-09-30)。
//
// 背景:國文/英語/社會當初是用純文字抽取匯入的,題目裡的圖片、表格、圖片選項全部變成 \x01 佔位字元,
// 這些題目無法作答(repair-question-text.mjs 已先把它們隱藏)。數學/自然走的是 LibreOffice
// HTML 管線,圖片正常。這支腳本只「補圖」,不重新匯入題目文字(重新匯入會把之前修好的文字又弄壞):
//   1. 讀 data/lo-html/{社會,國文,英文}/**/*.html,依「來源檔 + 題號」找到資料庫裡的同一題
//   2. 該題 HTML 裡的圖片數量要「剛好等於」資料庫題目裡 \x01 的數量才處理,依出現順序一對一替換
//      (題幹 → 選項;詳解另外比對)。數量對不上就跳過,不猜。
//   3. 圖片壓成 WebP(最寬為文件顯示寬度的 2 倍,上限 900px),依內容雜湊去重,
//      存到 web/public/qimg/{科目}/h/;<img> 帶原文件的顯示寬度,小圖示(方向標等)不會被放大。
//   4. 補完圖後通過 lib/question-checks.mjs 嚴格檢查、且不在人工缺圖清單的隱藏題 → 放回題庫。
//
// 用法:node scripts/patch-lo-images.mjs [--subjects social,chinese,english] [--dump <檔>]   乾跑
//       … --images    只產生圖片檔(不動資料庫)
//       … --apply     寫資料庫(會先到正式站抽查圖片已部署,拿不到就中止)
//       --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";
import { visibleProblems } from "./lib/visible-checks.mjs";

const sharp = createRequire(path.join(ROOT, "web", "package.json"))("sharp");
// 資料庫是正式站共用的:圖片檔還沒部署上線就改資料庫,孩子會看到破圖。所以分兩階段:
//   --images 只產生圖片檔(不動資料庫)→ git push 部署 → 確認線上圖片可開 → --apply 才寫資料庫
const APPLY = process.argv.includes("--apply");
const IMAGES = APPLY || process.argv.includes("--images");
const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題(圖片檔保留,不影響)`);
  process.exit(0);
}
const argSubj = process.argv.indexOf("--subjects");
const SUBJECTS = argSubj !== -1 ? process.argv[argSubj + 1].split(",") : ["social", "chinese", "english"];
const ZH = { social: "社會", chinese: "國文", english: "英文" };
const LO = path.join(ROOT, "data", "lo-html");
const IMG_OUT = path.join(ROOT, "web", "public", "qimg");
const FIELDS = ["question", "options", "explanation", "needs_review"];
const MAX_W = 900;

const manualBroken = new Set(
  fs.readFileSync(path.join(ROOT, "scripts", "hide-missing-figure-questions.mjs"), "utf8")
    .match(/const BROKEN = \[([\s\S]*?)\];/)[1].match(/"[a-z]+-[\d-]+"/g).map((s) => s.slice(1, -1))
);

function walk(d) {
  const out = [];
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.html$/i.test(e.name)) out.push(p);
  }
  return out;
}
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&nbsp;/g, " ")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

const RECOVERED_FILE = path.join(ROOT, "data", "rerender", "recovered.json");
const RECOVERED = fs.existsSync(RECOVERED_FILE) ? JSON.parse(fs.readFileSync(RECOVERED_FILE, "utf8")) : {};

/** HTML → 純文字,圖片換成 \x02{序號}\x03,回傳文字與圖片清單(檔案路徑 + 顯示寬度) */
function extract(file) {
  const html = fs.readFileSync(file, "utf8").replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  const imgs = [];
  const text = decode(
    html.replace(/<img[^>]*>/gi, (tag) => {
      const src = (tag.match(/src="([^"]+)"/i) || [])[1];
      const w = Number((tag.match(/width="(\d+)"/i) || [])[1]) || null;
      const name = decode((tag.match(/name="([^"]*)"/i) || [])[1] ?? "");
      let p = src ? path.join(path.dirname(file), decodeURIComponent(decode(src))) : null;
      // LO 匯出失敗(src 指回 .html):改用 recover-lo-failed.py 從原始 .doc 救回的圖
      if (p && /\.html$/i.test(p)) p = RECOVERED[`${file}|${imgs.length}`] ?? p;
      imgs.push({ path: p, width: w, name, html: file });
      return `\x02${imgs.length - 1}\x03`;
    }).replace(/<[^>]+>/g, "")
  );
  return { text, imgs };
}

const made = new Map(); // 原圖路徑 → 網址(同一張圖只壓一次)
const failed = [];
const lowRes = new Set();
const lowResUse = [];
let bytesOut = 0;
async function toWebp(img, subject) {
  if (!img.path || !fs.existsSync(img.path)) return null;
  if (made.has(img.path)) return made.get(img.path);
  const buf = fs.readFileSync(img.path);
  const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16);
  let ext = "webp";
  try {
    const meta = await sharp(buf).metadata();
    // 低解析:原圖寬度只有文件顯示寬度那麼大、而且不是小圖示 → 多半是 Word 內嵌物件(表格/圖表)
    // 被 LibreOffice 依顯示大小點陣化,字很糊。補圖但先不放回題庫,免得孩子看到讀不出的表格。
    if (img.width && img.width >= 120 && meta.width < img.width * 1.2) lowRes.add(img.path);
  } catch {
    // sharp 讀不了(例:少數 GIF 變體):瀏覽器能顯示的格式就原檔照用,否則放棄這張(整題跳過)
    const orig = path.extname(img.path).slice(1).toLowerCase();
    if (!["gif", "png", "jpg", "jpeg"].includes(orig)) { failed.push(img.path); made.set(img.path, null); return null; }
    ext = orig;
  }
  const rel = `/qimg/${subject}/h/${hash}.${ext}`;
  const dest = path.join(IMG_OUT, subject, "h", `${hash}.${ext}`);
  if (IMAGES && !fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    let out = buf;
    if (ext === "webp") {
      const target = Math.min(MAX_W, img.width ? img.width * 2 : MAX_W);
      out = await sharp(buf, { animated: false }).flatten({ background: "#ffffff" })
        .resize({ width: target, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    }
    fs.writeFileSync(dest, out);
    bytesOut += out.length;
  }
  made.set(img.path, rel);
  return rel;
}
// 小圖(圖示、符號)維持文件上的大小;地圖/圖表不指定寬度,以 2 倍解析度的原尺寸顯示
// (版面太窄時 CSS max-width:100% 會縮),孩子在 iPad 上才看得清楚圖上的小字
const tag = (url, width) => `<img src="${url}" alt="圖"${width && width < 150 ? ` width="${width}"` : ""} />`;
const countX = (s) => (String(s ?? "").match(/\x01/g) || []).length;

// 題組:母題(id = 題號)的 \x01 依序對應這一題的圖;每個小題(-gN)的 \x01 用「前後文」到母題裡找同一個位置。
// 前後文正規化:去空白、去小題標記「(　)(1)」「（第 1 小題）」。每個 \x01 都要在母題找到唯一的對應,否則整組跳過。
const ctxNorm = (s) => s.replace(/[(（]\s*[)）]\s*[(（]\d+[)）]|（第\s*\d+\s*小題）/g, "").replace(/[\s　]/g, "");
function slots(text) { // 每個 \x01 的 [左文, 右文]
  const out = [];
  const t = String(text ?? "");
  for (let i = 0; i < t.length; i++) if (t[i] === "\x01") out.push([ctxNorm(t.slice(Math.max(0, i - 30), i)).slice(-12), ctxNorm(t.slice(i + 1, i + 31)).slice(0, 12)]);
  return out;
}
async function patchGroup(cands, parentId, block, imgs, subject) {
  const parent = cands.find((r) => r.id === parentId);
  if (!parent) return null;
  const pText = [parent.question, ...(parent.options ?? [])].join("\u0000");
  const body = block.split("《答案》")[0];
  const bodyImgs = [...body.matchAll(/\x02(\d+)\x03/g)].map((m) => imgs[+m[1]]);
  const pSlots = slots(pText);
  if (pSlots.length !== bodyImgs.length || !pSlots.length) return null;
  const urls = await Promise.all(bodyImgs.map((im) => toWebp(im, subject)));
  if (urls.some((u) => !u)) return null;
  const find = ([l, r]) => {
    let hit = pSlots.map((s, i) => (s[0] === l && s[1] === r ? i : -1)).filter((i) => i >= 0);
    if (hit.length !== 1) hit = pSlots.map((s, i) => (s[0] === l ? i : -1)).filter((i) => i >= 0);
    return hit.length === 1 ? hit[0] : -1;
  };
  const out = [];
  for (const q of cands) {
    if (q === parent) continue;
    let bad = false;
    const fill = (s) => {
      if (typeof s !== "string" || !s.includes("\x01")) return s;
      const ss = slots(s);
      let k = 0;
      return s.replace(/\x01/g, () => { const i = find(ss[k++]); if (i < 0) { bad = true; return "\x01"; } return tag(urls[i], bodyImgs[i].width); });
    };
    const o = { ...q, question: fill(q.question), options: q.options ? q.options.map(fill) : q.options };
    if (bad) return null; // 任一小題對不上 → 整組跳過
    const why = ["題組補圖"];
    const usesLowRes = bodyImgs.some((im) => lowRes.has(im.path));
    if (q.needs_review && !usesLowRes && !manualBroken.has(q.id) && problems(o).length === 0 && visibleProblems(o).length === 0) { o.needs_review = false; why.push("放回題庫"); stat.unhide++; }
    const bodyPatch = {};
    for (const f of FIELDS) if (JSON.stringify(o[f]) !== JSON.stringify(q[f])) bodyPatch[f] = o[f];
    if (Object.keys(bodyPatch).length) out.push({ id: q.id, subject, body: bodyPatch, before: Object.fromEntries(Object.keys(bodyPatch).map((f) => [f, q[f]])), why });
  }
  return out;
}

const plan = [];
const stat = { files: 0, blocks: 0, need: 0, matched: 0, mismatch: 0, ambiguous: 0, unhide: 0 };
for (const subject of SUBJECTS) {
  const rows = await fetchAll(`questions?select=id,subject,source,type,question,options,answer,answer_text,explanation,needs_review&subject=eq.${subject}&order=id`);
  const bySource = new Map();
  for (const r of rows) { if (!bySource.has(r.source)) bySource.set(r.source, []); bySource.get(r.source).push(r); }
  const dir = path.join(LO, ZH[subject]);
  for (const file of walk(dir)) {
    stat.files++;
    const parts = path.relative(dir, file).split(path.sep);
    const source = `${parts[0]}/${parts[parts.length - 1].replace(/\.html$/i, "")}`;
    const dbRows = bySource.get(source) ?? [];
    const { text, imgs } = extract(file);
    for (const block of text.split(/題號：/).slice(1)) {
      const num = (block.match(/^\s*(\d+)/) || [])[1];
      if (!num) continue;
      stat.blocks++;
      const cands = dbRows.filter((r) => r.id === `${subject}-${num}` || r.id.startsWith(`${subject}-${num}-`));
      const q = cands[0];
      const nQ = q ? countX(q.question) + (q.options ?? []).reduce((s, o) => s + countX(o), 0) : 0;
      const nE = q ? countX(q.explanation) : 0;
      if (q && !nQ && !nE && q.needs_review && cands.length === 1) {
        // 已經補過圖、但因低解析圖還隱藏著的題目:依序對照,只記錄低解析圖給 render-ole-tables.mjs
        const ours = [q.question, ...(q.options ?? [])].join("\n").match(new RegExp(`/qimg/${subject}/h/[0-9a-f]+\\.(?:webp|gif|png|jpe?g)`, "g")) ?? [];
        const body = block.split("《答案》")[0];
        const bodyImgs = [...body.matchAll(/\x02(\d+)\x03/g)].map((m) => imgs[+m[1]]);
        if (ours.length && ours.length === bodyImgs.length) {
          for (let i = 0; i < bodyImgs.length; i++) {
            const url = await toWebp(bodyImgs[i], subject);
            if (url === ours[i] && lowRes.has(bodyImgs[i].path))
              lowResUse.push({ id: q.id, subject, html: bodyImgs[i].html, name: bodyImgs[i].name, url });
          }
        }
        continue;
      }
      if (!q || (!nQ && !nE)) continue;
      stat.need++;
      if (cands.length > 1) { // 題組:母題 + 拆出的小題(2026-10-05)
        const r = await patchGroup(cands, `${subject}-${num}`, block, imgs, subject);
        if (!r) { stat.ambiguous++; continue; }
        stat.group = (stat.group ?? 0) + r.length;
        plan.push(...r);
        continue;
      }
      const [body, ...rest] = block.split("《答案》");
      const bodyImgs = [...body.matchAll(/\x02(\d+)\x03/g)].map((m) => imgs[+m[1]]);
      const explPart = rest.join("《答案》").split("詳解：").slice(1).join("詳解：");
      const explImgs = [...explPart.matchAll(/\x02(\d+)\x03/g)].map((m) => imgs[+m[1]]);
      if (nQ !== bodyImgs.length || (nE && nE !== explImgs.length)) { stat.mismatch++; continue; }
      stat.matched++;

      // 依序替換:題幹 → 各選項;詳解另外一組
      const urls = await Promise.all(bodyImgs.map((im) => toWebp(im, subject)));
      const eurls = nE ? await Promise.all(explImgs.map((im) => toWebp(im, subject))) : [];
      if (urls.some((u) => !u) || eurls.some((u) => !u)) { stat.mismatch++; stat.matched--; continue; }
      let k = 0;
      const fill = (s) => String(s).replace(/\x01/g, () => { const i = k++; return tag(urls[i], bodyImgs[i].width); });
      const out = { ...q, question: fill(q.question), options: q.options ? q.options.map(fill) : null };
      let e = 0;
      if (nE) out.explanation = String(q.explanation).replace(/\x01/g, () => { const i = e++; return tag(eurls[i], explImgs[i].width); });
      // 題目的附圖在原文件裡常排在選項後面,抽出來就黏在最後一個選項裡(「(D)鹿皮。\n[圖]」),
      // 看起來像是 (D) 的內容。選項文字後「另起一行」的圖 = 題目附圖,移回題幹尾。
      const why = ["補圖"];
      if (out.options) {
        const moved = [];
        const last = out.options.length - 1;
        out.options = out.options.map((o, i) => {
          // 1) 選項文字後另起一行的圖
          let m = o.match(/^([\s\S]*\S)[ \t　]*\n\s*((?:<img[^>]*>\s*)+)$/);
          // 2) 最後一個選項在句點/出處標記(「。」「【110教育會考】」)之後接著圖(可能帶圖說「圖(十五)」)
          if (!m && i === last) m = o.match(/^([\s\S]*?[。】])\s*(<img[^>]*>[\s\S]*)$/);
          if (!m || !m[1].replace(/<img[^>]*>/g, "").trim()) return o;
          moved.push(m[2].trim());
          return m[1];
        });
        if (moved.length) { out.question = `${out.question}\n${moved.join("\n")}`; why.push("附圖移回題幹"); }
      }
      const usesLowRes = [...bodyImgs, ...explImgs].some((im) => lowRes.has(im.path));
      if (q.needs_review && usesLowRes) {
        why.push("低解析圖,暫不放回");
        // 記下來給 render-ole-tables.mjs:這些多半是 Word 內嵌表格,可以轉成真正的 HTML 表格
        [...bodyImgs, ...explImgs].forEach((im) => {
          if (lowRes.has(im.path)) lowResUse.push({ id: q.id, subject, html: im.html, name: im.name, url: made.get(im.path) });
        });
      }
      else if (q.needs_review && !manualBroken.has(q.id) && problems(out).length === 0 && visibleProblems(out).length === 0) { out.needs_review = false; why.push("放回題庫"); stat.unhide++; }
      const bodyPatch = {};
      for (const f of FIELDS) if (JSON.stringify(out[f]) !== JSON.stringify(q[f])) bodyPatch[f] = out[f];
      plan.push({ id: q.id, subject, body: bodyPatch, before: Object.fromEntries(Object.keys(bodyPatch).map((f) => [f, q[f]])), why });
    }
  }
}

console.log(stat);
const bySubj = {};
for (const p of plan) for (const w of p.why) bySubj[`${w} ${p.subject}`] = (bySubj[`${w} ${p.subject}`] ?? 0) + 1;
console.log(bySubj, `圖片 ${made.size} 張(去重後)`);
if (failed.length) console.log(`無法處理的圖片 ${failed.length} 張(該題跳過),例:`, failed.slice(0, 3));
// 2026-10-05:低解析清單已由 rerender 流程維護(重畫好的已移除),這裡不再覆寫;只有加 --write-lowres 才寫
if (process.argv.includes("--write-lowres")) {
  fs.writeFileSync(path.join(ROOT, "data", "lowres-images.json"), JSON.stringify(lowResUse), "utf8");
  console.log(`低解析圖使用清單 ${lowResUse.length} 筆 → data/lowres-images.json`);
}
// --exclude <JSON>:題號(不含 -gN)清單,整組不處理(例:救回圖檢查發現有問題的,data/rerender/rec-exclude.json)
const exIdx = process.argv.indexOf("--exclude");
if (exIdx !== -1) {
  const ex = new Set(JSON.parse(fs.readFileSync(process.argv[exIdx + 1], "utf8")));
  const before = plan.length;
  for (let i = plan.length - 1; i >= 0; i--) if (ex.has(plan[i].id.replace(/-g\d+$/, ""))) plan.splice(i, 1);
  console.log(`--exclude 排除 ${before - plan.length} 題`);
}
// 題幹(去掉圖)沒有文字的不放回:無法確認選項圖配得對不對
for (const p of plan) if (p.body.needs_review === false && !String(p.body.question ?? "").replace(/<img[^>]*>/g, "").replace(/<[^>]+>/g, "").replace(/[\s　]/g, "")) {
  delete p.body.needs_review; p.why.push("題幹空白,不放回");
}
const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx !== -1) fs.writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(plan), "utf8");
if (IMAGES) console.log(`本次新產生圖片 ${(bytesOut / 1048576).toFixed(1)} MB`);
if (!APPLY) {
  console.log(IMAGES ? "(只產生圖片,未寫資料庫。部署上線後再加 --apply)" : "(乾跑,未寫入、未產生圖片)");
  process.exit(0);
}

// 寫資料庫前確認:用到的圖片都已部署在正式站(抽查),避免孩子看到破圖
const SITE = "https://cap-three-ruddy.vercel.app";
const sample = [...new Set(plan.flatMap((p) => JSON.stringify(p.body).match(/\/qimg\/[a-z]+\/h\/[0-9a-f]+\.webp/g) ?? []))];
for (const u of sample.sort(() => Math.random() - 0.5).slice(0, 20)) {
  const r = await fetch(SITE + u, { method: "HEAD" });
  if (!r.ok) { console.log(`❌ 正式站還拿不到 ${u}(HTTP ${r.status}),圖片尚未部署,中止,資料庫未修改`); process.exit(1); }
}
console.log("正式站圖片抽查 20 張 OK");
const backupFile = writeBackup("lo-images", plan.map((p) => ({ id: p.id, ...p.before })));
console.log(`💾 已備份 → ${backupFile}`);
await runPool(plan, (p) => patchQuestion(p.id, p.body));
console.log(`✅ 已補圖 ${plan.length} 題`);
console.log(`還原:node scripts/patch-lo-images.mjs --restore "${backupFile}"`);
