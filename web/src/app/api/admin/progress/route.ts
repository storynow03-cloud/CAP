import { NextRequest, NextResponse } from "next/server";
import { requireStaff, adminFetch } from "@/lib/supabase/admin";

/**
 * 管理者查看學生練習狀況。
 * 走 service key 繞過 RLS —— 這正是重點:RLS 只讓學生看自己的資料,
 * 家長要看孩子的學習狀況必須從後端以管理者身分取。
 *
 * GET              → 所有學生的總覽(今日/本週題數、正確率、連續天數、錯題待複習)
 * GET ?userId=xxx  → 單一學生的細節(近 14 天曲線、各科精熟度、最近作答、弱點單元)
 */

const day = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return day(d);
};

async function json<T>(path: string): Promise<T> {
  const r = await adminFetch(`/rest/v1/${path}`);
  const d = await r.json();
  return (Array.isArray(d) ? d : []) as T;
}

interface DailyStat { user_id: string; day: string; total: number; correct: number; minutes: number }
interface Profile { id: string; nickname: string; role: string; xp: number; coins: number; login_streak: number }

export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = req.nextUrl.searchParams.get("userId");
  const today = day(new Date());
  const weekAgo = daysAgo(6); // 含今天共 7 天

  // ---------- 單一學生細節 ----------
  if (userId) {
    const since14 = daysAgo(13);
    const [profile] = await json<Profile[]>(
      `profiles?id=eq.${userId}&select=id,nickname,role,xp,coins,login_streak`
    );
    const daily = await json<DailyStat[]>(
      `daily_stats?user_id=eq.${userId}&day=gte.${since14}&select=day,total,correct,minutes&order=day`
    );
    const mastery = await json<{ subject: string; topic: string; level: number; score: number; attempts_count: number }[]>(
      `mastery?user_id=eq.${userId}&select=subject,topic,level,score,attempts_count&order=score`
    );
    const recent = await json<Record<string, unknown>[]>(
      `attempts?user_id=eq.${userId}&select=question_id,is_correct,mode,time_spent_ms,created_at,questions(subject,topic)&order=created_at.desc&limit=40`
    );
    const wrong = await adminFetch(
      `/rest/v1/wrong_book?user_id=eq.${userId}&status=eq.active&select=question_id&limit=1`,
      { headers: { Prefer: "count=exact" } }
    );
    const wrongCount = Number(wrong.headers.get("content-range")?.split("/")[1] ?? 0);

    // 各科彙總
    const bySubject: Record<string, { level: number; topics: number; score: number }> = {};
    for (const m of mastery) {
      const s = (bySubject[m.subject] ??= { level: 0, topics: 0, score: 0 });
      s.level += m.level;
      s.score += Number(m.score);
      s.topics += 1;
    }
    const subjects = Object.entries(bySubject).map(([subject, v]) => ({
      subject,
      level: Math.max(1, Math.round(v.level / v.topics)),
      score: Math.round(v.score / v.topics),
      topics: v.topics,
    }));

    return NextResponse.json({
      profile,
      daily,
      subjects,
      weakTopics: mastery.filter((m) => m.attempts_count >= 3).slice(0, 8),
      recent,
      wrongCount,
    });
  }

  // ---------- 所有學生總覽 ----------
  const profiles = await json<Profile[]>(
    `profiles?select=id,nickname,role,xp,coins,login_streak&order=nickname`
  );
  const stats = await json<DailyStat[]>(
    `daily_stats?day=gte.${weekAgo}&select=user_id,day,total,correct,minutes`
  );
  const wrongRows = await json<{ user_id: string }[]>(
    `wrong_book?status=eq.active&select=user_id&limit=10000`
  );
  const wrongBy: Record<string, number> = {};
  for (const w of wrongRows) wrongBy[w.user_id] = (wrongBy[w.user_id] ?? 0) + 1;

  const lastAttempts = await json<{ user_id: string; created_at: string }[]>(
    `attempts?select=user_id,created_at&order=created_at.desc&limit=2000`
  );
  const lastBy: Record<string, string> = {};
  for (const a of lastAttempts) if (!lastBy[a.user_id]) lastBy[a.user_id] = a.created_at;

  const rows = profiles.map((p) => {
    const mine = stats.filter((s) => s.user_id === p.id);
    const t = mine.find((s) => s.day === today);
    const wk = mine.reduce(
      (acc, s) => ({ total: acc.total + s.total, correct: acc.correct + s.correct, minutes: acc.minutes + s.minutes }),
      { total: 0, correct: 0, minutes: 0 }
    );
    return {
      id: p.id,
      nickname: p.nickname,
      role: p.role,
      xp: p.xp,
      loginStreak: p.login_streak ?? 0,
      todayTotal: t?.total ?? 0,
      todayCorrect: t?.correct ?? 0,
      weekTotal: wk.total,
      weekCorrect: wk.correct,
      weekMinutes: wk.minutes,
      wrongCount: wrongBy[p.id] ?? 0,
      lastActiveAt: lastBy[p.id] ?? null,
    };
  });

  return NextResponse.json({ students: rows, today, weekFrom: weekAgo });
}
