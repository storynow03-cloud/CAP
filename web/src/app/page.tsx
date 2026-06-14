import { createClient } from "@/lib/supabase/server";
import { LEVEL_NAMES, SUBJECTS } from "@/lib/types";
import { levelFromXp, itemByKey, type QuestRow } from "@/lib/gamify";
import Link from "next/link";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const [{ data: profile }, { data: mastery }, { data: stats }, { count: dueCount }, { data: quests }] =
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
      supabase.from("daily_quests").select("*").eq("user_id", user.id).eq("day", today),
    ]);

  const xp = profile?.xp ?? 0;
  const coins = profile?.coins ?? 0;
  const lv = levelFromXp(xp);
  const frame = itemByKey(profile?.equipped_frame);
  // 預設任務(今天還沒作答時顯示 0 進度)
  const questDefs = [
    { key: "answer", label: "今日完成 15 題", target: 15 },
    { key: "correct", label: "答對 10 題", target: 10 },
    { key: "review", label: "複習 5 題錯題", target: 5 },
  ];
  const questList: QuestRow[] = questDefs.map((d) => {
    const q = (quests ?? []).find((x) => x.key === d.key);
    return (
      q ?? { ...d, progress: 0, reward_xp: 0, reward_coins: 0, completed: false }
    );
  });

  const examDate = new Date(profile?.exam_date ?? "2027-05-15");
  const daysLeft = Math.max(0, Math.ceil((examDate.getTime() - Date.now()) / 86400000));
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

  const goalPct = Math.min(100, ((todayStat?.total ?? 0) / goal) * 100);
  const questDone = questList.filter((q) => q.completed).length;

  return (
    <div className="space-y-4">
      {/* 戰績列:等級 / 連勝 / 金幣(點進個人頁)*/}
      <Link
        href="/me"
        className="flex items-stretch divide-x divide-slate-100 rounded-2xl bg-white px-2 py-3 shadow-sm transition hover:shadow"
      >
        <div className="flex flex-1 items-center gap-2.5 px-2">
          <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full accent-bg text-sm font-black text-white">
            {lv.level}
            {frame && <span className="absolute -right-1 -top-1 text-sm">{frame.value}</span>}
          </div>
          <div className="min-w-0">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full accent-bg" style={{ width: `${(lv.intoLevel / lv.levelSpan) * 100}%` }} />
            </div>
            <p className="mt-1 truncate text-xs text-slate-400">Lv{lv.level}・{xp} XP</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-2">
          <span className="text-lg font-black text-orange-500">🔥 {streakDays}</span>
          <span className="text-xs text-slate-400">連續天數</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-2">
          <span className="text-lg font-black text-amber-500">🪙 {coins}</span>
          <span className="text-xs text-slate-400">金幣</span>
        </div>
      </Link>

      {/* 會考倒數 + 今日目標 */}
      <section className="accent-hero rounded-3xl p-6 text-white shadow-lg">
        <p className="text-sm opacity-90">嗨,{profile?.nickname || "同學"} 👋 距離會考還有</p>
        <p className="mt-1 text-6xl font-black leading-none">
          {daysLeft}
          <span className="ml-1 text-2xl font-bold">天</span>
        </p>
        <div className="mt-5">
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="opacity-90">今日目標</span>
            <span className="font-semibold">
              {todayStat?.total ?? 0} / {goal} 題 {goalPct >= 100 ? "✅" : ""}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white transition-all" style={{ width: `${goalPct}%` }} />
          </div>
        </div>
      </section>

      {/* 主要行動:開始挑戰 */}
      <Link
        href="/challenge"
        className="flex items-center justify-between rounded-2xl accent-bg px-6 py-4 text-white shadow transition hover:brightness-110"
      >
        <span className="flex items-center gap-3">
          <span className="text-2xl">⚔️</span>
          <span>
            <span className="block font-bold">開始今日挑戰</span>
            <span className="block text-xs opacity-80">依你的等級出題,愈做愈強</span>
          </span>
        </span>
        <span className="text-2xl">→</span>
      </Link>

      {/* 王關 / 好友 PK */}
      <section className="grid grid-cols-2 gap-3">
        <Link href="/boss" className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-rose-500 to-purple-600 p-4 text-white shadow transition hover:brightness-110">
          <span className="text-3xl">👹</span>
          <span>
            <span className="block font-bold">本週王關</span>
            <span className="block text-xs opacity-80">擊倒魔王拿大獎</span>
          </span>
        </Link>
        <Link href="/friends" className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 p-4 text-white shadow transition hover:brightness-110">
          <span className="text-3xl">👬</span>
          <span>
            <span className="block font-bold">好友 PK</span>
            <span className="block text-xs opacity-80">跟同學比一比</span>
          </span>
        </Link>
      </section>

      {/* 次要行動 */}
      <section className="grid grid-cols-3 gap-3">
        {[
          { href: "/wrong-book", emoji: "📌", label: "錯題複習", sub: `${dueCount ?? 0} 題到期`, color: "#d97706" },
          { href: "/mock-exam", emoji: "🎯", label: "模擬考", sub: "五科綜合", color: "#7c3aed" },
          { href: "/practice", emoji: "📝", label: "自由練習", sub: "自選範圍", color: "#059669" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex flex-col items-center gap-1 rounded-2xl bg-white p-4 text-center shadow-sm transition hover:shadow"
          >
            <span
              className="grid h-11 w-11 place-items-center rounded-full text-xl"
              style={{ backgroundColor: `${a.color}1a` }}
            >
              {a.emoji}
            </span>
            <span className="mt-1 text-sm font-bold">{a.label}</span>
            <span className="text-xs text-slate-400">{a.sub}</span>
          </Link>
        ))}
      </section>

      {/* 每日任務 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">📋 每日任務</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
            {questDone}/{questList.length} 完成
          </span>
        </div>
        <div className="space-y-3.5">
          {questList.map((q) => {
            const pct = Math.min(100, (q.progress / q.target) * 100);
            const reward = q.key === "answer" ? 30 : q.key === "correct" ? 40 : 50;
            return (
              <div key={q.key} className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm"
                  style={{ backgroundColor: q.completed ? "#10b98122" : "#f1f5f9" }}>
                  {q.completed ? "✅" : "📖"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-sm">
                    <span className={q.completed ? "text-slate-400 line-through" : "font-medium"}>{q.label}</span>
                    <span className="text-xs text-slate-400">{Math.min(q.progress, q.target)}/{q.target}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${q.completed ? "bg-emerald-500" : "accent-bg"}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${q.completed ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                  +{reward}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 五科等級 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-bold">📊 五科等級</h2>
        <div className="space-y-3.5">
          {subjectLevels.map((s) => (
            <Link key={s.key} href={`/challenge?subject=${s.key}`} className="flex items-center gap-3">
              <span className="w-9 text-sm font-semibold" style={{ color: s.color }}>{s.label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${(s.level / 5) * 100}%`, backgroundColor: s.color }} />
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
