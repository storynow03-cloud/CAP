"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { pickChallengeQuestions } from "@/lib/engine";
import Quiz from "@/components/Quiz";
import { LEVEL_NAMES, SUBJECTS, type Question } from "@/lib/types";

function ChallengeInner() {
  const params = useSearchParams();
  const [subject, setSubject] = useState<string | null>(params.get("subject"));
  const [state, setState] = useState<"idle" | "loading" | "quiz">("idle");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [reviewIds, setReviewIds] = useState<Set<string>>(new Set());
  const [level, setLevel] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (subject && userId && state === "idle") start(subject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, userId]);

  async function start(subj: string) {
    setState("loading");
    setError("");
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const uid = data.user!.id;
      setUserId(uid);
      const res = await pickChallengeQuestions(supabase, uid, subj, 10);
      if (res.questions.length === 0) {
        setError("這科目前沒有可用題目(題庫可能還沒匯入)");
        setState("idle");
        return;
      }
      setQuestions(res.questions);
      setReviewIds(res.reviewIds);
      setLevel(res.level);
      setState("quiz");
    } catch (e) {
      setError(`載入失敗:${e instanceof Error ? e.message : e}`);
      setState("idle");
    }
  }

  if (state === "quiz" && userId) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-indigo-50 px-4 py-2 text-sm text-indigo-800">
          ⚔️ 挑戰模式|目前等級 Lv{level} {LEVEL_NAMES[level]}|連對 3 題會自動加深難度
        </div>
        <Quiz
          questions={questions}
          userId={userId}
          mode="challenge"
          reviewIds={reviewIds}
          adaptive
          onFinish={() => {
            setState("idle");
            setQuestions([]);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">⚔️ 分階挑戰</h1>
      <p className="text-sm text-slate-600">
        系統依你的等級出題:會自動跳過你已經會的題目、優先加強弱點單元、安排到期錯題。
      </p>
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {state === "loading" ? (
        <p className="py-12 text-center text-slate-500">出題中…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SUBJECTS.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  setSubject(s.key);
                  start(s.key);
                }}
                className="rounded-2xl bg-white p-6 text-lg font-bold shadow transition hover:scale-[1.02]"
                style={{ color: s.color }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <a
            href="/mock-exam"
            className="block rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 p-5 text-white shadow transition hover:scale-[1.01]"
          >
            <div className="font-bold">🎯 綜合模擬考</div>
            <div className="text-xs opacity-80">五科各 5 題,依目前等級出題,考完看成績單</div>
          </a>
        </>
      )}
    </div>
  );
}

export default function ChallengePage() {
  return (
    <Suspense>
      <ChallengeInner />
    </Suspense>
  );
}
