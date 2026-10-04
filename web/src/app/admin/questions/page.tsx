"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SUBJECTS, subjectLabel } from "@/lib/types";
import ChapterTag from "@/components/ChapterTag";
import { stripHtml } from "@/lib/html";
import type { ChapterFields } from "@/lib/chapter";

/**
 * 題目管理:搜尋題目(含隱藏題)→ 修改 → 放出來。
 * 隱藏的題目孩子看不到,但這裡看得到,修好之後按「放回題庫」孩子就能再考。
 */

interface Q extends ChapterFields {
  id: string;
  type: string;
  question: string;
  options: string[] | null;
  answer: number | null;
  answer_text: string | null;
  explanation: string | null;
  needs_review: boolean;
  difficulty: number;
}

const LETTERS = ["A", "B", "C", "D", "E"];

export default function AdminQuestionsPage() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-slate-400">載入中…</p>}>
      <QuestionsInner />
    </Suspense>
  );
}

function QuestionsInner() {
  const params = useSearchParams();
  const [kw, setKw] = useState(params.get("id") ?? "");
  const [subject, setSubject] = useState("");
  const [hidden, setHidden] = useState(params.get("id") ? "" : "1");
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<Q[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Q | null>(null);

  const search = useCallback(async (off = 0) => {
    setError("");
    const sp = new URLSearchParams({ kw, subject, hidden, offset: String(off) });
    const r = await fetch(`/api/admin/questions?${sp}`);
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? "讀取失敗"); return; }
    setList(d.questions);
    setTotal(d.total);
    setOffset(off);
    if (params.get("id") && d.questions.length === 1) setEditing(d.questions[0]);
  }, [kw, subject, hidden, params]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { search(0); }, [subject, hidden]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🛠️ 題目管理</h1>
        <Link href="/admin" className="text-sm text-indigo-600">← 返回管理後台</Link>
      </div>
      <p className="text-sm text-slate-500">
        隱藏的題目孩子看不到,但在這裡都找得到。修正題目內容後按「放回題庫」,孩子就能再考;每次修改都記在
        <Link href="/admin/audit" className="mx-1 text-indigo-600 underline">操作紀錄</Link>,改錯可以還原。
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <input value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search(0)}
          placeholder="題號、題目文字、單元名稱或知識點代碼" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <select value={subject} onChange={(e) => setSubject(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">全部科目</option>
          {SUBJECTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={hidden} onChange={(e) => setHidden(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="1">只看隱藏的</option>
          <option value="0">只看孩子看得到的</option>
          <option value="">全部</option>
        </select>
        <button onClick={() => search(0)} className="rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white">搜尋</button>
      </div>

      {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {!list && !error && <p className="py-12 text-center text-slate-400">載入中…</p>}

      {list && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="space-y-2">
            <p className="text-xs text-slate-500">共 {total} 題,第 {offset + 1}–{offset + list.length} 題</p>
            {list.map((q) => (
              <button key={q.id} onClick={() => setEditing(q)}
                className={`block w-full rounded-xl bg-white p-3 text-left text-sm shadow-sm ring-2 ${editing?.id === q.id ? "ring-indigo-400" : "ring-transparent hover:ring-slate-200"}`}>
                <div className="mb-1 flex flex-wrap items-center gap-1 text-xs">
                  <span className={`rounded px-1.5 py-0.5 font-semibold ${q.needs_review ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {q.needs_review ? "隱藏中" : "孩子看得到"}
                  </span>
                  <span className="font-semibold text-slate-500">{subjectLabel(q.subject)}</span>
                  <span className="text-slate-400">{q.id}</span>
                </div>
                <ChapterTag q={q} compact />
                <p className="mt-1 line-clamp-2 text-slate-600">{stripHtml(q.question)}</p>
              </button>
            ))}
            <div className="flex justify-between">
              <button disabled={offset === 0} onClick={() => search(Math.max(0, offset - 30))} className="rounded-full bg-white px-3 py-1 text-xs shadow-sm disabled:opacity-40">← 上一頁</button>
              <button disabled={offset + list.length >= total} onClick={() => search(offset + 30)} className="rounded-full bg-white px-3 py-1 text-xs shadow-sm disabled:opacity-40">下一頁 →</button>
            </div>
          </div>
          <div>
            {editing ? (
              <Editor key={editing.id} q={editing} onSaved={(saved) => {
                setEditing(saved);
                setList((prev) => (prev ?? []).map((x) => (x.id === saved.id ? saved : x)));
              }} />
            ) : (
              <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">點左邊的題目開始編輯</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Editor({ q, onSaved }: { q: Q; onSaved: (q: Q) => void }) {
  const [question, setQuestion] = useState(q.question);
  const [options, setOptions] = useState<string[]>(q.options ?? []);
  const [answer, setAnswer] = useState<number | null>(q.answer);
  const [answerText, setAnswerText] = useState(q.answer_text ?? "");
  const [explanation, setExplanation] = useState(q.explanation ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const isChoice = q.type === "single_choice";

  async function save(extra: Partial<Q> = {}) {
    setBusy(true);
    setMsg("");
    const fields: Record<string, unknown> = {
      question,
      explanation: explanation || null,
      ...(isChoice ? { options, answer } : { answer_text: answerText || null }),
      ...extra,
    };
    const r = await fetch("/api/admin/questions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: q.id, fields }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(`❌ ${d.error}`); return; }
    setMsg("✅ 已儲存");
    onSaved(d.question);
  }

  const area = "w-full rounded-lg border border-slate-300 p-2 font-mono text-xs";
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{q.id}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${q.needs_review ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
          {q.needs_review ? "隱藏中" : "孩子看得到"}
        </span>
        <ChapterTag q={q} compact />
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">孩子看到的樣子(預覽)</p>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="qhtml whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: question }} />
          {isChoice && (
            <div className="mt-2 space-y-1">
              {options.map((o, i) => (
                <div key={i} className={`rounded-lg px-2 py-1 text-sm ${i === answer ? "bg-emerald-50 font-semibold" : ""}`}>
                  ({LETTERS[i]}) <span className="qhtml" dangerouslySetInnerHTML={{ __html: o }} /> {i === answer && "✅"}
                </div>
              ))}
            </div>
          )}
          {!isChoice && answerText && (
            <p className="mt-2 text-sm">答案:<span className="qhtml" dangerouslySetInnerHTML={{ __html: answerText }} /></p>
          )}
          {explanation && (
            <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">詳解:<span className="qhtml" dangerouslySetInnerHTML={{ __html: explanation }} /></p>
          )}
        </div>
      </div>

      <label className="block text-xs font-semibold text-slate-500">題幹(HTML)
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={5} className={area} />
      </label>
      {isChoice ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-500">選項(點圓點設定正確答案)</p>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="ans" checked={answer === i} onChange={() => setAnswer(i)} />
              <span className="w-6 text-xs font-bold text-slate-400">({LETTERS[i]})</span>
              <input value={o} onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} className={area} />
            </div>
          ))}
        </div>
      ) : (
        <label className="block text-xs font-semibold text-slate-500">答案(HTML)
          <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)} rows={2} className={area} />
        </label>
      )}
      <label className="block text-xs font-semibold text-slate-500">詳解(HTML)
        <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={4} className={area} />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} onClick={() => save()} className="rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">💾 儲存修改</button>
        {q.needs_review ? (
          <button disabled={busy} onClick={() => save({ needs_review: false })} className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">✅ 儲存並放回題庫</button>
        ) : (
          <button disabled={busy} onClick={() => save({ needs_review: true })} className="rounded-full bg-rose-100 px-4 py-1.5 text-sm font-semibold text-rose-700 disabled:opacity-40">🙈 隱藏這題</button>
        )}
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </div>
  );
}
