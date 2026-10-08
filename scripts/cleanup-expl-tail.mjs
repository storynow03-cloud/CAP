// 清掉詳解結尾混入的殘字(2026-10-08)
//   ① 段落標題:Word 原檔下一大題的標題(填充/題組/計算/證明/克漏字選擇)被接到上一題詳解尾巴。
//      只在標題前面是空白或句尾標點時才拿掉(「總括計算」「3種選擇」這類詞語不動)。
//   ② 頁碼:數學/自然用原檔 token 比對 —— 資料庫詳解尾巴比原檔多出一段「空白+1~3 位數字」才拿掉;
//      其他科只處理「句尾標點+空白+數字」這種明確的情況。
// 用法:node scripts/cleanup-expl-tail.mjs [--apply] [--list] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const TOKENS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/rerender/formula-audit/tokens.json"), "utf8"));
const KEEP = /[0-9A-Za-z一-鿿]/;
const normTail = (s) => [...s].filter((c) => KEEP.test(c)).join("");
const PUNCT = /[。！？」）)\]】.．：:；;]$/;

// 原檔「詳解：」之後到題目結尾的純文字(公式 token 換成其內容字元)
function sourceExpl(q) {
  const m = q.id.match(/^(math|science)-(\d{7})/);
  if (!m) return null;
  const [folder, name] = (q.source ?? "").split("/");
  const toks = TOKENS[`${m[1]}|${folder}|${q.volume ?? ""}|${name}`]?.[m[2]];
  if (!toks) return null;
  const s = toks.map((t) => (typeof t === "string" ? t : t.om ? t.om.replace(/<[^>]+>/g, "") : (t.eq ?? "").replace(/\\[a-zA-Z]+\d*/g, ""))).join("");
  const i = s.indexOf("詳解：");
  return i === -1 ? null : s.slice(i + 3);
}

const rows = await fetchAll("questions?select=id,subject,volume,source,explanation&needs_review=eq.false&explanation=not.is.null&order=id");
const changes = [], stat = {};
const bump = (k) => (stat[k] = (stat[k] ?? 0) + 1);
for (const q of rows) {
  let h = q.explanation, why = [];
  // ① 段落標題(可能一題有「計算」又接頁碼,迴圈處理兩種)
  for (let round = 0; round < 3; round++) {
    const mh = h.match(/(?:\s|&nbsp;|<br\s*\/?>)*(填充|題組|計算|證明|克漏字選擇)\s*$/);
    if (mh) {
      const before = h.slice(0, mh.index).replace(/<[^>]+>/g, "");
      const sep = mh[0].length > mh[1].length; // 標題前面有空白
      if (sep || PUNCT.test(before.trimEnd())) { h = h.slice(0, mh.index).trimEnd(); why.push(`標題「${mh[1]}」`); continue; }
    }
    // ② 頁碼:結尾是「空白+數字」,而且數字在標籤外(不是分數/上標的一部分)
    const mn = h.match(/(?:\s|&nbsp;)+(\d{1,3})\s*$/);
    if (mn) {
      const before = h.slice(0, mn.index);
      const src = sourceExpl(q);
      let page = false;
      if (src !== null) {
        // 原檔詳解結尾不是這串數字,而且去掉數字後資料庫結尾 = 原檔結尾 → 頁碼
        const a = normTail(src), b = normTail(before.replace(/<[^>]+>/g, ""));
        page = !a.endsWith(mn[1]) && b.length >= 4 && a.endsWith(b.slice(-4));
      } else if (!/^(math|science)$/.test(q.subject)) {
        page = PUNCT.test(before.replace(/<[^>]+>/g, "").trimEnd());
      }
      if (page) { h = before.trimEnd(); why.push(`頁碼「${mn[1]}」`); continue; }
    }
    break;
  }
  if (h !== q.explanation) {
    why.forEach((w) => bump(`${q.subject}|${w.replace(/「.*」/, "")}`));
    changes.push({ id: q.id, patch: { explanation: h }, why: why.join("+"), tail: q.explanation.replace(/<[^>]+>/g, "").slice(-30), newTail: h.replace(/<[^>]+>/g, "").slice(-30) });
  }
}
console.log(`要清 ${changes.length} 題`, stat);
fs.writeFileSync(path.join(ROOT, "data/rerender/expl-tail-plan.json"), JSON.stringify(changes, null, 1));
if (process.argv.includes("--list")) for (const c of changes) console.log(`${c.id}\t${c.why}\t…${c.tail}\t→ …${c.newTail}`);
if (!APPLY) { console.log("(乾跑,未寫入)→ data/rerender/expl-tail-plan.json"); process.exit(0); }
const byId = new Map(rows.map((q) => [q.id, q]));
const file = writeBackup("expl-tail", changes.map((c) => ({ id: c.id, explanation: byId.get(c.id).explanation })));
console.log(`💾 備份 → ${file}`);
await runPool(changes, (c) => patchQuestion(c.id, c.patch));
console.log(`✅ 已修改 ${changes.length} 題。還原:node scripts/cleanup-expl-tail.mjs --restore "${file}"`);
