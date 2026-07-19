"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { pickMockExam, pickFullExam } from "@/lib/engine";
import Quiz, { type QuizResult } from "@/components/Quiz";
import { FULL_EXAM_SPEC, LEVEL_NAMES, SUBJECTS, type Question } from "@/lib/types";

type ExamType = "quick" | "full";

export default function MockExamPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<"intro" | "loading" | "quiz" | "result">("intro");
  const [examType, setExamType] = useState<ExamType>("quick");
  const [fullSubject, setFullSubject] = useState<string>("math");
  const [ranSubjects, setRanSubjects] = useState<string[]>([]); // 本次結算涉及的科目
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

  async function startQuick() {
    if (!userId) return;
    setState("loading");
    setError("");
    try {
      const supabase = createClient();
      const res = await pickMockExam(supabase, userId, SUBJECTS.map((s) => s.key), 5);
      if (res.questions.length < 10) {
        setError("題庫題目不足,無法組卷");
        setState("intro");
        return;
      }
      setQuestions(res.questions);
      setLevels(res.levels);
      setRanSubjects(SUBJECTS.map((s) => s.key));
      setState("quiz");
    } catch (e) {
      setError(`組卷失敗:${e instanceof Error ? e.message : e}`);
      setState("intro");
    }
  }

  async function startFull() {
    if (!userId) return;
    setState("loading");
    setError("");
    try {
      const spec = FULL_EXAM_SPEC[fullSubject];
      const qs = await pickFullExam(createClient(), fullSubject, spec.count);
      if (qs.length < spec.count) {
        setError(`這科可用題數不足(需要 ${spec.count} 題,只找到 ${qs.length} 題)`);
        setState("intro");
        return;
      }
      setQuestions(qs);
      setRanSubjects([fullSubject]);
      setState("quiz");
    } catch (e) {
      setError(`組卷失敗:${e instanceof Error ? e.message : e}`);
      setState("intro");
    }
  }

  async function finish(summary: { total: number; correct: number; results: QuizResult[] }) {
    setResults(summary.results);
    setState("result");
    const supabase = createClient();
    const bySubject = new Map<string, { total: number; correct: number }>();
    for (const r of summary.results) {
      const s = bySubject.get(r.subject) ?? { total: 0, correct: 0 };
      s.total++;
      if (r.isCorrect) s.correct++;
      bySubject.set(r.subject, s);
    }
    const startedAt = new Date(Date.now() - summary.results.reduce((a, r) => a + r.timeMs, 0)).toISOString();
    await supabase.from("exam_sessions").insert(
      [...bySubject.entries()].map(([subject, s]) => ({
        user_id: userId!,
        subject,
        total: s.total,
        correct: s.correct,
        grade: gradeOf(s.correct, s.total),
        started_at: startedAt,
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
    const isFull = examType === "full";
    const spec = FULL_EXAM_SPEC[fullSubject];
    const subjLabel = SUBJECTS.find((s) => s.key === fullSubject)?.label;
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-violet-50 px-4 py-2 text-sm text-violet-800">
          {isFull
            ? `📝 全真模擬考|${subjLabel} ${spec.count} 題・建議 ${spec.minutes} 分鐘內完成`
            : "🎯 綜合模擬考|五科各 5 題,依你目前的等級出題"}
        </div>
        <Quiz questions={questions} userId={userId} mode="exam" onFinish={finish} />
      </div>
    );
  }

  if (state === "result") {
    const totalCorrect = results.filter((r) => r.isCorrect).length;
    const totalTimeMin = Math.round(results.reduce((a, r) => a + r.timeMs, 0) / 60000);

    // 全真單科:用容錯估級
    if (examType === "full" && ranSubjects.length === 1) {
      const subject = ranSubjects[0];
      const spec = FULL_EXAM_SPEC[subject];
      const label = SUBJECTS.find((s) => s.key === subject)?.label ?? subject;
      const wrong = results.length - totalCorrect;
      const grade = gradeOf(totalCorrect, results.length);
      const distToAPlus = Math.max(0, wrong - spec.aPlusMaxWrong);
      const overTime = totalTimeMin > spec.minutes;

      return (
        <div className="space-y-5">
          <h1 className="text-xl font-bold">📝 {label} 全真模擬考・成績單</h1>
          <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 p-6 text-white shadow">
            <p className="text-sm opacity-80">估計等級</p>
            <p className="text-5xl font-black">{grade}</p>
            <p className="mt-2 text-lg font-semibold">
              答對 {totalCorrect} / {results.length}(錯 {wrong} 題)
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">A++(精熟前段)容錯</span>
                <span className="font-semibold">錯 ≤ {spec.aPlusMaxWrong} 題</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">距離 A++</span>
                {distToAPlus === 0 ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-0.5 font-bold text-emerald-700">
                    🎉 已達 A++ 容錯!
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-3 py-0.5 font-bold text-amber-700">
                    還差 {distToAPlus} 題
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">作答時間</span>
                <span className={`font-semibold ${overTime ? "text-rose-600" : "text-emerald-600"}`}>
                  {totalTimeMin || 1} 分鐘 / 限時 {spec.minutes} 分鐘
                  {overTime ? " ⏰ 超時" : " ✅"}
                </span>
              </div>
            </div>
            {overTime && (
              <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-600">
                A++ 不只要會,還要快。這次超時了,平時練習可留意速度。
              </p>
            )}
            {spec.note && (
              <p className="mt-3 text-xs text-slate-400">※ {spec.note}</p>
            )}
            <p className="mt-2 text-xs text-slate-400">
              ※ 等級為依答對數估算的參考值,實際會考等級以官方標準為準。
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setState("intro")} className="flex-1 rounded-full bg-violet-600 py-3 font-semibold text-white">
              再考一次
            </button>
            <Link href="/history" className="flex-1 rounded-full bg-slate-200 py-3 text-center font-semibold text-slate-700">
              看學習歷程
            </Link>
          </div>
        </div>
      );
    }

    // 快速綜合:五科各科成績
    const bySubject = SUBJECTS.map((s) => {
      const rs = results.filter((r) => r.subject === s.key);
      const correct = rs.filter((r) => r.isCorrect).length;
      return { ...s, total: rs.length, correct, grade: gradeOf(correct, rs.length) };
    }).filter((s) => s.total > 0);

    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold">🎯 模擬考成績單</h1>
        <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 p-6 text-white shadow">
          <p className="text-sm opacity-80">總成績</p>
          <p className="text-4xl font-black">{totalCorrect} / {results.length} 題</p>
          <p className="mt-1 text-sm opacity-80">作答時間約 {totalTimeMin || 1} 分鐘</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow">
          <div className="space-y-3">
            {bySubject.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="w-10 font-semibold">{s.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${(s.correct / s.total) * 100}%`, backgroundColor: s.color }} />
                </div>
                <span className="w-14 text-right text-sm">{s.correct}/{s.total}</span>
                <span className="w-12 rounded-full bg-slate-100 px-2 py-0.5 text-center text-xs font-bold">{s.grade}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-400">※ 等級為依答對率估算的參考值,實際會考等級以官方為準</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setState("intro")} className="flex-1 rounded-full bg-violet-600 py-3 font-semibold text-white">再考一次</button>
          <Link href="/history" className="flex-1 rounded-full bg-slate-200 py-3 text-center font-semibold text-slate-700">看學習歷程</Link>
        </div>
      </div>
    );
  }

  // intro
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">🎯 模擬考</h1>

      <div className="flex gap-2">
        <button
          onClick={() => setExamType("quick")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${examType === "quick" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          快速綜合(25 題)
        </button>
        <button
          onClick={() => setExamType("full")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${examType === "full" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          📝 全真單科
        </button>
      </div>

      {examType === "quick" ? (
        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="leading-relaxed text-slate-700">
            一次挑戰<strong>五科各 5 題(共 25 題)</strong>,系統依你目前各科的等級出題,考完馬上看成績單。
            <br />想估「離 A++ 還多遠」,請改用<strong>全真單科</strong>。
          </p>
          <ul className="mt-4 space-y-1 text-sm text-slate-500">
            {SUBJECTS.map((s) => (
              <li key={s.key}>・{s.label}:目前 Lv{levels[s.key] ?? "?"}{levels[s.key] ? ` ${LEVEL_NAMES[levels[s.key]]}` : ""}</li>
            ))}
          </ul>
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          <button onClick={startQuick} disabled={state === "loading" || !userId} className="mt-6 w-full rounded-full bg-violet-600 py-3 font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
            {state === "loading" ? "組卷中…" : "開始模擬考"}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="leading-relaxed text-slate-700">
            照<strong>真實會考規格</strong>組一整份單科考卷,並依<strong>容錯數</strong>估計等級——讓你知道「離 A++ 還差幾題」。
          </p>
          <label className="mb-2 mt-5 block text-sm font-semibold">選擇科目</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setFullSubject(s.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${fullSubject === s.key ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {(() => {
            const spec = FULL_EXAM_SPEC[fullSubject];
            const label = SUBJECTS.find((s) => s.key === fullSubject)?.label;
            return (
              <div className="mt-5 rounded-xl bg-violet-50 p-4 text-sm text-violet-900">
                <p><strong>{label}</strong>全真卷</p>
                <ul className="mt-1 space-y-0.5">
                  <li>・題數:{spec.count} 題(選擇)</li>
                  <li>・建議時間:{spec.minutes} 分鐘</li>
                  <li>・A++ 容錯:錯 ≤ {spec.aPlusMaxWrong} 題</li>
                  {spec.note && <li className="text-violet-600">・{spec.note}</li>}
                </ul>
              </div>
            );
          })()}

          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          <button onClick={startFull} disabled={state === "loading" || !userId} className="mt-6 w-full rounded-full bg-violet-600 py-3 font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
            {state === "loading" ? "組卷中…" : "開始全真模擬考"}
          </button>
        </div>
      )}
    </div>
  );
}
