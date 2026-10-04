// 合併子代理看圖檢查結果(data/image-review/results/*.json)→ 對回圖片路徑與使用該圖的題目
// 輸出 data/image-review/flagged.json:[{p, sheet, n, why, qs:[題號]}],並印出覆蓋率與各科/各單元統計
// 用法:node scripts/merge-image-review.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const RD = path.join(ROOT, "data/image-review");
const manifest = JSON.parse(fs.readFileSync(path.join(RD, "sheets/manifest.json"), "utf8"));
const list = JSON.parse(fs.readFileSync(path.join(ROOT, "data/image-screen-list.json"), "utf8"));
const qsOf = new Map(list.map((x) => [x.p, x.qs]));

const reviewed = new Set();
const flagged = [];
for (const f of fs.readdirSync(path.join(RD, "results")).filter((f) => f.endsWith(".json")).sort()) {
  const r = JSON.parse(fs.readFileSync(path.join(RD, "results", f), "utf8"));
  for (const s of r.sheets_reviewed ?? []) reviewed.add(s);
  for (const b of r.bad ?? []) {
    const item = (manifest[b.sheet] ?? []).find((x) => x.n === Number(b.n));
    if (!item) { console.warn(`⚠️ ${f}: 對不到 ${b.sheet} #${b.n}`); continue; }
    flagged.push({ p: item.p, sheet: b.sheet, n: Number(b.n), why: b.why, qs: qsOf.get(item.p) ?? [] });
  }
}
const allSheets = Object.keys(manifest);
const missing = allSheets.filter((s) => !reviewed.has(s));
fs.writeFileSync(path.join(RD, "flagged.json"), JSON.stringify(flagged, null, 1));

const subj = (p) => p.split("/")[2];
const bySubj = {};
for (const x of flagged) bySubj[subj(x.p)] = (bySubj[subj(x.p)] ?? 0) + 1;
const qset = new Set(flagged.flatMap((x) => x.qs));
console.log(`已看 ${reviewed.size}/${allSheets.length} 頁;未看 ${missing.length} 頁${missing.length ? `(例 ${missing.slice(0, 5).join(" ")})` : ""}`);
console.log(`標記 ${flagged.length} 張圖,影響 ${qset.size} 題`);
console.log("各科標記圖數:", bySubj);
console.log(`→ data/image-review/flagged.json`);
