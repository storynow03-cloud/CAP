"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Quiz from "@/components/Quiz";
import WrittenQuiz from "@/components/WrittenQuiz";
import { pickVariant } from "@/lib/engine";
import { REVIEW_RULES, isFinalReview } from "@/lib/review";
import { SUBJECTS, subjectLabel, type Question } from "@/lib/types";

interface WrongRow {
  question_id: string;
  due_at: string;
  streak: number;
  status: string;
  questions: Question;
}

type Session =
  | { kind: "choice"; questions: Question[]; reviewOf: Map<string, string> }
  | { kind: "written"; questions: Question[] };

export default function WrongBookPage() {
  const [rows, setRows] = useState<WrongRow[]>([]);
  const [overcome, setOvercome] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>("all");
  const [session, setSession] = useState<Session | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    setUserId(uid);
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from("wrong_book")
        .select("question_id, due_at, streak, status, questions(*)")
        .eq("user_id", uid)
        .eq("status", "active")
        .order("due_at"),
      supabase
        .from("wrong_book")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("status", "overcome"),
    ]);
    // 後來被判定有問題而隱藏的題目(例如缺圖)不再要孩子複習
    setRows(((data as unknown as WrongRow[]) ?? []).filter((r) => r.questions && !r.questions.needs_review));
    setOvercome(count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const now = Date.now();
  const isDue = (r: WrongRow) => new Date(r.due_at).getTime() <= now;
  const inSubject = (r: WrongRow) => subject === "all" || r.questions.subject === subject;
  const due = rows.filter(isDue);
  const dueHere = due.filter(inSubject);
  const dueChoice = dueHere.filter((r) => r.questions.type === "single_choice");
  const dueWritten = dueHere.filter((r) => r.questions.type !== "single_choice");
  const batch = Math.min(REVIEW_RULES.BATCH, dueChoice.length);

  async function startChoice() {
    if (!userId) return;
    setPreparing(true);
    const supabase = createClient();
    const picked = dueChoice.slice(0, REVIEW_RULES.BATCH);
    const reviewOf = new Map<string, string>();
    // 最後一關改考變化題,確認是真的會、不是記住答案
    const questions = await Promise.all(
      picked.map(async (r) => {
        if (!isFinalReview(r.streak)) return r.questions;
        const v = await pickVariant(supabase, userId, r.questions);
        if (!v) return r.questions;
        reviewOf.set(v.id, r.question_id);
        return v;
      })
    );
    setPreparing(false);
    setSession({ kind: "choice", questions, reviewOf });
  }

  function finish() {
    setSession(null);
    load();
  }

  if (session && userId) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
          📌 錯題複習|答對後隔 3 天、7 天再考,連續答對 {REVIEW_RULES.OVERCOME_STREAK} 次就畢業(最後一次考同單元的變化題)
        </div>
        {session.kind === "choice" ? (
          <Quiz
            questions={session.questions}
            userId={userId}
            mode="review"
            reviewIds={new Set(session.questions.map((q) => q.id))}
            reviewOf={session.reviewOf}
            onFinish={finish}
          />
        ) : (
          <WrittenQuiz questions={session.questions} userId={userId} onFinish={finish} />
        )}
      </div>
    );
  }

  const subjectsWithRows = SUBJECTS.filter((s) => rows.some((r) => r.questions.subject === s.key));
  const listed = rows.filter(inSubject);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">📌 錯題本</h1>

      <div className="rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-black text-amber-600">{due.length} 題到期</p>
            <p className="text-sm text-slate-500">
              未克服 {rows.length} 題・<span className="text-emerald-600">已克服 {overcome} 題 🎓</span>
            </p>
          </div>
          <button
            onClick={startChoice}
            disabled={!batch || preparing}
            className="rounded-full bg-amber-500 px-6 py-2.5 font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
          >
            {preparing ? "準備中…" : batch ? `開始複習 ${batch} 題` : "今天沒有到期的"}
          </button>
        </div>
        {dueChoice.length > REVIEW_RULES.BATCH && (
          <p className="mt-3 text-xs text-slate-400">
            一次 {REVIEW_RULES.BATCH} 題,從最早到期的開始;做完還想做可以再按一次。
          </p>
        )}
        {dueWritten.length > 0 && (
          <button
            onClick={() => setSession({ kind: "written", questions: dueWritten.slice(0, REVIEW_RULES.BATCH).map((r) => r.questions) })}
            className="mt-3 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-semibold text-amber-700"
          >
            ✍️ 另有 {dueWritten.length} 題非選題(紙上作答)
          </button>
        )}

        {subjectsWithRows.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {[{ key: "all", label: "全部" }, ...subjectsWithRows].map((s) => {
              const n = s.key === "all" ? due.length : due.filter((r) => r.questions.subject === s.key).length;
              return (
                <button
                  key={s.key}
                  onClick={() => setSubject(s.key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    subject === s.key ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {s.label} {n > 0 && <span>・{n}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {loading ? (
        <p className="py-8 text-center text-slate-500">載入中…</p>
      ) : (
        <div className="space-y-2">
          {listed.map((r) => (
            <div key={r.question_id} className="rounded-xl bg-white p-4 text-sm shadow-sm">
              <div className="mb-1 flex justify-between gap-2 text-xs text-slate-400">
                <span>
                  {subjectLabel(r.questions.subject)}|{r.questions.topic}
                </span>
                <span className="shrink-0">
                  {"●".repeat(r.streak)}{"○".repeat(REVIEW_RULES.OVERCOME_STREAK - r.streak)}{" "}
                  {isDue(r) ? "🔔 已到期" : `下次 ${r.due_at.slice(5, 10)}`}
                </span>
              </div>
              {/* 直接渲染 HTML,讓幾何圖/數學式圖片看得到——只給文字的話,
                  「如圖…」這種題目在錯題本裡會變成認不出來的謎題。 */}
              <div
                className="qhtml qhtml-preview text-slate-700"
                dangerouslySetInnerHTML={{ __html: r.questions.question }}
              />
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
