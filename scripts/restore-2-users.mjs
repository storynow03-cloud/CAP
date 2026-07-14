// 還原步驟 2/3:在新專案用 Admin API 重建 6 個帳號(新密碼,email_confirm=true 免驗證)。
// 輸出 id-map.json(舊 UUID → 新 UUID,給步驟 3 資料還原用)+ new-passwords.txt(新密碼清單,拿去通知家人)。
// 用法:node scripts/restore-2-users.mjs <新專案URL> <新專案service_role key>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(import.meta.dirname, "..");
const [, , NEW_URL, NEW_SECRET] = process.argv;
if (!NEW_URL || !NEW_SECRET) {
  console.error("用法:node scripts/restore-2-users.mjs <新專案URL> <新專案service_role key>");
  process.exit(1);
}
const H = { apikey: NEW_SECRET, Authorization: `Bearer ${NEW_SECRET}`, "Content-Type": "application/json" };

const BACKUP_DIR = path.resolve(ROOT, "..", "國中會考-DB備份");
const latest = fs.readdirSync(BACKUP_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1);
const usersFile = path.join(BACKUP_DIR, latest, "auth", "users_metadata.json");
console.log(`讀取備份帳號清單:${usersFile}\n`);
const oldUsers = JSON.parse(fs.readFileSync(usersFile, "utf8"));

function randomPassword() {
  return crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "x"); // 12 碼英數
}

const idMap = {}; // old_uuid -> new_uuid
const passwords = []; // { email, nickname, password }

for (const u of oldUsers) {
  const password = randomPassword();
  const nickname = u.raw_user_meta_data?.nickname || u.email.split("@")[0];
  const r = await fetch(`${NEW_URL}/auth/v1/admin/users`, {
    method: "POST", headers: H,
    body: JSON.stringify({ email: u.email, password, email_confirm: true, user_metadata: { nickname } }),
  });
  const d = await r.json();
  if (!d.id) {
    console.log(`❌ ${u.email}: ${d.msg || d.message || JSON.stringify(d)}`);
    continue;
  }
  idMap[u.id] = d.id;
  passwords.push({ email: u.email, nickname, password });
  console.log(`✅ ${u.email} (${nickname})  舊uuid=${u.id}  新uuid=${d.id}`);
}

fs.writeFileSync(path.join(BACKUP_DIR, latest, "id-map.json"), JSON.stringify(idMap, null, 2), "utf8");
fs.writeFileSync(
  path.join(BACKUP_DIR, latest, "new-passwords.txt"),
  passwords.map((p) => `${p.nickname.padEnd(10)} ${p.email.padEnd(24)} 新密碼:${p.password}`).join("\n") + "\n",
  "utf8"
);

console.log(`\n✅ ${passwords.length}/${oldUsers.length} 個帳號建立完成。`);
console.log(`   id-map.json 存於 ${path.join(BACKUP_DIR, latest)}(下一步資料還原要用)`);
console.log(`   new-passwords.txt 存於同目錄(新密碼清單,拿去通知家人;看完建議刪除這個檔案)`);
