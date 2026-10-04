"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// 管理模組分 4 區(和孩子端的 學習/診斷/挑戰/獎勵 同一套邏輯)
// l2: L2 家長(guardian)也能用;其他只限 L1(teacher/parent)
type Mod = { href: string; l2?: boolean; emoji: string; label: string; sub: string; from: string; to: string };
const GROUPS: { title: string; hint: string; mods: Mod[] }[] = [
  { title: "👀 看孩子", hint: "學習狀況、會考預估、考卷診斷", mods: [
    { href: "/admin/progress", l2: true, emoji: "📊", label: "學習狀況", sub: "會考預估積分、弱點單元、每一題作答", from: "from-indigo-500", to: "to-blue-600" },
    { href: "/diagnose", emoji: "📷", label: "考卷診斷", sub: "上傳學校考卷,看補強進度", from: "from-rose-500", to: "to-red-600" },
  ] },
  { title: "📚 管題庫", hint: "題目正確最重要", mods: [
    { href: "/admin/reports", emoji: "🚩", label: "題目回報", sub: "孩子回報有問題的題目,確認後可一鍵隱藏", from: "from-rose-500", to: "to-pink-600" },
    { href: "/admin/questions", emoji: "🛠️", label: "題目管理", sub: "找出隱藏的題目、修正內容、再放回題庫", from: "from-cyan-500", to: "to-sky-600" },
  ] },
  { title: "🎁 管獎勵", hint: "金幣、現金券、商城、夥伴、秘境", mods: [
    { href: "/admin/rewards", l2: true, emoji: "🎁", label: "發放獎勵", sub: "給孩子金幣、現金券、特權券或裝扮", from: "from-pink-500", to: "to-rose-600" },
    { href: "/admin/vouchers", emoji: "💵", label: "現金券兌換", sub: "孩子換的現金券/特權券,發放後按已發放", from: "from-emerald-600", to: "to-lime-600" },
    { href: "/admin/shop", emoji: "🛍️", label: "商城管理", sub: "商品上下架、價格、交易所下架", from: "from-amber-500", to: "to-orange-600" },
    { href: "/admin/pets", emoji: "🐾", label: "夥伴管理", sub: "新增夥伴、上傳圖片、設定加成", from: "from-emerald-500", to: "to-teal-600" },
    { href: "/admin/realms", emoji: "🗺️", label: "秘境管理", sub: "發布限時懸賞任務(個人/團體)", from: "from-violet-500", to: "to-fuchsia-600" },
  ] },
  { title: "⚙️ 系統", hint: "帳號與操作紀錄", mods: [
    { href: "/admin/users", emoji: "🧑‍🎓", label: "帳號管理", sub: "新增/編輯學生、家長 L1/L2 帳號", from: "from-slate-600", to: "to-slate-800" },
    { href: "/admin/audit", emoji: "🧾", label: "操作紀錄", sub: "誰改了什麼都有紀錄,改錯可一鍵還原", from: "from-stone-500", to: "to-stone-700" },
  ] },
];

export default function AdminHubPage() {
  const [denied, setDenied] = useState(false);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: u }) => {
      if (!u.user) { setDenied(true); setLoading(false); return; }
      const { data: p } = await supabase.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
      setDenied(!p || !["teacher", "parent", "guardian"].includes(p.role));
      setRole(p?.role ?? "");
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="py-12 text-center text-slate-500">載入中…</p>;
  if (denied)
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-bold">🔒 需要管理者權限</p>
        <p className="mt-1 text-sm text-slate-500">只有老師/家長角色能進入管理後台。</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">🛠️ 管理後台</h1>
      <p className="text-sm text-slate-500">{role === "guardian" ? "家長 L2:看孩子的學習狀況、發放獎勵。" : "管理模組分成 4 區:看孩子、管題庫、管獎勵、系統。"}</p>
      {GROUPS.map((g) => {
        const mods = g.mods.filter((m) => role !== "guardian" || m.l2);
        if (!mods.length) return null;
        return (
          <section key={g.title} className="space-y-2">
            <h2 className="font-bold">{g.title}<span className="ml-2 text-xs font-normal text-slate-400">{g.hint}</span></h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {mods.map((m) => (
                <Link key={m.href} href={m.href}
                  className={`flex items-center gap-4 rounded-2xl bg-gradient-to-br ${m.from} ${m.to} p-5 text-white shadow transition hover:brightness-110`}>
                  <span className="text-3xl">{m.emoji}</span>
                  <div className="min-w-0">
                    <p className="font-bold">{m.label}</p>
                    <p className="text-xs opacity-90">{m.sub}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
