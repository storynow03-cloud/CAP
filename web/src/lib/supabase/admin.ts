import { createClient } from "./server";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;

/** 驗證呼叫者是否為管理者(teacher/parent)。一切管理操作前必須先過這關。 */
export async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "未登入" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["teacher", "parent"].includes(profile.role)) {
    return { ok: false as const, status: 403, error: "需要管理者權限" };
  }
  return { ok: true as const, user };
}

/** 角色:teacher/parent = L1 管理者(全部管理功能);guardian = L2 家長(看學習狀況、發放獎勵) */
export const STAFF_ROLES = ["teacher", "parent"];
export const VIEWER_ROLES = ["teacher", "parent", "guardian"];

/** 驗證呼叫者是 L1 或 L2 家長(看學習狀況、發放獎勵用) */
export async function requireViewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "未登入" };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !VIEWER_ROLES.includes(profile.role)) {
    return { ok: false as const, status: 403, error: "需要家長權限" };
  }
  return { ok: true as const, user, role: profile.role as string };
}

/**
 * 驗證已登入並回傳角色。學生自己的操作(上傳自己的考卷、做補強題)用這個;
 * 要代替別人操作時再另外檢查 isStaff。
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "未登入" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isStaff = !!profile && ["teacher", "parent"].includes(profile.role);
  return { ok: true as const, user, isStaff };
}

/** 用服務金鑰呼叫 Supabase(admin / 繞過 RLS)。只能在伺服器端用。 */
export function adminFetch(path: string, init?: RequestInit) {
  return fetch(`${URL}${path}`, {
    ...init,
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}
