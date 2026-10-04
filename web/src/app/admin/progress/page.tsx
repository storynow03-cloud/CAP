"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StudentDetail, { type Detail } from "@/components/StudentDetail";

interface StudentRow {
  id: string;
  nickname: string;
  role: string;
  xp: number;
  loginStreak: number;
  todayTotal: number;
  todayCorrect: number;
  weekTotal: number;
  weekCorrect: number;
  weekMinutes: number;
  wrongCount: number;
  lastActiveAt: string | null;
}

/** 距今多久(讓家長一眼看出孩子多久沒練了) */
function ago(iso: string | null) {
  if (!iso) return "從未作答";
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return "剛剛";
  if (h < 24) return `${Math.floor(h)} 小時前`;
  const d = Math.floor(h / 24);
  return d === 1 ? "昨天" : `${d} 天前`;
}

const pct = (c: number, t: number) => (t ? Math.round((c / t) * 100) : 0);

export default function AdminProgressPage() {
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/progress")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "讀取失敗");
        setRows(d.students);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function open(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/admin/progress?userId=${id}`);
      const d = await r.json();
      if (r.ok) setDetail(d);
    } finally {
      setDetailLoading(false);
    }
  }

  if (error)
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-bold">🔒 {error}</p>
        <Link href="/admin" className="mt-3 inline-block text-sm text-indigo-600">← 返回管理後台</Link>
      </div>
    );

  const students = (rows ?? []).filter((r) => r.role === "student");
  const others = (rows ?? []).filter((r) => r.role !== "student");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">📊 學習狀況</h1>
        <Link href="/admin" className="text-sm text-indigo-600">← 返回管理後台</Link>
      </div>
      <p className="text-sm text-slate-500">點一列可展開該學生的詳細狀況(會考等級預估、近 14 天、各科程度、弱點單元、最近作答)。</p>

      {!rows && <p className="py-12 text-center text-slate-400">載入中…</p>}

      {[
        { title: "學生", list: students },
        { title: "其他帳號(管理者)", list: others },
      ].map(({ title, list }) =>
        list.length === 0 ? null : (
          <div key={title} className="space-y-2">
            <p className="text-xs font-semibold text-slate-400">{title}</p>
            {list.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <button onClick={() => open(s.id)} className="w-full p-4 text-left hover:bg-slate-50">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-bold">{s.nickname}</span>
                    <span className="text-xs text-slate-400">{ago(s.lastActiveAt)}</span>
                    <span className="ml-auto text-xs text-slate-400">{openId === s.id ? "▲ 收合" : "▼ 展開"}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div className="rounded-lg bg-indigo-50 px-2 py-1.5">
                      <p className="text-xs text-slate-500">今日</p>
                      <p className="font-semibold text-indigo-700">
                        {s.todayTotal} 題
                        {s.todayTotal > 0 && <span className="ml-1 text-xs font-normal">({pct(s.todayCorrect, s.todayTotal)}%)</span>}
                      </p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-2 py-1.5">
                      <p className="text-xs text-slate-500">近 7 天</p>
                      <p className="font-semibold text-emerald-700">
                        {s.weekTotal} 題
                        {s.weekTotal > 0 && <span className="ml-1 text-xs font-normal">({pct(s.weekCorrect, s.weekTotal)}%)</span>}
                      </p>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                      <p className="text-xs text-slate-500">錯題待複習</p>
                      <p className="font-semibold text-amber-700">{s.wrongCount} 題</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                      <p className="text-xs text-slate-500">XP・連續</p>
                      <p className="font-semibold text-slate-700">{s.xp} ・ 🔥{s.loginStreak}</p>
                    </div>
                  </div>
                </button>

                {openId === s.id && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4">
                    <Link href={`/diagnose?userId=${s.id}`}
                      className="mb-3 inline-block rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white">
                      📷 考卷診斷・上傳考卷/看補強進度
                    </Link>
                    {detailLoading && <p className="py-6 text-center text-sm text-slate-400">載入中…</p>}
                    {detail && <StudentDetail d={detail} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
