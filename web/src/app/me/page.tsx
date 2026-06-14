"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ACHIEVEMENTS, SHOP_ITEMS, PETS, levelFromXp, petEmoji, petStage, STAGE_NAMES,
  itemByKey, type AchStats,
} from "@/lib/gamify";

interface Profile {
  nickname: string;
  xp: number;
  coins: number;
  equipped_theme: string | null;
  equipped_frame: string | null;
  pet: string;
  avatar_url: string | null;
}

export default function MePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<AchStats | null>(null);
  const [tab, setTab] = useState<"achievements" | "shop" | "pet">("achievements");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const uid = u.user.id;

    const [{ data: p }, { data: items }, { data: ach }, { data: mastery }, ac, an, conq, exam] =
      await Promise.all([
        supabase.from("profiles").select("nickname,xp,coins,equipped_theme,equipped_frame,pet,avatar_url").eq("id", uid).maybeSingle(),
        supabase.from("user_items").select("key").eq("user_id", uid),
        supabase.from("user_achievements").select("key").eq("user_id", uid),
        supabase.from("mastery").select("level"),
        supabase.from("attempts").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("is_correct", true),
        supabase.from("attempts").select("*", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("wrong_book").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("status", "overcome"),
        supabase.from("exam_sessions").select("*", { count: "exact", head: true }).eq("user_id", uid),
      ]);

    // 連續達標天數
    const { data: ds } = await supabase
      .from("daily_stats").select("day,total").eq("user_id", uid).order("day", { ascending: false }).limit(40);
    const goal = 20;
    let streakDays = 0;
    const byDay = new Map((ds ?? []).map((d) => [d.day, d.total]));
    for (let i = 0; i < 40; i++) {
      const d = new Date(Date.now() - i * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
      const t = byDay.get(d) ?? 0;
      if (t >= goal) streakDays++;
      else if (i === 0) continue;
      else break;
    }

    const levels = (mastery ?? []).map((m) => m.level);
    const s: AchStats = {
      streakDays,
      totalCorrect: ac.count ?? 0,
      totalAnswered: an.count ?? 0,
      maxTopicLevel: levels.length ? Math.max(...levels) : 0,
      masteredTopics: levels.filter((l) => l >= 4).length,
      conquered: conq.count ?? 0,
      examCount: exam.count ?? 0,
    };

    const already = new Set((ach ?? []).map((a) => a.key));
    // 檢查新解鎖的成就,寫入 DB
    const newly = ACHIEVEMENTS.filter((a) => !already.has(a.key) && a.check(s));
    if (newly.length) {
      await supabase.from("user_achievements").upsert(newly.map((a) => ({ user_id: uid, key: a.key })));
      newly.forEach((a) => already.add(a.key));
    }

    setProfile(p as Profile);
    setOwned(new Set((items ?? []).map((i) => i.key)));
    setUnlocked(already);
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function buy(key: string, price: number) {
    if (!profile) return;
    if (profile.coins < price) {
      setMsg("金幣不足 🪙");
      return;
    }
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("user_items").upsert({ user_id: u.user!.id, key });
    await supabase.from("profiles").update({ coins: profile.coins - price }).eq("id", u.user!.id);
    setMsg("購買成功!到下方點「裝備」即可使用");
    load();
  }

  async function equip(key: string, type: "theme" | "frame") {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    const col = type === "theme" ? "equipped_theme" : "equipped_frame";
    await supabase.from("profiles").update({ [col]: key }).eq("id", u.user!.id);
    setMsg("已裝備!重新整理頁面看效果");
    load();
  }

  async function saveName() {
    const name = nameInput.trim();
    if (!name) { setMsg("暱稱不能空白"); return; }
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("profiles").update({ nickname: name }).eq("id", u.user!.id);
    setEditing(false);
    setMsg("暱稱已更新 ✅");
    load();
  }

  async function uploadAvatar(file: File) {
    if (!file.type.startsWith("image/")) { setMsg("請選圖片檔"); return; }
    if (file.size > 5 * 1024 * 1024) { setMsg("圖片請小於 5MB"); return; }
    setUploading(true);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user!.id;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${uid}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { setMsg("上傳失敗:" + error.message); setUploading(false); return; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${pub.publicUrl}?t=${Date.now()}`; // 加時間戳避免快取
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", uid);
    setUploading(false);
    setMsg("照片已更新 ✅");
    load();
  }

  async function choosePet(key: string) {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("profiles").update({ pet: key }).eq("id", u.user!.id);
    setMsg("已選擇夥伴!做題就會幫牠長大 🐣");
    load();
  }

  // 轉蛋:花 80 金幣抽一個還沒擁有的裝扮
  async function gacha() {
    if (!profile) return;
    const price = 80;
    if (profile.coins < price) {
      setMsg("金幣不足 🪙(轉蛋要 80)");
      return;
    }
    const pool = SHOP_ITEMS.filter((i) => i.price > 0 && !owned.has(i.key));
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (pool.length === 0) {
      // 全收集完 → 退一半金幣
      await supabase.from("profiles").update({ coins: profile.coins - price + 40 }).eq("id", u.user!.id);
      setMsg("你已收集所有裝扮!退回 40 金幣 🪙");
      load();
      return;
    }
    const win = pool[Math.floor(Math.random() * pool.length)];
    await supabase.from("user_items").upsert({ user_id: u.user!.id, key: win.key });
    await supabase.from("profiles").update({ coins: profile.coins - price }).eq("id", u.user!.id);
    setMsg(`🎉 轉蛋抽中:${win.label}!到對應分類點裝備`);
    load();
  }

  if (loading || !profile || !stats)
    return <p className="py-12 text-center text-slate-500">載入中…</p>;

  const lv = levelFromXp(profile.xp);
  const frame = itemByKey(profile.equipped_frame);

  return (
    <div className="space-y-5">
      {/* 個人卡 */}
      <section className="accent-hero rounded-2xl p-6 text-white shadow">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="頭像"
                className="h-16 w-16 rounded-full border-2 border-white/40 object-cover" />
            ) : (
              <div className="grid h-16 w-16 place-items-center rounded-full bg-white/20 text-2xl font-black">
                Lv{lv.level}
              </div>
            )}
            {frame && <span className="absolute -right-1 -top-1 text-xl">{frame.value}</span>}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold">{profile.nickname}</p>
              <button onClick={() => { setNameInput(profile.nickname); setEditing(!editing); }}
                className="rounded-full bg-white/20 px-2 py-0.5 text-xs">✏️ 編輯</button>
            </div>
            <p className="text-sm opacity-90">Lv{lv.level}|XP {profile.xp}|🪙 {profile.coins}</p>
          </div>
          <div className="text-center">
            <div className="text-4xl">{petEmoji(profile.pet, lv.level)}</div>
            <div className="text-xs opacity-80">{STAGE_NAMES[petStage(lv.level)]}</div>
          </div>
        </div>

        {editing && (
          <div className="mt-4 space-y-3 rounded-xl bg-white/15 p-3">
            <div>
              <label className="text-xs opacity-80">暱稱</label>
              <div className="mt-1 flex gap-2">
                <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={20}
                  className="flex-1 rounded-lg px-3 py-2 text-slate-900" placeholder="輸入新暱稱" />
                <button onClick={saveName} className="rounded-lg bg-white px-4 font-semibold accent-text">儲存</button>
              </div>
            </div>
            <div>
              <label className="text-xs opacity-80">大頭照</label>
              <label className="mt-1 flex cursor-pointer items-center justify-center rounded-lg bg-white/25 py-2 text-sm font-semibold">
                {uploading ? "上傳中…" : "📷 選擇照片上傳"}
                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                  onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
              </label>
              <p className="mt-1 text-xs opacity-70">建議正方形圖片,小於 5MB</p>
            </div>
          </div>
        )}

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white" style={{ width: `${(lv.intoLevel / lv.levelSpan) * 100}%` }} />
        </div>
        <p className="mt-1 text-xs opacity-80">再 {lv.toNext} XP 升 Lv{lv.level + 1}</p>
      </section>

      {/* 分頁 */}
      <div className="flex gap-2">
        <button onClick={() => setTab("achievements")}
          className={`flex-1 rounded-full py-2 text-sm font-semibold ${tab === "achievements" ? "accent-bg text-white" : "bg-white text-slate-600"}`}>
          🏅 成就 ({unlocked.size}/{ACHIEVEMENTS.length})
        </button>
        <button onClick={() => setTab("pet")}
          className={`flex-1 rounded-full py-2 text-sm font-semibold ${tab === "pet" ? "accent-bg text-white" : "bg-white text-slate-600"}`}>
          🐣 夥伴
        </button>
        <button onClick={() => setTab("shop")}
          className={`flex-1 rounded-full py-2 text-sm font-semibold ${tab === "shop" ? "accent-bg text-white" : "bg-white text-slate-600"}`}>
          🛍️ 商城
        </button>
      </div>

      {msg && <p className="rounded-lg bg-amber-50 p-2 text-center text-sm text-amber-700">{msg}</p>}

      {tab === "achievements" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ACHIEVEMENTS.map((a) => {
            const got = unlocked.has(a.key);
            return (
              <div key={a.key}
                className={`rounded-2xl p-4 text-center shadow-sm ${got ? "bg-white" : "bg-slate-100 opacity-60"}`}>
                <div className={`text-3xl ${got ? "" : "grayscale"}`}>{got ? a.emoji : "🔒"}</div>
                <p className="mt-1 text-sm font-bold">{a.label}</p>
                <p className="text-xs text-slate-500">{a.desc}</p>
              </div>
            );
          })}
        </div>
      ) : tab === "pet" ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
            <div className="text-6xl">{petEmoji(profile.pet, lv.level)}</div>
            <p className="mt-2 font-bold">
              {PETS.find((p) => p.key === profile.pet)?.name ?? "夥伴"}・{STAGE_NAMES[petStage(lv.level)]}
            </p>
            <p className="text-xs text-slate-500">
              夥伴會隨你的等級進化:Lv3 幼年 → Lv7 成長期 → Lv15 完全體。多做題讓牠長大!
            </p>
          </div>
          <h3 className="font-bold">選擇夥伴</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PETS.map((p) => {
              const active = profile.pet === p.key;
              return (
                <button key={p.key} onClick={() => choosePet(p.key)}
                  className={`rounded-2xl p-4 text-center shadow-sm ${active ? "accent-border border-2 bg-white" : "bg-white"}`}>
                  <div className="text-3xl">{p.stages[petStage(lv.level)]}</div>
                  <p className="mt-1 text-sm font-semibold">{p.name}</p>
                  {active && <span className="text-xs accent-text">使用中</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 轉蛋 */}
          <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-pink-500 to-violet-500 p-4 text-white shadow-sm">
            <div>
              <p className="font-bold">🥚 神秘轉蛋</p>
              <p className="text-xs opacity-90">隨機抽一個裝扮(可能抽到稀有款)</p>
            </div>
            <button onClick={gacha} className="rounded-full bg-white/25 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/35">
              🪙 80 轉一次
            </button>
          </div>
          {(["theme", "frame"] as const).map((type) => (
            <div key={type}>
              <h3 className="mb-2 font-bold">{type === "theme" ? "🎨 主題色" : "🖼️ 頭像框"}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {SHOP_ITEMS.filter((i) => i.type === type).map((item) => {
                  const have = owned.has(item.key) || item.price === 0;
                  const equipped =
                    (type === "theme" ? profile.equipped_theme : profile.equipped_frame) === item.key;
                  return (
                    <div key={item.key} className="rounded-2xl bg-white p-3 text-center shadow-sm">
                      {type === "theme" ? (
                        <div className="mx-auto h-8 w-8 rounded-full" style={{ backgroundColor: item.value }} />
                      ) : (
                        <div className="text-2xl">{item.value}</div>
                      )}
                      <p className="mt-1 text-sm font-semibold">{item.label}</p>
                      {equipped ? (
                        <span className="mt-1 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">使用中</span>
                      ) : have ? (
                        <button onClick={() => equip(item.key, type)}
                          className="mt-1 rounded-full accent-bg px-3 py-1 text-xs text-white">裝備</button>
                      ) : (
                        <button onClick={() => buy(item.key, item.price)}
                          className="mt-1 rounded-full bg-amber-500 px-3 py-1 text-xs text-white">🪙 {item.price}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
