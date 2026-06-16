"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchShopItems, type ShopItem } from "@/lib/gamify";

interface Listing {
  id: number;
  item_key: string;
  label: string;
  item_type: string;
  value: string;
  price: number;
  seller_name: string;
  is_mine: boolean;
  created_at: string;
}

const ERR: Record<string, string> = {
  NOT_ENOUGH_COINS: "金幣不足 🪙",
  ALREADY_OWNED: "你已經擁有這個裝扮了",
  OWN_LISTING: "不能買自己上架的東西",
  SOLD_OR_CANCELLED: "手慢了!這件已被買走或下架",
  NOT_OWNED: "你沒有這個道具",
  NOT_TRADEABLE: "這個道具不能交易",
  BAD_PRICE: "請輸入正確的價格",
};

function ItemFace({ type, value }: { type: string; value: string }) {
  return type === "theme" ? (
    <span className="h-8 w-8 shrink-0 rounded-full" style={{ backgroundColor: value }} />
  ) : (
    <span className="text-2xl">{value}</span>
  );
}

export default function MarketPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [coins, setCoins] = useState(0);
  const [ownedTradeable, setOwnedTradeable] = useState<ShopItem[]>([]);
  const [price, setPrice] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const uid = u.user.id;
    const [{ data: market }, { data: p }, { data: items }, shop] = await Promise.all([
      supabase.rpc("get_market"),
      supabase.from("profiles").select("coins").eq("id", uid).maybeSingle(),
      supabase.from("user_items").select("key").eq("user_id", uid),
      fetchShopItems(supabase),
    ]);
    setListings((market as Listing[]) ?? []);
    setCoins(p?.coins ?? 0);
    const ownedKeys = new Set((items ?? []).map((i) => i.key));
    setOwnedTradeable(shop.filter((s) => (s.type === "theme" || s.type === "frame") && ownedKeys.has(s.key)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function rpc(fn: string, args: object): Promise<boolean> {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { setMsg(ERR[error.message] ?? "操作失敗:" + error.message); return false; }
    return true;
  }

  async function list(item: ShopItem) {
    const pr = price[item.key];
    if (!pr || pr <= 0) { setMsg("請先填上架價格"); return; }
    if (await rpc("create_listing", { p_item_key: item.key, p_price: pr })) {
      setMsg(`已上架「${item.label}」🪙 ${pr}`);
      setPrice((s) => ({ ...s, [item.key]: 0 }));
      load();
    }
  }
  async function buy(l: Listing) {
    if (await rpc("buy_listing", { p_id: l.id })) { setMsg(`購買成功!「${l.label}」已入庫 🎉`); load(); }
  }
  async function cancel(l: Listing) {
    if (await rpc("cancel_listing", { p_id: l.id })) { setMsg(`已下架「${l.label}」,道具退回`); load(); }
  }

  if (loading) return <p className="py-12 text-center text-slate-500">載入中…</p>;

  const mine = listings.filter((l) => l.is_mine);
  const others = listings.filter((l) => !l.is_mine);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🏪 交易所</h1>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">🪙 {coins}</span>
      </div>
      <p className="text-sm text-slate-500">把重複或不想要的裝扮賣給別人,換金幣!</p>
      {msg && <p className="rounded-lg bg-amber-50 p-2 text-center text-sm text-amber-700">{msg}</p>}

      {/* 上架我的裝扮 */}
      <section>
        <h2 className="mb-2 font-bold">📤 上架我的裝扮</h2>
        {ownedTradeable.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-400 shadow-sm">
            目前沒有可上架的裝扮(免費預設款不能賣)
          </p>
        ) : (
          <div className="space-y-2">
            {ownedTradeable.map((item) => (
              <div key={item.key} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                <ItemFace type={item.type} value={item.value} />
                <span className="flex-1 truncate text-sm font-semibold">{item.label}</span>
                <input type="number" min={1} placeholder="售價"
                  value={price[item.key] || ""}
                  onChange={(e) => setPrice((s) => ({ ...s, [item.key]: Number(e.target.value) }))}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <button onClick={() => list(item)} disabled={busy}
                  className="rounded-full accent-bg px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">上架</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 我的上架中 */}
      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">🏷️ 我上架中的({mine.length})</h2>
          <div className="space-y-2">
            {mine.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                <ItemFace type={l.item_type} value={l.value} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{l.label}</p>
                  <p className="text-xs text-slate-400">售價 🪙 {l.price}</p>
                </div>
                <button onClick={() => cancel(l)} disabled={busy}
                  className="rounded-full bg-slate-100 px-4 py-1.5 text-sm disabled:opacity-50">下架</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 市集 */}
      <section>
        <h2 className="mb-2 font-bold">🛒 市集({others.length})</h2>
        {others.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-400 shadow-sm">
            目前沒有別人上架的商品
          </p>
        ) : (
          <div className="space-y-2">
            {others.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                <ItemFace type={l.item_type} value={l.value} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{l.label}</p>
                  <p className="text-xs text-slate-400">賣家 {l.seller_name}</p>
                </div>
                <button onClick={() => buy(l)} disabled={busy || coins < l.price}
                  className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                  🪙 {l.price}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
