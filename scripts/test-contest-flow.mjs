// 大會考流程整合測試(走 RLS,模擬真實前端行為)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function signIn(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`登入失敗 ${email}: ${JSON.stringify(d)}`);
  return d.access_token;
}

function api(token) {
  return async (pathname, opts = {}) => {
    const r = await fetch(`${URL}${pathname}`, {
      ...opts,
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opts.headers ?? {}),
      },
    });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
}

const log = (label, ok, extra = "") => console.log(`${ok ? "✅" : "❌"} ${label} ${extra}`);

// 1. 管理者登入並建立大會考
const adminToken = await signIn("admin@test.com", "admin1234");
const admin = api(adminToken);
const adminUid = JSON.parse(Buffer.from(adminToken.split(".")[1], "base64").toString()).sub;

const { body: pool } = await admin(
  "/rest/v1/questions?subject=eq.math&needs_review=eq.false&type=eq.single_choice&difficulty=gte.1&difficulty=lte.3&select=id&limit=50"
);
log("管理者讀題庫", pool.length >= 5, `(${pool.length} 題)`);
const ids = pool.slice(0, 5).map((r) => r.id);

const { status: cStatus, body: created } = await admin("/rest/v1/contests", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    title: "測試大會考",
    created_by: adminUid,
    subject: "math",
    question_ids: ids,
    ends_at: new Date(Date.now() + 86400000).toISOString(),
  }),
});
log("管理者建立大會考", cStatus === 201, `(id=${created?.[0]?.id})`);
const contestId = created[0].id;

// 2. 學生不能建立大會考(RLS 應擋下)
const studentToken = await signIn("student@test.com", "test1234");
const student = api(studentToken);
const studentUid = JSON.parse(Buffer.from(studentToken.split(".")[1], "base64").toString()).sub;
const { status: denyStatus } = await student("/rest/v1/contests", {
  method: "POST",
  body: JSON.stringify({
    title: "學生偷建", created_by: studentUid, subject: "math",
    question_ids: ids, ends_at: new Date(Date.now() + 86400000).toISOString(),
  }),
});
log("學生建立被 RLS 擋下", denyStatus === 403 || denyStatus === 401, `(HTTP ${denyStatus})`);

// 3. 學生看到大會考並取題
const { body: visible } = await student(`/rest/v1/contests?id=eq.${contestId}&select=*`);
log("學生看得到大會考", visible.length === 1);
const { body: qs } = await student(
  `/rest/v1/questions?id=in.(${ids.map((i) => `"${i}"`).join(",")})&select=id,answer`
);
log("學生取得考題", qs.length === 5, `(${qs.length} 題)`);

// 4. 學生交卷(答對 3 題模擬)
const { status: eStatus } = await student("/rest/v1/contest_entries", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates" },
  body: JSON.stringify({
    contest_id: contestId, user_id: studentUid,
    score: 3, total: 5, time_spent_ms: 222000,
  }),
});
log("學生交卷", eStatus === 201, `(HTTP ${eStatus})`);

// 管理者也交一份(分數較低,驗證排序)
await admin("/rest/v1/contest_entries", {
  method: "POST",
  body: JSON.stringify({
    contest_id: contestId, user_id: adminUid,
    score: 2, total: 5, time_spent_ms: 100000,
  }),
});

// 5. 排行榜
const { body: board } = await student("/rest/v1/rpc/get_contest_leaderboard", {
  method: "POST",
  body: JSON.stringify({ cid: contestId }),
});
log("排行榜", Array.isArray(board) && board.length === 2 && board[0].score === 3,
  `→ ${board.map((b) => `${b.nickname}:${b.score}/${b.total}${b.is_me ? "(我)" : ""}`).join(", ")}`);

// 6. 清理測試場次
const { status: delStatus } = await admin(`/rest/v1/contests?id=eq.${contestId}`, { method: "DELETE" });
log("管理者刪除測試場次", delStatus === 204);
