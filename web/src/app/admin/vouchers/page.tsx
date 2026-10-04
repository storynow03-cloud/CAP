"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/** 現金券兌換:孩子用金幣兌換的現金券,家長給現金後按「已發放」;按錯或要退款按「取消」會退回金幣。 */

interface Item {
  id: number; user_id: string; item_key: string; amount: number; coins: number;
  status: "pending" | "paid" | "cancelled"; created_at: string; handled_at: string | null;
}

export default function AdminVouchersPage() {
  const [status, setStatus] = useState<"pending" | "all">("pending");
  const [items, setItems] = useState<Item[] | null>(null);
  const [nick, setNick] = useState<Record<string, string>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    const r = await fetch(`/api/admin/vouchers?status=${status}`);
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? "讀取失敗"); setItems([]); return; }
    setItems(d.items);
    setNick(d.nick);
    setLabels(d.labels ?? {});
  }, [status]);
  useEffect(() => { load(); }, [load]);

  async function act(it: Item, action: "paid" | "cancelled") {
    const who = nick[it.user_id] ?? "孩子";
    const what = it.amount > 0 ? `${it.amount} 元現金券` : labels[it.item_key] ?? "特權券";
    if (action === "cancelled" && !confirm(`取消 ${who} 的 ${what},退回 ${it.coins} 金幣?`)) return;
    setBusy(it.id);
    const r = await fetch("/api/admin/vouchers", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, action }),
    });
    setBusy(null);
    if (!r.ok) { alert((await r.json()).error ?? "處理失敗"); return; }
    load();
  }

  const pendingTotal = (items ?? []).filter((i) => i.status === "pending").reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">💵 現金券・特權券兌換</h1>
        <Link href="/admin" className="text-sm text-indigo-600">← 返回管理後台</Link>
      </div>
      <p className="text-sm text-slate-500">孩子在商城用金幣兌換現金券(100 金幣 = 1 元)或特權券。給孩子現金/兌現特權後按「已發放」。特權券要在「商城管理」啟用才會出現在商城。</p>
      <div className="flex items-center gap-2">
        {(["pending", "all"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${status === s ? "bg-emerald-600 text-white" : "bg-white text-slate-600 shadow-sm"}`}>
            {s === "pending" ? "待發放" : "全部紀錄"}
          </button>
        ))}
        {pendingTotal > 0 && <span className="ml-auto text-sm font-bold text-amber-600">待發放合計 {pendingTotal} 元</span>}
      </div>
      {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {!items && <p className="py-12 text-center text-slate-400">載入中…</p>}
      {items && !error && items.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">沒有{status === "pending" ? "待發放的" : ""}兌換紀錄</p>}
      <div className="space-y-2">
        {items?.map((it) => (
          <div key={it.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
            <span className={`font-black ${it.amount > 0 ? "text-2xl text-emerald-600" : "text-base text-sky-600"}`}>
              {it.amount > 0 ? `$${it.amount}` : labels[it.item_key] ?? it.item_key}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{nick[it.user_id] ?? "?"}</p>
              <p className="text-xs text-slate-400">{new Date(it.created_at).toLocaleString("zh-TW")}・花 {it.coins} 金幣</p>
            </div>
            {it.status === "pending" ? (
              <div className="flex gap-2">
                <button disabled={busy === it.id} onClick={() => act(it, "paid")} className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">✅ 已發放</button>
                <button disabled={busy === it.id} onClick={() => act(it, "cancelled")} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40">取消退金幣</button>
              </div>
            ) : (
              <span className={`text-sm ${it.status === "paid" ? "text-emerald-600" : "text-slate-400"}`}>
                {it.status === "paid" ? "已發放" : "已取消"}{it.handled_at ? `・${new Date(it.handled_at).toLocaleDateString("zh-TW")}` : ""}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
