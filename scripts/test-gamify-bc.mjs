// 測試 Phase B(寵物)+ Phase C(好友/週排行/PK對戰/王關)
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const log = (ok, m) => console.log(`${ok ? "✅" : "❌"} ${m}`);

async function login(email, pw) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pw }),
  });
  const d = await r.json();
  const uid = JSON.parse(Buffer.from(d.access_token.split(".")[1], "base64").toString()).sub;
  const h = { apikey: ANON, Authorization: `Bearer ${d.access_token}`, "Content-Type": "application/json" };
  return {
    uid,
    rest: (p, o = {}) => fetch(`${URL}/rest/v1/${p}`, { ...o, headers: { ...h, ...(o.headers || {}) } }).then(async (x) => ({ status: x.status, body: await x.text().then((t) => (t ? JSON.parse(t) : null)) })),
    rpc: (fn, args) => fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(args) }).then(async (x) => ({ status: x.status, body: await x.text().then((t) => (t ? JSON.parse(t) : null)) })),
  };
}

const S = await login("student@test.com", "test1234");
const A = await login("admin@test.com", "admin1234");

// 好友碼
const sCode = (await S.rest(`profiles?id=eq.${S.uid}&select=friend_code`)).body[0].friend_code;
const aCode = (await A.rest(`profiles?id=eq.${A.uid}&select=friend_code`)).body[0].friend_code;
console.log(`好友碼:student=${sCode}, admin=${aCode}`);

// Phase B:寵物
await S.rest(`profiles?id=eq.${S.uid}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ pet: "dragon" }) });
const pet = (await S.rest(`profiles?id=eq.${S.uid}&select=pet`)).body[0].pet;
log(pet === "dragon", `Phase B 寵物設定:${pet}`);

// Phase C:加好友
const add = await S.rpc("add_friend", { code: aCode });
log(add.body && add.body !== "NOT_FOUND" && add.body !== "SELF", `加好友:回傳「${add.body}」`);

// 好友週排行
const board = (await S.rpc("get_friends_board")).body;
log(Array.isArray(board) && board.length >= 2, `週排行榜含 ${board?.length} 人`);

// PK 對戰:student 發起(國文,題多)
const created = await S.rpc("create_duel", { opp_code: aCode, subj: "chinese" });
const duelId = created.body;
log(typeof duelId === "number", `建立對戰 id=${duelId}`);

// student 應戰(答對 4 題,用時 30 秒)
await S.rest(`duels?id=eq.${duelId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ch_score: 4, ch_time: 30000, ch_done: true }) });
// admin 看得到並應戰(答對 3 題)
const adminSees = (await A.rpc("get_duel", { duel_id: duelId })).body;
log(adminSees?.length === 1, `對手看得到對戰`);
await A.rest(`duels?id=eq.${duelId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ op_score: 3, op_time: 40000, op_done: true }) });

// 結算
const fin = (await S.rpc("get_duel", { duel_id: duelId })).body[0];
const studentWon = fin.ch_done && fin.op_done && fin.ch_score > fin.op_score;
log(studentWon, `對戰結算:student ${fin.ch_score} : ${fin.op_score} admin → student ${studentWon ? "贏" : "?"}`);

// Phase C:王關通關
const week = new Date().getFullYear() + "-Wtest";
await S.rest(`boss_clears`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: S.uid, week, score: 8 }) });
const cleared = (await S.rest(`boss_clears?user_id=eq.${S.uid}&week=eq.${week}&select=score`)).body;
log(cleared?.length === 1 && cleared[0].score === 8, `王關通關紀錄:答對 ${cleared?.[0]?.score} 題`);

// 清理測試資料
await S.rest(`duels?id=eq.${duelId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
await S.rest(`boss_clears?user_id=eq.${S.uid}&week=eq.${week}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
console.log("\n(測試對戰/王關資料已清理)");
