"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LEVEL_NAMES, subjectLabel } from "@/lib/types";

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

interface Detail {
  profile: { nickname: string; xp: number; coins: number; login_streak: number } | null;
  daily: { day: string; total: number; correct: number; minutes: number }[];
  subjects: { subject: string; level: number; score: number; topics: number }[];
  weakTopics: { subject: string; topic: string; level: number; score: number; attempts_count: number }[];
  recent: {
    question_id: string;
    is_correct: boolean;
    mode: string;
    time_spent_ms: number | null;
    created_at: string;
    questions: { subject: string; topic: string } | null;
  }[];
  wrongCount: number;
}

const MODE_LABEL: Record<string, string> = {
  practice: "練習", challenge: "挑戰", exam: "模考", review: "複習",
};

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
      <p className="text-sm text-slate-500">點一列可展開該學生的詳細狀況(近 14 天、各科程度、弱點單元、最近作答)。</p>

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
                    {detailLoading && <p className="py-6 text-center text-sm text-slate-400">載入中…</p>}
                    {detail && <DetailView d={detail} />}
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

function DetailView({ d }: { d: Detail }) {
  const max = Math.max(1, ...d.daily.map((x) => x.total));
  return (
    <div className="space-y-4">
      {/* 近 14 天長條 */}
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">近 14 天作答量</p>
        {d.daily.length === 0 ? (
          <p className="text-sm text-slate-400">這段期間沒有作答紀錄</p>
        ) : (
          <div className="flex items-end gap-1" style={{ height: 64 }}>
            {d.daily.map((x) => (
              <div key={x.day} className="flex flex-1 flex-col items-center justify-end" title={`${x.day} ${x.total} 題・對 ${x.correct}`}>
                <div className="w-full rounded-t bg-indigo-400" style={{ height: `${(x.total / max) * 100}%`, minHeight: 2 }} />
                <span className="mt-0.5 text-[9px] text-slate-400">{x.day.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 各科程度 */}
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">各科程度</p>
        {d.subjects.length === 0 ? (
          <p className="text-sm text-slate-400">尚未開始任何科目</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {d.subjects.map((s) => (
              <span key={s.subject} className="rounded-full bg-white px-3 py-1 text-xs shadow-sm">
                {subjectLabel(s.subject)} <b>Lv{s.level}</b> {LEVEL_NAMES[s.level]}
                <span className="ml-1 text-slate-400">({s.topics} 單元・平均 {s.score} 分)</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 弱點單元 */}
      {d.weakTopics.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">最需要加強的單元</p>
          <div className="space-y-1">
            {d.weakTopics.map((t) => (
              <div key={`${t.subject}-${t.topic}`} className="flex items-center gap-2 text-sm">
                <span className="w-8 shrink-0 text-xs text-slate-500">{subjectLabel(t.subject)}</span>
                <span className="min-w-0 flex-1 truncate">{t.topic}</span>
                <div className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-rose-400" style={{ width: `${t.score}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-xs text-slate-400">{t.score} 分／{t.attempts_count} 題</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 最近作答 */}
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">最近作答(最新 40 筆)</p>
        {d.recent.length === 0 ? (
          <p className="text-sm text-slate-400">沒有作答紀錄</p>
        ) : (
          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg bg-white p-2">
            {d.recent.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span>{a.is_correct ? "✅" : "❌"}</span>
                <span className="w-24 shrink-0 text-slate-400">
                  {new Date(a.created_at).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="w-8 shrink-0">{a.questions ? subjectLabel(a.questions.subject) : "—"}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600">{a.questions?.topic ?? ""}</span>
                <span className="shrink-0 rounded bg-slate-100 px-1.5 text-slate-500">{MODE_LABEL[a.mode] ?? a.mode}</span>
                <span className="w-10 shrink-0 text-right text-slate-400">
                  {a.time_spent_ms ? `${Math.round(a.time_spent_ms / 1000)}s` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
