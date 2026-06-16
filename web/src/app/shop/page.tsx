"use client";

import { useState } from "react";
import ShopPanel from "@/components/ShopPanel";
import MarketPanel from "@/components/MarketPanel";

export default function ShopPage() {
  const [tab, setTab] = useState<"shop" | "market">("shop");
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">🏪 商店</h1>
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
