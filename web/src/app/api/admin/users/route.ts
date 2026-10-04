import { NextRequest, NextResponse } from "next/server";
import { requireStaff, adminFetch } from "@/lib/supabase/admin";
import { loginNameError, toLoginEmail } from "@/lib/login-name";

// 讀取所有帳號(合併 auth 的 email 與 profiles 的暱稱/角色/XP)
export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const usersRes = await adminFetch("/auth/v1/admin/users?per_page=200");
  const usersJson = await usersRes.json();
  const profRes = await adminFetch("/rest/v1/profiles?select=id,nickname,role,xp,grade,avatar_url");
  const profiles = await profRes.json();
  const pmap = new Map((profiles as { id: string }[]).map((p) => [p.id, p]));

  const list = (usersJson.users ?? []).map((u: { id: string; email: string; created_at: string; email_confirmed_at: string | null }) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    confirmed: !!u.email_confirmed_at,
    ...(pmap.get(u.id) ?? {}),
  }));
  list.sort((a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at));
  return NextResponse.json({ users: list });
}

// 建立帳號
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // email 欄位可以填中文姓名(換算成固定的 email,登入時打中文即可)或 email
  const { email: loginName, password, nickname, role } = await req.json();
  const nameErr = loginNameError(loginName ?? "");
  if (nameErr) return NextResponse.json({ error: nameErr }, { status: 400 });
  if (!password || password.length < 6) return NextResponse.json({ error: "密碼至少 6 碼" }, { status: 400 });
  const email = toLoginEmail(loginName);
  const isName = !String(loginName).includes("@");

  const r = await adminFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { nickname: nickname || (isName ? String(loginName).trim() : email.split("@")[0]) } }),
  });
  const d = await r.json();
  if (!d.id) {
    const m = d.msg || d.message || "建立失敗";
    return NextResponse.json({ error: /already/i.test(m) ? "這個登入名稱已經有人用了" : m }, { status: 400 });
  }
  if (role && role !== "student") {
    await adminFetch(`/rest/v1/profiles?id=eq.${d.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
  }
  return NextResponse.json({ ok: true, id: d.id });
}

// 更新帳號(暱稱 / 角色 / 重設密碼)
export async function PATCH(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id, nickname, role, password, loginName } = await req.json();
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  // 改登入名稱(中文姓名或 email)
  if (loginName) {
    const nameErr = loginNameError(loginName);
    if (nameErr) return NextResponse.json({ error: nameErr }, { status: 400 });
    const r = await adminFetch(`/auth/v1/admin/users/${id}`, {
      method: "PUT", body: JSON.stringify({ email: toLoginEmail(loginName), email_confirm: true }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      const m = d.msg || d.message || "更新登入名稱失敗";
      return NextResponse.json({ error: /already/i.test(m) ? "這個登入名稱已經有人用了" : m }, { status: 400 });
    }
  }

  if (password) {
    if (password.length < 6) return NextResponse.json({ error: "密碼至少 6 碼" }, { status: 400 });
    await adminFetch(`/auth/v1/admin/users/${id}`, { method: "PUT", body: JSON.stringify({ password }) });
  }
  const patch: Record<string, unknown> = {};
  if (nickname !== undefined) patch.nickname = nickname;
  if (role !== undefined) patch.role = role;
  if (Object.keys(patch).length)
    await adminFetch(`/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return NextResponse.json({ ok: true });
}

// 刪除帳號
export async function DELETE(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  if (id === auth.user.id) return NextResponse.json({ error: "不能刪除自己" }, { status: 400 });
  await adminFetch(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  return NextResponse.json({ ok: true });
}
