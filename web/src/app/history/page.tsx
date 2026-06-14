"use client";

import { useEffect, useState } from "react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { LEVEL_NAMES, SUBJECTS, subjectLabel } from "@/lib/types";
import { stripHtml } from "@/lib/html";

interface AttemptRow {
  created_at: string;
  is_correct: boolean;
  time_spent_ms: number | null;
  mode: string;
  questions: { subject: string; topic: string; question: string } | null;
}

const MODE_LABEL: Record<string, string> = {
  practice: "練習",
  challenge: "挑戰",
  exam: "模考",
  review: "複習",
};

interface MasteryRow {
  subject: string;
  topic: string;
  level: number;
  score: number;
  attempts_count: number;
  correct_count: number;
}

export default function HistoryPage() {
  const [mastery, setMastery] = useState<MasteryRow[]>([]);
  const [daily, setDaily] = useState<{ day: string; total: number; correct: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState("");
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const [{ data: m }, { data: d }] = await Promise.all([
        supabase.from("mastery").select("*").eq("user_id", u.user.id),
        supabase
          .from("daily_stats")
          .select("day,total,correct")
          .eq("user_id", u.user.id)
          .order("day")
          .limit(60),
      ]);
      setMastery((m as MasteryRow[]) ?? []);
      setDaily(d ?? []);
      if (d?.length) setDay(d[d.length - 1].day);
      setLoading(false);
    })();
  }, []);

  // 選定日期的作答明細
  useEffect(() => {
    if (!day) return;
    (async () => {
      setAttemptsLoading(true);
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("attempts")
        .select("created_at, is_correct, time_spent_ms, mode, questions(subject, topic, question)")
        .eq("user_id", u.user.id)
        .gte("created_at", `${day}T00:00:00+08:00`)
        .lt("created_at", `${day}T23:59:59.999+08:00`)
        .order("created_at", { ascending: false })
        .limit(300);
      setAttempts((data as unknown as AttemptRow[]) ?? []);
      setAttemptsLoading(false);
    })();
  }, [day]);

  const radarData = SUBJECTS.map((s) => {
    const rows = mastery.filter((m) => m.subject === s.key);
    const avg = rows.length ? rows.reduce((sum, r) => sum + r.score, 0) / rows.length : 0;
    return { subject: s.label, score: Math.round(avg) };
  });

  const lineData = daily.map((d) => ({
    day: d.day.slice(5),
    題數: d.total,
    正確率: d.total ? Math.round((d.correct / d.total) * 100) : 0,
  }));

  const weak = [...mastery]
    .filter((m) => m.attempts_count >= 5)
    .sort((a, b) => a.score - b.score)
    .slice(0, 8);

  if (loading) return <p className="py-12 text-center text-slate-500">載入中…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">📊 學習歷程</h1>

      <section className="rounded-2xl bg-white p-4 shadow">
        <h2 className="mb-2 px-2 font-bold">五科能力雷達</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="score" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.45} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow">
        <h2 className="mb-2 px-2 font-bold">每日練習與正確率</h2>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="題數" stroke="#059669" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="正確率" stroke="#4f46e5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-3 font-bold">弱點單元排行(做過 5 題以上)</h2>
        {weak.length ? (
          <div className="space-y-2">
            {weak.map((m) => (
              <div key={`${m.subject}-${m.topic}`} className="flex items-center gap-3 text-sm">
                <span className="w-10 shrink-0 font-semibold">{subjectLabel(m.subject)}</span>
                <span className="flex-1 truncate">{m.topic}</span>
                <span className="text-xs text-slate-400">
                  Lv{m.level} {LEVEL_NAMES[m.level]}
                </span>
                <span className={`w-12 text-right font-bold ${m.score < 60 ? "text-rose-600" : "text-amber-600"}`}>
                  {m.score}分
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">資料還不夠,先去做幾回挑戰吧!</p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">作答明細</h2>
          <select
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            {[...daily].reverse().map((d) => (
              <option key={d.day} value={d.day}>
                {d.day}({d.total} 題)
              </option>
            ))}
          </select>
        </div>
        {attemptsLoading ? (
          <p className="py-4 text-center text-sm text-slate-400">載入中…</p>
        ) : attempts.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">這天沒有作答紀錄</p>
        ) : (
          <div className="space-y-1.5">
            {attempts.map((a, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="shrink-0">{a.is_correct ? "✅" : "❌"}</span>
                <span className="w-12 shrink-0 text-xs text-slate-500">
                  {new Date(a.created_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="w-10 shrink-0 text-xs font-semibold">
                  {a.questions ? subjectLabel(a.questions.subject) : "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-600">
                  {a.questions ? `${a.questions.topic}|${stripHtml(a.questions.question)}` : ""}
                </span>
                <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500">
                  {MODE_LABEL[a.mode] ?? a.mode}
                </span>
                <span className="w-12 shrink-0 text-right text-xs text-slate-400">
                  {a.time_spent_ms ? `${Math.round(a.time_spent_ms / 1000)}秒` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
