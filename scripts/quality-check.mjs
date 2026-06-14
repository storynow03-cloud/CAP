import fs from "node:fs";
const qs = JSON.parse(fs.readFileSync("D:/Claude/國中會考/data/questions/math.html.json", "utf8")).filter((q) => !q.needs_review);
let clean = 0, degraded = 0;
const samples = [];
for (const q of qs) {
  const plain = (q.question || "").replace(/<img[^>]*>/g, "");
  const opts = (q.options || []).map((o) => o.replace(/<img[^>]*>/g, "").trim());
  const dupOpt = new Set(opts).size < opts.length;
  // 句中出現「字＝」缺左運算元、或「//」前後無字
  const orphan = /[，。若則為與和](＝|＜|＞)/.test(plain) || /[一-鿿](／／|\/\/)/.test(plain) || /^[＝／]/.test(plain.trim());
  const emptyish = plain.trim().length < 8;
  const bad = dupOpt || orphan || emptyish;
  if (bad) { degraded++; if (samples.length < 4) samples.push(plain.slice(0, 55) + "  ▶選項:" + opts.join(",")); }
  else clean++;
}
console.log(`可用題 ${qs.length} | 乾淨 ${clean} | 疑似缺漏 ${degraded} (${Math.round(degraded / qs.length * 100)}%)`);
console.log("--- 缺漏範例 ---");
samples.forEach((s) => console.log(s));
