// 還原步驟 4/4:把備份的 storage 檔案(avatars bucket)上傳回新專案,
// 路徑裡的舊使用者 UUID 換成新 UUID(跟 profiles.avatar_url 才會對得上)。
// 用法:node scripts/restore-4-storage.mjs <新專案URL> <新專案service_role key>
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const [, , NEW_URL, NEW_SECRET] = process.argv;
if (!NEW_URL || !NEW_SECRET) {
  console.error("用法:node scripts/restore-4-storage.mjs <新專案URL> <新專案service_role key>");
  process.exit(1);
}
const H = { apikey: NEW_SECRET, Authorization: `Bearer ${NEW_SECRET}` };

const BACKUP_DIR = path.resolve(ROOT, "..", "國中會考-DB備份");
const latest = fs.readdirSync(BACKUP_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1);
const storageDir = path.join(BACKUP_DIR, latest, "storage");
const idMap = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, latest, "id-map.json"), "utf8"));

async function ensureBucket(name) {
  const r = await fetch(`${NEW_URL}/storage/v1/bucket`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ id: name, name, public: true }),
  });
  if (r.ok) console.log(`  建立 bucket ${name} ✅`);
  else {
    const d = await r.json().catch(() => ({}));
    if (String(d.error || d.message || "").toLowerCase().includes("exist")) console.log(`  bucket ${name} 已存在,略過建立`);
    else console.log(`  ⚠️ 建立 bucket ${name} 失敗:${JSON.stringify(d)}`);
  }
}

function walk(dir, base = "") {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files = files.concat(walk(path.join(dir, entry.name), rel));
    else files.push(rel);
  }
  return files;
}

for (const bucket of ["avatars", "pet-images"]) {
  console.log(`\n--- ${bucket} ---`);
  await ensureBucket(bucket);
  const bucketDir = path.join(storageDir, bucket);
  if (!fs.existsSync(bucketDir)) { console.log("  無備份檔案,跳過"); continue; }
  const files = walk(bucketDir);
  for (const relPath of files) {
    // 路徑第一段若是舊 UUID,換成新 UUID
    const parts = relPath.split("/");
    if (idMap[parts[0]]) parts[0] = idMap[parts[0]];
    const newPath = parts.join("/");
    const buf = fs.readFileSync(path.join(bucketDir, relPath));
    const ext = relPath.split(".").pop().toLowerCase();
    const contentType = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" }[ext] || "application/octet-stream";
    const up = await fetch(`${NEW_URL}/storage/v1/object/${bucket}/${newPath}`, {
      method: "POST", headers: { ...H, "Content-Type": contentType, "x-upsert": "true" }, body: buf,
    });
    console.log(up.ok ? `  ✅ ${relPath} → ${newPath}` : `  ❌ ${relPath}: HTTP ${up.status} ${await up.text()}`);
  }
}

console.log("\n✅ storage 還原完成。");
