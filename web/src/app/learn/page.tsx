import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// 「學習」:今天要練什麼?(考卷診斷移到「診斷」)
const ITEMS = [
  { href: "/challenge", emoji: "⚔️", label: "分階挑戰", sub: "依你的等級出題,愈做愈強", color: "#4f46e5" },
  { href: "/practice", emoji: "📝", label: "自由練習", sub: "自選科目、冊別、單元、難度", color: "#059669" },
  { href: "/wrong-book", emoji: "📌", label: "錯題本", sub: "把錯過的題目練到會", color: "#d97706" },
  { href: "/mock-exam", emoji: "🎯", label: "模擬考", sub: "照會考規格考一份,看離 A++ 多遠", color: "#7c3aed" },
  { href: "/practice?format=written", emoji: "✍️", label: "非選題", sub: "數學非選:寫完過程再對答案", color: "#0891b2" },
];

export default async function LearnHub() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let due = 0;

  if (user) {
    const { count } = await supabase
      .from("wrong_book").select("question_id, questions!inner(needs_review)", { count: "exact", head: true })
      .eq("user_id", user.id).eq("status", "active").eq("questions.needs_review", false)
      .lte("due_at", new Date().toISOString());
    due = count ?? 0;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">📚 學習</h1>
      <p className="text-sm text-slate-500">今天要練什麼?選一種方式開始。想知道自己哪裡不會,到「📊 診斷」。</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map((it) => (
          <Link key={it.href} href={it.href}
            className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm transition hover:shadow">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-2xl"
              style={{ backgroundColor: `${it.color}1a` }}>{it.emoji}</span>
            <div className="min-w-0">
              <p className="font-bold">
                {it.label}
                {it.href === "/wrong-book" && due > 0 && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{due} 題到期</span>
                )}

              </p>
              <p className="text-xs text-slate-500">{it.sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
