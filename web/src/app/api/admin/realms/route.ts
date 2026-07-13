import { NextRequest, NextResponse } from "next/server";
import { requireStaff, adminFetch } from "@/lib/supabase/admin";

const FIELDS = ["title", "description", "subject", "target_count", "reward_xp", "reward_coins",
  "is_team", "starts_at", "ends_at", "active"];
const NUM_FIELDS = new Set(["target_count", "reward_xp", "reward_coins"]);

// 讀取所有秘境(含已過期/未啟用,管理頁要看到全部)
export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const r = await adminFetch("/rest/v1/realms?select=*&order=created_at.desc");
  return NextResponse.json({ realms: await r.json() });
}

// 新增秘境
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json();
  if (!body.title || !body.target_count || !body.starts_at || !body.ends_at)
    return NextResponse.json({ error: "需要標題、目標題數、開始/結束時間" }, { status: 400 });
  if (new Date(body.ends_at) <= new Date(body.starts_at))
    return NextResponse.json({ error: "結束時間必須晚於開始時間" }, { status: 400 });

  const row: Record<string, unknown> = { created_by: auth.user.id };
  for (const f of FIELDS) if (body[f] !== undefined) row[f] = NUM_FIELDS.has(f) ? Number(body[f]) || 0 : body[f];
  if (row.subject === "") row.subject = null;
  const r = await adminFetch("/rest/v1/realms", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const d = await r.json();
  if (!r.ok) return NextResponse.json({ error: d.message || "建立失敗" }, { status: 400 });
  return NextResponse.json({ ok: true, row: Array.isArray(d) ? d[0] : d });
}

// 編輯秘境
export async function PATCH(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const f of FIELDS) if (body[f] !== undefined) patch[f] = NUM_FIELDS.has(f) ? Number(body[f]) || 0 : body[f];
  if (patch.subject === "") patch.subject = null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "沒有要更新的欄位" }, { status: 400 });
  const r = await adminFetch(`/rest/v1/realms?id=eq.${body.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    return NextResponse.json({ error: d.message || "更新失敗" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// 刪除秘境
export async function DELETE(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const r = await adminFetch(`/rest/v1/realms?id=eq.${id}`, { method: "DELETE" });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    return NextResponse.json({ error: d.message || "刪除失敗" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
