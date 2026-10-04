// 情境測試(2026-10-04):金幣防竄改、現金券、PK 對賭結算、魔王分級、扭蛋、排行榜、操作紀錄還原。
// 執行:cd scripts; node sql-test/scenarios.mjs(需先 npm i,依賴 @electric-sql/pglite)
import { db } from "./setup.mjs";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const P = "00000000-0000-0000-0000-00000000000c";
const G = "00000000-0000-0000-0000-00000000000d"; // L2 家長(guardian)
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  ✅", msg); } else { fail++; console.log("  ❌", msg); } };

async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ""}', false); select set_config('request.headers', '', false); select set_config('request.jwt.claims', '', false);`);
  if (uid) await db.exec("set role authenticated");
  try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
}
async function asService(sql, params = [], headers = {}) {
  await db.exec(`reset role; select set_config('test.uid', '', false);
    select set_config('request.jwt.claims', '{"role":"service_role"}', false);
    select set_config('request.headers', '${JSON.stringify(headers)}', false);`);
  try { return await db.query(sql, params); } finally { await db.exec(`select set_config('request.headers', '', false); select set_config('request.jwt.claims', '', false);`); }
}
const coins = async (u) => (await db.query("select coins from profiles where id = $1", [u])).rows[0].coins;
async function expectError(fn, needle, msg) {
  try { await fn(); ok(false, `${msg}(應該失敗卻成功)`); } catch (e) { ok(e.message.includes(needle), `${msg}(${e.message})`); }
}

// ── 準備資料 ──
for (const [id, name] of [[A, "小A"], [B, "小B"], [P, "家長"], [G, "L2家長"]]) {
  await db.query("insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)", [id, `${name}@t`, { nickname: name }]);
}
await db.exec(`update profiles set role = 'student', coins = 1000 where id = '${A}';
  update profiles set role = 'student', coins = 300 where id = '${B}';
  update profiles set role = 'parent' where id = '${P}';
  update profiles set role = 'guardian' where id = '${G}';
  insert into friendships(user_id, friend_id) values ('${A}', '${B}'), ('${B}', '${A}');`);
for (let i = 0; i < 12; i++) {
  await db.query(`insert into questions(id, subject, topic, difficulty, type, question, options, answer, needs_review)
    values ($1, 'math', 't', $2, 'single_choice', 'q', '["a","b","c","d"]', 0, false)`, [`math-t${i}`, 1 + (i % 5)]);
}
const bCode = (await db.query("select friend_code from profiles where id = $1", [B])).rows[0].friend_code;

console.log("① 金幣防竄改");
await as(A, `update profiles set coins = 99999, xp = 99999, role = 'parent', nickname = '改名成功' where id = '${A}'`);
const pa = (await db.query("select coins, xp, role, nickname from profiles where id = $1", [A])).rows[0];
ok(pa.coins === 1000 && pa.xp === 0 && pa.role === "student", `孩子直接改金幣/經驗值/角色無效(coins=${pa.coins}, role=${pa.role})`);
ok(pa.nickname === "改名成功", "孩子改暱稱仍然可以");

console.log("② 現金券(100 金幣 = 1 元)");
await db.exec(`update profiles set coins = 5500 where id = '${A}'`);
await as(A, "select * from buy_item('voucher_50')");
ok(await coins(A) === 500, `買 50 元現金券扣 5,000 金幣(剩 ${await coins(A)})`);
const v = (await db.query("select * from voucher_redemptions where user_id = $1", [A])).rows;
ok(v.length === 1 && v[0].amount === 50 && v[0].status === "pending", "產生一筆待發放 50 元紀錄");
await expectError(() => as(A, "select * from buy_item('voucher_500')"), "NOT_ENOUGH_COINS", "金幣不夠買 500 元券");
await expectError(() => as(A, "select * from buy_item('priv_game30')"), "INACTIVE", "特權券預設下架買不到");
await expectError(() => as(B, `select handle_voucher(${v[0].id}, 'paid')`), "需要管理者權限", "孩子不能自己標記已發放");
await as(P, `select handle_voucher(${v[0].id}, 'cancelled')`);
ok(await coins(A) === 5500, `家長取消 → 退回 5,000 金幣(剩 ${await coins(A)})`);
await db.exec(`update profiles set coins = 10000 where id = '${A}'`);
await as(A, "select * from buy_item('voucher_100')");
const v2 = (await db.query("select id from voucher_redemptions where user_id = $1 and status = 'pending'", [A])).rows[0];
await as(P, `select handle_voucher(${v2.id}, 'paid')`);
ok((await db.query("select status from voucher_redemptions where id = $1", [v2.id])).rows[0].status === "paid" && await coins(A) === 0, "家長標記已發放、金幣不退");
await db.exec(`update profiles set coins = 1000 where id = '${A}'`);

console.log("③ 好友 PK 對賭");
const d1 = (await as(A, `select create_duel('${bCode}', 'math', 100) as id`)).rows[0].id;
ok(await coins(A) === 900, `發起押 100 → A 先扣 100(剩 ${await coins(A)})`);
await expectError(() => as(A, `update duels set ch_score = 5 where id = ${d1}`).then(async () => {
  const r = (await db.query("select ch_score from duels where id = $1", [d1])).rows[0];
  if (r.ch_score === 5) throw new Error("可以直接改分數"); else throw new Error("改分數無效");
}), "改分數無效", "前端不能直接改 duels 分數");
await expectError(() => as(A, `select duel_ready(${d1})`), "NOT_ACCEPTED", "對方還沒接受不能開始");
await as(B, `select accept_duel(${d1})`);
ok(await coins(B) === 200, `B 接受 → 扣 100(剩 ${await coins(B)})`);
await as(A, `select duel_ready(${d1})`);
const r1 = (await as(B, `select duel_ready(${d1}) as t`)).rows[0].t;
ok(!!r1, "雙方都準備好 → 產生共同開始時間");
await as(B, `select duel_progress(${d1}, 2, 1)`);
const prog = (await db.query("select op_answered, op_correct from duels where id = $1", [d1])).rows[0];
ok(prog.op_answered === 2 && prog.op_correct === 1, "作答進度即時寫入(對手看得到)");
ok((await as(A, `select finish_duel(${d1}, 4, 30000) as s`)).rows[0].s === "waiting", "A 交卷 → 等對手");
ok((await as(B, `select finish_duel(${d1}, 3, 20000) as s`)).rows[0].s === "settled", "B 交卷 → 結算");
ok(await coins(A) === 1100 && await coins(B) === 200, `A 贏 → 拿走獎池 200(A=${await coins(A)}, B=${await coins(B)})`);
ok((await as(A, `select finish_duel(${d1}, 5, 1) as s`)).rows[0].s === "settled" && await coins(A) === 1100, "結算後重複交卷不會再發錢");
const g = (await as(A, `select * from get_duel(${d1})`)).rows[0];
ok(g.winner === A && g.status === "settled", "get_duel 回傳贏家與狀態");

const d2 = (await as(A, `select create_duel('${bCode}', 'math', 50) as id`)).rows[0].id;
await as(B, `select accept_duel(${d2})`);
await as(A, `select finish_duel(${d2}, 3, 10000)`);
await as(B, `select finish_duel(${d2}, 3, 10000)`);
ok(await coins(A) === 1100 && await coins(B) === 200, `平手 → 雙方押注退回(A=${await coins(A)}, B=${await coins(B)})`);

const d3 = (await as(A, `select create_duel('${bCode}', 'math', 500) as id`)).rows[0].id;
await expectError(() => as(B, `select accept_duel(${d3})`), "NOT_ENOUGH_COINS", "B 金幣不夠不能接受");
await as(B, `select cancel_duel(${d3})`);
ok(await coins(A) === 1100, `B 拒絕 → A 押注退回(A=${await coins(A)})`);
const d4 = (await as(A, `select create_duel('${bCode}', 'math', 0) as id`)).rows[0].id;
ok((await db.query("select status from duels where id = $1", [d4])).rows[0].status === "accepted", "友誼賽(押 0)不用接受,直接可以打");
await expectError(() => as(A, `select create_duel('${bCode}', 'math', 99999)`), "BAD_STAKE", "押注超過上限被拒");

console.log("④ 魔王關分級");
await expectError(() => as(A, "select * from clear_boss('math', 2, 10)"), "LOCKED", "沒打過 Lv1 不能打 Lv2");
const before = await coins(A);
const b0 = (await as(A, "select * from clear_boss('math', 1, 5)")).rows[0];
ok(!b0.cleared && await coins(A) === before, "Lv1 答對 5 題(門檻 6)不算過關、沒獎勵");
const wk = (await db.query("select boss_week_subject() as s")).rows[0].s;
const b1 = (await as(A, "select * from clear_boss('math', 1, 6)")).rows[0];
const mult = wk === "math" ? 2 : 1;
ok(b1.cleared && b1.reward_coins === 30 * mult && await coins(A) === before + 30 * mult, `Lv1 過關 +${30 * mult} 金幣(本週加倍科目:${wk})`);
const b2 = (await as(A, "select * from clear_boss('math', 1, 10)")).rows[0];
ok(b2.cleared && b2.reward_coins === 0, "Lv1 重打不重複發獎");
ok((await as(A, "select * from clear_boss('math', 2, 7)")).rows[0].tier_cleared === 2, "Lv2 解鎖並過關");

console.log("⑤ 扭蛋與排行榜");
const c0 = await coins(A);
const gs = (await as(A, "select * from gacha_spin()")).rows[0];
ok(!!gs.won_key && gs.coins === c0 - 80, `扭蛋扣 80 抽到 ${gs.won_label}`);
const lb = (await as(A, "select * from get_leaderboard()")).rows;
ok(lb.length === 2 && lb.find((r) => r.user_id === A).is_me && Number(lb.find((r) => r.user_id === A).duel_wins) === 1 && Number(lb.find((r) => r.user_id === A).boss_tiers) === 2,
  `排行榜:2 位學生、A 的 PK 勝場 1、魔王級數 2(家長不列入)`);

console.log("⑥ 操作紀錄與還原");
await asService("update questions set question = '改壞了' where id = 'math-t0'", [], { "x-actor": P });
const log = (await db.query("select * from audit_log where row_id = 'math-t0' order by id desc limit 1")).rows[0];
ok(log && log.op === "UPDATE" && log.actor === P && log.before.question === "q" && log.after.question === "改壞了", "修改題目自動記錄(誰改的、改之前、改之後)");
await asService(`select audit_restore(${log.id})`, [], { "x-actor": P, "x-restored-from": String(log.id) });
ok((await db.query("select question from questions where id = 'math-t0'")).rows[0].question === "q", "一鍵還原回修改前");
const rlog = (await db.query("select * from audit_log order by id desc limit 1")).rows[0];
ok(rlog.restored_from === log.id, "還原本身也留下紀錄(標記還原自哪一筆)");
await asService("delete from shop_items where key = 'title_capgod'", [], { "x-actor": P });
const dlog = (await db.query("select id from audit_log where op = 'DELETE' and table_name = 'shop_items' order by id desc limit 1")).rows[0];
await asService(`select audit_restore(${dlog.id})`);
ok((await db.query("select count(*)::int as n from shop_items where key = 'title_capgod'")).rows[0].n === 1, "刪掉的商品可以還原回來");
await expectError(() => as(A, `select audit_restore(${log.id})`), "需要管理者權限", "孩子不能還原");
const seen = (await as(A, "select count(*)::int as n from audit_log")).rows[0].n;
ok(seen === 0, "孩子看不到操作紀錄");

console.log("⑦ L2 家長(guardian)");
const gc0 = await coins(A);
await as(G, `select grant_reward('${A}', 'coins', null, 300, '考試進步')`);
ok(await coins(A) === gc0 + 300, "L2 發放 300 金幣給孩子");
await as(G, `select grant_reward('${A}', 'item', 'priv_game30', 0, '週末獎勵')`);
ok((await db.query("select count(*)::int n from voucher_redemptions where user_id = $1 and item_key = 'priv_game30' and status = 'pending'", [A])).rows[0].n === 1, "L2 發放特權券(即使商城下架)→ 孩子得到待兌現券");
await as(G, `select grant_reward('${A}', 'item', 'frame_fire')`);
ok((await db.query("select count(*)::int n from user_items where user_id = $1 and key = 'frame_fire'", [A])).rows[0].n === 1, "L2 發放裝扮 → 孩子直接擁有");
const grants = (await as(A, "select kind, coins, note from reward_grants order by id")).rows;
ok(grants.length === 3 && grants[0].note === "考試進步", "孩子看得到自己收到的獎勵與留言");
await expectError(() => as(A, `select grant_reward('${B}', 'coins', null, 100)`), "需要家長權限", "孩子不能發獎勵給別人");
await expectError(() => as(G, `select grant_reward('${P}', 'coins', null, 100)`), "NOT_STUDENT", "不能發給非學生帳號");
await expectError(() => as(G, `select grant_reward('${A}', 'coins', null, 999999)`), "BAD_COINS", "單次金幣上限 50,000");
await expectError(() => as(G, `select handle_voucher(1, 'paid')`), "需要管理者權限", "L2 不能處理兌換(限 L1)");
await expectError(() => as(G, `select audit_restore(1)`), "需要管理者權限", "L2 不能還原操作紀錄");
ok((await as(G, "select count(*)::int n from audit_log")).rows[0].n === 0, "L2 看不到操作紀錄");
await expectError(() => db.query(`update profiles set role = 'admin' where id = '${G}'`), "profiles_role_check", "角色只能是四種之一");

console.log(`\n結果:${pass} 通過、${fail} 失敗`);
process.exit(fail ? 1 : 0);
