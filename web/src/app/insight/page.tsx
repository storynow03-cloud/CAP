"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { predictCap, type PredictAttempt, type SubjectPrediction } from "@/lib/cap-predict";
import CapScorePanel from "@/components/CapScorePanel";

/**
 * 「診斷」:我哪裡不會?
 * 上方是自己的「練習會考積分」與「真題會考積分」(與排行榜、管理後台同一套算法),下方是各種診斷工具入口。
 */

const TOOLS = [
  { href: "/chapters", emoji: "📋", label: "章節掌握度", sub: "依年級・冊・單元自評 + 系統評,找出盲點", color: "#4f46e5" },
  { href: "/history", emoji: "📈", label: "學習歷程", sub: "各科雷達、每日練習、每一題的作答明細", color: "#059669" },
  { href: "/wrong-book", emoji: "📌", label: "錯題集中在哪", sub: "錯題本會整理出錯最多的單元", color: "#d97706" },
  { href: "/diagnose", emoji: "📷", label: "考卷診斷", sub: "上傳學校考卷,AI 找出弱點再練到會", color: "#e11d48" },
];

type Att = PredictAttempt;

export default function InsightHub() {
  const [preds, setPreds] = useState<{ practice: SubjectPrediction[]; real: SubjectPrediction[] } | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const atts: Att[] = [];
      for (let off = 0; off < 3000; off += 1000) {
        const { data } = await supabase.from("attempts")
          .select("question_id,is_correct,created_at,questions(subject,difficulty,volume,type,source)")
          .eq("user_id", u.user.id).order("created_at", { ascending: false }).range(off, off + 999);
        atts.push(...((data as unknown as Att[]) ?? []));
        if (!data || data.length < 1000) break;
      }
      setPreds({ practice: predictCap(atts, "practice"), real: predictCap(atts, "real") });
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">📊 診斷</h1>
      <p className="text-sm text-slate-500">我哪裡不會?先看自己的積分,再用下面的工具找出要補強的單元。</p>

      {preds ? <CapScorePanel practice={preds.practice} real={preds.real} /> : <p className="py-6 text-center text-slate-400">計算中…</p>}
      {preds && preds.practice.length === 0 && preds.real.length === 0 && (
        <p className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">還沒有作答紀錄,先到「📚 學習」做幾題吧!</p>
      )}
      <p className="text-xs text-slate-500">想和大家比一比 → <Link href="/leaderboard" className="text-indigo-600 underline">排行榜</Link></p>

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
