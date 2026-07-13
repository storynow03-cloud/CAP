"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const MODULES = [
  { href: "/admin/users", emoji: "🧑‍🎓", label: "帳號管理", sub: "新增/編輯/刪除學生與管理者帳號", from: "from-slate-600", to: "to-slate-800" },
  { href: "/admin/shop", emoji: "🛍️", label: "商城管理", sub: "官方商城商品 CRUD、玩家交易所下架", from: "from-amber-500", to: "to-orange-600" },
  { href: "/admin/pets", emoji: "🐾", label: "夥伴管理", sub: "新增夥伴、上傳圖片、設定加成", from: "from-emerald-500", to: "to-teal-600" },
  { href: "/admin/realms", emoji: "🗺️", label: "秘境管理", sub: "發布限時懸賞任務(個人/團體)", from: "from-violet-500", to: "to-fuchsia-600" },
];

export default function AdminHubPage() {
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: u }) => {
      if (!u.user) { setDenied(true); setLoading(false); return; }
      const { data: p } = await supabase.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
      setDenied(!p || !["teacher", "parent"].includes(p.role));
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
      <p className="text-sm text-slate-500">帳號、商城、夥伴、秘境,四大管理模組都在這裡。</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {MODULES.map((m) => (
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
    </div>
  );
}
