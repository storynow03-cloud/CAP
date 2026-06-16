import { NextRequest, NextResponse } from "next/server";
import { requireStaff, adminFetch } from "@/lib/supabase/admin";

const TABLES: Record<string, string> = {
  category: "shop_categories",
  item: "shop_items",
};

function tableOf(kind: unknown): string | null {
  return typeof kind === "string" ? TABLES[kind] ?? null : null;
}

// 讀取全部分類與商品(含 inactive,管理頁要看到全部)
export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [catRes, itemRes] = await Promise.all([
    adminFetch("/rest/v1/shop_categories?select=*&order=sort"),
    adminFetch("/rest/v1/shop_items?select=*&order=type,sort"),
  ]);
  return NextResponse.json({
    categories: await catRes.json(),
    items: await itemRes.json(),
  });
}

// 新增分類或商品
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const table = tableOf(body.kind);
  if (!table) return NextResponse.json({ error: "kind 需為 category 或 item" }, { status: 400 });

  let row: Record<string, unknown>;
  if (body.kind === "category") {
    if (!body.name || !body.type)
      return NextResponse.json({ error: "分類需要名稱與類型" }, { status: 400 });
    row = { name: body.name, type: body.type, sort: Number(body.sort) || 0 };
  } else {
    if (!body.key || !body.label || !body.type || body.value === undefined || body.value === "")
      return NextResponse.json({ error: "商品需要 key、名稱、類型、內容" }, { status: 400 });
    row = {
      key: body.key,
      label: body.label,
      type: body.type,
      value: String(body.value),
      price: Number(body.price) || 0,
      category_id: body.category_id ?? null,
      active: body.active ?? true,
      sort: Number(body.sort) || 0,
    };
  }

  const r = await adminFetch(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const d = await r.json();
  if (!r.ok)
    return NextResponse.json({ error: d.message || d.hint || "建立失敗(key 可能重複)" }, { status: 400 });
  return NextResponse.json({ ok: true, row: Array.isArray(d) ? d[0] : d });
}

// 編輯分類或商品
export async function PATCH(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const table = tableOf(body.kind);
  if (!table) return NextResponse.json({ error: "kind 需為 category 或 item" }, { status: 400 });
  if (!body.id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  const fields =
    body.kind === "category"
      ? ["name", "type", "sort"]
      : ["key", "label", "type", "value", "price", "category_id", "active", "sort"];
  for (const f of fields) {
    if (body[f] === undefined) continue;
    if (f === "price" || f === "sort") patch[f] = Number(body[f]) || 0;
    else if (f === "value") patch[f] = String(body[f]);
    else patch[f] = body[f];
  }
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: "沒有要更新的欄位" }, { status: 400 });

  const r = await adminFetch(`/rest/v1/${table}?id=eq.${body.id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    return NextResponse.json({ error: d.message || "更新失敗" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// 刪除分類或商品
export async function DELETE(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const table = tableOf(body.kind);
  if (!table) return NextResponse.json({ error: "kind 需為 category 或 item" }, { status: 400 });
  if (!body.id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const r = await adminFetch(`/rest/v1/${table}?id=eq.${body.id}`, { method: "DELETE" });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    return NextResponse.json({ error: d.message || "刪除失敗" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
