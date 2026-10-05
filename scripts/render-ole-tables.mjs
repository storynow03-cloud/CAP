// 把「低解析表格圖」換成真正的 HTML 表格,再把通過檢查的題目放回題庫(2026-10-01)。
//
// 背景:Word 裡的內嵌物件(多半是表格)經 LibreOffice 轉 HTML 時只剩依顯示大小點陣化的預覽圖,
// 字糊到讀不出來,patch-lo-images.mjs 因此補了圖但先不放回題庫,並把這些圖記在
// data/lowres-images.json。這支腳本:
//   1. 把用到的原始 .doc 轉成 .odt(LibreOffice,快取在 data/lo-odt/,已轉過就跳過)
//   2. 交給 ole_tables.py:依物件名稱(「物件8」)找到內嵌文件,只有「純表格」才轉成 HTML 表格
//   3. 題目裡「每一張」低解析圖都轉成功,且預覽圖數出的列數 = 表格列數(防止內嵌表格被裁切、
//      轉出多餘的列),才把 <img> 換成表格;通過嚴格檢查才放回題庫
//      (表格樣式寫在 HTML 裡,不依賴網站 CSS,所以不用等部署)
//
// 用法:node scripts/render-ole-tables.mjs [--uses <清單>] [--dump <檔>] | --apply | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";
import { countRowLines } from "./lib/row-lines.mjs";

const APPLY = process.argv.includes("--apply");
const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}

const SOFFICE = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";
const LO_HTML = path.join(ROOT, "data", "lo-html");
const ODT = path.join(ROOT, "data", "lo-odt");
// --uses <檔>:改用指定清單(例:data/rerender/ole-uses.json,2026-10-04 看圖檢查確認壞掉的內嵌物件圖)
const usesIdx = process.argv.indexOf("--uses");
const uses = JSON.parse(fs.readFileSync(usesIdx !== -1 ? path.resolve(process.argv[usesIdx + 1]) : path.join(ROOT, "data", "lowres-images.json"), "utf8"));
const manualBroken = new Set(
  fs.readFileSync(path.join(ROOT, "scripts", "hide-missing-figure-questions.mjs"), "utf8")
    .match(/const BROKEN = \[([\s\S]*?)\];/)[1].match(/"[a-z]+-[\d-]+"/g).map((s) => s.slice(1, -1))
);

// 1) .doc → .odt(依資料夾批次轉,省 LibreOffice 啟動時間)
const htmlFiles = [...new Set(uses.map((u) => u.html))];
const docOf = (html) => {
  const rel = path.relative(LO_HTML, html);
  return {
    doc: path.join(ROOT, rel.replace(/\.html$/i, ".doc")),
    odt: path.join(ODT, rel.replace(/\.html$/i, ".odt")),
  };
};
const todoByDir = new Map();
for (const h of htmlFiles) {
  const { doc, odt } = docOf(h);
  if (fs.existsSync(odt) || !fs.existsSync(doc)) continue;
  const dir = path.dirname(odt);
  if (!todoByDir.has(dir)) todoByDir.set(dir, []);
  todoByDir.get(dir).push(doc);
}
let n = 0;
for (const [dir, docs] of todoByDir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync(SOFFICE, ["--headless", "--convert-to", "odt", "--outdir", dir, ...docs], { stdio: "ignore" });
  n += docs.length;
}
console.log(`轉 .odt:新轉 ${n} 檔(共需 ${htmlFiles.length} 檔)`);

// 2) 內嵌物件 → HTML 表格
const jobs = htmlFiles.map((h) => ({ odt: docOf(h).odt, names: [...new Set(uses.filter((u) => u.html === h).map((u) => u.name))] }));
const tmp = path.join(ROOT, "data", "ole-jobs.json");
const tmpOut = path.join(ROOT, "data", "ole-tables.json");
fs.writeFileSync(tmp, JSON.stringify(jobs), "utf8");
console.log("ole_tables.py:", execFileSync("python", [path.join(ROOT, "scripts", "ole_tables.py"), tmp, tmpOut], { encoding: "utf8" }).trim());
const tables = JSON.parse(fs.readFileSync(tmpOut, "utf8"));

// 3) 換進題目
const byId = new Map();
for (const u of uses) { if (!byId.has(u.id)) byId.set(u.id, []); byId.get(u.id).push(u); }
const ids = [...byId.keys()];
const SEL = "id,subject,type,question,options,answer,answer_text,explanation,needs_review";
const rows = [];
for (let i = 0; i < ids.length; i += 150) {
  rows.push(...await fetchAll(`questions?select=${SEL}&id=in.(${ids.slice(i, i + 150).join(",")})&order=id`));
}
// 題組拆出的小題(id = 原題 + "-g" + 小題號)沿用原題組文章裡的圖,一起處理
const subs = (await fetchAll(`questions?select=${SEL}&id=like.*-g*&order=id`)).filter((r) => byId.has(r.id.replace(/-g\d+$/, "")));
for (const s of subs) {
  const parentUses = byId.get(s.id.replace(/-g\d+$/, ""));
  const used = parentUses.filter((u) => [s.question, ...(s.options ?? [])].join("").includes(u.url));
  if (used.length) { byId.set(s.id, used); rows.push(s); }
}
const plan = [];
const stat = { 題數: rows.length, 全部轉成表格: 0, 有圖轉不了: 0, 列數對不上: 0, 放回題庫: 0, 轉了但檢查沒過: 0 };
const hidReasons = {};
for (const q of rows) {
  const list = byId.get(q.id);
  const htmls = list.map((u) => tables[docOf(u.html).odt]?.[u.name] ?? null);
  if (htmls.some((h) => !h)) { stat.有圖轉不了++; continue; }
  // Word 裡的內嵌表格可能只露出一部分(被裁切),轉出來會多出原本看不到的列,可能改變答案。
  // 用預覽圖數出實際露出的列數,必須跟表格列數完全相同才採用。
  let rowsOk = true;
  for (let i = 0; i < list.length; i++) {
    const trs = (htmls[i].match(/<tr>/g) ?? []).length;
    const tables = (htmls[i].match(/<table/g) ?? []).length;
    const seen = await countRowLines(path.join(ROOT, "web", "public", list[i].url));
    if (tables !== 1 || seen.rows !== trs) { rowsOk = false; break; }
  }
  if (!rowsOk) { stat.列數對不上++; continue; }
  stat.全部轉成表格++;
  const swap = (s) => {
    let t = String(s ?? "");
    list.forEach((u, i) => { t = t.replace(new RegExp(`<img src="${u.url.replace(/[.]/g, "\\.")}"[^>]*>`), htmls[i]); });
    return t;
  };
  const out = { ...q, question: swap(q.question), options: q.options ? q.options.map(swap) : null };
  const p = problems(out);
  const body = { question: out.question, options: out.options };
  const why = ["換成表格"];
  if (q.needs_review && !manualBroken.has(q.id) && p.length === 0) { body.needs_review = false; why.push("放回題庫"); stat.放回題庫++; }
  else { stat.轉了但檢查沒過++; p.forEach((r) => (hidReasons[r] = (hidReasons[r] ?? 0) + 1)); }
  plan.push({ id: q.id, subject: q.subject, body, before: Object.fromEntries(Object.keys(body).map((f) => [f, q[f]])), why });
}
console.log(stat, "檢查沒過的原因:", hidReasons);
const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx !== -1) fs.writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(plan), "utf8");
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }

const backupFile = writeBackup("ole-tables", plan.map((p) => ({ id: p.id, ...p.before })));
console.log(`💾 已備份 → ${backupFile}`);
await runPool(plan, (p) => patchQuestion(p.id, p.body));
console.log(`✅ 已處理 ${plan.length} 題`);
console.log(`還原:node scripts/render-ole-tables.mjs --restore "${backupFile}"`);
