import { NextRequest, NextResponse } from "next/server";
import { requireStaff, adminFetch } from "@/lib/supabase/admin";

const FIELDS = ["key", "name", "origin", "kind", "stage1", "stage2", "stage3", "rarity", "sort", "active",
  "price", "is_legendary", "bonus_xp", "bonus_coins", "bonus_affection", "bonus_subjects"];
const NUM_FIELDS = new Set(["sort", "price", "bonus_xp", "bonus_coins", "bonus_affection"]);

// 讀取所有夥伴(含 inactive,管理頁要看到全部;只回非自訂的公開夥伴)
export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const r = await adminFetch("/rest/v1/pet_defs?select=*&is_custom=eq.false&order=sort");
  return NextResponse.json({ pets: await r.json() });
}

// 新增夥伴
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json();
  if (!body.key || !body.name || !body.stage1 || !body.stage2 || !body.stage3)
    return NextResponse.json({ error: "需要 key、名稱、三個階段內容" }, { status: 400 });

  const row: Record<string, unknown> = {};
  for (const f of FIELDS) if (body[f] !== undefined) row[f] = NUM_FIELDS.has(f) ? Number(body[f]) || 0 : body[f];
  const r = await adminFetch("/rest/v1/pet_defs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const d = await r.json();
  if (!r.ok) return NextResponse.json({ error: d.message || "建立失敗(key 可能重複)" }, { status: 400 });
  return NextResponse.json({ ok: true, row: Array.isArray(d) ? d[0] : d });
}

// 編輯夥伴
export async function PATCH(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const f of FIELDS) if (body[f] !== undefined) patch[f] = NUM_FIELDS.has(f) ? Number(body[f]) || 0 : body[f];
  if (!Object.keys(patch).length) return NextResponse.json({ error: "沒有要更新的欄位" }, { status: 400 });
  const r = await adminFetch(`/rest/v1/pet_defs?id=eq.${body.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    return NextResponse.json({ error: d.message || "更新失敗" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// 刪除夥伴
export async function DELETE(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const r = await adminFetch(`/rest/v1/pet_defs?id=eq.${id}`, { method: "DELETE" });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    return NextResponse.json({ error: d.message || "刪除失敗" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
