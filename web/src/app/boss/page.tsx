"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Quiz, { type QuizResult } from "@/components/Quiz";
import { thisWeekBoss, BOSSES, BOSS_TIERS } from "@/lib/gamify";
import { subjectLabel, type Question } from "@/lib/types";

/**
 * 魔王關(2026-10-04 改版):
 * - 5 科各一隻魔王,各分 Lv1~Lv5;打倒這一級才能挑戰下一級,難度、過關門檻、獎勵逐級提高。
 * - 每週輪一科「本週加倍」,打倒該科新的一級獎勵 ×2。
 * - 獎勵由伺服器 clear_boss() 發放,每一級只發一次;已打過的級數可以重打練功(不發獎)。
 */

type Boss = (typeof BOSSES)[number];
type Tier = (typeof BOSS_TIERS)[number];

export default function BossPage() {
  const weekly = thisWeekBoss();
  const [userId, setUserId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [boss, setBoss] = useState<Boss>(weekly);
  const [tier, setTier] = useState<Tier | null>(null);
  const [state, setState] = useState<"pick" | "loading" | "fight" | "result">("pick");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [result, setResult] = useState<{ correct: number; total: number; won: boolean; xp: number; coins: number; replay: boolean } | null>(null);
  const [error, setError] = useState("");

  async function loadProgress() {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    setUserId(u.user?.id ?? null);
    if (!u.user) return;
    const { data, error } = await supabase.from("boss_progress").select("subject,tier_cleared").eq("user_id", u.user.id);
    if (error) setError("魔王關分級資料表尚未建立(管理者需執行 2026-10-04 的資料庫更新)");
    setProgress(Object.fromEntries((data ?? []).map((r) => [r.subject, r.tier_cleared])));
  }
  useEffect(() => { loadProgress(); }, []);

  const cleared = progress[boss.subject] ?? 0;

  async function fight(t: Tier) {
    setTier(t);
    setState("loading");
    setError("");
    const supabase = createClient();
    let { data } = await supabase
      .from("questions").select("*")
      .eq("subject", boss.subject).eq("needs_review", false).eq("type", "single_choice")
      .gte("difficulty", t.diff[0]).lte("difficulty", t.diff[1]).limit(80);
    if (!data || data.length < 10) {
      const r = await supabase.from("questions").select("*")
        .eq("subject", boss.subject).eq("needs_review", false).eq("type", "single_choice")
        .gte("difficulty", Math.max(1, t.diff[0] - 1)).limit(80);
      data = r.data;
    }
    if (!data || data.length < 10) {
      setError("這科這個難度的題目不足,暫時無法開戰");
      setState("pick");
      return;
    }
    setQuestions([...data].sort(() => Math.random() - 0.5).slice(0, 10));
    setState("fight");
  }

  async function finish(summary: { total: number; correct: number; results: QuizResult[] }) {
    if (!tier) return;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("clear_boss", { p_subject: boss.subject, p_tier: tier.tier, p_score: summary.correct });
    const r = (data as { cleared: boolean; reward_xp: number; reward_coins: number; tier_cleared: number }[] | null)?.[0];
    if (error) setError(error.message.includes("LOCKED") ? "要先打倒前一級" : "結算失敗:" + error.message);
    const won = summary.correct >= tier.pass;
    setResult({
      correct: summary.correct, total: summary.total, won,
      xp: r?.reward_xp ?? 0, coins: r?.reward_coins ?? 0, replay: won && tier.tier <= cleared,
    });
    setState("result");
    loadProgress();
  }

  if (state === "fight" && userId && tier) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-rose-100 px-4 py-2 text-center text-sm font-semibold text-rose-800">
          {boss.emoji} {boss.name} Lv{tier.tier}「{tier.name}」戰鬥中|答對 {tier.pass}/10 即可通關!
        </div>
        <Quiz questions={questions} userId={userId} mode="challenge" onFinish={finish} />
      </div>
    );
  }

  if (state === "result" && result && tier) {
    return (
      <div className="space-y-5 text-center">
        <div className="rounded-3xl bg-white p-8 shadow">
          <div className="text-6xl">{result.won ? "🏆" : boss.emoji}</div>
          <h1 className="mt-3 text-2xl font-black">{result.won ? `打倒 Lv${tier.tier}「${tier.name}」!` : "魔王尚未被擊倒"}</h1>
          <p className="mt-1 text-slate-600">答對 {result.correct} / {result.total} 題</p>
          {result.won && !result.replay && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 font-semibold text-amber-700">
              🎉 獲得 {result.xp} XP + {result.coins} 🪙!{tier.tier < 5 && `下一級 Lv${tier.tier + 1} 已解鎖`}
            </p>
          )}
          {result.replay && <p className="mt-3 text-sm text-slate-500">這一級之前打過了,這次是練功(不重複發獎)</p>}
          {!result.won && <p className="mt-3 text-sm text-slate-500">差一點!需要答對 {tier.pass} 題,再接再厲 💪</p>}
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </div>
        <button onClick={() => { setState("pick"); setResult(null); }} className="rounded-full accent-bg px-6 py-3 font-semibold text-white">
          回魔王關
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">👹 魔王關</h1>
      <p className="text-sm text-slate-500">
        5 科各有一隻魔王,每隻分 5 級:打倒這一級才能挑戰下一級。本週加倍:<b>{weekly.emoji} {weekly.name}</b>(獎勵 ×2)。
      </p>

      {/* 選魔王 */}
      <div className="grid grid-cols-5 gap-2">
        {BOSSES.map((b) => (
          <button key={b.key} onClick={() => setBoss(b)}
            className={`relative rounded-2xl p-2 text-center shadow-sm transition ${boss.key === b.key ? "bg-rose-600 text-white" : "bg-white"}`}>
            {b.key === weekly.key && <span className="absolute -right-1 -top-2 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-white">×2</span>}
            <div className="text-2xl">{b.emoji}</div>
            <div className="text-[11px] font-semibold">{subjectLabel(b.subject)}</div>
            <div className={`text-[10px] ${boss.key === b.key ? "opacity-80" : "text-slate-400"}`}>Lv{progress[b.subject] ?? 0}/5</div>
          </button>
        ))}
      </div>

      <section className="rounded-3xl bg-gradient-to-br from-rose-500 to-purple-600 p-6 text-center text-white shadow-lg">
        <div className="text-6xl">{boss.emoji}</div>
        <h2 className="mt-2 text-2xl font-black">{boss.name}</h2>
        <p className="mt-1 text-sm opacity-90">{boss.desc}・已打倒 {cleared} / 5 級</p>
      </section>

      {error && <p className="rounded-lg bg-rose-50 p-3 text-center text-sm text-rose-700">{error}</p>}

      {/* 分級階梯 */}
      <div className="space-y-2">
        {BOSS_TIERS.map((t) => {
          const done = t.tier <= cleared;
          const open = t.tier === cleared + 1;
          const mult = boss.key === weekly.key ? 2 : 1;
          return (
            <div key={t.tier} className={`flex items-center gap-3 rounded-2xl p-4 shadow-sm ${done ? "bg-emerald-50" : open ? "bg-white ring-2 ring-rose-400" : "bg-slate-100 opacity-60"}`}>
              <span className="text-2xl">{done ? "✅" : open ? "⚔️" : "🔒"}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">Lv{t.tier}「{t.name}」</p>
                <p className="text-xs text-slate-500">
                  難度 {"★".repeat(t.diff[0])}{t.diff[1] > t.diff[0] ? `~${"★".repeat(t.diff[1])}` : ""}・10 題答對 {t.pass} 題・
                  獎勵 {t.xp * mult} XP + {t.coins * mult} 🪙{mult > 1 && "(本週加倍)"}
                </p>
              </div>
              {(done || open) && (
                <button onClick={() => fight(t)} disabled={state === "loading" || !userId}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${done ? "bg-slate-400" : "bg-rose-600"}`}>
                  {state === "loading" && tier?.tier === t.tier ? "召喚中…" : done ? "重打練功" : "挑戰"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
