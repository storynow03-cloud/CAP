// 題組小題「附圖黏在最後一個選項」修正(2026-10-06)
//
// 問題:原檔小題之間的附圖,拆題時被留在上一小題最後一個選項尾巴:選項 D =「丁\n<img …>」。
//   → 圖顯示在選項 D 裡;若那張圖其實是下一小題的,下一小題就完全看不到圖。
// 修法(與 split-groups.mjs 相同規則):把圖從選項移出,依題幹有沒有提到「圖/表」決定給哪一小題:
//   只有本小題提到 → 本小題題幹;只有下一小題提到 → 下一小題題幹;都提到/都沒提到 → 兩小題都放。
//
// 用法:node scripts/fix-group-tail-images.mjs [--dump <檔>] [--apply] | --restore <備份檔>
import fs from "node:fs";
import { fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");

const rows = await fetchAll("questions?select=id,question,options,needs_review&type=eq.single_choice&tags=cs.{題組}&order=id");
const byId = new Map(rows.map((q) => [q.id, q]));
const TAIL = /^([\s\S]*?\S)\s*\n\s*((?:<img[^>]*>\s*)+)$/;
const stemOf = (q) => String(q?.question ?? "").split(/（第 \d+ 小題）/).at(-1).replace(/<[^>]+>/g, "");
const refFig = (q) => /圖|表格|[下上附此該本左右甲乙丙丁]表|表[中內裡上][的所]?|統計表|[如見依由據]表/.test(stemOf(q));

const changes = new Map(); // id → { question, options }
const get = (q) => changes.get(q.id) ?? changes.set(q.id, { question: q.question, options: [...q.options] }).get(q.id);
const stat = { 本小題: 0, 下一小題: 0, 兩小題: 0 };
for (const q of rows) {
  const m = q.options?.at(-1)?.match(TAIL);
  if (!m || /<img/.test(m[1])) continue;
  const mm = q.id.match(/^(.*-g)(\d+)$/);
  const next = mm ? byId.get(`${mm[1]}${Number(mm[2]) + 1}`) : null;
  const cur = refFig(q), nxt = next && refFig(next);
  const c = get(q);
  c.options[c.options.length - 1] = m[1];
  const imgs = m[2].trim();
  const targets = cur && !nxt ? [q] : !cur && nxt ? [next] : [q, next].filter(Boolean);
  stat[targets.length === 2 ? "兩小題" : targets[0] === q ? "本小題" : "下一小題"]++;
  for (const t of targets) {
    const ct = get(t);
    if (!ct.question.includes(imgs)) ct.question = `${ct.question.trim()}\n${imgs}`;
  }
}

// 第二種:有小題題幹提到圖/表卻沒有圖,而兄弟小題題幹(沒提到圖)尾巴有圖 → 複製過去(與 split-groups 的 moveOrphanFigures 相同)
const IMG = /<img[^>]*>/g;
const MARK = /（第 \d+ 小題）/;
const groups = new Map();
for (const q of rows) { const m = q.id.match(/^(.*)-g\d+$/); if (m) (groups.get(m[1]) ?? groups.set(m[1], []).get(m[1])).push(q); }
let orphanMoves = 0;
for (const subs of groups.values()) {
  const cur = subs.map((q) => get(q));
  const stemPart = (c) => c.question.split(MARK).at(-1);
  const has = (c) => /<img/.test(stemPart(c)) || c.options.some((o) => /<img/.test(o));
  const need = cur.filter((c) => /圖|表格|[下上附此該本左右甲乙丙丁]表|表[中內裡上][的所]?|統計表|[如見依由據]表/.test(stemPart(c).replace(/<[^>]+>/g, "")) && !has(c));
  const donors = cur.filter((c) => {
    const s = stemPart(c);
    return !/圖|表格|[下上附此該本左右甲乙丙丁]表|表[中內裡上][的所]?|統計表|[如見依由據]表/.test(s.replace(/<[^>]+>/g, "")) && /<img/.test(s) && s.replace(IMG, "").trim();
  });
  if (!need.length || !donors.length || !MARK.test(need[0].question)) continue;
  const imgs = [];
  for (const d of donors) {
    const s = stemPart(d);
    imgs.push(...s.match(IMG)); // 複製不移除:提供圖的小題也可能用到這張圖(多一張無害)
  }
  for (const c of need) c.question = `${c.question.trim()}\n${imgs.join("\n")}`;
  orphanMoves += need.length;
  console.log("  附圖移動:", donors.map((d) => subs[cur.indexOf(d)].id).join(","), "→", need.map((c) => subs[cur.indexOf(c)].id).join(","));
}
// 複製附圖後子代理看圖確認「仍少一張表/圖、無法作答」→ 隱藏(2026-10-06 result-figs.json)
const HIDE = ["social-0826587-g3", "social-0829959-g2", "social-8210350-g2"];
for (const id of HIDE) if (byId.has(id)) get(byId.get(id)).needs_review = true;
// 沒有實際變動的(get() 只是讀取)拿掉
for (const [id, c] of changes) { const q = byId.get(id); if (c.question === q.question && JSON.stringify(c.options) === JSON.stringify(q.options) && !c.needs_review) changes.delete(id); }
console.log(`題幹圖移到提到「附圖」的兄弟小題:${orphanMoves} 題`);
console.log(`要修改 ${changes.size} 題;圖歸屬:`, stat);
for (const [id, c] of [...changes].slice(0, 5)) console.log(`--- ${id}\n題尾:${c.question.slice(-120)}\n末選項:${c.options.at(-1)}`);
const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx !== -1) fs.writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(Object.fromEntries(changes)), "utf8");
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }

const file = writeBackup("group-tail-images", [...changes.keys()].map((id) => ({ id, question: byId.get(id).question, options: byId.get(id).options, needs_review: byId.get(id).needs_review })));
console.log(`💾 備份 → ${file}`);
await runPool([...changes], ([id, c]) => patchQuestion(id, c));
console.log(`✅ 已修改 ${changes.size} 題。還原:node scripts/fix-group-tail-images.mjs --restore "${file}"`);
