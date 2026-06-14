"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/", label: "首頁" },
  { href: "/challenge", label: "分階挑戰" },
  { href: "/contest", label: "大會考" },
  { href: "/practice", label: "自由練習" },
  { href: "/wrong-book", label: "錯題本" },
  { href: "/history", label: "學習歷程" },
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
        <span className="mr-2 whitespace-nowrap px-2 font-bold text-indigo-700">
          會考衝刺站
        </span>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 ${
              pathname === l.href
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {l.label}
          </Link>
        ))}
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
