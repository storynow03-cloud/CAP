"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { levelFromXp, petEmoji, itemByKey } from "@/lib/gamify";
import { SUBJECTS } from "@/lib/types";

interface BoardRow {
  nickname: string;
  xp: number;
  week_xp: number;
  pet: string;
  frame: string | null;
  friend_code: string;
  is_me: boolean;
}

export default function FriendsPage() {
  const router = useRouter();
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [myCode, setMyCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [duelFor, setDuelFor] = useState<string | null>(null); // friend_code being challenged

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("get_friends_board");
    const rows = (data as BoardRow[]) ?? [];
    setBoard(rows);
    setMyCode(rows.find((r) => r.is_me)?.friend_code ?? "");
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addFriend() {
    if (!codeInput.trim()) return;
    const supabase = createClient();
    const { data } = await supabase.rpc("add_friend", { code: codeInput.trim() });
    if (data === "NOT_FOUND") setMsg("找不到這個好友碼");
    else if (data === "SELF") setMsg("這是你自己的好友碼啦 😄");
    else {
      setMsg(`已加入好友:${data} 🎉`);
      setCodeInput("");
      load();
    }
  }

  // 對指定好友發起 PK:選科目 → 建立對戰 → 進入應戰
  async function startDuel(friendCode: string, subject: string) {
    const supabase = createClient();
    const { data: duelId, error } = await supabase.rpc("create_duel", {
      opp_code: friendCode,
      subj: subject,
    });
    if (error || !duelId) {
      setMsg("建立對戰失敗:" + (error?.message ?? "題目不足"));
      return;
    }
    router.push(`/duel?play=${duelId}`);
  }

  if (loading) return <p className="py-12 text-center text-slate-500">載入中…</p>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">👬 好友</h1>

      {/* 我的好友碼 + 加好友 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">把你的好友碼給同學/家人,互相加好友 PK:</p>
        <p className="my-2 select-all rounded-lg bg-slate-100 py-2 text-center text-2xl font-black tracking-widest accent-text">
          {myCode}
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="輸入對方好友碼"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center tracking-widest"
            maxLength={6}
          />
          <button onClick={addFriend} className="rounded-lg accent-bg px-5 font-semibold text-white">
            加好友
          </button>
        </div>
        {msg && <p className="mt-2 text-center text-sm text-amber-600">{msg}</p>}
      </section>

      {/* 本週排行榜 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">🏆 本週排行(好友間)</h2>
          <span className="text-xs text-slate-400">比本週 XP</span>
        </div>
        <div className="space-y-2">
          {board.map((r, i) => {
            const lv = levelFromXp(r.xp);
            const frame = itemByKey(r.frame);
            return (
              <div key={r.friend_code}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.is_me ? "bg-indigo-50" : ""}`}>
                <span className="w-7 text-center text-lg">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                </span>
                <span className="text-xl">{petEmoji(r.pet, lv.level)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {r.nickname}{r.is_me && "(我)"} {frame?.value ?? ""}
                  </p>
                  <p className="text-xs text-slate-400">Lv{lv.level}</p>
                </div>
                <span className="text-sm font-bold accent-text">{r.week_xp} XP</span>
                {!r.is_me && (
                  <button onClick={() => setDuelFor(duelFor === r.friend_code ? null : r.friend_code)}
                    className="rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white">
                    PK
                  </button>
                )}
              </div>
            );
          })}
          {board.length <= 1 && (
            <p className="py-4 text-center text-sm text-slate-400">還沒有好友,把上面的好友碼分享出去吧!</p>
          )}
        </div>

        {/* PK 科目選擇 */}
        {duelFor && (
          <div className="mt-3 rounded-xl bg-rose-50 p-3">
            <p className="mb-2 text-sm font-semibold text-rose-700">選擇 PK 科目(各 5 題,比又快又準):</p>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((s) => (
                <button key={s.key} onClick={() => startDuel(duelFor, s.key)}
                  className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-sm"
                  style={{ color: s.color }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="text-center text-sm text-slate-400">
        想看對戰結果?到 <a href="/duel" className="accent-text underline">對戰紀錄</a>
      </p>
    </div>
  );
}
