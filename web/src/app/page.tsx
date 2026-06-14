import { createClient } from "@/lib/supabase/server";
import { LEVEL_NAMES, SUBJECTS } from "@/lib/types";
import Link from "next/link";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: mastery }, { data: stats }, { count: dueCount }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("mastery").select("*").eq("user_id", user.id),
      supabase
        .from("daily_stats")
        .select("*")
        .eq("user_id", user.id)
        .order("day", { ascending: false })
        .limit(30),
      supabase
        .from("wrong_book")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active")
        .lte("due_at", new Date().toISOString()),
    ]);

  const examDate = new Date(profile?.exam_date ?? "2027-05-15");
  const daysLeft = Math.max(0, Math.ceil((examDate.getTime() - Date.now()) / 86400000));
  const today = new Date().toISOString().slice(0, 10);
  const todayStat = stats?.find((s) => s.day === today);
  const goal = profile?.daily_goal ?? 20;

  // 連續達標天數
  let streakDays = 0;
  if (stats) {
    const byDay = new Map(stats.map((s) => [s.day, s.total]));
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const t = byDay.get(d) ?? 0;
      if (t >= goal) streakDays++;
      else if (i === 0) continue; // 今天還在努力中,不中斷連續
      else break;
    }
  }

  // 各科平均等級
  const subjectLevels = SUBJECTS.map((s) => {
    const rows = mastery?.filter((m) => m.subject === s.key) ?? [];
    const avg = rows.length
      ? Math.round(rows.reduce((sum, m) => sum + m.level, 0) / rows.length)
      : 0;
    return { ...s, level: avg, topics: rows.length };
  });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white shadow">
        <p className="text-sm opacity-80">嗨,{profile?.nickname || "同學"}!距離會考還有</p>
        <p className="text-5xl font-black">{daysLeft} 天</p>
        <div className="mt-4 flex gap-6 text-sm">
          <span>
            今日 {todayStat?.total ?? 0} / {goal} 題
            {(todayStat?.total ?? 0) >= goal ? " ✅" : ""}
          </span>
          <span>🔥 連續達標 {streakDays} 天</span>
          {(dueCount ?? 0) > 0 && <span>📌 待複習 {dueCount} 題</span>}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Link
          href="/challenge"
          className="rounded-2xl bg-indigo-600 p-5 text-white shadow transition hover:scale-[1.02]"
        >
          <div className="text-2xl">⚔️</div>
          <div className="mt-1 font-bold">分階挑戰</div>
          <div className="text-xs opacity-80">依你的等級出題</div>
        </Link>
        <Link
          href="/wrong-book"
          className="rounded-2xl bg-amber-500 p-5 text-white shadow transition hover:scale-[1.02]"
        >
          <div className="text-2xl">📌</div>
          <div className="mt-1 font-bold">錯題複習</div>
          <div className="text-xs opacity-80">{dueCount ?? 0} 題到期</div>
        </Link>
        <Link
          href="/practice"
          className="rounded-2xl bg-emerald-600 p-5 text-white shadow transition hover:scale-[1.02]"
        >
          <div className="text-2xl">📝</div>
          <div className="mt-1 font-bold">自由練習</div>
          <div className="text-xs opacity-80">自選單元難度</div>
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-4 font-bold">五科等級</h2>
        <div className="space-y-3">
          {subjectLevels.map((s) => (
            <Link key={s.key} href={`/challenge?subject=${s.key}`} className="flex items-center gap-3">
              <span className="w-10 text-sm font-semibold">{s.label}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(s.level / 5) * 100}%`, backgroundColor: s.color }}
                />
              </div>
              <span className="w-24 text-right text-xs text-slate-500">
                {s.level ? `Lv${s.level} ${LEVEL_NAMES[s.level]}` : "尚未開始"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
