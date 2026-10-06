// 選項尾巴的「出處標記」與「注釋」修正(2026-10-06)
//
// 問題:會考真題與部分題庫題,原檔在最後一個選項後面接著出處與注釋,匯入時黏進選項 D:
//   「烏蒂會影響泡出來的顏色。【109教育會考】\n【注釋】（１）斗品：茶葉的精品。…」
//   → 孩子在選項 D 裡看到注釋與出處,注釋本來是給題目文章用的。
// 修法:選項只留原本文字;「【注釋】…」移到題目最後;出處標記拿掉(source 欄已有「國中教育會考/109年度會考」)。
// 只處理格式完全符合的;選項剩下的文字若還有【】、注釋裡夾圖、題目已經有同樣注釋 → 不動、列出來。
//
// 用法:node scripts/fix-option-notes.mjs [--dump <檔>] [--apply] | --restore <備份檔>
import fs from "node:fs";
import { fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");

const TAG = /【[^】]{0,20}(?:會考|基測|學測|模擬考|段考)[^】]{0,12}】/;
const NOTE = /【(?:注釋|註釋|注|註)】/;
const rows = await fetchAll("questions?select=id,subject,needs_review,question,options,source&type=eq.single_choice&order=id");
const changes = [], skipped = [];
for (const q of rows) {
  const opts = q.options ?? [];
  const last = opts.at(-1) ?? "";
  if (!TAG.test(last) && !NOTE.test(last)) continue;
  if (opts.slice(0, -1).some((o) => TAG.test(o) || NOTE.test(o))) { skipped.push([q.id, "其他選項也有標記"]); continue; }
  const ni = last.search(NOTE);
  let head = ni >= 0 ? last.slice(0, ni) : last;
  const note = ni >= 0 ? last.slice(ni).trim() : "";
  const tag = head.match(TAG)?.[0] ?? "";
  head = head.replace(TAG, "").trim();
  if (!head) { skipped.push([q.id, "選項只剩空白"]); continue; }
  if (/[【】]/.test(head)) { skipped.push([q.id, `選項還有【】:${head.slice(0, 30)}`]); continue; }
  // 選項後面還夾著別的段落(社會會考題,2026-10-06 逐題看過 23 題):
  //   「(山脊線：山脊的連線。」括號名詞解釋 → 注釋;「表(三)」「<img>」「圖(九)」→ 題目附圖與標題;
  //   規定條文等內文 → 題目內容;\u0001(遺失的內嵌物件)與空行 → 刪掉
  const [first, ...rest] = head.split("\n");
  head = first.trim();
  const extraStem = [], extraNotes = [];
  for (const line of rest.map((l) => l.trim())) {
    if (!line || /^[\u0001\s]+$/.test(line)) continue;
    const nm = line.match(/^[（(]\s*([^：:＝=()（）]{1,15}[：:＝=][^()（）]*?)[）)]?$/);
    if (nm) extraNotes.push(nm[1].trim());
    else extraStem.push(line);
  }
  if (!head) { skipped.push([q.id, "選項只剩空白"]); continue; }
  if (/<img/.test(note)) { skipped.push([q.id, "注釋裡有圖"]); continue; }
  if (tag && q.source && !/會考|基測/.test(q.source)) { skipped.push([q.id, `出處標記與 source 不符:${tag} / ${q.source}`]); continue; }
  // 其他選項都沒有句號時,這個選項尾巴的「。」也是分隔用的 → 拿掉
  if (/。$/.test(head) && !opts.slice(0, -1).some((o) => /。$/.test(o.trim()))) head = head.slice(0, -1);
  if (note && q.question.includes(note.slice(0, 20))) { skipped.push([q.id, "題目已經有同樣注釋"]); continue; }
  const parts = [q.question.trim(), ...extraStem];
  if (note) parts.push(note);
  if (extraNotes.length) parts.push(`【注釋】${extraNotes.join("　")}`);
  changes.push({
    id: q.id, before: q, tag, note: [note, ...extraNotes].filter(Boolean).join(" "), extraStem,
    question: parts.join("\n"),
    options: [...opts.slice(0, -1), head],
  });
}
const stat = { 有注釋: changes.filter((c) => c.note).length, 有出處: changes.filter((c) => c.tag).length, 可見: changes.filter((c) => !c.before.needs_review).length };
console.log(`要修改 ${changes.length} 題`, stat, `;不動 ${skipped.length} 題`);
for (const [id, why] of skipped) console.log(`  不動 ${id}:${why}`);
for (const c of changes.slice(0, 3)) console.log(`--- ${c.id}\n題尾:${c.question.slice(-140)}\n末選項:${c.options.at(-1)}`);
const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx !== -1) fs.writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(changes), "utf8");
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }

const file = writeBackup("option-notes", changes.map(({ before: q }) => ({ id: q.id, question: q.question, options: q.options })));
console.log(`💾 備份 → ${file}`);
await runPool(changes, (c) => patchQuestion(c.id, { question: c.question, options: c.options }));
console.log(`✅ 已修改 ${changes.length} 題。還原:node scripts/fix-option-notes.mjs --restore "${file}"`);
