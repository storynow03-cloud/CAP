// 題庫文字修復 + 隱藏「看不到關鍵內容」的題目(2026-09-30)。
//
// 一、還原被「知識點」吞掉的題幹開頭(原始解析器的 bug)
//   parse-questions*.mjs 用 /知識點：([^\s　]+)/ 讀代碼,會一路吃到下一個空白為止:
//     「知識點：JEN050402000000(Jason is watching…」→ 代碼欄變成 "JEN050402000000(Jason",
//     題幹少了開頭的 "(Jason"。國文沒有空白,常常整句題目(甚至連《答案》)都被吃進代碼欄。
//   被吃掉的文字原封不動在 knowledge_code 欄位裡,所以可以精準還原:
//     knowledge_code = 純代碼;題幹 = 被吃掉的文字 + 原題幹。
//   特例:只吃到作答括號「（」→ 題幹本來就沒少東西,只清代碼欄;
//         吃到「填入（」→ 原本是「（　）」,解析器又把後半「　）」刪了,要補回來;
//         吃到《答案》→ 拆成題幹與答案(答案欄原本是空的才寫入)。
// 二、題幹開頭殘留代碼(「;JSH010101010200（  ）某位考古學家…」)→ 移除
// 三、英文填空的空格變成控制字元 \x15 → 換成 ＿＿＿
// 四、隱藏「關鍵內容遺失、無法作答」的可見題目(needs_review = true):
//   - \x01:原本是圖片/表格(文字抽取時遺失),例如選項全是圖、「根據對話內容」但對話是圖
//   - \x03~\x08:遺失的數學物件(\x07\x03\b = 分數,\x04\x05 = 根號…)
//   - 數學/自然「靜默遺失」的算式:「若＝，＝2」「則＋＋＝？」(原本是線段、絕對值、分數)
//   抽樣人工檢查 25/25、29/30 確實無法作答,寧可先隱藏,之後用 LibreOffice 轉出圖片再救回。
//
// 用法:node scripts/repair-question-text.mjs            (乾跑,只列統計與範例;--dump <檔> 輸出完整清單)
//       node scripts/repair-question-text.mjs --apply    (備份後寫入)
//       node scripts/repair-question-text.mjs --restore <備份檔>
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const env = fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8");
const KEY = env.match(/SUPABASE_SECRET_KEY=(\S+)/)[1].trim();
const URL_BASE = env.match(/NEXT_PUBLIC_SUPABASE_URL=(\S+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const BACKUP_DIR = path.resolve(ROOT, "..", "國中會考-DB備份");
const APPLY = process.argv.includes("--apply");
const restoreIdx = process.argv.indexOf("--restore");
const FIELDS = ["question", "options", "knowledge_code", "answer_text", "explanation", "needs_review"];

// 知識點代碼:3 個大寫 + 可選 1 個小寫 + 11~12 位數字(JCH030101000000、JCHa20101000000)。
// (?!\d) 與後面的 (?![;；]CODE) 都是必要的:少了會回溯,把最後一位數字或最後一個代碼當成「被吞的文字」。
const CODE = String.raw`[A-Z]{3}[a-z]?\d{11,12}(?!\d)`;
const KC = new RegExp(String.raw`^(${CODE}(?:[;；]${CODE})*)(?![;；]${CODE})([\s\S]+)$`);
const LEADING_CODE = new RegExp(String.raw`^[,，;；\s]*(?:${CODE}[;；\s]*)+(?:[（(][\s　]*[）)]\s*)?`);
// 題幹中間還夾著代碼 = 出題者的標註混進題目(例:「whether引導名詞子句作主詞;JEN020220080000根據句意…」)
const CODE_ANYWHERE = /[A-Z]{2,3}[a-z]?\d{11,12}(?!\d)/;
const CJK = /[　-鿿＀-￯]/;
const LOST_OBJECT = /[\x01\x03-\x08]/;
// 「＝」「：」前面不是數字/字母/右括號,後面緊接符號或結尾 → 中間的算式不見了
const LOST_EXPR = /(^|[^0-9a-zA-Z）)\]])＝(?=[＝：，。]|$)|(^|[^0-9a-zA-Z）)\]])：(?=[＝：，。])|＝＝|：：|[＋－×÷]＝/;
const plain = (s) => String(s ?? "").replace(/<img[^>]*>/g, "[圖]").replace(/<[^>]+>/g, "");

async function fetchAll() {
  const rows = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(
      `${URL_BASE}/rest/v1/questions?select=id,subject,${FIELDS.join(",")}&order=id&limit=1000&offset=${off}`,
      { headers: H }
    );
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error(JSON.stringify(d));
    rows.push(...d);
    if (d.length < 1000) break;
  }
  return rows;
}

async function patch(id, body) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(`${URL_BASE}/rest/v1/questions?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body),
    });
    if (r.ok) return;
    if (attempt === 3) throw new Error(`PATCH ${id} → ${r.status} ${await r.text()}`);
    await new Promise((res) => setTimeout(res, 500 * attempt));
  }
}

async function runPool(items, worker, concurrency = 12) {
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < items.length) {
      await worker(items[next++]);
      if (++done % 2000 === 0) console.log(`  …${done}/${items.length}`);
    }
  }));
}

if (restoreIdx !== -1) {
  const backup = JSON.parse(fs.readFileSync(process.argv[restoreIdx + 1], "utf8"));
  await runPool(backup, ({ id, ...before }) => patch(id, before));
  console.log(`✅ 已還原 ${backup.length} 題`);
  process.exit(0);
}

/** 單題修復:回傳要改的欄位與原因(沒有要改就回 null) */
function repair(q) {
  const out = { question: q.question, options: q.options, knowledge_code: q.knowledge_code, answer_text: q.answer_text, explanation: q.explanation, needs_review: q.needs_review };
  const why = [];

  // 一、知識點吞字
  const m = String(q.knowledge_code ?? "").match(KC);
  if (m) {
    out.knowledge_code = m[1].replace(/；/g, ";");
    let rest = m[2].replace(/^＿+/, ""); // 英文填空題前面的作答底線
    // \x05 開頭的是出題者的文法提示標籤(「\x05時態過去式（」),還原回去等於洩漏答案,不還原
    if (rest && !/^[（(]$/.test(rest) && !/\x05/.test(rest)) {
      let joiner = "";
      if (/[（(]$/.test(rest)) joiner = "　）";
      else if (!CJK.test(rest.slice(-1)) && !CJK.test(String(q.question ?? "")[0] ?? "")) joiner = " ";
      let combined = rest + joiner + String(q.question ?? "");
      const ans = combined.match(/^([\s\S]*?)《答案》([\s\S]*)$/);
      if (ans) {
        combined = ans[1].trim();
        // 《答案》後面可能還接著「詳解：…」,以及下一題的題號(「…ㄈㄨ33.」)
        const [aPart, ...ePart] = ans[2].split("詳解：");
        const clean = (t) => t.replace(/^[．.\s　]+/, "").replace(/\s*[0-9０-９]+[.．]?\s*$/, "").trim();
        const a = clean(aPart);
        const e = clean(ePart.join("詳解："));
        if (!q.answer_text && a) { out.answer_text = a; why.push("拆出答案"); }
        if (!q.explanation && e) { out.explanation = e; why.push("拆出詳解"); }
      }
      out.question = combined;
      why.push("還原題幹開頭");
    } else {
      why.push("清代碼欄");
    }
  }

  // 二、題幹開頭殘留代碼
  const lead = String(out.question ?? "").match(LEADING_CODE);
  if (lead && out.question.length > lead[0].length) {
    out.question = out.question.slice(lead[0].length);
    why.push("移除開頭代碼");
  }

  // 三、\x15 填空格
  if (/\x15/.test(out.question) || (out.options ?? []).some((o) => /\x15/.test(o))) {
    out.question = out.question.replace(/\x15/g, "＿＿＿");
    if (out.options) out.options = out.options.map((o) => o.replace(/\x15/g, "＿＿＿"));
    why.push("填空格");
  }

  // 四、關鍵內容遺失 → 隱藏(只處理目前可見的)
  if (!q.needs_review) {
    const texts = [out.question, ...(out.options ?? [])];
    if (texts.some((t) => /\x01/.test(t))) why.push("隱藏:遺失圖片");
    else if (texts.some((t) => LOST_OBJECT.test(t))) why.push("隱藏:遺失數學物件");
    else if ((q.subject === "math" || q.subject === "science") && texts.some((t) => LOST_EXPR.test(plain(t))))
      why.push("隱藏:遺失算式");
    else if (texts.some((t) => CODE_ANYWHERE.test(t))) why.push("隱藏:夾雜標註");
    if (why.some((w) => w.startsWith("隱藏"))) out.needs_review = true;
  }

  const body = {};
  for (const f of FIELDS) if (JSON.stringify(out[f]) !== JSON.stringify(q[f])) body[f] = out[f];
  if (!Object.keys(body).length) return null;
  const before = Object.fromEntries(Object.keys(body).map((f) => [f, q[f]]));
  return { id: q.id, subject: q.subject, body, before, why };
}

const rows = await fetchAll();
console.log(`讀取 ${rows.length} 題`);
const plan = rows.map(repair).filter(Boolean);

const stat = {};
for (const p of plan) for (const w of p.why) {
  const k = `${w}`.padEnd(12) + p.subject;
  stat[k] = (stat[k] ?? 0) + 1;
}
console.log(`\n要修改 ${plan.length} 題:`);
for (const [k, v] of Object.entries(stat).sort()) console.log(`  ${String(v).padStart(6)}  ${k}`);

console.log("\n範例:");
const shown = new Set();
for (const p of plan) {
  const key = p.subject + p.why.join();
  if (shown.has(key) || !p.body.question) continue;
  shown.add(key);
  console.log(`  ${p.id} [${p.why.join("、")}]\n    前:${JSON.stringify(String(p.before.question).slice(0, 70))}\n    後:${JSON.stringify(String(p.body.question).slice(0, 90))}`);
}
const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx !== -1) fs.writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(plan), "utf8");
if (!APPLY) { console.log("\n(乾跑,未寫入。加 --apply 才會寫入;--dump <檔> 可輸出完整清單)"); process.exit(0); }

const dir = path.join(BACKUP_DIR, `${new Date().toISOString().slice(0, 10)}-repair-text`);
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupFile = path.join(dir, `original-${stamp}.json`);
fs.writeFileSync(backupFile, JSON.stringify(plan.map((p) => ({ id: p.id, ...p.before }))), "utf8");
// 另存「這次被隱藏的題目」清單,之後用 LibreOffice 轉出圖片時要優先救這批
fs.writeFileSync(path.join(dir, `hidden-${stamp}.json`),
  JSON.stringify(plan.filter((p) => p.body.needs_review).map((p) => ({ id: p.id, subject: p.subject, reason: p.why.find((w) => w.startsWith("隱藏")) }))), "utf8");
console.log(`\n💾 已備份 → ${backupFile}`);
await runPool(plan, (p) => patch(p.id, p.body));
console.log(`✅ 已修改 ${plan.length} 題`);
console.log(`還原:node scripts/repair-question-text.mjs --restore "${backupFile}"`);
