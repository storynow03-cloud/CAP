import Link from "next/link";
import { thisWeekBoss } from "@/lib/gamify";

export default function ArenaHub() {
  const boss = thisWeekBoss();
  const items = [
    { href: "/boss", emoji: "👹", label: "本週王關", sub: `${boss.name}・擊倒拿大獎`, from: "from-rose-500", to: "to-purple-600" },
    { href: "/friends", emoji: "👬", label: "好友 PK", sub: "加好友、週排行、1v1 對戰", from: "from-sky-500", to: "to-indigo-600" },
    { href: "/duel", emoji: "⚔️", label: "對戰紀錄", sub: "查看你的 PK 戰績", from: "from-amber-500", to: "to-orange-600" },
    { href: "/contest", emoji: "🏆", label: "大會考", sub: "老師/家長出卷,全班排名", from: "from-emerald-500", to: "to-teal-600" },
    { href: "/market", emoji: "🏪", label: "交易所", sub: "把重複裝扮賣給別人換金幣", from: "from-fuchsia-500", to: "to-pink-600" },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">⚔️ 對戰</h1>
      <p className="text-sm text-slate-500">跟魔王、好友、同學一較高下!</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <Link key={it.href} href={it.href}
            className={`flex items-center gap-4 rounded-2xl bg-gradient-to-br ${it.from} ${it.to} p-5 text-white shadow transition hover:brightness-110`}>
            <span className="text-3xl">{it.emoji}</span>
            <div className="min-w-0">
              <p className="font-bold">{it.label}</p>
              <p className="text-xs opacity-90">{it.sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
