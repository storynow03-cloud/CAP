"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUBJECTS } from "@/lib/types";

interface Realm {
  id: number;
  title: string;
  description: string | null;
  subject: string | null;
  target_count: number;
  reward_xp: number;
  reward_coins: number;
  is_team: boolean;
  starts_at: string;
  ends_at: string;
  is_open: boolean;
  is_joined: boolean;
  my_progress: number;
  team_total: number;
  participant_count: number;
  claimed: boolean;
}

const ERR: Record<string, string> = {
  NOT_IN_WINDOW: "現在不在秘境的開放時間內",
  INACTIVE: "這個秘境已下架",
  NOT_JOINED: "請先加入秘境",
  ALREADY_CLAIMED: "已經領過獎勵了",
  NOT_YET: "還沒達成目標,再接再厲!",
};

function subjLabel(k: string | null) {
  return k ? SUBJECTS.find((s) => s.key === k)?.label ?? k : "全科";
}
function timeLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "已結束";
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `剩 ${Math.floor(h / 24)} 天`;
  if (h >= 1) return `剩 ${h} 小時`;
  return `剩 ${Math.max(1, Math.floor(ms / 60000))} 分鐘`;
}

export default function RealmPage() {
  const [realms, setRealms] = useState<Realm[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("get_realms");
    setRealms((data as Realm[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function join(r: Realm) {
    setBusy(r.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("join_realm", { p_id: r.id });
    setBusy(null);
    if (error) { setMsg(ERR[error.message] ?? "加入失敗:" + error.message); return; }
    setMsg(`🗺️ 已加入「${r.title}」!去做題累積進度吧!`);
    load();
  }

  async function claim(r: Realm) {
    setBusy(r.id);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("claim_realm_reward", { p_id: r.id });
    setBusy(null);
    if (error) { setMsg(ERR[error.message] ?? "領取失敗:" + error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    setMsg(`🎉 秘境完成!獲得 ${row?.reward_xp ?? 0} XP・${row?.reward_coins ?? 0} 🪙`);
    load();
  }

  if (loading) return <p className="py-12 text-center text-slate-500">載入中…</p>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">🗺️ 秘境</h1>
      <p className="text-sm text-slate-500">老師/家長發布的限時懸賞任務,做題累積進度,達標領大獎!</p>
      {msg && <p className="rounded-lg bg-amber-50 p-2 text-center text-sm text-amber-700">{msg}</p>}

      {realms.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">
          目前沒有進行中的秘境,敬請期待!
        </div>
      ) : (
        <div className="space-y-3">
          {realms.map((r) => {
            const total = r.is_team ? r.team_total : r.my_progress;
            const pct = Math.min(100, (total / r.target_count) * 100);
            const done = total >= r.target_count;
            return (
              <div key={r.id}
                className={`rounded-2xl p-4 shadow-sm ${r.is_team ? "bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white" : "bg-white"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 font-bold">
                      {r.is_team && "👥"} {r.title}
                    </p>
                    {r.description && <p className={`mt-0.5 text-xs ${r.is_team ? "opacity-90" : "text-slate-500"}`}>{r.description}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${r.is_open ? "bg-emerald-400 text-white" : "bg-slate-300 text-slate-600"}`}>
                    {r.is_open ? timeLeft(r.ends_at) : "已截止"}
                  </span>
                </div>

                <p className={`mt-2 text-xs ${r.is_team ? "opacity-90" : "text-slate-400"}`}>
                  {subjLabel(r.subject)}・目標 {r.target_count} 題・🎁 {r.reward_xp} XP・{r.reward_coins} 🪙
                  {r.is_team && `・已有 ${r.participant_count} 人參加`}
                </p>

                {r.is_joined && (
                  <div className="mt-2">
                    <div className={`h-2 overflow-hidden rounded-full ${r.is_team ? "bg-white/25" : "bg-slate-100"}`}>
                      <div className={`h-full rounded-full ${r.is_team ? "bg-white" : "accent-bg"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className={`mt-1 text-xs ${r.is_team ? "opacity-90" : "text-slate-400"}`}>
                      {r.is_team ? `全隊進度 ${total}/${r.target_count} 題(我貢獻 ${r.my_progress} 題)` : `進度 ${total}/${r.target_count} 題`}
                    </p>
                  </div>
                )}

                <div className="mt-3">
                  {!r.is_joined ? (
                    r.is_open ? (
                      <button onClick={() => join(r)} disabled={busy === r.id}
                        className="w-full rounded-full bg-amber-500 py-2 text-sm font-bold text-white disabled:opacity-50">
                        加入秘境
                      </button>
                    ) : (
                      <p className={`text-center text-xs ${r.is_team ? "opacity-70" : "text-slate-400"}`}>未開放加入</p>
                    )
                  ) : r.claimed ? (
                    <span className="block rounded-full bg-emerald-100 py-2 text-center text-sm font-bold text-emerald-700">已領取獎勵 ✅</span>
                  ) : done ? (
                    <button onClick={() => claim(r)} disabled={busy === r.id}
                      className="w-full rounded-full bg-white py-2 text-sm font-bold text-violet-600 disabled:opacity-50">
                      🎁 領取獎勵
                    </button>
                  ) : (
                    <p className={`text-center text-xs font-semibold ${r.is_team ? "opacity-90" : "text-slate-500"}`}>
                      去{subjLabel(r.subject)}做題推進進度吧!
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
