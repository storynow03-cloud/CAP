"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { stripHtml } from "@/lib/html";

/**
 * 操作紀錄:誰在什麼時候改了哪一筆資料、改了什麼。改錯或刪錯時按「還原」回到修改前。
 * 記錄範圍:題目、商城商品/分類、寵物、副本、題目回報(觸發器自動記錄,腳本改的也算)。
 */

interface Log {
  id: number;
  at: string;
  actor: string | null;
  table_name: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  row_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  restored_from: number | null;
}

const TABLE_LABEL: Record<string, string> = {
  questions: "題目", shop_items: "商城商品", shop_categories: "商城分類",
  pet_defs: "寵物", realms: "副本", question_reports: "題目回報",
};
const OP_LABEL = { INSERT: "新增", UPDATE: "修改", DELETE: "刪除" };
const OP_COLOR = { INSERT: "bg-emerald-100 text-emerald-700", UPDATE: "bg-sky-100 text-sky-700", DELETE: "bg-rose-100 text-rose-700" };

const show = (v: unknown) => {
  if (v == null) return "(空)";
  const s = typeof v === "string" ? stripHtml(v) : JSON.stringify(v);
  return s.length > 120 ? s.slice(0, 120) + "…" : s;
};

function changedKeys(l: Log): string[] {
  if (l.op !== "UPDATE") return [];
  const keys = new Set([...Object.keys(l.before ?? {}), ...Object.keys(l.after ?? {})]);
  return [...keys].filter((k) => JSON.stringify(l.before?.[k]) !== JSON.stringify(l.after?.[k]));
}

export default function AdminAuditPage() {
  const [table, setTable] = useState("");
  const [rowId, setRowId] = useState("");
  const [offset, setOffset] = useState(0);
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [nick, setNick] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async (off = 0) => {
    setError("");
    const r = await fetch(`/api/admin/audit?${new URLSearchParams({ table, rowId, offset: String(off) })}`);
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? "讀取失敗"); setLogs([]); return; }
    setLogs(d.logs);
    setNick(d.nick);
    setOffset(off);
  }, [table, rowId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(0); }, [table]);

  async function restore(l: Log) {
    const what = `${TABLE_LABEL[l.table_name] ?? l.table_name} ${l.row_id}`;
    const how = l.op === "UPDATE" ? "改回修改前的內容" : l.op === "DELETE" ? "把刪掉的資料放回去" : "刪除這筆新增的資料";
    if (!confirm(`確定要還原「${what}」?\n會${how}。還原也會留下紀錄,之後仍可再還原。`)) return;
    setBusy(l.id);
    const r = await fetch("/api/admin/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: l.id }) });
    setBusy(null);
    if (!r.ok) { alert((await r.json()).error ?? "還原失敗"); return; }
    load(0);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🧾 操作紀錄</h1>
        <Link href="/admin" className="text-sm text-indigo-600">← 返回管理後台</Link>
      </div>
      <p className="text-sm text-slate-500">
        題目、商城、寵物、副本、題目回報的每一次新增/修改/刪除都會自動記錄(包含程式批次修題)。改錯或刪錯時,按「還原」就能回到修改前。
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <select value={table} onChange={(e) => setTable(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">全部資料表</option>
          {Object.entries(TABLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={rowId} onChange={(e) => setRowId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(0)}
          placeholder="資料編號(例:math-0811412)" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <button onClick={() => load(0)} className="rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white">查詢</button>
      </div>

      {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {!logs && <p className="py-12 text-center text-slate-400">載入中…</p>}
      {logs && !error && logs.length === 0 && <p className="py-12 text-center text-slate-400">沒有紀錄</p>}

      <div className="space-y-2">
        {logs?.map((l) => {
          const keys = changedKeys(l);
          return (
            <div key={l.id} className="rounded-xl bg-white p-3 text-sm shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${OP_COLOR[l.op]}`}>{OP_LABEL[l.op]}</span>
                <span className="font-semibold">{TABLE_LABEL[l.table_name] ?? l.table_name}</span>
                <span className="text-slate-500">{l.row_id}</span>
                {l.restored_from && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">還原自 #{l.restored_from}</span>}
                <span className="ml-auto text-xs text-slate-400">
                  {new Date(l.at).toLocaleString("zh-TW")}・{l.actor ? nick[l.actor] ?? "管理者" : "系統/腳本"}
                </span>
                <button disabled={busy === l.id} onClick={() => restore(l)}
                  className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-semibold text-amber-700 disabled:opacity-40">↩ 還原</button>
              </div>
              {l.op === "UPDATE" && (
                <div className="mt-2 space-y-1 text-xs">
                  {keys.slice(0, 6).map((k) => (
                    <div key={k} className="grid grid-cols-[6rem_1fr] gap-2">
                      <span className="font-semibold text-slate-500">{k}</span>
                      <span>
                        <span className="text-rose-600 line-through">{show(l.before?.[k])}</span>
                        <span className="mx-1 text-slate-400">→</span>
                        <span className="text-emerald-700">{show(l.after?.[k])}</span>
                      </span>
                    </div>
                  ))}
                  {keys.length > 6 && <p className="text-slate-400">…還有 {keys.length - 6} 個欄位</p>}
                </div>
              )}
              {l.op !== "UPDATE" && (
                <p className="mt-1 truncate text-xs text-slate-500">{show(l.before ?? l.after)}</p>
              )}
            </div>
          );
        })}
      </div>
      {logs && logs.length > 0 && (
        <div className="flex justify-between">
          <button disabled={offset === 0} onClick={() => load(Math.max(0, offset - 50))} className="rounded-full bg-white px-3 py-1 text-xs shadow-sm disabled:opacity-40">← 較新</button>
          <button disabled={logs.length < 50} onClick={() => load(offset + 50)} className="rounded-full bg-white px-3 py-1 text-xs shadow-sm disabled:opacity-40">較舊 →</button>
        </div>
      )}
    </div>
  );
}
