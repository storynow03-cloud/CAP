"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchQuestionsByIds } from "@/lib/engine";
import Quiz, { type QuizResult } from "@/components/Quiz";
import { subjectLabel, type Question } from "@/lib/types";

/**
 * 好友 PK(2026-10-04 改版):
 * - 可押金幣;押注 > 0 時對方要接受並付出同額金幣,贏家拿走全部,平手退回(資料庫結算)。
 * - 對戰房間:雙方按「準備好了」→ 伺服器定共同開始時間 → 同時看到同樣 5 題;
 *   每答一題回報進度,畫面上即時看到對手答到第幾題、答對幾題(每 1.5 秒更新)。
 * - 對方不在線上也可以先打,對方之後再打,打完一樣結算。
 */

interface DuelRow {
  id: number; subject: string; ch_name: string; op_name: string;
  ch_score: number | null; ch_time: number | null; ch_done: boolean;
  op_score: number | null; op_time: number | null; op_done: boolean;
  am_i_challenger: boolean; created_at: string;
  stake: number; status: string; winner: string | null; i_won: boolean | null;
}

interface DuelDetail {
  id: number; subject: string; question_ids: string[];
  challenger: string; opponent: string; ch_name: string; op_name: string;
  ch_score: number | null; ch_time: number | null; ch_done: boolean;
  op_score: number | null; op_time: number | null; op_done: boolean;
  am_i_challenger: boolean; stake: number; status: string;
  ch_ready: boolean; op_ready: boolean; start_at: string | null;
  ch_answered: number; ch_correct: number; op_answered: number; op_correct: number;
  winner: string | null; server_now: string;
}

const ERR: Record<string, string> = {
  NOT_ENOUGH_COINS: "金幣不夠",
  NOT_ACCEPTED: "對方還沒接受這場對戰",
  NOT_FOUND: "找不到這場對戰",
};
const errText = (m?: string) => Object.entries(ERR).find(([k]) => m?.includes(k))?.[1] ?? m ?? "操作失敗";

function resultText(d: DuelRow): string {
  if (d.status === "declined") return "對方拒絕了";
  if (d.status === "cancelled") return "已取消";
  if (d.status !== "settled") return "進行中";
  const coin = d.stake > 0 ? `(${d.i_won ? "+" : "−"}${d.stake} 金幣)` : "";
  if (!d.winner) return d.stake > 0 ? "🤝 平手,押注退回" : "🤝 平手";
  return d.i_won ? `🏆 你贏了!${coin}` : `😢 你輸了${coin}`;
}

/* ───────────── 對戰房間 ───────────── */
function Bar({ who, answered, correct, done, total, color }: { who: string; answered: number; correct: number; done: boolean; total: number; color: string }) {
  return (
    <div className="flex-1">
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-bold">{who}</span>
        <span className="text-slate-500">{done ? "已交卷" : `${answered}/${total} 題`}・答對 {correct}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full transition-all ${color}`} style={{ width: `${(answered / total) * 100}%` }} />
      </div>
    </div>
  );
}

function Room({ duelId, userId, onExit }: { duelId: number; userId: string; onExit: () => void }) {
  const [d, setD] = useState<DuelDetail | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [phase, setPhase] = useState<"lobby" | "countdown" | "play" | "done">("lobby");
  const [countdown, setCountdown] = useState(0);
  const [msg, setMsg] = useState("");
  const clockOffset = useRef(0); // 伺服器時間 - 本機時間
  // 自己的進度用 state(畫面要即時顯示),同時 ref 給非同步回報用
  const [myProg, setMyProg] = useState({ answered: 0, correct: 0 });
  const progress = useRef({ answered: 0, correct: 0 });
  const supabase = createClient();

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_duel", { duel_id: duelId });
    if (error) { setMsg(errText(error.message)); return null; }
    const row = (data as DuelDetail[])?.[0];
    if (!row) { setMsg("找不到這場對戰"); return null; }
    clockOffset.current = new Date(row.server_now).getTime() - Date.now();
    setD(row);
    return row;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelId]);

  // 載入 + 輪詢(每 1.5 秒看對手狀態)
  useEffect(() => {
    let alive = true;
    (async () => {
      const row = await refresh();
      if (!row || !alive) return;
      const mineDone = row.am_i_challenger ? row.ch_done : row.op_done;
      if (mineDone) setPhase("done");
      setQuestions(await fetchQuestionsByIds(supabase, row.question_ids));
    })();
    const t = setInterval(refresh, 1500);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  // 兩人都準備好 → 依伺服器時間倒數,同時開始
  useEffect(() => {
    if (!d?.start_at || phase !== "lobby") return;
    const tick = () => {
      const left = Math.ceil((new Date(d.start_at!).getTime() - (Date.now() + clockOffset.current)) / 1000);
      if (left <= 0) { setPhase("play"); return true; }
      setPhase("countdown");
      setCountdown(left);
      return false;
    };
    if (tick()) return;
    const t = setInterval(() => { if (tick()) clearInterval(t); }, 200);
    return () => clearInterval(t);
  }, [d?.start_at, phase]);

  if (msg) return (
    <div className="space-y-3">
      <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{msg}</p>
      <button onClick={onExit} className="accent-text underline">回對戰列表</button>
    </div>
  );
  if (!d || !questions) return <p className="py-12 text-center text-slate-500">進入房間中…</p>;

  const me = d.am_i_challenger
    ? { name: d.ch_name, ready: d.ch_ready, answered: d.ch_answered, correct: d.ch_correct, done: d.ch_done, score: d.ch_score, time: d.ch_time }
    : { name: d.op_name, ready: d.op_ready, answered: d.op_answered, correct: d.op_correct, done: d.op_done, score: d.op_score, time: d.op_time };
  const opp = d.am_i_challenger
    ? { name: d.op_name, ready: d.op_ready, answered: d.op_answered, correct: d.op_correct, done: d.op_done, score: d.op_score, time: d.op_time }
    : { name: d.ch_name, ready: d.ch_ready, answered: d.ch_answered, correct: d.ch_correct, done: d.ch_done, score: d.ch_score, time: d.ch_time };
  const total = d.question_ids.length;
  const myAnswered = phase === "play" ? myProg.answered : me.answered;
  const myCorrect = phase === "play" ? myProg.correct : me.correct;

  const header = (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-bold">⚔️ {subjectLabel(d.subject)} PK・{total} 題</span>
        {d.stake > 0 && <span className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-700">🪙 獎池 {d.stake * 2} 金幣(贏家全拿)</span>}
      </div>
      <div className="flex gap-4">
        <Bar who={`你(${me.name})`} answered={myAnswered} correct={myCorrect} done={me.done} total={total} color="bg-indigo-500" />
        <Bar who={opp.name} answered={opp.answered} correct={opp.correct} done={opp.done} total={total} color="bg-rose-500" />
      </div>
    </div>
  );

  async function ready() {
    const { error } = await supabase.rpc("duel_ready", { p_id: duelId });
    if (error) setMsg(errText(error.message));
    refresh();
  }

  async function onAnswer(_q: Question, _sel: number, isCorrect: boolean) {
    progress.current = { answered: progress.current.answered + 1, correct: progress.current.correct + (isCorrect ? 1 : 0) };
    setMyProg(progress.current);
    await supabase.rpc("duel_progress", { p_id: duelId, p_answered: progress.current.answered, p_correct: progress.current.correct });
  }

  async function finish(summary: { total: number; correct: number; results: QuizResult[] }) {
    const time = summary.results.reduce((a, r) => a + r.timeMs, 0);
    const { error } = await supabase.rpc("finish_duel", { p_id: duelId, p_score: summary.correct, p_time: time });
    if (error) setMsg(errText(error.message));
    setPhase("done");
    refresh();
  }

  if (phase === "play") {
    return (
      <div className="space-y-4">
        {header}
        <Quiz questions={questions} userId={userId} mode="exam" onAnswer={onAnswer} onFinish={finish} />
      </div>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-2xl bg-white p-10 text-center shadow">
          <p className="text-sm text-slate-500">兩人都準備好了,同時開始!</p>
          <p className="mt-2 text-7xl font-black text-rose-500">{countdown}</p>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const settled = d.status === "settled";
    const iWon = d.winner === userId;
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-2xl bg-white p-8 text-center shadow">
          {!settled ? (
            <>
              <p className="text-3xl">⏳</p>
              <p className="mt-2 font-bold">你已交卷:答對 {me.score} 題</p>
              <p className="mt-1 text-sm text-slate-500">等 {opp.name} 交卷…(對手答到第 {opp.answered} 題)</p>
            </>
          ) : (
            <>
              <p className="text-5xl">{!d.winner ? "🤝" : iWon ? "🏆" : "😢"}</p>
              <p className="mt-2 text-2xl font-black">{!d.winner ? "平手" : iWon ? "你贏了!" : "你輸了"}</p>
              <p className="mt-1 text-sm text-slate-500">
                你 {me.score} 題({Math.round((me.time ?? 0) / 1000)} 秒)vs {opp.name} {opp.score} 題({Math.round((opp.time ?? 0) / 1000)} 秒)
              </p>
              {d.stake > 0 && (
                <p className={`mt-2 font-bold ${!d.winner ? "text-slate-600" : iWon ? "text-emerald-600" : "text-rose-600"}`}>
                  {!d.winner ? `押注 ${d.stake} 金幣退回` : iWon ? `🪙 贏得 ${d.stake * 2} 金幣(淨賺 ${d.stake})` : `🪙 輸掉 ${d.stake} 金幣`}
                </p>
              )}
            </>
          )}
          <button onClick={onExit} className="mt-5 rounded-full bg-indigo-600 px-6 py-2 font-semibold text-white">回對戰列表</button>
        </div>
      </div>
    );
  }

  // lobby
  return (
    <div className="space-y-4">
      {header}
      <div className="rounded-2xl bg-white p-6 text-center shadow">
        {d.status === "pending" ? (
          <p className="text-slate-600">等 {opp.name} 接受押注({d.stake} 金幣)…</p>
        ) : (
          <>
            <p className="font-bold">對戰房間</p>
            <div className="mx-auto mt-3 grid max-w-sm grid-cols-2 gap-3 text-sm">
              <div className={`rounded-xl p-3 ${me.ready ? "bg-emerald-50 text-emerald-700" : "bg-slate-50"}`}>
                你<br /><b>{me.ready ? "✅ 準備好了" : "還沒準備"}</b>
              </div>
              <div className={`rounded-xl p-3 ${opp.ready ? "bg-emerald-50 text-emerald-700" : "bg-slate-50"}`}>
                {opp.name}<br /><b>{opp.ready ? "✅ 準備好了" : opp.done ? "已打完" : "還沒進房間"}</b>
              </div>
            </div>
            {!me.ready && (
              <button onClick={ready} className="mt-5 rounded-full bg-rose-500 px-8 py-3 text-lg font-bold text-white">準備好了!</button>
            )}
            {me.ready && !opp.ready && <p className="mt-4 text-sm text-slate-500">等對手按「準備好了」,兩人會同時開始…</p>}
            <p className="mt-5 text-xs text-slate-400">
              對方不在線上?
              <button onClick={() => setPhase("play")} className="ml-1 underline">先自己打</button>
              (對方之後再打,一樣會結算,但看不到即時狀況)
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────── 對戰列表 ───────────── */
function DuelInner() {
  const params = useSearchParams();
  const playId = params.get("play");
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<number | null>(playId ? Number(playId) : null);
  const [duels, setDuels] = useState<DuelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const loadList = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("my_duels");
    setDuels((data as DuelRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      setUserId(u.user?.id ?? null);
      await loadList();
    })();
  }, [loadList]);

  // 列表也輪詢:對方接受、交卷時自動更新
  useEffect(() => {
    if (room) return;
    const t = setInterval(loadList, 5000);
    return () => clearInterval(t);
  }, [room, loadList]);

  async function call(fn: string, id: number) {
    const supabase = createClient();
    const { error } = await supabase.rpc(fn, { p_id: id });
    if (error) setMsg(errText(error.message));
    else if (fn === "accept_duel") setRoom(id);
    loadList();
  }

  function exitRoom() {
    setRoom(null);
    setLoading(true);
    loadList();
    window.history.replaceState(null, "", "/duel");
  }

  if (room && userId) return <Room duelId={room} userId={userId} onExit={exitRoom} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">⚔️ 好友 PK</h1>
        <Link href="/friends" className="rounded-full accent-bg px-4 py-1.5 text-sm font-semibold text-white">
          找好友 PK
        </Link>
      </div>
      <p className="text-sm text-slate-500">同樣 5 題、同時開始、看得到對手進度。押金幣的話,贏家拿走全部!</p>
      {msg && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{msg}</p>}
      {loading ? (
        <p className="py-12 text-center text-slate-500">載入中…</p>
      ) : duels.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
          還沒有對戰。到「好友」頁挑戰朋友吧!
        </p>
      ) : (
        duels.map((d) => {
          const myDone = d.am_i_challenger ? d.ch_done : d.op_done;
          const oppName = d.am_i_challenger ? d.op_name : d.ch_name;
          const myS = d.am_i_challenger ? d.ch_score : d.op_score;
          const oppS = d.am_i_challenger ? d.op_score : d.ch_score;
          return (
            <div key={d.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">vs {oppName}</p>
                  <p className="text-xs text-slate-400">
                    {subjectLabel(d.subject)}・5 題{d.stake > 0 ? `・🪙 押 ${d.stake} 金幣` : "・友誼賽"}
                  </p>
                </div>
                {d.status === "pending" && !d.am_i_challenger ? (
                  <div className="flex gap-2">
                    <button onClick={() => call("accept_duel", d.id)} className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white">
                      接受(付 {d.stake} 金幣)
                    </button>
                    <button onClick={() => call("cancel_duel", d.id)} className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600">拒絕</button>
                  </div>
                ) : d.status === "pending" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">等對方接受…</span>
                    <button onClick={() => call("cancel_duel", d.id)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600">取消(退回金幣)</button>
                  </div>
                ) : d.status === "accepted" && !myDone ? (
                  <button onClick={() => setRoom(d.id)} className="rounded-full bg-rose-500 px-5 py-2 font-semibold text-white">
                    ⚔️ 進入對戰房間
                  </button>
                ) : d.status === "accepted" ? (
                  <button onClick={() => setRoom(d.id)} className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-500">等對方交卷…</button>
                ) : (
                  <div className="text-right">
                    <p className="font-bold">{resultText(d)}</p>
                    {d.status === "settled" && <p className="text-xs text-slate-400">你 {myS} : {oppS} 對方</p>}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function DuelPage() {
  return (
    <Suspense>
      <DuelInner />
    </Suspense>
  );
}
