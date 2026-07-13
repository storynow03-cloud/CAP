"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** 每日登入獎勵:進儀表板自動領,首次領取顯示慶祝橫幅(連續登入階梯式,第 7 天起封頂 70)。 */
export default function DailyLogin() {
  const [banner, setBanner] = useState<{ reward: number; streak: number } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("daily_login").then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (row && !row.already && row.reward > 0) setBanner({ reward: row.reward, streak: row.streak });
    });
  }, []);

  if (!banner) return null;
  return (
    <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-3 text-white shadow">
      <div>
        <p className="font-bold">🎁 每日簽到獎勵 +{banner.reward} 🪙</p>
        <p className="text-xs opacity-90">
          連續 {banner.streak} 天登入{banner.streak < 7 ? `,明天 +${Math.min(banner.streak + 1, 7) * 10}!` : ",已達最高獎勵!"}
        </p>
      </div>
      <button onClick={() => setBanner(null)} className="rounded-full bg-white/25 px-3 py-1 text-sm">✕</button>
    </div>
  );
}
