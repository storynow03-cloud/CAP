// 題目修正清單 #5(2026-10-14):原詳解錯字/事實錯誤 + 小題詳解只剩標號「(k)」
// A. 逐題查證過的錯誤(對照附圖、選項、答案):脊隨→脊髓、故選丁→戊、腎臟→腎上腺、溶液→血液、十大建設年代、
//    選項代號錯開、甲乙丙丁↔ㄅㄆㄇㄈ、0821647 第 1/2 小題被切錯位置(從母題原文還原)
// B. 小題詳解只剩「(k)」(22 題):原檔「(1)(2)…」兩小題合寫,舊拆題把空標號給 g1、內容給 g2
//    → 兩小題都給合寫段「(1)(2)…」(需母題詳解確實是相鄰標號);或 g2 開頭其實是 g1 的內容 → 拆回去
// 用法:node scripts/fix-expl-errors-2026-10-14.mjs [--apply] | --restore <備份檔>
import { fetchAll, patchQuestion, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const plain = (h) => (h ?? "").replace(/<[^>]+>/g, "").trim();

// ── A. 字串取代(題號前綴 → [舊, 新]);每組至少要命中一題
const REPLACE = [
  [/^science-081085[01]/, "脊隨", "脊髓"],
  [/^science-0810930/, "胰島素分泌異常，故選丁。", "胰島素分泌異常，故選戊。"],
  [/^science-0810931/, "腎臟分泌的腎上腺素", "腎上腺分泌的腎上腺素"],
  [/^science-0941129/, "不會使溶液的酸鹼性有明顯變化", "不會使血液的酸鹼性有明顯變化"],
  [/^social-0828278/, "十大建設則是一九八○年代發生的事情，故第(4)題選(C)。", "臺灣醫療進步、產業向高科技轉型是一九八○年代以後的事情，故第(4)題選(C)。"],
  [/^social-0944513/, "甲：印度(印度教為主)，乙：馬來西亞、印尼(伊斯蘭教為主)，丙：巴西(基督宗教為主)，丁：日本(佛教為主)。",
    "ㄅ：印度(印度教為主)，ㄆ：馬來西亞、印尼(伊斯蘭教為主)，ㄇ：巴西(基督宗教為主)，ㄈ：日本(佛教為主)，故選(B)ㄆ。"],
];
// ── A. 整段改寫(題號 → 新詳解)
const SET = {
  // 詳解的選項代號對應舊版選項(「(B)未受金朝統治」其實在講現在的 D)→ 依現在的選項重寫
  "social-9310164-g1": "(1)元代來自中亞、西亞的伊斯蘭教信徒屬於色目人，善於理財經商，常擔任財政相關職位，故選(B)。(A)應屬於色目人階級；(C)社會地位次於蒙古統治階層；(D)未受金朝統治，政治地位也不是最低(最低為南人)。",
  // 舊拆題切錯位置,從母題原文還原
  "science-0821647-g1": "(1)(A)軟體動物門(文蛤、烏賊)2種；(B)節肢動物門(螃蟹、龍蝦)2種；(C)刺絲胞動物門(水母、珊瑚)2種；(D)棘皮動物門(海參、海星、海膽)3種，故選(D)棘皮動物門。",
  "science-0821647-g2": "(2)(B)龍蝦為節肢動物門，有外骨骼。",
};

const ids = new Set(Object.keys(SET));
const all = await fetchAll("questions?select=id,needs_review,explanation&subject=in.(science,social)&explanation=not.is.null&order=id");
const byId = Object.fromEntries(all.map((r) => [r.id, r]));
const plan = new Map(); // id → 新詳解
const cur = (id) => plan.get(id) ?? byId[id]?.explanation;
for (const [re, a, b] of REPLACE) {
  const hit = all.filter((r) => re.test(r.id) && cur(r.id).includes(a));
  if (!hit.length) throw new Error(`沒有命中:${a}`);
  for (const r of hit) plan.set(r.id, cur(r.id).split(a).join(b));
}
for (const [id, e] of Object.entries(SET)) {
  if (!byId[id]) throw new Error(`找不到 ${id}`);
  plan.set(id, e);
}

// ── B. 只剩「(k)」的小題
const lone = all.filter((r) => /-g\d+$/.test(r.id) && !r.needs_review && /^[（(]\d+[）)]$/.test(plain(r.explanation)));
const manual = [];
for (const r of lone) {
  const [, base, kk] = r.id.match(/^(.*)-g(\d+)$/);
  const k = +kk, nextId = `${base}-g${k + 1}`, next = byId[nextId], mom = plain(byId[base]?.explanation);
  const nh = cur(nextId) ?? "";
  if (new RegExp(`^\\s*[（(]${k + 1}[）)]`).test(plain(nh)) && new RegExp(`[（(]${k}[）)][、，\\s]*[（(]${k + 1}[）)]`).test(mom)) {
    // 合寫段:兩小題都給「(k)(k+1)…」
    const merged = `(${k})` + nh.trim();
    plan.set(r.id, merged); plan.set(nextId, merged);
  } else if (next && !/^[（(]/.test(plain(nh)) && nh.includes(`(${k + 1})`) && mom.includes(`(${k})` + plain(nh).slice(0, 8))) {
    // g(k+1) 開頭其實是 g(k) 的內容 → 拆回
    const i = nh.indexOf(`(${k + 1})`);
    plan.set(r.id, `(${k})` + nh.slice(0, i).trim());
    plan.set(nextId, nh.slice(i).trim());
  } else manual.push(r.id);
}
if (manual.length) console.log("⚠️ 規則處理不了(未修改):", manual.join(" "));

const rows = [...plan].filter(([id, e]) => e !== byId[id].explanation);
for (const [id, e] of rows) console.log(`\n${id}${byId[id].needs_review ? "(隱)" : ""}\n  原:${plain(byId[id].explanation).slice(0, 150)}\n  新:${plain(e).slice(0, 150)}`);
console.log(`\n共 ${rows.length} 題(只剩標號 ${lone.length} 題,規則處理不了 ${manual.length})`);
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }
const file = writeBackup("expl-errors", rows.map(([id]) => ({ id, explanation: byId[id].explanation })));
console.log(`💾 備份 → ${file}`);
for (const [id, explanation] of rows) await patchQuestion(id, { explanation });
console.log(`✅ 已寫入 ${rows.length} 題。還原:node scripts/fix-expl-errors-2026-10-14.mjs --restore "${file}"`);
