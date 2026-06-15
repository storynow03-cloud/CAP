"use client";

import { useEffect, useState } from "react";

interface UserRow {
  id: string;
  email: string;
  nickname?: string;
  role?: string;
  xp?: number;
  confirmed?: boolean;
  created_at: string;
}

const ROLE_LABEL: Record<string, string> = { student: "學生", parent: "家長", teacher: "老師" };

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [msg, setMsg] = useState("");
  // 新增表單
  const [form, setForm] = useState({ email: "", password: "", nickname: "", role: "student" });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ nickname: "", role: "student", password: "" });

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/users");
    if (r.status === 403 || r.status === 401) { setDenied(true); setLoading(false); return; }
    const d = await r.json();
    setUsers(d.users ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setMsg("");
    const r = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json();
    if (!r.ok) { setMsg("建立失敗:" + d.error); return; }
    setMsg("已建立 " + form.email);
    setForm({ email: "", password: "", nickname: "", role: "student" });
    load();
  }

  async function saveEdit(id: string) {
    const body: Record<string, unknown> = { id, nickname: edit.nickname, role: edit.role };
    if (edit.password) body.password = edit.password;
    const r = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { setMsg("更新失敗:" + d.error); return; }
    setMsg("已更新");
    setEditing(null);
    load();
  }

  async function remove(u: UserRow) {
    if (!confirm(`確定刪除 ${u.email}?此帳號的所有學習紀錄都會一併刪除,無法復原。`)) return;
    const r = await fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id }) });
    const d = await r.json();
    if (!r.ok) { setMsg("刪除失敗:" + d.error); return; }
    setMsg("已刪除 " + u.email);
    load();
  }

  if (denied)
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-bold">🔒 需要管理者權限</p>
        <p className="mt-1 text-sm text-slate-500">只有老師/家長角色能管理帳號。</p>
      </div>
    );
  if (loading) return <p className="py-12 text-center text-slate-500">載入中…</p>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">🛠️ 帳號管理</h1>
      {msg && <p className="rounded-lg bg-amber-50 p-2 text-center text-sm text-amber-700">{msg}</p>}

      {/* 新增帳號 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold">➕ 新增帳號</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Email"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="密碼(至少 6 碼)"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="暱稱"
            value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
          <select className="rounded-lg border border-slate-300 px-3 py-2"
            value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="student">學生</option>
            <option value="parent">家長(可管理)</option>
            <option value="teacher">老師(可管理)</option>
          </select>
        </div>
        <button onClick={create} className="mt-3 w-full rounded-lg accent-bg py-2.5 font-semibold text-white">建立帳號</button>
      </section>

      {/* 帳號列表 */}
      <section className="space-y-2">
        <h2 className="font-bold">所有帳號({users.length})</h2>
        {users.map((u) => (
          <div key={u.id} className="rounded-2xl bg-white p-4 shadow-sm">
            {editing === u.id ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-500">{u.email}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="暱稱"
                    value={edit.nickname} onChange={(e) => setEdit({ ...edit, nickname: e.target.value })} />
                  <select className="rounded-lg border border-slate-300 px-3 py-2"
                    value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                    <option value="student">學生</option>
                    <option value="parent">家長</option>
                    <option value="teacher">老師</option>
                  </select>
                  <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="重設密碼(留空不改)"
                    value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(u.id)} className="rounded-lg accent-bg px-4 py-1.5 text-sm font-semibold text-white">儲存</button>
                  <button onClick={() => setEditing(null)} className="rounded-lg bg-slate-100 px-4 py-1.5 text-sm">取消</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {u.nickname || "(無暱稱)"}
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{ROLE_LABEL[u.role || "student"]}</span>
                  </p>
                  <p className="truncate text-xs text-slate-400">{u.email}|XP {u.xp ?? 0}{u.confirmed ? "" : "|未驗證"}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => { setEditing(u.id); setEdit({ nickname: u.nickname || "", role: u.role || "student", password: "" }); }}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">編輯</button>
                  <button onClick={() => remove(u)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-600">刪除</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
