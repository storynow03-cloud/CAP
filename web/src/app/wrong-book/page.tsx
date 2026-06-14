"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Quiz from "@/components/Quiz";
import { subjectLabel, type Question } from "@/lib/types";
import { stripHtml } from "@/lib/html";

interface WrongRow {
  question_id: string;
  due_at: string;
  streak: number;
  status: string;
  questions: Question;
}

export default function WrongBookPage() {
  const [rows, setRows] = useState<WrongRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<Question[] | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    setUserId(uid);
    const { data } = await supabase
      .from("wrong_book")
      .select("question_id, due_at, streak, status, questions(*)")
      .eq("user_id", uid)
      .eq("status", "active")
      .order("due_at");
    setRows((data as unknown as WrongRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const now = Date.now();
  const due = rows.filter((r) => new Date(r.due_at).getTime() <= now);

  if (reviewing && userId) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
          📌 錯題複習|連續答對 3 次就會從錯題本畢業
        </div>
        <Quiz
          questions={reviewing}
          userId={userId}
          mode="review"
          reviewIds={new Set(reviewing.map((q) => q.id))}
          onFinish={() => {
            setReviewing(null);
            load();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">📌 錯題本</h1>

      <div className="rounded-2xl bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-black text-amber-600">{due.length} 題</p>
            <p className="text-sm text-slate-500">今日到期待複習(共 {rows.length} 題未克服)</p>
          </div>
          <button
            onClick={() => setReviewing(due.slice(0, 20).map((r) => r.questions))}
            disabled={!due.length}
            className="rounded-full bg-amber-500 px-6 py-2.5 font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
          >
            開始複習
          </button>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-slate-500">載入中…</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.question_id} className="rounded-xl bg-white p-4 text-sm shadow-sm">
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>
                  {subjectLabel(r.questions.subject)}|{r.questions.topic}
                </span>
                <span>
                  {new Date(r.due_at).getTime() <= now
                    ? "🔔 已到期"
                    : `下次複習 ${r.due_at.slice(0, 10)}`}
                  {r.streak > 0 && `|已連對 ${r.streak} 次`}
                </span>
              </div>
              <p className="line-clamp-2 text-slate-700">{stripHtml(r.questions.question)}</p>
            </div>
          ))}
          {!rows.length && (
            <p className="py-8 text-center text-slate-400">錯題本是空的,太強了!💪</p>
          )}
        </div>
      )}
    </div>
  );
}
