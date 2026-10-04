// 題目圖片「看得清楚嗎?」AI 篩檢(2026-10-04)
//
// 為什麼:文字檢查抓不到「圖檔存在但內容壞掉」——轉檔時字型跑掉,字母擠成一團、重疊、亂碼
// (例:english-0813694 的表格、math-1080313-3 數線標籤全變成 c)。孩子回報才發現,所以要逐張看圖。
// 做法:每次送 BATCH 張圖給 Gemini,問「哪幾張的文字/標籤糊掉、重疊、看不清楚,或圖是空白/破圖」,
//   只回傳有問題的編號與原因。結果存 data/image-screen.json(可中斷續跑,已看過的不重看)。
//   被標記的圖之後再由人工(Claude 讀圖)逐張複核,確認才隱藏題目;不會只憑 AI 判斷就改資料庫。
//
// 用法:node scripts/screen-images.mjs --list <圖片清單.json> [--limit N] [--batch 12] [--model 名稱]
//   清單格式:[{ p: "/qimg/...", qs: ["題號", ...] }, ...]
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/rest.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
const LIST = JSON.parse(fs.readFileSync(arg("--list"), "utf8"));
const LIMIT = Number(arg("--limit", "0")) || LIST.length;
const BATCH = Number(arg("--batch", "12"));
const OUT = path.join(ROOT, "data", "image-screen.json");

const env = fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8");
const KEYS = [...new Set((env.match(/GEMINI_API_KEY[S_0-9]*=(.*)/g) ?? []).flatMap((l) => l.split("=")[1].split(",")).map((s) => s.trim()).filter(Boolean))];
const MODELS = arg("--model", "gemini-3.5-flash-lite,gemini-3.5-flash").split(",");

const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
// 不是圖片的檔案(例:LibreOffice 匯出失敗留下的 .html)直接標記,不送 AI
const MAGIC = ["89504e47", "47494638", "ffd8ff", "52494646"];
for (const x of LIST.slice(0, LIMIT)) {
  if (x.p in done) continue;
  const h = fs.readFileSync(path.join(ROOT, "web", "public", x.p)).subarray(0, 4).toString("hex");
  if (!MAGIC.some((m) => h.startsWith(m))) done[x.p] = { ok: false, why: "檔案不是圖片(破圖)", model: "檔頭檢查", qs: x.qs };
}
const todo = LIST.slice(0, LIMIT).filter((x) => !(x.p in done));
console.log(`清單 ${LIST.length} 張,本次要看 ${todo.length} 張(已看過 ${Object.keys(done).length})`);

const PROMPT = `你是國中考卷的品質檢查員。以下依序有 N 張題目附圖(編號從 1 開始)。
請找出「孩子看不懂」的圖,只要符合任一項就算有問題:
1. 圖中的文字、數字、英文字母或標籤糊掉、擠在一起、互相重疊、變形,或變成亂碼(例如英文單字字母黏成一團、點的名稱都變成同一個字母)。
2. 圖是空白、全黑、破圖,或只剩一小塊看不出是什麼。
3. 表格的格線或內容嚴重錯位,讀不出對應關係。
清楚可讀的圖(即使是手繪風、簡單示意圖、只有圖形沒有字)都不算問題。
只回傳 JSON:{"bad":[{"i":編號,"why":"簡短原因"}]},全部都沒問題就回 {"bad":[]}。`;

const mime = (f) => ({ ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" })[path.extname(f).toLowerCase()] ?? "image/png";

async function ask(batch) {
  const parts = [{ text: PROMPT.replace("N 張", `${batch.length} 張`) }];
  batch.forEach((x, i) => {
    const file = path.join(ROOT, "web", "public", x.p);
    parts.push({ text: `【圖 ${i + 1}】` });
    parts.push({ inline_data: { mime_type: mime(file), data: fs.readFileSync(file).toString("base64") } });
  });
  for (const key of KEYS) for (const model of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
      });
      if (!r.ok) { if (r.status === 429) continue; console.log(`  ${model} ${r.status}`); continue; }
      const d = await r.json();
      const txt = d.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
      const j = JSON.parse(txt);
      return { model, bad: Array.isArray(j.bad) ? j.bad : [] };
    } catch (e) { console.log(`  ${model} 錯誤 ${String(e).slice(0, 80)}`); }
  }
  return null;
}

let n = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const res = await ask(batch);
  if (!res) { console.log("所有金鑰/模型都失敗(多半是今天的免費額度用完),先停在這裡,明天續跑即可。"); break; }
  batch.forEach((x, k) => {
    const hit = res.bad.find((b) => Number(b.i) === k + 1);
    done[x.p] = { ok: !hit, why: hit?.why ?? null, model: res.model, qs: x.qs };
  });
  n += batch.length;
  fs.writeFileSync(OUT, JSON.stringify(done, null, 1), "utf8");
  console.log(`  ${n}/${todo.length}(${res.model})標記 ${res.bad.length} 張`);
}
const flagged = Object.entries(done).filter(([, v]) => !v.ok);
console.log(`累計看過 ${Object.keys(done).length} 張,標記有問題 ${flagged.length} 張`);
