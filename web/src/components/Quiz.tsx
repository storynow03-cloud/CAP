"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordAnswer } from "@/lib/engine";
import { LEVEL_NAMES, subjectLabel, type Question } from "@/lib/types";
import { levelFromXp, petCheer, fetchPets, type PetDef } from "@/lib/gamify";
import PetView from "@/components/PetView";

const LETTERS = ["A", "B", "C", "D", "E"];

export interface QuizResult {
  questionId: string;
  subject: string;
  isCorrect: boolean;
  timeMs: number;
}

interface Props {
  questions: Question[];
  userId: string;
  mode: "practice" | "challenge" | "exam" | "review";
  reviewIds?: Set<string>;
  adaptive?: boolean; // 回合內自適應(挑戰模式)
  onFinish?: (summary: { total: number; correct: number; results: QuizResult[] }) => void;
}

export default function Quiz({ questions: initial, userId, mode, reviewIds, adaptive, onFinish }: Props) {
  const [queue, setQueue] = useState<Question[]>(initial);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0); // 正為連對,負為連錯
  const [toast, setToast] = useState("");
  const [finished, setFinished] = useState(false);
  const [pet, setPet] = useState<{ key: string; level: number; affection: number; imageUrl: string | null } | null>(null);
  const [petDefs, setPetDefs] = useState<PetDef[]>([]);
  const [cheer, setCheer] = useState("");
  const [hintQty, setHintQty] = useState(0);
  const [hintBusy, setHintBusy] = useState(false);
  const [eliminated, setEliminated] = useState<Set<number>>(new Set());
  const resultsRef = useRef<QuizResult[]>([]);
  const startRef = useRef(Date.now());
  const supabase = createClient();

  const q = queue[idx];
  const allowHint = mode !== "exam"; // 正式模考不能用提示券

  useEffect(() => {
    startRef.current = Date.now();
    setEliminated(new Set());
  }, [idx]);

  // 載入夥伴(考試模式不打擾)
  useEffect(() => {
    if (mode === "exam") return;
    fetchPets(supabase).then(setPetDefs);
    supabase
      .from("profiles")
      .select("pet,xp,pet_affection,pet_image_url")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data)
          setPet({ key: data.pet, level: levelFromXp(data.xp ?? 0).level, affection: data.pet_affection ?? 0, imageUrl: data.pet_image_url ?? null });
      });
    supabase.from("inventory").select("qty").eq("user_id", userId).eq("item_key", "booster_hint").maybeSingle()
      .then(({ data }) => setHintQty(data?.qty ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function useHint() {
    if (hintQty <= 0 || revealed || hintBusy) return;
    setHintBusy(true);
    const { error, data } = await supabase.rpc("use_hint");
    setHintBusy(false);
    if (error) return;
    setHintQty(typeof data === "number" ? data : Math.max(0, hintQty - 1));
    const wrongLeft = (q.options ?? []).map((_, i) => i)
      .filter((i) => i !== q.answer && !eliminated.has(i));
    if (wrongLeft.length > 1) {
      const pick = wrongLeft[Math.floor(Math.random() * wrongLeft.length)];
      setEliminated((prev) => new Set(prev).add(pick));
    }
  }

  if (!q || finished) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow">
        <div className="text-4xl">🎉</div>
        <h2 className="mt-2 text-xl font-bold">本回合完成!</h2>
        <p className="mt-1 text-slate-600">
          答對 {correctCount} / {queue.length} 題(
          {queue.length ? Math.round((correctCount / queue.length) * 100) : 0}%)
        </p>
        <button
          className="mt-4 rounded-full bg-indigo-600 px-6 py-2 font-semibold text-white"
          onClick={() =>
            onFinish?.({ total: queue.length, correct: correctCount, results: resultsRef.current })
          }
        >
          繼續
        </button>
      </div>
    );
  }

  async function choose(i: number) {
    if (revealed) return;
    setSelected(i);
    setRevealed(true);
    const isCorrect = i === q.answer;
    resultsRef.current.push({
      questionId: q.id,
      subject: q.subject,
      isCorrect,
      timeMs: Date.now() - startRef.current,
    });
    if (isCorrect) setCorrectCount((c) => c + 1);
    const newStreak = isCorrect ? Math.max(1, streak + 1) : Math.min(-1, streak - 1);
    setStreak(newStreak);
    if (pet) setCheer(petCheer(pet.affection, isCorrect));

    const effectiveMode = reviewIds?.has(q.id) ? "review" : mode;
    const res = await recordAnswer(
      supabase, userId, q, i, isCorrect, effectiveMode, Date.now() - startRef.current
    );
    if (res.levelUp)
      setToast(`🚀 升階!「${q.topic}」升到 Lv${res.levelUp} ${LEVEL_NAMES[res.levelUp]}`);
    else if (res.levelDown)
      setToast(`💪 先回到 Lv${res.levelDown} 鞏固「${q.topic}」`);

    // 回合內自適應:連對3題抽一題更難的替換後面的題目
    if (adaptive && Math.abs(newStreak) >= (newStreak > 0 ? 3 : 2)) {
      const dir = newStreak > 0 ? 1 : -1;
      const targetDiff = Math.min(5, Math.max(1, q.difficulty + dir));
      const { data } = await supabase
        .from("questions")
        .select("*")
        .eq("subject", q.subject)
        .eq("needs_review", false)
        .eq("type", "single_choice")
        .eq("difficulty", targetDiff)
        .limit(30);
      if (data?.length) {
        const existing = new Set(queue.map((x) => x.id));
        const fresh = data.filter((d) => !existing.has(d.id));
        if (fresh.length && idx + 1 < queue.length) {
          const pick = fresh[Math.floor(Math.random() * fresh.length)];
          setQueue((prev) => {
            const next = [...prev];
            next[idx + 1] = pick;
            return next;
          });
          setStreak(0);
        }
      }
    }
  }

  function next() {
    setToast("");
    setCheer("");
    setSelected(null);
    setRevealed(false);
    if (idx + 1 >= queue.length) setFinished(true);
    else setIdx(idx + 1);
  }

  const isCorrect = revealed && selected === q.answer;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          {subjectLabel(q.subject)}|{q.topic}
          {reviewIds?.has(q.id) && (
            <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-700">錯題複習</span>
          )}
        </span>
        <span>
          {idx + 1} / {queue.length}|難度 {"★".repeat(q.difficulty)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-indigo-500 transition-all"
          style={{ width: `${((idx + (revealed ? 1 : 0)) / queue.length) * 100}%` }}
        />
      </div>

      <div className="rounded-2xl bg-white p-6 shadow">
        <div
          className="qhtml whitespace-pre-wrap text-lg leading-relaxed"
          dangerouslySetInnerHTML={{ __html: q.question }}
        />
        {allowHint && !revealed && (
          <button onClick={useHint} disabled={hintQty <= 0 || hintBusy}
            className="mt-3 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 disabled:opacity-40">
            💡 使用提示券(消去一個錯的選項)・剩 {hintQty}
          </button>
        )}
        <div className="mt-5 space-y-2">
          {(q.options ?? []).map((opt, i) => {
            const isOut = !revealed && eliminated.has(i);
            let cls = "border-slate-200 hover:border-indigo-400 hover:bg-indigo-50";
            if (revealed) {
              if (i === q.answer) cls = "border-emerald-500 bg-emerald-50";
              else if (i === selected) cls = "border-rose-400 bg-rose-50";
              else cls = "border-slate-200 opacity-60";
            } else if (isOut) {
              cls = "border-slate-100 bg-slate-50 opacity-40";
            }
            return (
              <button
                key={i}
                onClick={() => choose(i)}
                disabled={revealed || isOut}
                className={`block w-full rounded-xl border-2 px-4 py-3 text-left transition ${cls}`}
              >
                <span className="mr-2 font-bold text-slate-400">({LETTERS[i]})</span>
                <span className={`qhtml ${isOut ? "line-through" : ""}`} dangerouslySetInnerHTML={{ __html: opt }} />
              </button>
            );
          })}
        </div>

        {revealed && (
          <div className={`mt-5 rounded-xl p-4 ${isCorrect ? "bg-emerald-50" : "bg-rose-50"}`}>
            <p className="font-bold">
              {isCorrect ? "✅ 答對了!" : `❌ 答錯了,正確答案是 (${LETTERS[q.answer ?? 0]})`}
            </p>
            {q.explanation && (
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                <span className="font-semibold">詳解:</span>
                <span className="qhtml" dangerouslySetInnerHTML={{ __html: q.explanation }} />
              </div>
            )}
            {!isCorrect && (
              <p className="mt-2 text-xs text-slate-500">已加入錯題本,明天會再考你一次 📌</p>
            )}
          </div>
        )}
      </div>

      {revealed && pet && cheer && (() => {
        const isLegendary = !!petDefs.find((d) => d.key === pet.key)?.is_legendary;
        return (
          <div className={`flex items-center gap-3 rounded-2xl p-3 shadow-sm ${isLegendary ? "bg-gradient-to-r from-amber-50 to-violet-50 ring-2 ring-amber-300" : "bg-white"}`}>
            <span className={`pet-showcase relative grid h-11 w-11 shrink-0 place-items-center ${isLegendary ? "" : ""}`}>
              {isLegendary && <span className="pet-aura" />}
              <span className={`relative ${isLegendary ? "pet-final" : ""}`}>
                <PetView petKey={pet.key} defs={petDefs} level={pet.level} affection={pet.affection} px={40} emojiClass="text-3xl" />
              </span>
            </span>
            <p className="text-sm font-medium text-slate-700">{cheer}{isLegendary && " ✨"}</p>
          </div>
        );
      })()}

      {toast && (
        <div className="rounded-xl bg-indigo-600 p-3 text-center font-semibold text-white">{toast}</div>
      )}

      {revealed && (
        <button
          onClick={next}
          className="w-full rounded-full bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700"
        >
          {idx + 1 >= queue.length ? "看結果" : "下一題 →"}
        </button>
      )}
    </div>
  );
}
