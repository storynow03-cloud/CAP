// Supabase REST 共用工具(service key 從 web/.env.local 讀,不經過指令列參數)
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const BACKUP_DIR = path.resolve(ROOT, "..", "國中會考-DB備份");
const env = fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8");
const KEY = env.match(/SUPABASE_SECRET_KEY=(\S+)/)[1].trim();
export const URL_BASE = env.match(/NEXT_PUBLIC_SUPABASE_URL=(\S+)/)[1].trim();
export const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

/** 分頁讀完整張查詢結果(path 例:`questions?select=id,question&order=id`) */
export async function fetchAll(pathQuery) {
  const rows = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_BASE}/rest/v1/${pathQuery}&limit=1000&offset=${off}`, { headers: H });
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error(JSON.stringify(d));
    rows.push(...d);
    if (d.length < 1000) break;
  }
  return rows;
}

export async function patchQuestion(id, body) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(`${URL_BASE}/rest/v1/questions?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body),
    });
    if (r.ok) return;
    if (attempt === 3) throw new Error(`PATCH ${id} → ${r.status} ${await r.text()}`);
    await new Promise((res) => setTimeout(res, 500 * attempt));
  }
}

export async function runPool(items, worker, concurrency = 12) {
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < items.length) {
      await worker(items[next++]);
      if (++done % 2000 === 0) console.log(`  …${done}/${items.length}`);
    }
  }));
}

/** 備份「修改前」的欄位值到 git 外的備份資料夾(檔名帶時間戳,不會覆蓋舊備份) */
export function writeBackup(tag, records) {
  const dir = path.join(BACKUP_DIR, `${new Date().toISOString().slice(0, 10)}-${tag}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `original-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(records), "utf8");
  return file;
}

/** 依備份檔還原(每筆 { id, ...修改前的欄位 }) */
export async function restoreBackup(file) {
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  await runPool(backup, ({ id, ...before }) => patchQuestion(id, before));
  return backup.length;
}
