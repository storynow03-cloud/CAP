"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { levelFromXp } from "@/lib/gamify";
import { subjectLabel } from "@/lib/types";

/**
 * 排行榜:
 *   兩個「會考積分」榜(/api/leaderboard,後端彙整作答):📘 練習會考積分、🎯 真題會考積分(都是 /35)
 *   八個「成就」榜(get_leaderboard RPC):金幣、等級、刷題數、本週經驗值、正確率、連續登入、錯題克服、PK 勝場
 */

interface Row {
  user_id: string; nickname: string; avatar_url: string | null; pet: string | null; is_me: boolean;
  coins: number; xp: number; total_answered: number; week_xp: number; acc30: number | null; answered30: number;
  login_streak: number; overcome: number; duel_wins: number; boss_tiers: number;
}
type Grades = { subject: string; grade: string | null; questions: number }[];
interface ScoreRow {
  user_id: string; nickname: string; avatar_url: string | null; is_me: boolean;
  practice: { points: number; graded: number; grades: Grades; volumes: number[] };
  real: { points: number; graded: number; grades: Grades };
}

type Board = { key: string; emoji: string; label: string; unit: string; hint: string; kind: "score" | "rpc"; value: (r: never) => number | null };
const GRADE = ["", "七上", "七下", "八上", "八下", "九上", "九下"];

const SCORE_BOARDS: Board[] = [
  { key: "practice", emoji: "📘", label: "練習會考積分", unit: "/35", kind: "score",
    hint: "平常練習換算成會考積分(A++=7…C=1,五科滿分 35),代表練過的範圍掌握得如何。國一、國二認真練也能上榜!每科至少 20 題才算。",
    value: ((r: ScoreRow) => r.practice.points) as (r: never) => number },
  { key: "real", emoji: "🎯", label: "真題會考積分", unit: "/35", kind: "score",
    hint: "只算歷屆會考真題換算的積分,範圍是整個會考,最接近真正的會考成績。去寫會考真題就能上榜!每科至少 20 題才算。",
    value: ((r: ScoreRow) => r.real.points) as (r: never) => number },
];
const gradeText = (g: Grades) => g.length ? g.map((x) => `${subjectLabel(x.subject)} ${x.grade ?? `(${x.questions}題)`}`).join("・") : "還沒有作答";
const RPC_BOARDS: Board[] = ([
  { key: "coins", emoji: "🪙", label: "金幣最多", unit: "金幣", hint: "目前持有的金幣", value: (r: Row) => r.coins },
  { key: "level", emoji: "⭐", label: "等級最高", unit: "級", hint: "依累積經驗值換算", value: (r: Row) => levelFromXp(r.xp).level },
  { key: "total_answered", emoji: "📝", label: "刷題最多", unit: "題", hint: "累積作答題數", value: (r: Row) => r.total_answered },
  { key: "week_xp", emoji: "🔥", label: "本週最努力", unit: "XP", hint: "本週獲得的經驗值(每週一歸零)", value: (r: Row) => r.week_xp },
  { key: "acc30", emoji: "✅", label: "正確率最高", unit: "%", hint: "近 30 天,至少做 50 題才列入", value: (r: Row) => r.acc30 },
  { key: "login_streak", emoji: "📅", label: "連續登入", unit: "天", hint: "連續每天上線的天數", value: (r: Row) => r.login_streak },
  { key: "overcome", emoji: "🎓", label: "錯題克服王", unit: "題", hint: "錯題本畢業的題數", value: (r: Row) => r.overcome },
  { key: "duel_wins", emoji: "⚔️", label: "PK 勝場", unit: "勝", hint: "好友 PK 贏的場數", value: (r: Row) => r.duel_wins },
] as const).map((b) => ({ ...b, kind: "rpc" as const, value: b.value as (r: never) => number | null }));

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [scores, setScores] = useState<ScoreRow[] | null>(null);
  const [board, setBoard] = useState<Board>(SCORE_BOARDS[0]);
  const [rpcError, setRpcError] = useState("");

  useEffect(() => {
    createClient().rpc("get_leaderboard").then(({ data, error }) => {
      if (error) setRpcError("這個排行榜尚未啟用(管理者需執行 2026-10-04 的資料庫更新)");
      setRows((data as Row[]) ?? []);
    });
    fetch("/api/leaderboard").then((r) => r.json()).then((d) => setScores(d.rows ?? []));
  }, []);

  const src: (Row | ScoreRow)[] | null = board.kind === "score" ? scores : rows;
  const ranked = (src ?? [])
    .map((r) => ({ r, v: board.value(r as never) }))
    .filter((x) => x.v != null)
    .sort((a, b) => (b.v as number) - (a.v as number));
  const excluded = (src ?? []).filter((r) => board.value(r as never) == null);

  const Chip = ({ b }: { b: Board }) => (
    <button onClick={() => setBoard(b)}
      className={`rounded-xl p-2 text-center text-xs font-semibold shadow-sm ${board.key === b.key ? "bg-amber-500 text-white" : "bg-white text-slate-600"}`}>
      <div className="text-xl">{b.emoji}</div>
      {b.label}
    </button>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">🏅 排行榜</h1>
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">積分榜</p>
        <div className="grid grid-cols-2 gap-2">{SCORE_BOARDS.map((b) => <Chip key={b.key} b={b} />)}</div>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">成就榜</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">{RPC_BOARDS.map((b) => <Chip key={b.key} b={b} />)}</div>
      </div>
      <p className="text-xs text-slate-500">{board.emoji} {board.label}:{board.hint}</p>
      {board.kind === "rpc" && rpcError && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{rpcError}</p>}
      {!src && <p className="py-12 text-center text-slate-400">載入中…</p>}
      <div className="space-y-2">
        {ranked.map(({ r, v }, i) => (
          <div key={r.user_id} className={`rounded-2xl p-3 shadow-sm ${r.is_me ? "bg-amber-50 ring-2 ring-amber-300" : "bg-white"}`}>
            <div className="flex items-center gap-3">
              <span className="w-8 text-center text-xl font-black">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
              {r.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={r.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                : <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100">🙂</span>}
              <span className="min-w-0 flex-1 truncate font-semibold">{r.nickname}{r.is_me && "(我)"}</span>
              <span className="text-lg font-black text-amber-600">
                {board.key === "acc30" ? (v as number).toFixed(1) : v}
                <span className="ml-0.5 text-xs font-normal text-slate-400">{board.unit}</span>
              </span>
            </div>
            {board.key === "practice" && "practice" in r && (
              <p className="mt-1 pl-11 text-[11px] text-slate-500">
                已評 {r.practice.graded} 科|{gradeText(r.practice.grades)}
                {r.practice.volumes.length > 0 && `|練過:${r.practice.volumes.map((n) => GRADE[n]).join("、")}`}
              </p>
            )}
            {board.key === "real" && "real" in r && (
              <p className="mt-1 pl-11 text-[11px] text-slate-500">已評 {r.real.graded} 科|{gradeText(r.real.grades)}</p>
            )}
          </div>
        ))}
      </div>
      {board.key === "acc30" && excluded.length > 0 && (
        <p className="text-xs text-slate-400">近 30 天作答未滿 50 題、暫不列入:{excluded.map((r) => r.nickname).join("、")}</p>
      )}
    </div>
  );
}
