"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { subjectLabel } from "@/lib/types";
import ChapterTag from "@/components/ChapterTag";
import type { ChapterFields } from "@/lib/chapter";

const REASON_LABEL: Record<string, string> = {
  missing_image: "缺圖/圖看不到",
  wrong_answer: "答案好像錯了",
  unreadable: "看不懂/有亂碼",
  bad_options: "選項有問題",
  other: "其他",
};
const LETTERS = ["A", "B", "C", "D", "E"];

interface Item {
  question: (ChapterFields & {
    id: string; subject: string; topic: string; question: string;
    options: string[] | null; answer: number | null; answer_text: string | null;
    explanation: string | null; needs_review: boolean;
  }) | null;
  reports: { reason: string; note: string | null; created_at: string; by: string }[];
}

export default function AdminReportsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/admin/reports");
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? "讀取失敗"); return; }
    setItems(d.items);
  }
  useEffect(() => { load(); }, []);

  async function act(questionId: string, action: "hide" | "fixed" | "dismiss") {
    setBusy(questionId);
    const r = await fetch("/api/admin/reports", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, action }),
    });
    setBusy(null);
    if (r.ok) setItems((prev) => (prev ?? []).filter((i) => i.question?.id !== questionId));
    else alert((await r.json()).error ?? "處理失敗");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🚩 題目回報</h1>
        <Link href="/admin" className="text-sm text-indigo-600">← 返回管理後台</Link>
      </div>
      <p className="text-sm text-slate-500">
        孩子做題時按「這題有問題」送來的回報。確認題目真的有問題就「隱藏此題」,孩子之後不會再抽到;隱藏的題目可以到「題目管理」修正後再放回題庫。
      </p>

      {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {!items && !error && <p className="py-12 text-center text-slate-400">載入中…</p>}
      {items && items.length === 0 && (
        <p className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">目前沒有待處理的回報 🎉</p>
      )}

      {items?.map((it) => {
        const q = it.question;
        if (!q) return null;
        return (
          <div key={q.id} className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold">{subjectLabel(q.subject)}</span>
              <ChapterTag q={q} compact />
              <span className="font-mono">{q.id}</span>
              {q.needs_review && <span className="rounded bg-slate-200 px-2 py-0.5">已隱藏</span>}
            </div>

            <div className="space-y-1">
              {it.reports.map((r, i) => (
                <p key={i} className="text-sm">
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                    {REASON_LABEL[r.reason] ?? r.reason}
                  </span>
                  <span className="ml-2 text-slate-600">{r.by}</span>
                  {r.note && <span className="ml-2 text-slate-500">「{r.note}」</span>}
                  <span className="ml-2 text-xs text-slate-400">{new Date(r.created_at).toLocaleString("zh-TW")}</span>
                </p>
              ))}
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <div className="qhtml whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: q.question }} />
              {q.options && (
                <div className="mt-3 space-y-1">
                  {q.options.map((o, i) => (
                    <p key={i} className={`text-sm ${i === q.answer ? "font-bold text-emerald-700" : ""}`}>
                      ({LETTERS[i]}) <span className="qhtml" dangerouslySetInnerHTML={{ __html: o }} />
                      {i === q.answer && " ← 系統答案"}
                    </p>
                  ))}
                </div>
              )}
              {q.answer_text && <p className="mt-2 text-sm text-emerald-700">參考答案:{q.answer_text}</p>}
              {q.explanation && (
                <div className="mt-2 text-sm text-slate-600">
                  <span className="font-semibold">詳解:</span>
                  <span className="qhtml" dangerouslySetInnerHTML={{ __html: q.explanation }} />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => act(q.id, "hide")} disabled={busy === q.id}
                className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                🙈 隱藏此題
              </button>
              <button onClick={() => act(q.id, "fixed")} disabled={busy === q.id}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                ✅ 已修正
              </button>
              <Link href={`/admin/questions?id=${encodeURIComponent(q.id)}`}
                className="rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-700">
                ✏️ 編輯這題
              </Link>
              <button onClick={() => act(q.id, "dismiss")} disabled={busy === q.id}
                className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">
                題目沒問題
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
