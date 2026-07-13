// 完整資料庫備份:分頁匯出所有 public schema 資料表 → 本地 JSON,
// 並下載 storage buckets 的所有檔案。用 service role key(繞過 RLS,拿到全部資料)。
// 輸出到 repo 外的 ../國中會考-DB備份/<日期>/,不會進 git。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = env.SUPABASE_SECRET_KEY;
const H = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" };

const OUT = path.resolve(ROOT, "..", "國中會考-DB備份", new Date().toISOString().slice(0, 10));
fs.mkdirSync(path.join(OUT, "data"), { recursive: true });
fs.mkdirSync(path.join(OUT, "storage"), { recursive: true });

// 依 primary key 排序分頁抓全部列(PostgREST Range header,每批 1000 筆)
async function fetchAllRows(table, orderCol = "id") {
  const rows = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${table}?select=*&order=${orderCol}.asc`, {
      headers: { ...H, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!r.ok && r.status !== 206) {
      console.error(`  ⚠️ ${table} HTTP ${r.status}: ${await r.text()}`);
      return rows;
    }
    const batch = await r.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// 各表用哪個欄位排序分頁(多數是 id;複合主鍵的表用第一個主鍵欄位即可,足夠穩定分頁)
const TABLES = [
  ["profiles", "id"], ["questions", "id"], ["attempts", "id"], ["mastery", "user_id"],
  ["wrong_book", "user_id"], ["exam_sessions", "id"], ["daily_stats", "user_id"],
  ["contests", "id"], ["contest_entries", "user_id"], ["daily_quests", "user_id"],
  ["user_achievements", "user_id"], ["user_items", "user_id"], ["friendships", "user_id"],
  ["duels", "id"], ["boss_clears", "user_id"], ["self_assessment", "user_id"],
  ["shop_categories", "id"], ["shop_items", "id"], ["inventory", "user_id"],
  ["market_listings", "id"], ["pet_expeditions", "id"], ["pet_defs", "id"],
  ["user_pets", "user_id"], ["realms", "id"], ["realm_participants", "realm_id"],
];

console.log(`備份輸出目錄:${OUT}\n`);
let totalRows = 0;
for (const [table, orderCol] of TABLES) {
  process.stdout.write(`匯出 ${table} ...`);
  const rows = await fetchAllRows(table, orderCol);
  fs.writeFileSync(path.join(OUT, "data", `${table}.json`), JSON.stringify(rows, null, 2), "utf8");
  console.log(` ${rows.length} 筆`);
  totalRows += rows.length;
}
console.log(`\n資料表匯出完成,共 ${totalRows} 筆列。`);

// ===== Storage buckets =====
console.log("\n--- Storage ---");
// 用 storage API 列出 bucket(固定用專案內已知的兩個 bucket)
const BUCKETS = ["avatars", "pet-images"];
for (const bucket of BUCKETS) {
  // 遞迴列出資料夾(avatars 用 <uid>/xxx 結構,list 只列頂層,folder 項目 metadata 為 null)
  async function listRecursive(prefix) {
    const r = await fetch(`${URL}/storage/v1/object/list/${bucket}`, {
      method: "POST", headers: H, body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    });
    const items = await r.json();
    let files = [];
    for (const it of items) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null && it.metadata === null) files = files.concat(await listRecursive(p)); // 資料夾
      else files.push(p);
    }
    return files;
  }
  const files = await listRecursive("");
  console.log(`  ${bucket}: ${files.length} 個檔案`);
  const bucketDir = path.join(OUT, "storage", bucket);
  for (const f of files) {
    const dl = await fetch(`${URL}/storage/v1/object/${bucket}/${f}`, { headers: H });
    if (!dl.ok) { console.log(`    ⚠️ 下載失敗 ${f}: HTTP ${dl.status}`); continue; }
    const buf = Buffer.from(await dl.arrayBuffer());
    const dest = path.join(bucketDir, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    console.log(`    ✓ ${f} (${(buf.length / 1024).toFixed(1)} KB)`);
  }
}

console.log(`\n✅ 備份完成:${OUT}`);
