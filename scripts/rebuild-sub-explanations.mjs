// 題組小題詳解重建(2026-10-08)
// 背景:split-groups 拆題時,小題詳解若只剩題號/算式遺失(公式在 LibreOffice 轉檔掉了)就不給詳解(tidyExplanation)
//       → 41 題小題「詳解:(無)」,但 Word 原檔其實有。現在有原檔 token(scripts/export-formula-tokens.py),可從原檔直接重建:
//       原檔「詳解：」之後,第 k 小題「(k)」到「(k+1)」之間 → 文字照原檔、公式用 eqToHtml / OMML HTML。
// 只處理:可見的 -gN 小題、資料庫沒有詳解、原檔詳解裡找得到「(k)」標記。
// 輸出 data/rerender/sub-expl-plan.json(含 marked 版,給看圖複核);用法:node scripts/rebuild-sub-explanations.mjs [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { eqToHtml } from "./lib/eq-field.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const TOKENS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/rerender/formula-audit/tokens.json"), "utf8"));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function tokHtml(t) {
  if (t.om) return t.om;
  if (!t.eq) throw new Error(`OMML 轉不了:${t.omx}`);
  const h = eqToHtml(t.eq.replace(/^\s*\\?eq\s*/i, "EQ ")).replace(/\ue000([^\ue001]*)\ue001/g, "<sup>$1</sup>");
  if (/[\ue000\ue001]/.test(h)) throw new Error("上標標記無法轉換");
  return h;
}

const rows = await fetchAll("questions?select=id,source,volume,explanation,needs_review&id=like.*-g*&needs_review=eq.false&explanation=is.null&order=id");
const plan = [], skip = {};
const bump = (k) => (skip[k] = (skip[k] ?? 0) + 1);
for (const q of rows) {
  const m = q.id.match(/^(math|science)-(\d{7})-g(\d+)$/);
  if (!m) continue;
  const k = +m[3];
  const [folder, name] = (q.source ?? "").split("/");
  const toks = TOKENS[`${m[1]}|${folder}|${q.volume ?? ""}|${name}`]?.[m[2]];
  if (!toks) { bump("找不到原檔"); continue; }
  // 攤平:文字逐字、公式保留為物件,方便用字串位置切段
  const items = toks.flatMap((t) => (typeof t === "string" ? [...t] : [t]));
  const text = items.map((x) => (typeof x === "string" ? x : "\u0000")).join("");
  const d = text.indexOf("詳解：");
  if (d === -1) { bump("原檔無詳解"); continue; }
  const mark = (n) => { const re = new RegExp(`[（(]\\s*${n}\\s*[）)]`, "g"); re.lastIndex = d; const r = re.exec(text); return r ? r.index : -1; };
  const a = mark(k);
  if (a === -1) { bump("原檔詳解無此小題標記"); continue; }
  const b0 = mark(k + 1);
  const b = b0 === -1 ? text.length : b0;
  let h = "";
  try {
    for (const x of items.slice(a, b)) h += typeof x === "string" ? esc(x) : tokHtml(x);
  } catch (e) { bump(`公式轉不了`); continue; }
  // 一般文字的上/下標標記 → <sup>/<sub>
  h = h.replace(/\ue000([^\ue001]*)\ue001/g, "<sup>$1</sup>").replace(/\ue002([^\ue003]*)\ue003/g, "<sub>$1</sub>").replace(/[\ue000-\ue003]/g, "");
  // 空白收斂;去掉尾巴的段落標題/頁碼(同 split-groups 的 tidyExplanation)
  h = h.replace(/[\s　]+/g, " ").trim()
    .replace(/\s+(?:簡答|問答|題組|選擇|計算|配合|填充|是非|非選擇?題?)\s*$/, "")
    .replace(/(?<=[。．.)）])\s+[0-9０-９]{1,2}\s*$/, "").trim();
  // 最後一小題的詳解會接到原檔下一大題的標題,而且段落之間沒有分隔字(「b＝55計算」)→ 不論有無空白都拿掉
  if (b0 === -1) h = h.replace(/(?:簡答|問答|題組|選擇|計算|配合|填充|是非|證明|非選擇?題?)$/, "").trim();
  if (h.replace(/<[^>]+>/g, "").replace(/^[（(]\s*\d+\s*[）)]/, "").trim().length < 2) { bump("內容太短"); continue; }
  plan.push({ id: q.id, explanation: h });
}
fs.writeFileSync(path.join(ROOT, "data/rerender/sub-expl-plan.json"), JSON.stringify(plan, null, 1));
console.log(`重建 ${plan.length} 題小題詳解;略過`, skip);
for (const p of plan.slice(0, 4)) console.log(`  ${p.id}: ${p.explanation.replace(/<[^>]+>/g, "").slice(0, 80)}`);
if (!APPLY) { console.log("(乾跑,未寫入)→ data/rerender/sub-expl-plan.json"); process.exit(0); }
const file = writeBackup("sub-expl", plan.map((p) => ({ id: p.id, explanation: null })));
console.log(`💾 備份 → ${file}`);
await runPool(plan, (p) => patchQuestion(p.id, { explanation: p.explanation }));
console.log(`✅ 已寫入 ${plan.length} 題。還原:node scripts/rebuild-sub-explanations.mjs --restore "${file}"`);
