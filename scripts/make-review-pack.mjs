// 匯出「補圖後」題目的審查資料包給子代理(2026-10-16):ONLY=<id 清單.json> N=<批數> OUT=<資料夾> node scripts/make-review-pack.mjs
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll } from "./lib/rest.mjs";
const { plan } = JSON.parse(fs.readFileSync("data/obj-export/plan.json", "utf8"));
const only = process.env.ONLY ? new Set(JSON.parse(fs.readFileSync(process.env.ONLY, "utf8"))) : null;
const ok = plan.filter((p) => p.complete && (only ? only.has(p.id) : p.hidden));
const ids = ok.map((p) => p.id);
const rows = [];
for (let i = 0; i < ids.length; i += 150) rows.push(...await fetchAll(`questions?select=id,subject,type,question,options,answer,answer_text,explanation&id=in.(${ids.slice(i, i + 150).join(",")})&order=id`));
const by = Object.fromEntries(rows.map((r) => [r.id, r]));
const L = "ABCDEFGH";
const loc = (h) => (h ?? "").replace(/<img[^>]*src="([^"]+)"[^>]*>/g, (_, s) => ` [圖:${path.join(ROOT, "web", "public", s)}] `)
  .replace(/<span class="ovl">([^<]*)<\/span>/g, "‾$1‾").replace(/<sup>([^<]*)<\/sup>/g, "^($1)").replace(/<sub>([^<]*)<\/sub>/g, "_($1)")
  .replace(/<[^>]+>/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "�").replace(/[ \t]+/g, " ").trim();
const out = ok.map((p) => { const q = { ...by[p.id], ...p.patch };
  return { id: q.id, subject: q.subject, type: q.type, question: loc(q.question),
    options: Array.isArray(q.options) ? q.options.map((o, i) => `(${L[i]}) ${loc(String(o))}`) : null,
    answer: q.type === "non_choice" ? loc(q.answer_text) : L[q.answer], explanation: loc(q.explanation) || null }; });
const N = +(process.env.N ?? 8), size = Math.ceil(out.length / N);
for (let b = 0; b < N; b++) fs.writeFileSync(`${process.env.OUT ?? "data/rerender/obj-review"}/batch-${b + 1}.json`, JSON.stringify(out.slice(b * size, (b + 1) * size), null, 1));
console.log(out.length, "items, size", size, "含�:", out.filter((o) => JSON.stringify(o).includes("�")).length);
