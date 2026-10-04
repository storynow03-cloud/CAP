"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { levelFromXp } from "@/lib/gamify";

/** 排行榜:8 個項目,所有學生一起排(資料由 get_leaderboard RPC 一次取回,前端切換排序) */

interface Row {
  user_id: string; nickname: string; avatar_url: string | null; pet: string | null; is_me: boolean;
  coins: number; xp: number; total_answered: number; week_xp: number; acc30: number | null; answered30: number;
  login_streak: number; overcome: number; duel_wins: number; boss_tiers: number;
}

const BOARDS: { key: keyof Row | "level"; emoji: string; label: string; unit: string; hint: string; value: (r: Row) => number | null }[] = [
  { key: "coins", emoji: "🪙", label: "金幣最多", unit: "金幣", hint: "目前持有的金幣", value: (r) => r.coins },
  { key: "level", emoji: "⭐", label: "等級最高", unit: "級", hint: "依累積經驗值換算", value: (r) => levelFromXp(r.xp).level },
  { key: "total_answered", emoji: "📝", label: "刷題最多", unit: "題", hint: "累積作答題數", value: (r) => r.total_answered },
  { key: "week_xp", emoji: "🔥", label: "本週最努力", unit: "XP", hint: "本週獲得的經驗值(每週一歸零)", value: (r) => r.week_xp },
  { key: "acc30", emoji: "🎯", label: "正確率最高", unit: "%", hint: "近 30 天,至少做 50 題才列入", value: (r) => r.acc30 },
  { key: "login_streak", emoji: "📅", label: "連續登入", unit: "天", hint: "連續每天上線的天數", value: (r) => r.login_streak },
  { key: "overcome", emoji: "🎓", label: "錯題克服王", unit: "題", hint: "錯題本畢業的題數", value: (r) => r.overcome },
  { key: "duel_wins", emoji: "⚔️", label: "PK 勝場", unit: "勝", hint: "好友 PK 贏的場數", value: (r) => r.duel_wins },
];

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [board, setBoard] = useState(BOARDS[0]);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient().rpc("get_leaderboard").then(({ data, error }) => {
      if (error) setError("排行榜尚未啟用(管理者需執行 2026-10-04 的資料庫更新)");
      setRows((data as Row[]) ?? []);
    });
  }, []);

  const ranked = (rows ?? [])
    .map((r) => ({ r, v: board.value(r) }))
    .filter((x) => x.v != null)
    .sort((a, b) => (b.v as number) - (a.v as number));
  const excluded = (rows ?? []).filter((r) => board.value(r) == null);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">🏅 排行榜</h1>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {BOARDS.map((b) => (
          <button key={b.key} onClick={() => setBoard(b)}
            className={`rounded-xl p-2 text-center text-xs font-semibold shadow-sm ${board.key === b.key ? "bg-amber-500 text-white" : "bg-white text-slate-600"}`}>
            <div className="text-xl">{b.emoji}</div>
            {b.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{board.emoji} {board.label}:{board.hint}</p>
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {!rows && <p className="py-12 text-center text-slate-400">載入中…</p>}
      <div className="space-y-2">
        {ranked.map(({ r, v }, i) => (
          <div key={r.user_id} className={`flex items-center gap-3 rounded-2xl p-3 shadow-sm ${r.is_me ? "bg-amber-50 ring-2 ring-amber-300" : "bg-white"}`}>
            <span className="w-8 text-center text-xl font-black">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
            {r.avatar_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={r.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
              : <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100">🙂</span>}
            <span className="min-w-0 flex-1 truncate font-semibold">{r.nickname}{r.is_me && "(我)"}</span>
            <span className="text-lg font-black text-amber-600">{board.key === "acc30" ? (v as number).toFixed(1) : v}<span className="ml-0.5 text-xs font-normal text-slate-400">{board.unit}</span></span>
          </div>
        ))}
      </div>
      {board.key === "acc30" && excluded.length > 0 && (
        <p className="text-xs text-slate-400">近 30 天作答未滿 50 題、暫不列入:{excluded.map((r) => r.nickname).join("、")}</p>
      )}
    </div>
  );
}
