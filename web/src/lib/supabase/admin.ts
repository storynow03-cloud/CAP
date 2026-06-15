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
