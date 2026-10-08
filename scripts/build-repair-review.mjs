// 公式補回的複核資料(2026-10-07):repair-plan.json → 
//   data/rerender/formula-audit/db-marked.json(補上的公式包 <mark class="ins">,給 make-recheck-page.mjs 用)
//   data/rerender/formula-audit/review-items.json([{id, num, subject, volume, source}],給 sci-source-crops.py 裁原檔)
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/rest.mjs";
const D = path.join(ROOT, "data/rerender/formula-audit");
const db = JSON.parse(fs.readFileSync(path.join(D, "db.json"), "utf8"));
const plan = JSON.parse(fs.readFileSync(path.join(D, "repair-plan.json"), "utf8")).filter((p) => p.inserted.length);
const by = new Map(db.map((q) => [q.id, structuredClone(q)]));
const ids = new Set();
for (const p of plan) {
  const q = by.get(p.id);
  if (p.k === null) q[p.field] = p.marked; else q[p.field][p.k] = p.marked;
  ids.add(p.id);
}
const rows = [...ids].map((id) => by.get(id));
fs.writeFileSync(path.join(D, "db-marked.json"), JSON.stringify(rows));
const items = rows.map((q) => ({ id: q.id, num: q.id.match(/-(\d{7})/)[1], subject: q.subject, volume: q.volume, source: q.source }));
fs.writeFileSync(path.join(D, "review-items.json"), JSON.stringify(items, null, 0));
console.log(`複核 ${rows.length} 題(數學 ${items.filter((x) => x.subject === "math").length}、自然 ${items.filter((x) => x.subject === "science").length})`);
