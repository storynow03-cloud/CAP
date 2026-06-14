"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { pickPracticeQuestions } from "@/lib/engine";
import Quiz from "@/components/Quiz";
import { SUBJECTS, type Question } from "@/lib/types";

export default function PracticePage() {
  const [subject, setSubject] = useState("math");
  const [topics, setTopics] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState(0);
  const [count, setCount] = useState(10);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<"setup" | "loading" | "quiz">("setup");
  const [error, setError] = useState("");

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // 載入該科的單元清單
  useEffect(() => {
    setTopic("");
    const supabase = createClient();
    supabase.rpc("get_topics", { subj: subject }).then(({ data }) => {
      setTopics((data ?? []).map((r: { topic: string }) => r.topic));
    });
  }, [subject]);

  async function start() {
    setState("loading");
    setError("");
    try {
      const qs = await pickPracticeQuestions(createClient(), {
        subject,
        topic: topic || undefined,
        difficulty: difficulty || undefined,
        count,
      });
      if (!qs.length) {
        setError("找不到符合條件的題目,換個條件試試。");
        setState("setup");
        return;
      }
      setQuestions(qs);
      setState("quiz");
    } catch (e) {
      setError(`載入失敗:${e instanceof Error ? e.message : e}`);
      setState("setup");
    }
  }

  if (state === "quiz" && userId) {
    return (
      <Quiz
        questions={questions}
        userId={userId}
        mode="practice"
        onFinish={() => setState("setup")}
      />
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">📝 自由練習</h1>

      <div className="rounded-2xl bg-white p-6 shadow">
        <label className="mb-2 block text-sm font-semibold">科目</label>
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSubject(s.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                subject === s.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <label className="mb-2 mt-5 block text-sm font-semibold">
          單元(共 {topics.length} 個,不選 = 全部)
        </label>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        >
          <option value="">全部單元</option>
          {topics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="mb-2 mt-5 block text-sm font-semibold">難度</label>
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4, 5].map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                difficulty === d ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {d === 0 ? "全部" : "★".repeat(d)}
            </button>
          ))}
        </div>

        <label className="mb-2 mt-5 block text-sm font-semibold">題數</label>
        <div className="flex gap-2">
          {[5, 10, 20, 30].map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              className={`rounded-full px-4 py-1.5 text-sm ${
                count === c ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {c} 題
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

        <button
          onClick={start}
          disabled={state === "loading" || !userId}
          className="mt-6 w-full rounded-full bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {state === "loading" ? "出題中…" : "開始練習"}
        </button>
      </div>
    </div>
  );
}
