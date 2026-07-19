"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordAnswer } from "@/lib/engine";
import { subjectLabel, type Question } from "@/lib/types";

export interface WrittenResult {
  questionId: string;
  subject: string;
  rating: "correct" | "partial" | "wrong";
  timeMs: number;
}

interface Props {
  questions: Question[];
  userId: string;
  onFinish?: (summary: { correct: number; partial: number; wrong: number }) => void;
}

/**
 * 非選題練習(自評制):看題 → 在紙上作答 → 翻詳解 → 自評對錯。
 * 非選題沒有選項,無法自動判分,所以由學生對照參考答案/詳解後自評。
 * 自評結果照樣進 attempts / 精熟度 / 錯題本(答對=correct,半對與答錯都當未過關進錯題本再練)。
 */
export default function WrittenQuiz({ questions, userId, onFinish }: Props) {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ correct: 0, partial: 0, wrong: 0 });
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const startRef = useRef(Date.now());
  const supabase = createClient();

  const q = questions[idx];

  if (!q || finished) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow">
        <div className="text-4xl">🎉</div>
        <h2 className="mt-2 text-xl font-bold">本回合完成!</h2>
        <p className="mt-2 text-slate-600">
          自評結果:✅ 答對 {tally.correct}・◐ 半對 {tally.partial}・❌ 答錯 {tally.wrong}
        </p>
        <p className="mt-1 text-xs text-slate-400">半對與答錯的題目已加入錯題本,之後會再練一次 📌</p>
        <button
          className="mt-4 rounded-full bg-indigo-600 px-6 py-2 font-semibold text-white"
          onClick={() => onFinish?.(tally)}
        >
          繼續
        </button>
      </div>
    );
  }

  async function reveal() {
    setRevealed(true);
  }

  async function assess(rating: "correct" | "partial" | "wrong") {
    if (saving) return;
    setSaving(true);
    const isCorrect = rating === "correct";
    // 非選以 selected=null、mode='practice' 記錄(沿用既有作答管線與遊戲化獎勵)
    await recordAnswer(supabase, userId, q, null, isCorrect, "practice", Date.now() - startRef.current);
    setTally((t) => ({
      correct: t.correct + (rating === "correct" ? 1 : 0),
      partial: t.partial + (rating === "partial" ? 1 : 0),
      wrong: t.wrong + (rating === "wrong" ? 1 : 0),
    }));
    setSaving(false);
    // 下一題
    if (idx + 1 >= questions.length) {
      setFinished(true);
    } else {
      setIdx(idx + 1);
      setRevealed(false);
      startRef.current = Date.now();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          {subjectLabel(q.subject)}|{q.topic}
          <span className="ml-2 rounded bg-violet-100 px-2 py-0.5 text-violet-700">非選・紙上作答</span>
        </span>
        <span>
          {idx + 1} / {questions.length}|難度 {"★".repeat(q.difficulty)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-violet-500 transition-all"
          style={{ width: `${((idx + (revealed ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

      <div className="rounded-2xl bg-white p-6 shadow">
        <div
          className="qhtml whitespace-pre-wrap text-lg leading-relaxed"
          dangerouslySetInnerHTML={{ __html: q.question }}
        />

        {!revealed ? (
          <div className="mt-6">
            <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-800">
              ✍️ 請在紙上完整寫出你的作答過程,寫完後再看解答對照。非選題重點是<b>把過程寫完整</b>,這是 A++ 的關鍵。
            </p>
            <button
              onClick={reveal}
              className="mt-4 w-full rounded-full bg-violet-600 py-3 font-semibold text-white hover:bg-violet-700"
            >
              我寫完了,看解答 →
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {q.answer_text && (
              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-800">參考答案</p>
                <div
                  className="qhtml mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700"
                  dangerouslySetInnerHTML={{ __html: q.answer_text }}
                />
              </div>
            )}
            {q.explanation && (
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="font-semibold text-slate-700">詳解</p>
                <div
                  className="qhtml mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700"
                  dangerouslySetInnerHTML={{ __html: q.explanation }}
                />
              </div>
            )}

            <div className="pt-1">
              <p className="mb-2 text-center text-sm font-semibold text-slate-600">對照後,誠實自評:</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => assess("correct")}
                  disabled={saving}
                  className="rounded-xl border-2 border-emerald-500 bg-emerald-50 py-3 font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  ✅ 答對<br /><span className="text-xs font-normal">過程完整正確</span>
                </button>
                <button
                  onClick={() => assess("partial")}
                  disabled={saving}
                  className="rounded-xl border-2 border-amber-400 bg-amber-50 py-3 font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                >
                  ◐ 半對<br /><span className="text-xs font-normal">方向對但有漏</span>
                </button>
                <button
                  onClick={() => assess("wrong")}
                  disabled={saving}
                  className="rounded-xl border-2 border-rose-400 bg-rose-50 py-3 font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  ❌ 答錯<br /><span className="text-xs font-normal">沒寫出來/錯</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
