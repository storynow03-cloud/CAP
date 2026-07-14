// 還原步驟 3/3:把備份的 25 張表資料灌回新專案。
//  - 用 session_replication_role=replica 停用所有觸發器,避免「重播」歷史 attempts/wrong_book
//    又重新觸發一次遊戲化邏輯(XP/金幣會被重複加總,弄髒資料)。
//  - 所有 UUID 欄位(user_id/created_by/seller/...)自動用 id-map.json 從舊 UUID 換成新 UUID。
//  - profiles 表用 UPSERT(ON CONFLICT DO UPDATE):因為 Admin API 建帳號時
//    handle_new_user 觸發器已經建了一筆預設值的 profiles(那次是走 GoTrue 自己的連線,
//    不受這支腳本的 session_replication_role 影響),要覆蓋掉那筆預設值。
// 用法:node scripts/restore-3-data.mjs <新專案 DB 連線字串>
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(import.meta.dirname, "..");
const connStr = process.argv[2];
if (!connStr) {
  console.error("用法:node scripts/restore-3-data.mjs <postgresql://postgres:密碼@db.xxx.supabase.co:5432/postgres>");
  process.exit(1);
}

const BACKUP_DIR = path.resolve(ROOT, "..", "國中會考-DB備份");
const latest = fs.readdirSync(BACKUP_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1);
const dataDir = path.join(BACKUP_DIR, latest, "data");
const idMapFile = path.join(BACKUP_DIR, latest, "id-map.json");
if (!fs.existsSync(idMapFile)) {
  console.error(`找不到 ${idMapFile},請先跑 restore-2-users.mjs 產生帳號對照表。`);
  process.exit(1);
}
const idMap = JSON.parse(fs.readFileSync(idMapFile, "utf8"));
console.log(`讀取資料備份:${dataDir}`);
console.log(`帳號對照表:${Object.keys(idMap).length} 組 UUID\n`);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function remapRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "string" && UUID_RE.test(v) && idMap[v] ? idMap[v] : v;
  }
  return out;
}

// 插入順序:profiles 先(其餘表多半外鍵指向它),questions 隨時可以(沒人依賴它,量大所以放前面
// 讓它跟其他小表的錯誤分開觀察),其餘表順序不重要(session_replication_role 已跳過 FK 檢查)。
const TABLE_ORDER = [
  "profiles", "questions", "attempts", "mastery", "wrong_book", "exam_sessions", "daily_stats",
  "contests", "contest_entries", "daily_quests", "user_achievements", "user_items",
  "friendships", "duels", "boss_clears", "self_assessment",
  "shop_categories", "shop_items", "inventory", "market_listings",
  "pet_defs", "user_pets", "pet_expeditions", "realms", "realm_participants",
];

const client = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query("SET session_replication_role = replica;"); // 停用觸發器與 FK 觸發檢查
console.log("已連線,觸發器已暫停(session_replication_role=replica)。\n");

const BATCH = 500;
for (const table of TABLE_ORDER) {
  const file = path.join(dataDir, `${table}.json`);
  if (!fs.existsSync(file)) { console.log(`⏭️  ${table}: 無備份檔,跳過`); continue; }
  const rows = JSON.parse(fs.readFileSync(file, "utf8")).map(remapRow);
  if (rows.length === 0) { console.log(`⏭️  ${table}: 0 筆,跳過`); continue; }

  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(",");
  const isProfiles = table === "profiles";
  const conflictClause = isProfiles
    ? `ON CONFLICT (id) DO UPDATE SET ${cols.filter((c) => c !== "id").map((c) => `"${c}"=excluded."${c}"`).join(",")}`
    : "ON CONFLICT DO NOTHING";

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = [];
    const placeholders = batch.map((row, ri) => {
      const base = ri * cols.length;
      values.push(...cols.map((c) => row[c] ?? null));
      return `(${cols.map((_, ci) => `$${base + ci + 1}`).join(",")})`;
    }).join(",");
    const sql = `insert into public.${table} (${colList}) values ${placeholders} ${conflictClause}`;
    try {
      await client.query(sql, values);
      inserted += batch.length;
    } catch (e) {
      console.log(`  ❌ ${table} batch ${i}-${i + batch.length}: ${e.message}`);
    }
  }
  console.log(`✅ ${table}: ${inserted}/${rows.length} 筆`);
}

await client.query("SET session_replication_role = DEFAULT;"); // 還原觸發器
console.log("\n觸發器已還原正常運作。");
await client.end();
console.log("\n✅ 資料還原完成。接下來:1) 上傳 storage 檔案 2) 改 web/.env.local 指到新專案 3) 實測登入。");
