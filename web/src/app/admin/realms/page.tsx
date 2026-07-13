"use client";

import { useEffect, useState } from "react";
import { SUBJECTS } from "@/lib/types";

interface Realm {
  id: number;
  title: string;
  description: string | null;
  subject: string | null;
  target_count: number;
  reward_xp: number;
  reward_coins: number;
  is_team: boolean;
  starts_at: string;
  ends_at: string;
  active: boolean;
}

// datetime-local <-> ISO 轉換(以瀏覽器所在時區的牆上時鐘時間為準)
function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(local: string): string {
  return local ? new Date(local).toISOString() : "";
}
function inHours(h: number): string {
  return toLocalInput(new Date(Date.now() + h * 3600000).toISOString());
}

const emptyForm = () => ({
  title: "", description: "", subject: "", target_count: 30,
  reward_xp: 100, reward_coins: 100, is_team: false,
  starts_at: toLocalInput(new Date().toISOString()),
  ends_at: inHours(72),
});

export default function AdminRealmsPage() {
  const [realms, setRealms] = useState<Realm[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [edit, setEdit] = useState<Realm | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/realms");
    if (r.status === 403 || r.status === 401) { setDenied(true); setLoading(false); return; }
    const d = await r.json();
    setRealms(d.realms ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function api(method: string, body: object) {
    const r = await fetch("/api/admin/realms", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { setMsg("失敗:" + d.error); return false; }
    setMsg("已儲存 ✅"); load(); return true;
  }

  async function create() {
    if (!form.title || !form.target_count) { setMsg("需填標題與目標題數"); return; }
    const ok = await api("POST", { ...form, starts_at: fromLocalInput(form.starts_at), ends_at: fromLocalInput(form.ends_at) });
    if (ok) setForm(emptyForm());
  }
  async function saveEdit() {
    if (!edit) return;
    if (await api("PATCH", { ...edit, starts_at: fromLocalInput(toLocalInput(edit.starts_at)), ends_at: fromLocalInput(toLocalInput(edit.ends_at)) }))
      setEdit(null);
  }
  async function toggleActive(r: Realm) { api("PATCH", { id: r.id, active: !r.active }); }
  async function del(r: Realm) {
    if (!confirm(`刪除秘境「${r.title}」?已加入的玩家進度會一併消失。`)) return;
    api("DELETE", { id: r.id });
  }

  if (denied)
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-bold">🔒 需要管理者權限</p>
        <p className="mt-1 text-sm text-slate-500">只有老師/家長角色能發布秘境。</p>
      </div>
    );
  if (loading) return <p className="py-12 text-center text-slate-500">載入中…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🗺️ 秘境管理</h1>
        <a href="/admin" className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">← 管理主控台</a>
      </div>
      <p className="text-sm text-slate-500">發布限時懸賞任務,學生做題累積進度、達標領獎。可設定為團體任務(全員進度加總)。</p>
      {msg && <p className="rounded-lg bg-amber-50 p-2 text-center text-sm text-amber-700">{msg}</p>}

      {/* 新增 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold">➕ 發布新秘境</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="rounded-lg border border-slate-300 px-3 py-2 sm:col-span-2" placeholder="標題(例:期中考衝刺秘境)"
            value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea className="rounded-lg border border-slate-300 px-3 py-2 sm:col-span-2" placeholder="說明(選填)" rows={2}
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <select className="rounded-lg border border-slate-300 px-3 py-2"
            value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
            <option value="">全科</option>
            {SUBJECTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <input type="number" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="目標題數"
            value={form.target_count} onChange={(e) => setForm({ ...form, target_count: Number(e.target.value) })} />
          <input type="number" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="獎勵 XP"
            value={form.reward_xp} onChange={(e) => setForm({ ...form, reward_xp: Number(e.target.value) })} />
          <input type="number" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="獎勵金幣"
            value={form.reward_coins} onChange={(e) => setForm({ ...form, reward_coins: Number(e.target.value) })} />
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <input type="checkbox" checked={form.is_team} onChange={(e) => setForm({ ...form, is_team: e.target.checked })} />
            👥 團體任務(全員進度加總達標,每人各領一份獎勵)
          </label>
          <div />
          <label className="text-xs text-slate-500">開始時間
            <input type="datetime-local" className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></label>
          <label className="text-xs text-slate-500">結束時間(限時)
            <input type="datetime-local" className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></label>
        </div>
        <button onClick={create} className="mt-3 w-full rounded-lg accent-bg py-2.5 font-semibold text-white">發布秘境</button>
      </section>

      {/* 列表 */}
      <section className="space-y-2">
        <h2 className="font-bold">所有秘境({realms.length})</h2>
        {realms.map((r) => {
          const now = Date.now();
          const open = r.active && new Date(r.starts_at).getTime() <= now && now <= new Date(r.ends_at).getTime();
          return (
            <div key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
              {edit?.id === r.id ? (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className="rounded-lg border border-slate-300 px-3 py-2 sm:col-span-2" placeholder="標題"
                      value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                    <input type="number" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="目標題數"
                      value={edit.target_count} onChange={(e) => setEdit({ ...edit, target_count: Number(e.target.value) })} />
                    <input type="number" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="獎勵 XP"
                      value={edit.reward_xp} onChange={(e) => setEdit({ ...edit, reward_xp: Number(e.target.value) })} />
                    <input type="number" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="獎勵金幣"
                      value={edit.reward_coins} onChange={(e) => setEdit({ ...edit, reward_coins: Number(e.target.value) })} />
                    <label className="text-xs text-slate-500">結束時間
                      <input type="datetime-local" className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                        value={toLocalInput(edit.ends_at)} onChange={(e) => setEdit({ ...edit, ends_at: e.target.value })} /></label>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="rounded-lg accent-bg px-4 py-1.5 text-sm font-semibold text-white">儲存</button>
                    <button onClick={() => setEdit(null)} className="rounded-lg bg-slate-100 px-4 py-1.5 text-sm">取消</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {r.is_team && "👥 "}{r.title}
                      {open ? (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">進行中</span>
                      ) : (
                        <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">{r.active ? "未開始/已結束" : "已下架"}</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {r.subject ? SUBJECTS.find((s) => s.key === r.subject)?.label : "全科"}・{r.target_count} 題・
                      🎁 {r.reward_xp}XP {r.reward_coins}🪙・結束 {new Date(r.ends_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => toggleActive(r)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">{r.active ? "下架" : "上架"}</button>
                    <button onClick={() => setEdit(r)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">編輯</button>
                    <button onClick={() => del(r)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-600">刪除</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
