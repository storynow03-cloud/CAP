import { NextRequest, NextResponse } from "next/server";
import { requireStaff, adminFetch } from "@/lib/supabase/admin";

/**
 * 現金券兌換(管理者):孩子在商城用金幣兌換現金券(10 金幣 = 1 元)→ 這裡列出 → 家長給現金後按「已發放」。
 * GET   ?status=pending|all  → 兌換紀錄(附暱稱)
 * PATCH { id, action }       → paid 已發放 / cancelled 取消並退回金幣
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  const r = await adminFetch(
    `/rest/v1/voucher_redemptions?select=*${status === "all" ? "" : `&status=eq.${status}`}&order=created_at.desc&limit=200`
  );
  const rows = await r.json();
  if (!Array.isArray(rows)) {
    return NextResponse.json(
      { error: "現金券資料表尚未建立:請到 Supabase SQL Editor 執行 supabase/migrations/20261004010000_vouchers_duel_wager.sql" },
      { status: 500 }
    );
  }
  const uids = [...new Set(rows.map((x: { user_id: string }) => x.user_id))];
  const profiles = uids.length
    ? await (await adminFetch(`/rest/v1/profiles?id=in.(${uids.join(",")})&select=id,nickname`)).json()
    : [];
  const nick = Object.fromEntries((profiles as { id: string; nickname: string }[]).map((p) => [p.id, p.nickname]));
  const keys = [...new Set(rows.map((x: { item_key: string }) => x.item_key))];
  const shop = keys.length
    ? await (await adminFetch(`/rest/v1/shop_items?key=in.(${keys.join(",")})&select=key,label`)).json()
    : [];
  const labels = Object.fromEntries((Array.isArray(shop) ? shop : []).map((s: { key: string; label: string }) => [s.key, s.label]));
  return NextResponse.json({ items: rows, nick, labels });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id, action } = await req.json();
  if (!Number.isInteger(id) || !["paid", "cancelled"].includes(action)) {
    return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  }
  const r = await adminFetch("/rest/v1/rpc/handle_voucher", {
    method: "POST",
    headers: { "x-actor": auth.user.id },
    body: JSON.stringify({ p_id: id, p_action: action, p_by: auth.user.id }),
  });
  if (!r.ok) return NextResponse.json({ error: `處理失敗:${await r.text()}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
