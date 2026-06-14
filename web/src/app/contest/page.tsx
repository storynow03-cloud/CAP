"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchQuestionsByIds } from "@/lib/engine";
import Quiz, { type QuizResult } from "@/components/Quiz";
import { subjectLabel, type Question } from "@/lib/types";

interface Contest {
  id: number;
  title: string;
  description: string | null;
  subject: string | null;
  question_ids: string[];
  duration_minutes: number;
  starts_at: string;
  ends_at: string;
}

interface Entry {
  nickname: string;
  score: number;
  total: number;
  time_spent_ms: number;
  finished_at: string;
  is_me: boolean;
}

export default function ContestPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState("student");
  const [contests, setContests] = useState<Contest[]>([]);
  const [myEntries, setMyEntries] = useState<Map<number, { score: number; total: number }>>(new Map());
  const [boards, setBoards] = useState<Map<number, Entry[]>>(new Map());
  const [taking, setTaking] = useState<{ contest: Contest; questions: Question[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;
    const [{ data: profile }, { data: cs }, { data: mine }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", uid).maybeSingle(),
      supabase.from("contests").select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("contest_entries").select("contest_id, score, total").eq("user_id", uid),
    ]);
    setRole(profile?.role ?? "student");
    setContests(cs ?? []);
    setMyEntries(new Map((mine ?? []).map((e) => [e.contest_id, e])));
    // 載入每場排行榜
    const map = new Map<number, Entry[]>();
    await Promise.all(
      (cs ?? []).map(async (c) => {
        const { data } = await supabase.rpc("get_contest_leaderboard", { cid: c.id });
        map.set(c.id, data ?? []);
      })
    );
    setBoards(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startContest(c: Contest) {
    setError("");
    try {
      const qs = await fetchQuestionsByIds(createClient(), c.question_ids);
      if (!qs.length) {
        setError("這場大會考的題目載入失敗");
        return;
      }
      setTaking({ contest: c, questions: qs });
    } catch (e) {
      setError(`載入失敗:${e instanceof Error ? e.message : e}`);
    }
  }

  async function finishContest(summary: { total: number; correct: number; results: QuizResult[] }) {
    if (!taking || !userId) return;
    const supabase = createClient();
    await supabase.from("contest_entries").upsert({
      contest_id: taking.contest.id,
      user_id: userId,
      score: summary.correct,
      total: summary.total,
      time_spent_ms: summary.results.reduce((a, r) => a + r.timeMs, 0),
      finished_at: new Date().toISOString(),
    });
    setTaking(null);
    load();
  }

  if (taking && userId) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-800">
          🏆 大會考:{taking.contest.title}|共 {taking.questions.length} 題|全員同卷,答對數與速度決定名次
        </div>
        <Quiz questions={taking.questions} userId={userId} mode="exam" onFinish={finishContest} />
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🏆 大會考</h1>
        {role !== "student" && (
          <Link
            href="/contest/new"
            className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            ＋ 建立大會考
          </Link>
        )}
      </div>
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {loading ? (
        <p className="py-12 text-center text-slate-500">載入中…</p>
      ) : contests.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow">
          目前沒有大會考。
          {role !== "student" ? "點右上角「建立大會考」來出第一卷!" : "等老師/家長出卷後就會出現在這裡!"}
        </div>
      ) : (
        contests.map((c) => {
          const open = now >= new Date(c.starts_at).getTime() && now <= new Date(c.ends_at).getTime();
          const done = myEntries.get(c.id);
          const board = boards.get(c.id) ?? [];
          return (
            <div key={c.id} className="rounded-2xl bg-white p-6 shadow">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold">{c.title}</h2>
                  <p className="text-xs text-slate-500">
                    {c.subject ? subjectLabel(c.subject) : "跨科"}|{c.question_ids.length} 題|
                    截止 {new Date(c.ends_at).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {!open && <span className="ml-1 text-rose-500">(已截止)</span>}
                  </p>
                  {c.description && <p className="mt-1 text-sm text-slate-600">{c.description}</p>}
                </div>
                {done ? (
                  <span className="rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-700">
                    已完成 {done.score}/{done.total}
                  </span>
                ) : open ? (
                  <button
                    onClick={() => startContest(c)}
                    className="rounded-full bg-rose-600 px-5 py-2 font-semibold text-white hover:bg-rose-700"
                  >
                    開始應考
                  </button>
                ) : null}
              </div>

              {board.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs font-semibold text-slate-400">排行榜</p>
                  <div className="space-y-1">
                    {board.map((e, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm ${
                          e.is_me ? "bg-indigo-50 font-semibold text-indigo-800" : ""
                        }`}
                      >
                        <span className="w-8 text-center">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                        </span>
                        <span className="flex-1">{e.nickname}{e.is_me ? "(我)" : ""}</span>
                        <span>{e.score}/{e.total}</span>
                        <span className="w-16 text-right text-xs text-slate-400">
                          {Math.round(e.time_spent_ms / 1000 / 60)}分{Math.round((e.time_spent_ms / 1000) % 60)}秒
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
