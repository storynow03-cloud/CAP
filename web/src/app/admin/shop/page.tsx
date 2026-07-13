"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Listing {
  id: number;
  item_key: string;
  label: string;
  item_type: string;
  value: string;
  price: number;
  seller_name: string;
}

interface Category {
  id: number;
  name: string;
  type: string;
  sort: number;
}
interface Item {
  id: number;
  category_id: number | null;
  key: string;
  label: string;
  type: string;
  value: string;
  price: number;
  active: boolean;
  sort: number;
}

const TYPE_LABEL: Record<string, string> = {
  theme: "主題色", frame: "頭像框", nameplate: "名牌底圖", title: "稱號", food: "寵物食物", booster: "加成道具",
};
const TYPE_HINT: Record<string, string> = {
  theme: "內容填色碼,如 #4f46e5",
  frame: "內容填一個 emoji,如 ⭐",
  nameplate: "內容填 CSS 漸層,如 linear-gradient(135deg,#f97316,#ec4899)",
  title: "內容填顯示文字(可含 emoji),如 🌱 新星",
  food: "內容填好感度點數,如 10",
  booster: "內容填一個 emoji 圖示,如 ⚡",
};
const TYPE_OPTIONS = Object.entries(TYPE_LABEL);

const emptyItem = (): Omit<Item, "id"> => ({
  category_id: null,
  key: "",
  label: "",
  type: "theme",
  value: "",
  price: 0,
  active: true,
  sort: 0,
});

export default function AdminShopPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [msg, setMsg] = useState("");

  const [newCat, setNewCat] = useState({ name: "", type: "theme", sort: 0 });
  const [newItem, setNewItem] = useState<Omit<Item, "id">>(emptyItem());
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/shop");
    if (r.status === 403 || r.status === 401) { setDenied(true); setLoading(false); return; }
    const d = await r.json();
    setCategories(d.categories ?? []);
    setItems(d.items ?? []);
    const { data: mk } = await createClient().rpc("admin_get_market");
    setListings((mk as Listing[]) ?? []);
    setLoading(false);
  }

  async function removeListing(l: Listing) {
    if (!confirm(`強制下架「${l.label}」(賣家 ${l.seller_name})?道具會退回賣家。`)) return;
    const { error } = await createClient().rpc("admin_remove_listing", { p_id: l.id });
    if (error) { setMsg("下架失敗:" + error.message); return; }
    setMsg("已下架並退回賣家");
    load();
  }
  useEffect(() => { load(); }, []);

  async function api(method: string, body: object) {
    const r = await fetch("/api/admin/shop", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) { setMsg("失敗:" + d.error); return false; }
    setMsg("已儲存 ✅");
    load();
    return true;
  }

  async function addCategory() {
    if (!newCat.name) { setMsg("請填分類名稱"); return; }
    if (await api("POST", { kind: "category", ...newCat })) setNewCat({ name: "", type: "theme", sort: 0 });
  }
  async function delCategory(c: Category) {
    if (!confirm(`刪除分類「${c.name}」?(底下商品的分類會清空,但商品不會被刪)`)) return;
    api("DELETE", { kind: "category", id: c.id });
  }

  async function addItem() {
    if (!newItem.key || !newItem.label || !newItem.value) { setMsg("商品需填 key、名稱、內容"); return; }
    if (await api("POST", { kind: "item", ...newItem })) setNewItem(emptyItem());
  }
  async function saveItem() {
    if (!editItem) return;
    if (await api("PATCH", { kind: "item", ...editItem })) setEditItem(null);
  }
  async function delItem(it: Item) {
    if (!confirm(`刪除商品「${it.label}」?已購買的玩家仍保有此道具,但商城不再顯示。`)) return;
    api("DELETE", { kind: "item", id: it.id });
  }
  async function toggleActive(it: Item) {
    api("PATCH", { kind: "item", id: it.id, active: !it.active });
  }

  if (denied)
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-bold">🔒 需要管理者權限</p>
        <p className="mt-1 text-sm text-slate-500">只有老師/家長角色能管理商城。</p>
      </div>
    );
  if (loading) return <p className="py-12 text-center text-slate-500">載入中…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🛍️ 商城管理</h1>
        <a href="/admin" className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">← 管理主控台</a>
      </div>
      {msg && <p className="rounded-lg bg-amber-50 p-2 text-center text-sm text-amber-700">{msg}</p>}

      {/* 分類 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold">分類</h2>
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm">
                <b>{c.name}</b>
                <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs">{TYPE_LABEL[c.type] ?? c.type}</span>
                <span className="ml-2 text-xs text-slate-400">排序 {c.sort}</span>
              </span>
              <button onClick={() => delCategory(c)} className="text-sm text-rose-600">刪除</button>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <input className="rounded-lg border border-slate-300 px-3 py-2 sm:col-span-2" placeholder="新分類名稱"
            value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
          <select className="rounded-lg border border-slate-300 px-3 py-2"
            value={newCat.type} onChange={(e) => setNewCat({ ...newCat, type: e.target.value })}>
            {TYPE_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <button onClick={addCategory} className="rounded-lg accent-bg py-2 font-semibold text-white">➕ 新增分類</button>
        </div>
      </section>

      {/* 新增商品 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold">➕ 新增商品</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="key(唯一,如 theme_ocean)"
            value={newItem.key} onChange={(e) => setNewItem({ ...newItem, key: e.target.value })} />
          <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="顯示名稱"
            value={newItem.label} onChange={(e) => setNewItem({ ...newItem, label: e.target.value })} />
          <select className="rounded-lg border border-slate-300 px-3 py-2"
            value={newItem.type} onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}>
            {TYPE_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder={TYPE_HINT[newItem.type]}
            value={newItem.value} onChange={(e) => setNewItem({ ...newItem, value: e.target.value })} />
          <input type="number" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="價格(金幣)"
            value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })} />
          <input type="number" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="排序"
            value={newItem.sort} onChange={(e) => setNewItem({ ...newItem, sort: Number(e.target.value) })} />
        </div>
        <p className="mt-1 text-xs text-slate-400">{TYPE_HINT[newItem.type]}</p>
        <button onClick={addItem} className="mt-3 w-full rounded-lg accent-bg py-2.5 font-semibold text-white">建立商品</button>
      </section>

      {/* 商品列表 */}
      <section className="space-y-2">
        <h2 className="font-bold">所有商品({items.length})</h2>
        {items.map((it) => (
          <div key={it.id} className="rounded-2xl bg-white p-4 shadow-sm">
            {editItem?.id === it.id ? (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="顯示名稱"
                    value={editItem.label} onChange={(e) => setEditItem({ ...editItem, label: e.target.value })} />
                  <select className="rounded-lg border border-slate-300 px-3 py-2"
                    value={editItem.type} onChange={(e) => setEditItem({ ...editItem, type: e.target.value })}>
                    {TYPE_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                  <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder={TYPE_HINT[editItem.type]}
                    value={editItem.value} onChange={(e) => setEditItem({ ...editItem, value: e.target.value })} />
                  <input type="number" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="價格"
                    value={editItem.price} onChange={(e) => setEditItem({ ...editItem, price: Number(e.target.value) })} />
                  <input type="number" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="排序"
                    value={editItem.sort} onChange={(e) => setEditItem({ ...editItem, sort: Number(e.target.value) })} />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveItem} className="rounded-lg accent-bg px-4 py-1.5 text-sm font-semibold text-white">儲存</button>
                  <button onClick={() => setEditItem(null)} className="rounded-lg bg-slate-100 px-4 py-1.5 text-sm">取消</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  {it.type === "theme" ? (
                    <span className="h-7 w-7 shrink-0 rounded-full" style={{ backgroundColor: it.value }} />
                  ) : it.type === "nameplate" ? (
                    <span className="h-7 w-9 shrink-0 rounded-lg" style={{ background: it.value }} />
                  ) : it.type === "title" ? (
                    <span className="text-sm font-bold">{it.value}</span>
                  ) : (
                    <span className="text-2xl">{it.value}</span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {it.label}
                      {!it.active && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">已下架</span>}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {TYPE_LABEL[it.type] ?? it.type}|🪙 {it.price}|{it.key}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => toggleActive(it)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">{it.active ? "下架" : "上架"}</button>
                  <button onClick={() => setEditItem(it)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">編輯</button>
                  <button onClick={() => delItem(it)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-600">刪除</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* 玩家交易所 moderation */}
      <section className="space-y-2">
        <h2 className="font-bold">🤝 玩家交易所(上架中 {listings.length})</h2>
        {listings.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-400 shadow-sm">目前沒有玩家上架的商品</p>
        ) : (
          listings.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 rounded-2xl bg-white p-3 shadow-sm">
              <div className="flex min-w-0 items-center gap-2">
                {l.item_type === "theme" ? (
                  <span className="h-7 w-7 shrink-0 rounded-full" style={{ backgroundColor: l.value }} />
                ) : (
                  <span className="text-2xl">{l.value}</span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold">{l.label}</p>
                  <p className="truncate text-xs text-slate-400">賣家 {l.seller_name}|🪙 {l.price}</p>
                </div>
              </div>
              <button onClick={() => removeListing(l)} className="shrink-0 rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-600">強制下架</button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
