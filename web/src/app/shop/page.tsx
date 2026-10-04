"use client";

import { useState } from "react";
import Link from "next/link";
import ShopPanel from "@/components/ShopPanel";
import MarketPanel from "@/components/MarketPanel";

export default function ShopPage() {
  const [tab, setTab] = useState<"shop" | "market">("shop");
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">🎁 獎勵</h1>
      <p className="text-sm text-slate-500">努力換到什麼?金幣可以換現金券、特權券、裝扮,也看得到爸媽送你的獎勵。</p>
      <div className="grid grid-cols-2 gap-2">
        <Link href="/me?tab=pet" className="flex items-center gap-2 rounded-2xl bg-white p-3 text-sm font-semibold shadow-sm">🐾 我的夥伴<span className="ml-auto text-slate-400">→</span></Link>
        <Link href="/me" className="flex items-center gap-2 rounded-2xl bg-white p-3 text-sm font-semibold shadow-sm">🏅 成就與裝扮<span className="ml-auto text-slate-400">→</span></Link>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setTab("shop")}
          className={`flex-1 rounded-full py-2 text-sm font-semibold ${tab === "shop" ? "accent-bg text-white" : "bg-white text-slate-600"}`}>
          🛍️ 官方商城
        </button>
        <button onClick={() => setTab("market")}
          className={`flex-1 rounded-full py-2 text-sm font-semibold ${tab === "market" ? "accent-bg text-white" : "bg-white text-slate-600"}`}>
          🤝 玩家交易所
        </button>
      </div>
      {tab === "shop" ? <ShopPanel /> : <MarketPanel />}
    </div>
  );
}
