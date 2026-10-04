"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { predictCap, type PredictAttempt, type SubjectPrediction } from "@/lib/cap-predict";
import { subjectLabel } from "@/lib/types";

/**
 * 「診斷」:我哪裡不會?
 * 上方是自己的「預估會考積分」與「練習積點」(與排行榜同一套算法),下方是各種診斷工具入口。
 */

const GRADE_POINT: Record<string, number> = { "A++": 7, "A+": 6, A: 5, "B++": 4, "B+": 3, B: 2, C: 1 };
const GRADE_NAME = ["", "七上", "七下", "八上", "八下", "九上", "九下"];
const GRADE_COLOR: Record<string, string> = {
  "A++": "bg-emerald-600", "A+": "bg-emerald-500", A: "bg-emerald-400",
  "B++": "bg-amber-500", "B+": "bg-amber-400", B: "bg-amber-300", C: "bg-rose-500",
};

const TOOLS = [
  { href: "/chapters", emoji: "📋", label: "章節掌握度", sub: "依年級・冊・單元自評 + 系統評,找出盲點", color: "#4f46e5" },
  { href: "/history", emoji: "📈", label: "學習歷程", sub: "各科雷達、每日練習、每一題的作答明細", color: "#059669" },
  { href: "/wrong-book", emoji: "📌", label: "錯題集中在哪", sub: "錯題本會整理出錯最多的單元", color: "#d97706" },
  { href: "/diagnose", emoji: "📷", label: "考卷診斷", sub: "上傳學校考卷,AI 找出弱點再練到會", color: "#e11d48" },
];

interface Att extends PredictAttempt { time_spent_ms: number | null }

export default function InsightHub() {
  const [preds, setPreds] = useState<SubjectPrediction[] | null>(null);
  const [practice, setPractice] = useState({ points: 0, correct: 0 });

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const atts: Att[] = [];
      for (let off = 0; off < 3000; off += 1000) {
        const { data } = await supabase.from("attempts")
          .select("question_id,is_correct,created_at,time_spent_ms,questions(subject,difficulty,volume,type)")
          .eq("user_id", u.user.id).order("created_at", { ascending: false }).range(off, off + 999);
        atts.push(...((data as unknown as Att[]) ?? []));
        if (!data || data.length < 1000) break;
      }
      setPreds(predictCap(atts));
      // 練習積點:近 30 天認真答對(≥ 5 秒、同題同日一次)的難度加總(與排行榜相同)
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const seen = new Set<string>();
      let points = 0, correct = 0;
      for (const a of atts) {
        if (a.created_at < since || !a.is_correct || (a.time_spent_ms ?? 0) < 5000 || !a.questions) continue;
        const k = `${a.question_id}|${a.created_at.slice(0, 10)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        points += a.questions.difficulty ?? 3;
        correct++;
      }
      setPractice({ points, correct });
    })();
  }, []);

  const capPoints = (preds ?? []).reduce((s, p) => s + (GRADE_POINT[p.grade] ?? 0), 0);
  const volumes = [...new Set((preds ?? []).flatMap((p) => p.volumes))].sort();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">📊 診斷</h1>
      <p className="text-sm text-slate-500">我哪裡不會?先看自己的積分,再用下面的工具找出要補強的單元。</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-4 text-white shadow">
          <p className="text-sm opacity-90">🎯 預估會考積分</p>
          <p className="text-4xl font-black">{preds ? capPoints : "…"}<span className="text-base font-normal opacity-80"> / 35</span></p>
          <p className="mt-1 text-[11px] opacity-80">
            依你做過的題目估計(A++=7…C=1)。{volumes.length > 0 && `目前練過:${volumes.map((n) => GRADE_NAME[n]).join("、")}。`}多寫會考真題會越準!
          </p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-white shadow">
          <p className="text-sm opacity-90">💪 練習積點(近 30 天)</p>
          <p className="text-4xl font-black">{preds ? practice.points : "…"}<span className="text-base font-normal opacity-80"> 點</span></p>
          <p className="mt-1 text-[11px] opacity-80">認真答對 {practice.correct} 題,難題分數比較高。和大家比一比 → <Link href="/leaderboard" className="underline">排行榜</Link></p>
        </div>
      </div>

      {preds && preds.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {preds.map((p) => (
            <div key={p.subject} className="rounded-xl bg-white p-3 text-center shadow-sm">
              <p className="text-xs font-semibold text-slate-500">{subjectLabel(p.subject)}</p>
              <p className={`mx-auto my-1 inline-block rounded-lg px-2 py-0.5 text-lg font-black text-white ${GRADE_COLOR[p.grade] ?? "bg-slate-400"}`}>{p.grade}</p>
              <p className="text-[11px] text-slate-400">{p.questions} 題{p.confidence === "資料不足" ? "・資料不足" : ""}</p>
            </div>
          ))}
        </div>
      )}
      {preds && preds.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">還沒有作答紀錄,先到「📚 學習」做幾題吧!</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm transition hover:shadow">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-2xl" style={{ backgroundColor: `${t.color}1a` }}>{t.emoji}</span>
            <div className="min-w-0">
              <p className="font-bold">{t.label}</p>
              <p className="text-xs text-slate-500">{t.sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
