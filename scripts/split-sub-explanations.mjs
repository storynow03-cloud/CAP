// 題組小題詳解只留本小題(2026-10-10,題目修正清單 #4)
// 背景:自然/社會的題組拆成 -gN 小題時,每一小題都拿到整組詳解「前言 (1)… (2)… (3)…」,
//       學生在第 2 小題看到的詳解開頭是第 1 小題的內容(例 science-1050111-g2)。
// 做法:在現有詳解(HTML)裡找標籤外的「(1)(2)…(n)」標記,必須依序遞增出現且剛好 1~n 各一次、
//       n = 該題組的小題數(含隱藏小題);符合才改成「前言 + 第 k 段」。不符合的列進 skipped 給人看。
// 範圍:全庫可見 -gN 小題中,詳解含其他小題標記者(取代舊清單 data/rerender/sub-expl-unsplit.json 的 513 題)
// 用法:node scripts/split-sub-explanations.mjs [--apply] | --restore <備份檔>
// 輸出:data/rerender/sub-expl-split-plan.json(plan + skipped)
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
// 全庫所有 -gN 小題(含隱藏,用來算各題組小題數);只處理可見且有詳解的
const all = (await fetchAll("questions?select=id,explanation,needs_review&id=like.*-g*&order=id")).filter((r) => /-g\d+$/.test(r.id));
const groupSize = {};
for (const r of all) {
  const b = r.id.replace(/-g\d+$/, "");
  groupSize[b] = Math.max(groupSize[b] ?? 0, +r.id.match(/-g(\d+)$/)[1]);
}
const rows = all.filter((r) => !r.needs_review && r.explanation);
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(ROOT, "data/rerender/sub-expl-overrides.json"), "utf8"));
// 母題詳解(人工對應的段落可能只存在母題裡,例:原檔第 1 小題沒拆出來、小題編號錯位一格)
const momIds = [...new Set(Object.keys(OVERRIDES).map((id) => id.replace(/-g\d+$/, "")))];
const momExpl = Object.fromEntries((await fetchAll(`questions?select=id,explanation&id=in.(${momIds.join(",")})&order=id`)).map((r) => [r.id, r.explanation ?? ""]));

const toAscii = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
/** 找 HTML 中「不在標籤內」的 (n) 標記 */
function markers(html) {
  const out = [];
  const re = /[（(]\s*([0-9０-９]{1,2})\s*[）)]/g;
  let m;
  while ((m = re.exec(html))) {
    const before = html.slice(0, m.index);
    if (before.lastIndexOf("<") > before.lastIndexOf(">")) continue; // 在標籤屬性裡
    if (/第\s*$/.test(plain(before))) continue; // 敘述式「第(1)題答案為…」不是段落標記
    out.push({ n: +toAscii(m[1]), at: m.index });
  }
  return out;
}
const plain = (h) => (h ?? "").replace(/<[^>]+>/g, "").trim();
/** 段尾的分隔符(；，、)改成句號;前言尾巴的空白收掉 */
const tidyTail = (h) => /<img[^>]*>\s*$/.test(h) ? h.trim() : h.trim().replace(/[；;，,、：:\s]+$/, "").replace(/([^。．.!！?？」）)])$/, "$1。");

/** 相鄰標記(中間只有「、」或空白,例「(1)、(2)…」「(1)(5)…」)併成同一段;「(1)～(4)」展開成 1~4 */
function groups(html, ms) {
  const gs = [];
  for (const m of ms) {
    const last = gs.at(-1);
    const between = last ? plain(html.slice(last.end, m.at)) : null;
    if (last && /^\s*[～~－\-至]\s*$/.test(between) && m.n > last.labels.at(-1)) {
      for (let v = last.labels.at(-1) + 1; v <= m.n; v++) last.labels.push(v);
      last.end = m.end;
    } else if (last && /^[\s、，,]*$/.test(between)) { last.labels.push(m.n); last.end = m.end; }
    else gs.push({ labels: [m.n], at: m.at, end: m.end });
  }
  return gs;
}
// 尾巴殘留原檔下一大題的標題(同 split-groups 的 tidyExplanation)
const stripTitle = (h) => h.replace(/(?:簡答|問答|題組|選擇|計算|配合|填充|是非|非選擇?題?)\s*$/, "");

// OVERRIDES:子代理逐題內容核對(data/rerender/sub-expl-review/result-*.json)判 wrong 的人工對應:題號 → 本小題該給的原文段落
const plan = [], skipped = [];
for (const q of rows) {
  const base = q.id.replace(/-g\d+$/, "");
  const k = +q.id.match(/-g(\d+)$/)[1];
  const n = groupSize[base];
  const h = stripTitle((q.explanation ?? "").trim());
  if (q.id in OVERRIDES) {
    const seg = OVERRIDES[q.id];
    // 只接受「原詳解裡原樣存在」的段落,且原詳解不含 HTML(否則要人工處理)
    const mom = momExpl[base] ?? "";
    if (/</.test(h + mom) || (seg != null && !plain(h).includes(seg) && !plain(mom).includes(seg))) { skipped.push({ id: q.id, n, why: "人工對應段落與原文不符/含 HTML", text: plain(h) }); continue; }
    plan.push({ id: q.id, k, n, seq: "人工", kind: seg == null ? "無詳解" : "人工對應", before: q.explanation, explanation: seg == null ? null : tidyTail(seg) });
    continue;
  }
  const ms = markers(h).map((m) => ({ ...m, end: h.indexOf(")", m.at) === -1 ? m.at : m.at + h.slice(m.at).search(/[）)]/) + 1 }));
  const gs = groups(h, ms);
  const labels = gs.flatMap((g) => g.labels);
  const seq = gs.map((g) => g.labels.join("+")).join(",");
  // 只處理「詳解裡有別小題的段落」:至少兩個不同標籤,且有一段不屬於本小題
  if (new Set(labels).size < 2 || gs.every((g) => g.labels.includes(k))) continue;
  // 每個標籤最多一次、都在 1~n、每段的最小標籤遞增(擋掉「依據(1)的方式」這種內文引用)
  const ok = labels.length > 0 && new Set(labels).size === labels.length && labels.every((v) => v >= 1 && v <= n)
    && gs.every((g, i) => i === 0 || Math.min(...g.labels) > Math.min(...gs[i - 1].labels));
  if (!ok) { skipped.push({ id: q.id, n, seq, why: "標記重複/超出小題數/順序亂", text: plain(h) }); continue; }
  const pre = h.slice(0, gs[0].at);
  // 前言:結尾是連接詞(因此/所以/故…)或逗號就照原樣接下去,否則補句號
  const preTrim = pre.trim().replace(/[；;、：:]+$/, "");
  const preHtml = !plain(pre) ? "" : /(因此|所以|故|則|即|，|,)$/.test(plain(preTrim)) ? preTrim : tidyTail(preTrim);
  const gi = gs.findIndex((g) => g.labels.includes(k));
  let explanation;
  if (gi === -1) {
    // 原檔詳解沒有這一小題 → 只留共同前言;沒有前言就不給詳解
    explanation = preHtml ? tidyTail(preHtml) : null;
  } else {
    const seg = h.slice(gs[gi].at, gi + 1 < gs.length ? gs[gi + 1].at : h.length);
    if (plain(seg).replace(/^([（(]\s*\d+\s*[）)][\s、，,]*)+/, "").trim().length < 2) { skipped.push({ id: q.id, n, seq, why: "本段太短", text: plain(h) }); continue; }
    explanation = (preHtml + tidyTail(seg)).replace(/。\s*。$/, "。");
  }
  plan.push({ id: q.id, k, n, seq, kind: gi === -1 ? (explanation ? "只留前言" : "無詳解") : "切段", before: q.explanation, explanation });
}

fs.writeFileSync(path.join(ROOT, "data/rerender/sub-expl-split-plan.json"), JSON.stringify({ plan, skipped }, null, 1));
console.log(`可切 ${plan.length} 題;略過 ${skipped.length} 題(見 data/rerender/sub-expl-split-plan.json)`);
console.log("  ", plan.reduce((c, p) => ((c[p.kind] = (c[p.kind] ?? 0) + 1), c), {}));
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }
const file = writeBackup("sub-expl-split", plan.map((p) => ({ id: p.id, explanation: p.before })));
console.log(`💾 備份 → ${file}`);
await runPool(plan, (p) => patchQuestion(p.id, { explanation: p.explanation }));
console.log(`✅ 已寫入 ${plan.length} 題。還原:node scripts/split-sub-explanations.mjs --restore "${file}"`);
