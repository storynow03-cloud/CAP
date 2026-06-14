// 驗證遊戲化觸發器:作答 → XP/金幣/每日任務自動更新
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "student@test.com", password: "test1234" }),
});
const { access_token } = await r.json();
const uid = JSON.parse(Buffer.from(access_token.split(".")[1], "base64").toString()).sub;
const h = { apikey: ANON, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };
const api = (p, o = {}) => fetch(`${URL}/rest/v1/${p}`, { headers: h, ...o }).then(async (x) => ({ status: x.status, body: await x.text().then((t) => (t ? JSON.parse(t) : null)) }));

// 取一題會考圖片題來作答
const { body: qs } = await api(`questions?subject=eq.math&needs_review=eq.false&select=id,difficulty&limit=1`);
const q = qs[0];

const before = (await api(`profiles?id=eq.${uid}&select=xp,coins`)).body[0];
console.log(`作答前:XP ${before.xp},金幣 ${before.coins}`);

// 插入一筆「答對」紀錄(挑戰模式)
const ins = await api(`attempts`, { method: "POST", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: uid, question_id: q.id, selected: 0, is_correct: true, time_spent_ms: 5000, mode: "challenge" }) });
console.log(`插入作答:HTTP ${ins.status}`);

const after = (await api(`profiles?id=eq.${uid}&select=xp,coins`)).body[0];
console.log(`作答後:XP ${after.xp},金幣 ${after.coins}`);
console.log(`→ XP +${after.xp - before.xp},金幣 +${after.coins - before.coins}(難度 ${q.difficulty} 答對應 +${10 + q.difficulty * 3} XP)`);

const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
const { body: quests } = await api(`daily_quests?user_id=eq.${uid}&day=eq.${today}&select=key,label,progress,target,completed`);
console.log("每日任務:");
for (const t of quests) console.log(`  [${t.completed ? "✓" : " "}] ${t.label}  ${t.progress}/${t.target}`);

console.log(quests.length === 3 && after.xp > before.xp ? "\n✅ 遊戲化觸發器正常運作" : "\n❌ 異常");
