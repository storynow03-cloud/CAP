"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Quiz, { type QuizResult } from "@/components/Quiz";
import { thisWeekBoss, currentWeekKey, BOSS_PASS, BOSS_REWARD } from "@/lib/gamify";
import { subjectLabel, type Question } from "@/lib/types";

export default function BossPage() {
  const boss = thisWeekBoss();
  const week = currentWeekKey();
  const [userId, setUserId] = useState<string | null>(null);
  const [cleared, setCleared] = useState<{ score: number } | null>(null);
  const [state, setState] = useState<"intro" | "loading" | "fight" | "result">("intro");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [result, setResult] = useState<{ correct: number; total: number; won: boolean } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      setUserId(u.user?.id ?? null);
      if (!u.user) return;
      const { data } = await supabase
        .from("boss_clears").select("score").eq("user_id", u.user.id).eq("week", week).maybeSingle();
      if (data) setCleared({ score: data.score });
    })();
  }, [week]);

  async function fight() {
    setState("loading");
    setError("");
    const supabase = createClient();
    // 先抓難度 4-5,不足再放寬到 3+
    let { data } = await supabase
      .from("questions").select("*")
      .eq("subject", boss.subject).eq("needs_review", false).eq("type", "single_choice")
      .gte("difficulty", 4).limit(60);
    if (!data || data.length < 10) {
      const r = await supabase.from("questions").select("*")
        .eq("subject", boss.subject).eq("needs_review", false).eq("type", "single_choice")
        .gte("difficulty", 3).limit(80);
      data = r.data;
    }
    if (!data || data.length < 10) {
      setError("這科目前難題不足,無法開戰(題庫還在轉換中)");
      setState("intro");
      return;
    }
    const picked = [...data].sort(() => Math.random() - 0.5).slice(0, 10);
    setQuestions(picked);
    setState("fight");
  }

  async function finish(summary: { total: number; correct: number; results: QuizResult[] }) {
    const won = summary.correct >= BOSS_PASS;
    setResult({ correct: summary.correct, total: summary.total, won });
    setState("result");
    if (won && userId) {
      const supabase = createClient();
      await supabase.from("boss_clears").upsert({ user_id: userId, week, score: summary.correct });
      // 發大獎(額外 XP/金幣)
      const { data: p } = await supabase.from("profiles").select("xp,coins").eq("id", userId).maybeSingle();
      if (p) {
        await supabase.from("profiles").update({
          xp: p.xp + BOSS_REWARD.xp, coins: p.coins + BOSS_REWARD.coins,
        }).eq("id", userId);
      }
      setCleared({ score: summary.correct });
    }
  }

  if (state === "fight" && userId) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-rose-100 px-4 py-2 text-center text-sm font-semibold text-rose-800">
          {boss.emoji} {boss.name}戰鬥中|答對 {BOSS_PASS}/10 即可通關!
        </div>
        <Quiz questions={questions} userId={userId} mode="challenge" onFinish={finish} />
      </div>
    );
  }

  if (state === "result" && result) {
    return (
      <div className="space-y-5 text-center">
        <div className="rounded-3xl bg-white p-8 shadow">
          <div className="text-6xl">{result.won ? "🏆" : boss.emoji}</div>
          <h1 className="mt-3 text-2xl font-black">{result.won ? "通關成功!" : "魔王尚未被擊倒"}</h1>
          <p className="mt-1 text-slate-600">答對 {result.correct} / {result.total} 題</p>
          {result.won ? (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 font-semibold text-amber-700">
              🎉 獲得 {BOSS_REWARD.xp} XP + {BOSS_REWARD.coins} 🪙!
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-500">差一點!需要答對 {BOSS_PASS} 題,再接再厲 💪</p>
          )}
        </div>
        {!result.won && (
          <button onClick={() => setState("intro")} className="rounded-full accent-bg px-6 py-3 font-semibold text-white">
            再挑戰一次
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">👹 本週王關</h1>
      <section className="rounded-3xl bg-gradient-to-br from-rose-500 to-purple-600 p-8 text-center text-white shadow-lg">
        <div className="text-7xl">{boss.emoji}</div>
        <h2 className="mt-3 text-2xl font-black">{boss.name}</h2>
        <p className="mt-1 opacity-90">{boss.desc}</p>
        <p className="mt-1 text-sm opacity-80">科目:{subjectLabel(boss.subject)}|每週輪替</p>
      </section>

      {cleared ? (
        <div className="rounded-2xl bg-emerald-50 p-5 text-center">
          <p className="text-lg font-bold text-emerald-700">✅ 本週已通關!(答對 {cleared.score} 題)</p>
          <p className="text-sm text-emerald-600">下週會有新魔王,期待挑戰!</p>
        </div>
      ) : (
        <>
          {error && <p className="rounded-lg bg-rose-50 p-3 text-center text-sm text-rose-700">{error}</p>}
          <div className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">
            <p>・10 題該科難題(難度 4-5)</p>
            <p>・答對 <strong>{BOSS_PASS} 題</strong>以上即通關</p>
            <p>・通關獎勵:<strong className="text-amber-600">{BOSS_REWARD.xp} XP + {BOSS_REWARD.coins} 金幣</strong></p>
            <p>・每週一次,本週限定</p>
          </div>
          <button onClick={fight} disabled={state === "loading" || !userId}
            className="w-full rounded-full bg-rose-600 py-4 text-lg font-bold text-white shadow hover:bg-rose-700 disabled:opacity-50">
            {state === "loading" ? "召喚魔王中…" : `⚔️ 挑戰 ${boss.name}`}
          </button>
        </>
      )}
    </div>
  );
}
