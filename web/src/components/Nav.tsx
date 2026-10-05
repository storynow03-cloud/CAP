"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 4 大類,每一類回答一個問題:學習(今天練什麼)、診斷(哪裡不會)、挑戰(跟誰比)、獎勵(努力換到什麼)
// subs:進入該類之後顯示的第二層選單,同類功能可以直接互相切換,不用回主頁
type Sub = { href: string; label: string; l1?: boolean };
const LINKS: { href: string; label: string; match: string[]; subs?: Sub[] }[] = [
  { href: "/", label: "🏠 首頁", match: ["/"] },
  {
    href: "/learn", label: "📚 學習", match: ["/learn", "/challenge", "/practice", "/wrong-book", "/mock-exam"],
    subs: [
      { href: "/challenge", label: "⚔️ 分階挑戰" },
      { href: "/practice", label: "📝 自由練習" },
      { href: "/wrong-book", label: "📌 錯題本" },
      { href: "/mock-exam", label: "🎯 模擬考" },
      { href: "/practice?format=written", label: "✍️ 非選題" },
    ],
  },
  {
    href: "/insight", label: "📊 診斷", match: ["/insight", "/chapters", "/history", "/diagnose"],
    subs: [
      { href: "/insight", label: "🎯 積分總覽" },
      { href: "/chapters", label: "📋 章節掌握度" },
      { href: "/history", label: "📈 學習歷程" },
      { href: "/diagnose", label: "📷 考卷診斷" },
    ],
  },
  {
    href: "/arena", label: "🎮 挑戰", match: ["/arena", "/boss", "/friends", "/duel", "/contest", "/realm", "/leaderboard"],
    subs: [
      { href: "/boss", label: "👹 魔王關" },
      { href: "/leaderboard", label: "🏅 排行榜" },
      { href: "/friends", label: "👬 好友 PK" },
      { href: "/duel", label: "⚔️ 對戰紀錄" },
      { href: "/contest", label: "🏆 大會考" },
      { href: "/realm", label: "🗺️ 秘境" },
    ],
  },
  {
    href: "/shop", label: "🎁 獎勵", match: ["/shop", "/market"],
    subs: [
      { href: "/shop", label: "🛍️ 商城" },
      { href: "/market", label: "🤝 交易所" },
      { href: "/me?tab=pet", label: "🐾 夥伴" },
    ],
  },
  {
    href: "/me", label: "🙂 我的", match: ["/me", "/admin"],
    subs: [
      { href: "/me", label: "🙂 我的" },
      { href: "/admin/progress", label: "📊 學習狀況" },
      { href: "/admin/rewards", label: "🎁 發放獎勵" },
      { href: "/admin/reports", label: "🚩 題目回報", l1: true },
      { href: "/admin/questions", label: "🛠️ 題目管理", l1: true },
      { href: "/admin/vouchers", label: "💵 兌換", l1: true },
      { href: "/admin/shop", label: "🛍️ 商城管理", l1: true },
      { href: "/admin/users", label: "🧑‍🎓 帳號", l1: true },
      { href: "/admin/audit", label: "🧾 操作紀錄", l1: true },
      { href: "/admin", label: "🛠️ 全部管理功能" },
    ],
  },
];

const pathOf = (href: string) => href.split("?")[0];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: u }) => {
      if (!u.user) return;
      const { data: p } = await supabase.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
      setRole(p?.role ?? "student");
    });
  }, []);

  if (pathname.startsWith("/login")) return null;

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (l: (typeof LINKS)[number]) =>
    l.href === "/" ? pathname === "/" : l.match.some((m) => m !== "/" && pathname.startsWith(m));
  const current = LINKS.find(isActive);
  const isStaff = role === "teacher" || role === "parent";
  const isGuardian = role === "guardian";
  // 「我的」底下的管理功能:學生不顯示;L2 家長只顯示自己能用的
  const subs = (current?.subs ?? []).filter((s) => {
    if (current?.href !== "/me" || s.href === "/me") return true;
    if (isStaff) return true;
    return isGuardian && !s.l1;
  });
  // 同一路徑的子選單只標一個(/practice 與 /practice?format=written)
  const activeSub = subs.find((s) => !s.href.includes("?") && (pathname === pathOf(s.href) || (pathOf(s.href) !== "/admin" && pathname.startsWith(pathOf(s.href) + "/"))))
    ?? subs.find((s) => pathname === pathOf(s.href));

  return (
    <nav className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-1 px-2 py-2 text-sm">
        <span className="accent-text mr-1 whitespace-nowrap px-1 font-bold sm:mr-2 sm:px-2">
          會考衝刺站
        </span>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-full px-2 py-1.5 sm:px-3 ${
              isActive(l) ? "accent-bg text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {l.label}
          </Link>
        ))}
        <button
          onClick={signOut}
          className="ml-auto whitespace-nowrap rounded-full px-2 py-1.5 text-slate-400 hover:bg-slate-100 sm:px-3"
        >
          登出
        </button>
      </div>
      {subs.length > 1 && (
        <div className="border-t border-slate-100 bg-slate-50/80">
          {/* 子分頁多(例如管理後台)時自動換行成多排,不出現橫向捲軸 */}
          <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-1 gap-y-1.5 px-2 py-1.5 text-xs">
            {subs.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className={`whitespace-nowrap rounded-full px-3 py-1 font-semibold ${
                  activeSub?.href === s.href ? "bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200" : "text-slate-500 hover:bg-white"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
