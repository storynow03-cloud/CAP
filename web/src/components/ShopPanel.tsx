"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RARITY, rarityOf, SHOP_TYPE_LABEL, type ShopRow } from "@/lib/gamify";

type EquipType = "theme" | "frame" | "nameplate" | "title";
const EQUIP_COL: Record<EquipType, string> = {
  theme: "equipped_theme", frame: "equipped_frame", nameplate: "equipped_nameplate", title: "equipped_title",
};
const EQUIP_TYPES = ["theme", "frame", "nameplate", "title"];
const ORDER = ["theme", "frame", "nameplate", "title", "booster"];

const BUY_ERR: Record<string, string> = {
  NOT_ENOUGH_COINS: "金幣不足 🪙",
  ALREADY_OWNED: "你已經擁有了",
  FREE_ITEM: "這是免費預設款",
};

interface Equipped {
  coins: number;
  equipped_theme: string | null;
  equipped_frame: string | null;
  equipped_nameplate: string | null;
  equipped_title: string | null;
  boost_xp2x_left: number;
  boost_coin2x_left: number;
}

const USE_ERR: Record<string, string> = { NO_ITEM: "沒有這個道具,先去買吧!" };

function ItemFace({ item, size = "md" }: { item: ShopRow; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "h-12 w-12" : "h-9 w-9";
  if (item.type === "theme")
    return <div className={`mx-auto ${dim} rounded-full`} style={{ backgroundColor: item.value }} />;
  if (item.type === "nameplate")
    return <div className={`mx-auto ${dim} rounded-lg`} style={{ background: item.value }} />;
  if (item.type === "title")
    return <div className="text-lg font-bold">{item.value}</div>;
  return <div className={size === "lg" ? "text-4xl" : "text-2xl"}>{item.value}</div>;
}

export default function ShopPanel() {
  const [rows, setRows] = useState<ShopRow[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [inventory, setInventory] = useState<Map<string, number>>(new Map());
  const [eq, setEq] = useState<Equipped | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const uid = u.user.id;
    const [{ data: shop }, { data: items }, { data: p }, { data: inv }] = await Promise.all([
      supabase.rpc("get_shop"),
      supabase.from("user_items").select("key").eq("user_id", uid),
      supabase.from("profiles").select("coins,equipped_theme,equipped_frame,equipped_nameplate,equipped_title,boost_xp2x_left,boost_coin2x_left").eq("id", uid).maybeSingle(),
      supabase.from("inventory").select("item_key,qty").eq("user_id", uid),
    ]);
    setRows((shop as ShopRow[]) ?? []);
    setOwned(new Set((items ?? []).map((i) => i.key)));
    setInventory(new Map((inv ?? []).map((r) => [r.item_key, r.qty])));
    setEq(p as Equipped);
    setLoading(false);
  }, []);

  async function useBooster(key: "booster_xp2x" | "booster_coin2x") {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("use_booster", { p_key: key });
    setBusy(false);
    if (error) { setMsg(USE_ERR[error.message] ?? "使用失敗:" + error.message); return; }
    setMsg(key === "booster_xp2x" ? "⚡ XP 加倍已啟動,接下來 5 題 XP 雙倍!" : "💰 金幣加倍已啟動,接下來 5 題金幣雙倍!");
    load();
  }

  useEffect(() => { load(); }, [load]);

  async function buy(key: string) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("buy_item", { p_key: key });
    setBusy(false);
    if (error) { setMsg(BUY_ERR[error.message] ?? "購買失敗:" + error.message); return; }
    setMsg("購買成功!點「裝備」即可使用 ✨");
    load();
  }

  async function equip(key: string, type: EquipType) {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("profiles").update({ [EQUIP_COL[type]]: key }).eq("id", u.user!.id);
    setMsg("已裝備!主題色需重新整理頁面看效果");
    load();
  }

  async function unequip(type: EquipType) {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("profiles").update({ [EQUIP_COL[type]]: null }).eq("id", u.user!.id);
    setMsg("已卸下");
    load();
  }

  async function gacha() {
    if (!eq) return;
    const price = 80;
    if (eq.coins < price) { setMsg("金幣不足 🪙(轉蛋要 80)"); return; }
    const pool = rows.filter((i) => EQUIP_TYPES.includes(i.type) && !owned.has(i.key));
    setBusy(true);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (pool.length === 0) {
      await supabase.from("profiles").update({ coins: eq.coins - price + 40 }).eq("id", u.user!.id);
      setMsg("你已收集所有裝扮!退回 40 金幣 🪙");
    } else {
      const win = pool[Math.floor(Math.random() * pool.length)];
      await supabase.from("user_items").upsert({ user_id: u.user!.id, key: win.key });
      await supabase.from("profiles").update({ coins: eq.coins - price }).eq("id", u.user!.id);
      setMsg(`🎉 轉蛋抽中:${win.label}(${RARITY[rarityOf(win.rarity)].label})!`);
    }
    setBusy(false);
    load();
  }

  if (loading || !eq) return <p className="py-12 text-center text-slate-500">載入中…</p>;

  const featured = rows.filter((r) => r.is_featured);
  const equippedKey = (type: EquipType) =>
    type === "theme" ? eq.equipped_theme : type === "frame" ? eq.equipped_frame
      : type === "nameplate" ? eq.equipped_nameplate : eq.equipped_title;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">🛍️ 官方商城</h2>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">🪙 {eq.coins}</span>
      </div>
      {msg && <p className="rounded-lg bg-amber-50 p-2 text-center text-sm text-amber-700">{msg}</p>}

      {/* 每日精選 */}
      {featured.length > 0 && (
        <section className="rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 p-4 text-white shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold">🔥 今日精選・限時 7 折</p>
            <span className="text-xs opacity-90">每天輪換</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {featured.map((item) => {
              const have = owned.has(item.key);
              return (
                <div key={item.key} className="rounded-xl bg-white/15 p-2 text-center backdrop-blur">
                  <ItemFace item={item} />
                  <p className="mt-1 truncate text-xs font-semibold">{item.label}</p>
                  {have ? (
                    <span className="text-xs opacity-80">已擁有</span>
                  ) : (
                    <button onClick={() => buy(item.key)} disabled={busy}
                      className="mt-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-rose-600 disabled:opacity-50">
                      <span className="line-through opacity-50">{item.price}</span> 🪙{item.effective_price}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 轉蛋 */}
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-pink-500 to-violet-500 p-4 text-white shadow-sm">
        <div>
          <p className="font-bold">🥚 神秘轉蛋</p>
          <p className="text-xs opacity-90">隨機抽一個裝扮(可能抽到傳說款)</p>
        </div>
        <button onClick={gacha} disabled={busy} className="rounded-full bg-white/25 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/35 disabled:opacity-50">
          🪙 80 轉一次
        </button>
      </div>

      {/* 加成道具:目前生效中提示 */}
      {(eq.boost_xp2x_left > 0 || eq.boost_coin2x_left > 0) && (
        <section className="flex flex-wrap gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">
          {eq.boost_xp2x_left > 0 && <span>⚡ XP 加倍生效中,剩 {eq.boost_xp2x_left} 題</span>}
          {eq.boost_coin2x_left > 0 && <span>💰 金幣加倍生效中,剩 {eq.boost_coin2x_left} 題</span>}
        </section>
      )}

      {/* 分類商品 */}
      {ORDER.map((type) => {
        const list = rows.filter((r) => r.type === type);
        if (!list.length) return null;
        const isBooster = type === "booster";
        return (
          <section key={type}>
            <h3 className="mb-2 font-bold">{SHOP_TYPE_LABEL[type] ?? type}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {list.map((item) => {
                const rar = RARITY[rarityOf(item.rarity)];
                const have = owned.has(item.key) || item.price === 0;
                const isEq = !isBooster && equippedKey(type as EquipType) === item.key;
                const qty = inventory.get(item.key) ?? 0;
                return (
                  <div key={item.key} className={`rounded-2xl bg-white p-3 text-center ${rar.ring} ${rar.glow}`}>
                    <div className="mb-1 flex justify-center">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${rar.chip}`}>{rar.label}</span>
                    </div>
                    <ItemFace item={item} size="lg" />
                    <p className="mt-1 truncate text-sm font-semibold">{item.label}</p>
                    {isBooster ? (
                      <div className="mt-1 space-y-1">
                        <p className="text-[10px] text-slate-400">擁有 {qty}</p>
                        <div className="flex gap-1">
                          <button onClick={() => buy(item.key)} disabled={busy}
                            className="flex-1 rounded-full bg-amber-500 px-2 py-1 text-xs text-white disabled:opacity-50">🪙 {item.price}</button>
                          {(item.key === "booster_xp2x" || item.key === "booster_coin2x") && (
                            <button onClick={() => useBooster(item.key as "booster_xp2x" | "booster_coin2x")} disabled={busy || qty <= 0}
                              className="flex-1 rounded-full accent-bg px-2 py-1 text-xs text-white disabled:opacity-40">使用</button>
                          )}
                        </div>
                        {item.key === "booster_hint" && <p className="text-[10px] text-slate-400">練習作答時可直接使用</p>}
                      </div>
                    ) : isEq ? (
                      <button onClick={() => unequip(type as EquipType)}
                        className="mt-1 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">使用中・卸下</button>
                    ) : have ? (
                      <button onClick={() => equip(item.key, type as EquipType)}
                        className="mt-1 rounded-full accent-bg px-3 py-1 text-xs text-white">裝備</button>
                    ) : item.is_featured ? (
                      <button onClick={() => buy(item.key)} disabled={busy}
                        className="mt-1 rounded-full bg-rose-500 px-3 py-1 text-xs text-white disabled:opacity-50">
                        <span className="line-through opacity-60">{item.price}</span> 🪙{item.effective_price}
                      </button>
                    ) : (
                      <button onClick={() => buy(item.key)} disabled={busy}
                        className="mt-1 rounded-full bg-amber-500 px-3 py-1 text-xs text-white disabled:opacity-50">🪙 {item.price}</button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
