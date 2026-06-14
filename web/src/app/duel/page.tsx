"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchQuestionsByIds } from "@/lib/engine";
import Quiz, { type QuizResult } from "@/components/Quiz";
import { subjectLabel, type Question } from "@/lib/types";

interface DuelRow {
  id: number; subject: string; ch_name: string; op_name: string;
  ch_score: number | null; ch_time: number | null; ch_done: boolean;
  op_score: number | null; op_time: number | null; op_done: boolean;
  am_i_challenger: boolean; created_at: string;
}

function winnerText(d: DuelRow): string {
  if (!d.ch_done || !d.op_done) return "進行中";
  const myS = d.am_i_challenger ? d.ch_score! : d.op_score!;
  const myT = d.am_i_challenger ? d.ch_time! : d.op_time!;
  const oppS = d.am_i_challenger ? d.op_score! : d.ch_score!;
  const oppT = d.am_i_challenger ? d.op_time! : d.ch_time!;
  if (myS !== oppS) return myS > oppS ? "🏆 你贏了!" : "😢 你輸了";
  if (myT !== oppT) return myT < oppT ? "🏆 你贏了!(較快)" : "😢 你輸了(較慢)";
  return "🤝 平手";
}

function DuelInner() {
  const params = useSearchParams();
  const playId = params.get("play");
  const [userId, setUserId] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ duelId: number; questions: Question[]; mine: "ch" | "op" } | null>(null);
  const [duels, setDuels] = useState<DuelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadList = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("my_duels");
    setDuels((data as DuelRow[]) ?? []);
    setLoading(false);
  }, []);

  const startPlay = useCallback(async (id: string) => {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    setUserId(u.user?.id ?? null);
    const { data } = await supabase.rpc("get_duel", { duel_id: Number(id) });
    const d = (data as DuelRow[] & { question_ids: string[] }[])?.[0] as unknown as
      (DuelRow & { question_ids: string[]; ch_done: boolean; op_done: boolean }) | undefined;
    if (!d) { setError("找不到這場對戰"); return; }
    const mine = d.am_i_challenger ? "ch" : "op";
    if ((mine === "ch" && d.ch_done) || (mine === "op" && d.op_done)) {
      setError("你已經打完這場了");
      loadList();
      return;
    }
    const qs = await fetchQuestionsByIds(supabase, d.question_ids);
    setPlaying({ duelId: d.id, questions: qs, mine });
  }, [loadList]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      setUserId(u.user?.id ?? null);
      if (playId) await startPlay(playId);
      else await loadList();
    })();
  }, [playId, startPlay, loadList]);

  async function finishDuel(summary: { total: number; correct: number; results: QuizResult[] }) {
    if (!playing) return;
    const supabase = createClient();
    const time = summary.results.reduce((a, r) => a + r.timeMs, 0);
    const patch = playing.mine === "ch"
      ? { ch_score: summary.correct, ch_time: time, ch_done: true }
      : { op_score: summary.correct, op_time: time, op_done: true };
    await supabase.from("duels").update(patch).eq("id", playing.duelId);
    setPlaying(null);
    setLoading(true);
    loadList();
    window.history.replaceState(null, "", "/duel");
  }

  if (playing && userId) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-800">
          ⚔️ PK 對戰|{playing.questions.length} 題|又快又準才會贏!
        </div>
        <Quiz questions={playing.questions} userId={userId} mode="exam" onFinish={finishDuel} />
      </div>
    );
  }

  if (error)
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
        <Link href="/duel" className="accent-text underline" onClick={() => setError("")}>看對戰紀錄</Link>
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">⚔️ 對戰紀錄</h1>
        <Link href="/friends" className="rounded-full accent-bg px-4 py-1.5 text-sm font-semibold text-white">
          找好友 PK
        </Link>
      </div>
      {loading ? (
        <p className="py-12 text-center text-slate-500">載入中…</p>
      ) : duels.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
          還沒有對戰。到「好友」頁挑戰朋友吧!
        </p>
      ) : (
        duels.map((d) => {
          const iNeedToPlay = (d.am_i_challenger && !d.ch_done) || (!d.am_i_challenger && !d.op_done);
          const oppName = d.am_i_challenger ? d.op_name : d.ch_name;
          const myS = d.am_i_challenger ? d.ch_score : d.op_score;
          const oppS = d.am_i_challenger ? d.op_score : d.ch_score;
          return (
            <div key={d.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">vs {oppName}</p>
                  <p className="text-xs text-slate-400">{subjectLabel(d.subject)}・5 題</p>
                </div>
                {iNeedToPlay ? (
                  <button onClick={() => startPlay(String(d.id))}
                    className="rounded-full bg-rose-500 px-5 py-2 font-semibold text-white">
                    ⚔️ 應戰
                  </button>
                ) : d.ch_done && d.op_done ? (
                  <div className="text-right">
                    <p className="font-bold">{winnerText(d)}</p>
                    <p className="text-xs text-slate-400">你 {myS} : {oppS} 對方</p>
                  </div>
                ) : (
                  <span className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-500">等對方應戰…</span>
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
