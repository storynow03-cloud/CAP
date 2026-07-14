// 還原後驗證:比對新專案每張表的筆數是不是跟備份時一致。
// 用法:node scripts/restore-5-verify.mjs <新專案URL> <新專案service_role key>
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const [, , NEW_URL, NEW_SECRET] = process.argv;
if (!NEW_URL || !NEW_SECRET) {
  console.error("用法:node scripts/restore-5-verify.mjs <新專案URL> <新專案service_role key>");
  process.exit(1);
}
const H = { apikey: NEW_SECRET, Authorization: `Bearer ${NEW_SECRET}` };

const BACKUP_DIR = path.resolve(ROOT, "..", "國中會考-DB備份");
const latest = fs.readdirSync(BACKUP_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1);
const dataDir = path.join(BACKUP_DIR, latest, "data");

let allOk = true;
for (const file of fs.readdirSync(dataDir).sort()) {
  const table = file.replace(".json", "");
  const expected = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8")).length;
  const r = await fetch(`${NEW_URL}/rest/v1/${table}?select=*&limit=0`, { headers: { ...H, Prefer: "count=exact" } });
  const range = r.headers.get("content-range"); // e.g. "0-0/123" or "*/0"
  const actual = range ? Number(range.split("/")[1]) : -1;
  const ok = actual === expected;
  if (!ok) allOk = false;
  console.log(`${ok ? "✅" : "❌"} ${table}: 備份 ${expected} 筆 / 新專案 ${actual} 筆`);
}
console.log(allOk ? "\n✅ 全部表筆數一致,還原成功。" : "\n⚠️ 有表筆數不一致,請往上找對應的錯誤訊息。");
