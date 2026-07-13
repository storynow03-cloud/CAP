"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/", label: "🏠 首頁", match: ["/"] },
  { href: "/learn", label: "📚 練習", match: ["/learn", "/challenge", "/practice", "/wrong-book", "/mock-exam"] },
  { href: "/arena", label: "⚔️ 對戰", match: ["/arena", "/boss", "/friends", "/duel", "/contest", "/realm"] },
  { href: "/shop", label: "🏪 商店", match: ["/shop", "/market"] },
  { href: "/history", label: "📈 歷程", match: ["/history"] },
  { href: "/me", label: "🙂 我的", match: ["/me", "/admin"] },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname.startsWith("/login")) return null;

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto px-2 py-2 text-sm">
        <span className="accent-text mr-2 whitespace-nowrap px-2 font-bold">
          會考衝刺站
        </span>
        {LINKS.map((l) => {
          const active =
            l.href === "/"
              ? pathname === "/"
              : l.match.some((m) => m !== "/" && pathname.startsWith(m));
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 ${
                active ? "accent-bg text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
        <button
          onClick={signOut}
          className="ml-auto whitespace-nowrap rounded-full px-3 py-1.5 text-slate-400 hover:bg-slate-100"
        >
          登出
        </button>
      </div>
    </nav>
  );
}
