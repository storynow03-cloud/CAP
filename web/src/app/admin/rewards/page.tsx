"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/** 發放獎勵(L1/L2 家長):給孩子金幣或商城商品,可附一句話;孩子在商城看得到。 */

interface Student { id: string; nickname: string; coins: number }
interface Item { key: string; label: string; type: string; value: string; price: number; active: boolean }
interface Grant { id: number; user_id: string; granted_by: string | null; kind: string; item_key: string | null; coins: number; note: string | null; created_at: string }

const TYPE_LABEL: Record<string, string> = {
  voucher: "💵 現金券", privilege: "🎟️ 特權券", booster: "⚡ 加成道具", food: "🍖 寵物食物",
  title: "🏅 稱號", frame: "🖼️ 頭像框", nameplate: "🏷️ 名牌底圖", theme: "🎨 主題色",
};
const TYPE_ORDER = Object.keys(TYPE_LABEL);

export default function AdminRewardsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [nick, setNick] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<"coins" | "item">("coins");
  const [coins, setCoins] = useState(100);
  const [itemKey, setItemKey] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/rewards");
    const d = await r.json();
    setLoading(false);
    if (!r.ok) { setError(d.error ?? "讀取失敗"); return; }
    setStudents(d.students); setItems(d.items); setGrants(d.grants); setNick(d.nick);
    setTo((cur) => cur || d.students[0]?.id || "");
  }, []);
  useEffect(() => { load(); }, [load]);

  const labelOf = (k: string | null) => items.find((i) => i.key === k)?.label ?? k ?? "";

  async function send() {
    const who = nick[to] ?? "孩子";
    const what = kind === "coins" ? `${coins} 金幣` : labelOf(itemKey);
    if (!to || (kind === "item" && !itemKey)) return;
    if (!confirm(`發給 ${who}:${what}${note ? `\n留言:${note}` : ""}?`)) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/rewards", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: to, kind, coins, itemKey, note }),
    });
    setBusy(false);
    const d = await r.json();
    if (!r.ok) { setMsg(`❌ ${d.error}`); return; }
    setMsg(`✅ 已發給 ${who}:${what}`);
    setNote("");
    load();
  }

  if (loading) return <p className="py-12 text-center text-slate-400">載入中…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🎁 發放獎勵</h1>
        <Link href="/admin" className="text-sm text-indigo-600">← 返回管理後台</Link>
      </div>
      <p className="text-sm text-slate-500">
        給孩子金幣,或商城裡的任何一件商品(現金券、特權券、道具、裝扮)。現金券/特權券會出現在孩子的「待兌現」清單;
        孩子在商城看得到誰送了什麼、你的留言。
      </p>
      {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

      {!error && (
        <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
          <label className="block text-sm font-semibold">發給
            <select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
              {students.map((s) => <option key={s.id} value={s.id}>{s.nickname}(目前 {s.coins} 金幣)</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            {(["coins", "item"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${kind === k ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                {k === "coins" ? "🪙 金幣" : "🛍️ 商品"}
              </button>
            ))}
          </div>
          {kind === "coins" ? (
            <div className="flex flex-wrap items-center gap-2">
              {[50, 100, 300, 500, 1000].map((v) => (
                <button key={v} onClick={() => setCoins(v)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${coins === v ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700"}`}>{v}</button>
              ))}
              <input type="number" min={1} max={50000} value={coins} onChange={(e) => setCoins(Number(e.target.value))}
                className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
              <span className="text-xs text-slate-500">金幣(100 金幣 = 1 元現金券價值)</span>
            </div>
          ) : (
            <select value={itemKey} onChange={(e) => setItemKey(e.target.value)} className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">選擇商品…</option>
              {TYPE_ORDER.map((t) => {
                const list = items.filter((i) => i.type === t);
                if (!list.length) return null;
                return (
                  <optgroup key={t} label={TYPE_LABEL[t]}>
                    {list.map((i) => <option key={i.key} value={i.key}>{i.label}{i.active ? "" : "(商城未上架)"}</option>)}
                  </optgroup>
                );
              })}
            </select>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={60}
            placeholder="給孩子的一句話(選填),例如:這次數學進步很多!" className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex items-center gap-3">
            <button onClick={send} disabled={busy || !to || (kind === "item" && !itemKey)}
              className="rounded-full bg-rose-500 px-6 py-2 font-semibold text-white disabled:opacity-40">🎁 發放</button>
            {msg && <span className="text-sm">{msg}</span>}
          </div>
        </div>
      )}

      {grants.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-500">最近發放紀錄</p>
          {grants.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
              <span className="font-semibold">{nick[g.user_id] ?? "?"}</span>
              <span>{g.kind === "coins" ? `🪙 ${g.coins} 金幣` : labelOf(g.item_key)}</span>
              {g.note && <span className="text-slate-500">「{g.note}」</span>}
              <span className="ml-auto text-xs text-slate-400">
                {g.granted_by ? nick[g.granted_by] ?? "家長" : "系統"}・{new Date(g.created_at).toLocaleString("zh-TW")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
