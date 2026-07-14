// 還原步驟 1/3:把 24 個 migration 依序套用到新 Supabase 專案(直接用 pg 連線執行 DDL)。
// 用法:node scripts/restore-1-schema.mjs <新專案 DB 連線字串>
// 連線字串格式:postgresql://postgres:<密碼>@db.<專案ref>.supabase.co:5432/postgres
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(import.meta.dirname, "..");
const connStr = process.argv[2];
if (!connStr) {
  console.error("用法:node scripts/restore-1-schema.mjs <postgresql://postgres:密碼@db.xxx.supabase.co:5432/postgres>");
  process.exit(1);
}

const client = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log("已連線到新專案資料庫。\n");

const dir = path.join(ROOT, "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
console.log(`找到 ${files.length} 個 migration,依序套用:\n`);

for (const f of files) {
  process.stdout.write(`  ${f} ...`);
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  try {
    await client.query(sql);
    console.log(" ✅");
  } catch (e) {
    console.log(` ❌ ${e.message}`);
    console.error("\n中斷於此檔,請檢查錯誤訊息後修正再重跑(migration 多半用 create or replace / if not exists,重跑通常安全)。");
    await client.end();
    process.exit(1);
  }
}

console.log("\n✅ 全部 schema 套用完成。");
await client.end();
