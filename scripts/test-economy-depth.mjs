// 驗證 2026-07-13 經濟系統深化 + 加成道具 + 秘境 三個 migration 的所有 RPC
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SECRET = env.SUPABASE_SECRET_KEY;

async function login(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const { access_token } = await r.json();
  const uid = JSON.parse(Buffer.from(access_token.split(".")[1], "base64").toString()).sub;
  return { uid, h: { apikey: ANON, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" } };
}
const adminH = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" };

async function rest(h, p, o = {}) {
  const r = await fetch(`${URL}/rest/v1/${p}`, { headers: h, ...o });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
}
async function rpc(h, name, args = {}) {
  return rest(h, `rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
}

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? "  " + detail : ""}`);
  ok ? pass++ : fail++;
}

const { uid, h } = await login("student@test.com", "test1234");
console.log(`學生帳號 uid=${uid}\n`);

// ===== 1. daily_login =====
console.log("--- 每日登入 ---");
// 先重置,確保今天還沒登入過(用 admin key 直接清 login_day)
await rest(adminH, `profiles?id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ login_day: null, login_streak: 0 }) });
const login1 = await rpc(h, "daily_login");
check("首次登入給獎勵", login1.body?.[0]?.already === false && login1.body[0].reward === 10, JSON.stringify(login1.body));
const login2 = await rpc(h, "daily_login");
check("同一天重複登入不重複發獎", login2.body?.[0]?.already === true, JSON.stringify(login2.body));

// ===== 2. claim_affection_reward =====
console.log("\n--- 好感度里程碑 ---");
await rest(adminH, `profiles?id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ pet_affection: 60, affection_claimed: 0 }) });
const aff1 = await rpc(h, "claim_affection_reward");
check("好感度 60 可領第一階(門檻50,獎勵50)", aff1.body?.[0]?.reward === 50 && aff1.body[0].tier === 1, JSON.stringify(aff1.body));
const aff2 = await rpc(h, "claim_affection_reward");
check("好感度不足下一階(150)應拒絕 NOT_YET", aff2.status === 400 && JSON.stringify(aff2.body).includes("NOT_YET"), JSON.stringify(aff2.body));

// ===== 3. 升級自動發金幣(on_levelup 觸發器)=====
console.log("\n--- 升級發金幣 ---");
const beforeLv = await rest(h, `profiles?id=eq.${uid}&select=xp,coins`);
const xpBefore = beforeLv.body[0].xp, coinsBefore = beforeLv.body[0].coins;
// 直接把 xp 設到剛好跨一級的邊界前後(用 admin key 精準控制測試條件)
await rest(adminH, `profiles?id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ xp: 95 }) }); // Lv1 (need 100 for Lv2)
await rest(adminH, `profiles?id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ coins: 0 }) });
await rest(adminH, `profiles?id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ xp: 105 }) }); // 跨到 Lv2,應該送 2*20=40 金幣
const afterLv = await rest(h, `profiles?id=eq.${uid}&select=xp,coins`);
check("XP 95→105 跨 Lv1→Lv2,金幣 +40", afterLv.body[0].coins === 40, `coins=${afterLv.body[0].coins}`);

// ===== 4. 錯題克服自動發獎(on_wrong_overcome 觸發器)=====
console.log("\n--- 錯題克服發獎 ---");
const { body: qlist } = await rest(h, `questions?subject=eq.math&needs_review=eq.false&select=id&limit=1`);
const qid = qlist[0].id;
await rest(adminH, `wrong_book?user_id=eq.${uid}&question_id=eq.${qid}`, { method: "DELETE" });
await rest(h, `wrong_book`, { method: "POST", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: uid, question_id: qid, status: "active" }) });
const beforeWB = await rest(h, `profiles?id=eq.${uid}&select=xp,coins`);
await rest(h, `wrong_book?user_id=eq.${uid}&question_id=eq.${qid}`, { method: "PATCH", body: JSON.stringify({ status: "overcome", streak: 3 }) });
const afterWB = await rest(h, `profiles?id=eq.${uid}&select=xp,coins`);
check("錯題克服 +10 金幣 +20 XP", afterWB.body[0].coins - beforeWB.body[0].coins === 10 && afterWB.body[0].xp - beforeWB.body[0].xp === 20,
  `Δcoins=${afterWB.body[0].coins - beforeWB.body[0].coins} Δxp=${afterWB.body[0].xp - beforeWB.body[0].xp}`);
await rest(adminH, `wrong_book?user_id=eq.${uid}&question_id=eq.${qid}`, { method: "DELETE" });

// ===== 5. 答錯也給 1 金幣(風險2修正)=====
console.log("\n--- 答錯參與獎 ---");
const beforeWrong = await rest(h, `profiles?id=eq.${uid}&select=coins`);
await rest(h, `attempts`, { method: "POST", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: uid, question_id: qid, selected: 99, is_correct: false, time_spent_ms: 1000, mode: "practice" }) });
const afterWrong = await rest(h, `profiles?id=eq.${uid}&select=coins`);
check("答錯也給 1 金幣參與獎", afterWrong.body[0].coins - beforeWrong.body[0].coins === 1, `Δcoins=${afterWrong.body[0].coins - beforeWrong.body[0].coins}`);

// ===== 6. 成就獎勵(claim_achievement_reward)=====
console.log("\n--- 成就獎勵 ---");
await rest(adminH, `user_achievements?user_id=eq.${uid}&key=eq.first_step`, { method: "DELETE" });
await rest(h, `user_achievements`, { method: "POST", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: uid, key: "first_step" }) });
const beforeAch = await rest(h, `profiles?id=eq.${uid}&select=xp,coins`);
const ach1 = await rpc(h, "claim_achievement_reward", { p_key: "first_step" });
const afterAch = await rest(h, `profiles?id=eq.${uid}&select=xp,coins`);
check("成就 first_step 給 20XP/10coins", ach1.body?.[0]?.reward_xp === 20 && ach1.body[0].reward_coins === 10
  && afterAch.body[0].xp - beforeAch.body[0].xp === 20 && afterAch.body[0].coins - beforeAch.body[0].coins === 10,
  JSON.stringify(ach1.body));
const ach2 = await rpc(h, "claim_achievement_reward", { p_key: "first_step" });
check("重複領取應拒絕 ALREADY_CLAIMED", ach2.status === 400 && JSON.stringify(ach2.body).includes("ALREADY_CLAIMED"), JSON.stringify(ach2.body));

// ===== 7. 加成道具:XP/金幣加倍卡 + 提示券 =====
console.log("\n--- 加成道具 ---");
await rest(adminH, `inventory?user_id=eq.${uid}&item_key=eq.booster_xp2x`, { method: "DELETE" });
await rest(adminH, `profiles?id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ coins: 1000, boost_xp2x_left: 0 }) });
const buy1 = await rpc(h, "buy_item", { p_key: "booster_xp2x" });
check("購買 XP 加倍卡", buy1.status === 200, JSON.stringify(buy1.body));
const use1 = await rpc(h, "use_booster", { p_key: "booster_xp2x" });
check("使用 XP 加倍卡,剩餘次數=5", use1.body?.[0]?.xp2x_left === 5, JSON.stringify(use1.body));
const beforeBoost = await rest(h, `profiles?id=eq.${uid}&select=xp`);
await rest(h, `attempts`, { method: "POST", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: uid, question_id: qid, selected: 0, is_correct: true, time_spent_ms: 1000, mode: "practice" }) });
const afterBoost = await rest(h, `profiles?id=eq.${uid}&select=xp,boost_xp2x_left`);
const q1 = await rest(h, `questions?id=eq.${qid}&select=difficulty`);
const baseXp = 10 + q1.body[0].difficulty * 3;
check("加倍卡生效:XP 是原本的 2 倍", afterBoost.body[0].xp - beforeBoost.body[0].xp === baseXp * 2,
  `Δxp=${afterBoost.body[0].xp - beforeBoost.body[0].xp} 期望=${baseXp * 2}`);
check("加倍卡剩餘次數遞減為 4", afterBoost.body[0].boost_xp2x_left === 4, `left=${afterBoost.body[0].boost_xp2x_left}`);

await rest(adminH, `inventory?user_id=eq.${uid}&item_key=eq.booster_hint`, { method: "DELETE" });
const buyHint = await rpc(h, "buy_item", { p_key: "booster_hint" });
check("購買提示券", buyHint.status === 200, JSON.stringify(buyHint.body));
const useHint1 = await rpc(h, "use_hint");
check("使用提示券,回傳剩餘 0", useHint1.body === 0, JSON.stringify(useHint1.body));
const useHint2 = await rpc(h, "use_hint");
check("提示券用完後應拒絕 NO_ITEM", useHint2.status === 400 && JSON.stringify(useHint2.body).includes("NO_ITEM"), JSON.stringify(useHint2.body));

// ===== 8. 秘境(realms)=====
console.log("\n--- 秘境 ---");
// 用 admin key 直接建立測試秘境(繞過 API route,因為沒有跑本機 server)
const nowIso = new Date().toISOString();
const endIso = new Date(Date.now() + 3600000).toISOString();
const createRealm = await rest(adminH, `realms`, {
  method: "POST", headers: { ...adminH, Prefer: "return=representation" },
  body: JSON.stringify({ title: "測試秘境", subject: "math", target_count: 3, reward_xp: 50, reward_coins: 30, is_team: false, starts_at: nowIso, ends_at: endIso }),
});
const realmId = createRealm.body?.[0]?.id;
check("建立測試秘境", !!realmId, JSON.stringify(createRealm.body));

const joinR = await rpc(h, "join_realm", { p_id: realmId });
check("學生加入秘境", joinR.status === 204 || joinR.status === 200, `status=${joinR.status}`);

const getR1 = await rpc(h, "get_realms");
const myRealm = getR1.body?.find((r) => r.id === realmId);
check("get_realms 看到已加入、進度為 0", myRealm?.is_joined === true && myRealm.my_progress === 0, JSON.stringify(myRealm));

// 答 3 題數學題(不同題以免 upsert 衝突)讓進度推進到 3
const { body: mathQs } = await rest(h, `questions?subject=eq.math&needs_review=eq.false&select=id&limit=3`);
for (const q of mathQs) {
  await rest(h, `attempts`, { method: "POST", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: uid, question_id: q.id, selected: 0, is_correct: true, time_spent_ms: 1000, mode: "practice" }) });
}
const getR2 = await rpc(h, "get_realms");
const myRealm2 = getR2.body?.find((r) => r.id === realmId);
check("做 3 題數學後秘境進度達標(3/3)", myRealm2?.my_progress === 3, `progress=${myRealm2?.my_progress}`);

const claimR = await rpc(h, "claim_realm_reward", { p_id: realmId });
check("領取秘境獎勵 50XP/30coins", claimR.body?.[0]?.reward_xp === 50 && claimR.body[0].reward_coins === 30, JSON.stringify(claimR.body));
const claimR2 = await rpc(h, "claim_realm_reward", { p_id: realmId });
check("重複領取應拒絕 ALREADY_CLAIMED", claimR2.status === 400 && JSON.stringify(claimR2.body).includes("ALREADY_CLAIMED"), JSON.stringify(claimR2.body));

// 團體秘境測試:兩個帳號一起做
const admin = await login("admin@test.com", "admin1234");
const createTeam = await rest(adminH, `realms`, {
  method: "POST", headers: { ...adminH, Prefer: "return=representation" },
  body: JSON.stringify({ title: "測試團體秘境", subject: "math", target_count: 4, reward_xp: 20, reward_coins: 10, is_team: true, starts_at: nowIso, ends_at: endIso }),
});
const teamId = createTeam.body?.[0]?.id;
await rpc(h, "join_realm", { p_id: teamId });
await rpc(admin.h, "join_realm", { p_id: teamId });
// 學生答 2 題、管理者答 2 題,湊滿團隊目標 4
const { body: mathQs2 } = await rest(h, `questions?subject=eq.math&needs_review=eq.false&select=id&limit=6`);
for (const q of mathQs2.slice(0, 2)) {
  await rest(h, `attempts`, { method: "POST", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: uid, question_id: q.id, selected: 0, is_correct: true, time_spent_ms: 1000, mode: "practice" }) });
}
for (const q of mathQs2.slice(2, 4)) {
  await rest(admin.h, `attempts`, { method: "POST", headers: { ...admin.h, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: admin.uid, question_id: q.id, selected: 0, is_correct: true, time_spent_ms: 1000, mode: "practice" }) });
}
const teamCheckStudent = await rpc(h, "claim_realm_reward", { p_id: teamId });
check("團體秘境達標(2+2=4),學生可領獎", teamCheckStudent.body?.[0]?.reward_xp === 20, JSON.stringify(teamCheckStudent.body));
const teamCheckAdmin = await rpc(admin.h, "claim_realm_reward", { p_id: teamId });
check("團體秘境,隊友也能各自領獎(不互相瓜分)", teamCheckAdmin.body?.[0]?.reward_xp === 20, JSON.stringify(teamCheckAdmin.body));

// 清理測試秘境
await rest(adminH, `realms?id=eq.${realmId}`, { method: "DELETE" });
await rest(adminH, `realms?id=eq.${teamId}`, { method: "DELETE" });

console.log(`\n==== ${pass} 通過 / ${fail} 失敗 ====`);
process.exit(fail > 0 ? 1 : 0);
