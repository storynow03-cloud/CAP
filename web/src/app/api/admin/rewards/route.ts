import { NextRequest, NextResponse } from "next/server";
import { requireViewer, adminFetch } from "@/lib/supabase/admin";

/**
 * 發放獎勵(L1 管理者與 L2 家長都可用):給孩子金幣,或任一件商城商品(現金券/特權券/道具/裝扮)。
 * GET  → 學生清單、可發放的商品(含下架的特權券)、最近 50 筆發放紀錄
 * POST { userId, kind: "coins" | "item", coins?, itemKey?, note? } → 呼叫 grant_reward
 */

export async function GET() {
  const auth = await requireViewer();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const [students, items, grants] = await Promise.all([
    adminFetch("/rest/v1/profiles?role=eq.student&select=id,nickname,coins&order=nickname").then((r) => r.json()),
    adminFetch("/rest/v1/shop_items?select=key,label,type,value,price,active&order=type,sort").then((r) => r.json()),
    adminFetch("/rest/v1/reward_grants?select=*&order=id.desc&limit=50").then((r) => r.json()),
  ]);
  if (!Array.isArray(grants)) {
    return NextResponse.json(
      { error: "發放獎勵資料表尚未建立:請到 Supabase SQL Editor 執行 supabase/migrations/20261004030000_guardian_rewards_ratio.sql" },
      { status: 500 }
    );
  }
  const by = [...new Set(grants.map((g: { granted_by: string | null }) => g.granted_by).filter(Boolean))];
  const givers = by.length ? await (await adminFetch(`/rest/v1/profiles?id=in.(${by.join(",")})&select=id,nickname`)).json() : [];
  return NextResponse.json({
    students, items, grants,
    nick: Object.fromEntries([...(Array.isArray(students) ? students : []), ...givers].map((p: { id: string; nickname: string }) => [p.id, p.nickname])),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireViewer();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { userId, kind, coins, itemKey, note } = await req.json();
  if (!userId || !["coins", "item"].includes(kind)) return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  const r = await adminFetch("/rest/v1/rpc/grant_reward", {
    method: "POST",
    headers: { "x-actor": auth.user.id },
    body: JSON.stringify({
      p_user: userId, p_kind: kind, p_item_key: kind === "item" ? itemKey : null,
      p_coins: kind === "coins" ? Number(coins) : 0, p_note: note ?? null, p_by: auth.user.id,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    const msg = t.includes("BAD_COINS") ? "金幣數量要在 1~50,000 之間" : t.includes("NOT_STUDENT") ? "只能發給學生帳號" : t.includes("ITEM_NOT_FOUND") ? "找不到這個商品" : `發放失敗:${t}`;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
