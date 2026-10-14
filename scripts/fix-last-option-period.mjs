// 最後一個選項多句號(2026-10-14,題目修正清單 #3)
// 背景:康軒原檔整句「(A)…(B)…(C)…(D)…。」的句尾句號被併進最後一個選項(例 science-0810xxx「(D)血漿中。」、
//       圖片選項後面多一個「。」)。內容沒錯,只是外觀不一致。
// 規則(保守):最後一個選項以「。」結尾,且其他選項都沒有任何句尾標點(。？！.?!)→ 刪掉最後那個「。」。
//       其他選項本來就是完整句子時,句號是原文的一部分,不動。
// 用法:node scripts/fix-last-option-period.mjs [--apply] | --restore <備份檔>
import { fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const END = /[。？！.?!]\s*$/;
const TAIL = /\s*。\s*$/;
const plain = (h) => String(h).replace(/<[^>]+>/g, "").trim();

// 只處理學生看得到的題目(隱藏題多半選項本身就壞了,例如夾著下一題「（　）２」,留給之後救回時一起處理)
const rows = await fetchAll("questions?select=id,subject,needs_review,options&options=not.is.null&needs_review=eq.false&order=id");
const BROKEN = /[（(]\s*[）)]\s*[0-9０-９]|\n\s*[（(]\s*[0-9０-９]+\s*[）)]/; // 選項裡夾著別題題號
const broken = [];
const plan = [];
for (const q of rows) {
  const o = q.options;
  if (!Array.isArray(o) || o.length < 2) continue;
  const last = String(o.at(-1));
  if (!TAIL.test(last)) continue;
  if (o.slice(0, -1).some((x) => END.test(String(x)))) continue;
  if (o.some((x) => BROKEN.test(plain(x)))) { broken.push(q.id); continue; }
  const fixed = last.replace(TAIL, "");
  if (!plain(fixed) && !/<img/.test(fixed)) continue; // 刪完變空的不處理
  plan.push({ id: q.id, subject: q.subject, hidden: q.needs_review, before: o, after: [...o.slice(0, -1), fixed] });
}
const by = (k) => plan.reduce((c, p) => ((c[p[k]] = (c[p[k]] ?? 0) + 1), c), {});
console.log(`共 ${plan.length} 題(可見 ${plan.filter((p) => !p.hidden).length})`, by("subject"));
const img = plan.filter((p) => /<img[^>]*>\s*。\s*$/.test(String(p.before.at(-1))));
console.log(`其中圖片選項後的句號 ${img.length} 題;選項夾別題題號而跳過 ${broken.length} 題`, broken.slice(0, 20).join(" "));
if (process.argv.includes("--sample")) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const show = (p) => console.log(`${p.id}: ${p.before.map((x) => plain(x).slice(0, 28) || "[圖]").join(" | ")}`);
  for (const s of ["math", "chinese", "science", "social"]) { const g = plan.filter((p) => p.subject === s); for (const p of s === "math" ? g : Array.from({ length: 8 }, () => g[Math.floor(rnd() * g.length)])) show(p); }
  img.slice(0, 3).forEach((p) => console.log(p.id, JSON.stringify(p.before.at(-1)).slice(-60)));
}
if (process.argv.includes("--list")) for (const p of plan) console.log(p.id, JSON.stringify(p.before.map((x) => plain(x).slice(-25))));
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }
const file = writeBackup("last-option-period", plan.map((p) => ({ id: p.id, options: p.before })));
console.log(`💾 備份 → ${file}`);
await runPool(plan, (p) => patchQuestion(p.id, { options: p.after }));
console.log(`✅ 已寫入 ${plan.length} 題。還原:node scripts/fix-last-option-period.mjs --restore "${file}"`);
