"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { pickMockExam } from "@/lib/engine";
import Quiz, { type QuizResult } from "@/components/Quiz";
import { LEVEL_NAMES, SUBJECTS, subjectLabel, type Question } from "@/lib/types";

export default function MockExamPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<"intro" | "loading" | "quiz" | "result">("intro");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [results, setResults] = useState<QuizResult[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const { data: m } = await supabase
        .from("mastery")
        .select("subject, level")
        .eq("user_id", uid);
      const lv: Record<string, number> = {};
      for (const s of SUBJECTS) {
        const rows = (m ?? []).filter((r) => r.subject === s.key);
        lv[s.key] = rows.length
          ? Math.max(1, Math.round(rows.reduce((a, r) => a + r.level, 0) / rows.length))
          : 1;
      }
      setLevels(lv);
    })();
  }, []);

  async function start() {
    if (!userId) return;
    setState("loading");
    setError("");
    try {
      const supabase = createClient();
      const res = await pickMockExam(
        supabase,
        userId,
        SUBJECTS.map((s) => s.key),
        5
      );
      if (res.questions.length < 10) {
        setError("題庫題目不足,無法組卷");
        setState("intro");
        return;
      }
      setQuestions(res.questions);
      setLevels(res.levels);
      setState("quiz");
    } catch (e) {
      setError(`組卷失敗:${e instanceof Error ? e.message : e}`);
      setState("intro");
    }
  }

  async function finish(summary: { total: number; correct: number; results: QuizResult[] }) {
    setResults(summary.results);
    setState("result");
    // 寫入模擬考紀錄(各科一筆)
    const supabase = createClient();
    const bySubject = new Map<string, { total: number; correct: number }>();
    for (const r of summary.results) {
      const s = bySubject.get(r.subject) ?? { total: 0, correct: 0 };
      s.total++;
      if (r.isCorrect) s.correct++;
      bySubject.set(r.subject, s);
    }
    await supabase.from("exam_sessions").insert(
      [...bySubject.entries()].map(([subject, s]) => ({
        user_id: userId!,
        subject,
        total: s.total,
        correct: s.correct,
        grade: gradeOf(s.correct, s.total),
        started_at: new Date(Date.now() - summary.results.reduce((a, r) => a + r.timeMs, 0)).toISOString(),
        finished_at: new Date().toISOString(),
      }))
    );
  }

  function gradeOf(correct: number, total: number): string {
    const pct = total ? correct / total : 0;
    if (pct >= 0.95) return "A++";
    if (pct >= 0.85) return "A+";
    if (pct >= 0.75) return "A";
    if (pct >= 0.6) return "B++";
    if (pct >= 0.45) return "B+";
    if (pct >= 0.3) return "B";
    return "C";
  }

  if (state === "quiz" && userId) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-violet-50 px-4 py-2 text-sm text-violet-800">
          🎯 綜合模擬考|五科各 5 題,依你目前的等級出題
        </div>
        <Quiz questions={questions} userId={userId} mode="exam" onFinish={finish} />
      </div>
    );
  }

  if (state === "result") {
    const bySubject = SUBJECTS.map((s) => {
      const rs = results.filter((r) => r.subject === s.key);
      const correct = rs.filter((r) => r.isCorrect).length;
      return { ...s, total: rs.length, correct, grade: gradeOf(correct, rs.length) };
    }).filter((s) => s.total > 0);
    const totalCorrect = results.filter((r) => r.isCorrect).length;
    const totalTime = Math.round(results.reduce((a, r) => a + r.timeMs, 0) / 60000);

    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold">🎯 模擬考成績單</h1>
        <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 p-6 text-white shadow">
          <p className="text-sm opacity-80">總成績</p>
          <p className="text-4xl font-black">
            {totalCorrect} / {results.length} 題
          </p>
          <p className="mt-1 text-sm opacity-80">作答時間約 {totalTime || 1} 分鐘</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow">
          <div className="space-y-3">
            {bySubject.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="w-10 font-semibold">{s.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(s.correct / s.total) * 100}%`, backgroundColor: s.color }}
                  />
                </div>
                <span className="w-14 text-right text-sm">{s.correct}/{s.total}</span>
                <span className="w-12 rounded-full bg-slate-100 px-2 py-0.5 text-center text-xs font-bold">
                  {s.grade}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            ※ 等級為依答對率估算的參考值,實際會考等級以官方為準
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setState("intro")}
            className="flex-1 rounded-full bg-violet-600 py-3 font-semibold text-white"
          >
            再考一次
          </button>
          <Link
            href="/history"
            className="flex-1 rounded-full bg-slate-200 py-3 text-center font-semibold text-slate-700"
          >
            看學習歷程
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">🎯 綜合模擬考</h1>
      <div className="rounded-2xl bg-white p-6 shadow">
        <p className="leading-relaxed text-slate-700">
          一次挑戰<strong>五科各 5 題(共 25 題)</strong>,系統依你目前各科的等級出題,
          考完馬上看成績單與各科表現。
        </p>
        <ul className="mt-4 space-y-1 text-sm text-slate-500">
          {SUBJECTS.map((s) => (
            <li key={s.key}>
              ・{s.label}:目前 Lv{levels[s.key] ?? "?"}
              {levels[s.key] ? ` ${LEVEL_NAMES[levels[s.key]]}` : ""}
            </li>
          ))}
        </ul>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <button
          onClick={start}
          disabled={state === "loading" || !userId}
          className="mt-6 w-full rounded-full bg-violet-600 py-3 font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {state === "loading" ? "組卷中…" : "開始模擬考"}
        </button>
      </div>
    </div>
  );
}
