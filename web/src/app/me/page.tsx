"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUBJECTS } from "@/lib/types";
import {
  ACHIEVEMENTS, PETS, levelFromXp, petEmoji, petStage, STAGE_NAMES,
  itemByKey, fetchShopItems, affectionProgress, AFFECTION_NAMES, MAX_AFFECTION_LEVEL,
  nextStageReq, FINAL_STAGE, petMood, PET_SKILLS, type AchStats, type ShopItem,
} from "@/lib/gamify";

interface Expedition {
  id: number;
  subject: string;
  tier: number;
  target_count: number;
  progress_count: number;
  reward_xp: number;
  reward_coins: number;
  reward_food: string | null;
  reward_affection: number;
  status: string;
}
const EXP_TIERS = [
  { tier: 1, label: "短程探險", target: 10, reward: "60 XP・30🪙" },
  { tier: 2, label: "中程遠征", target: 20, reward: "140 XP・70🪙・小魚乾" },
  { tier: 3, label: "長征冒險", target: 30, reward: "240 XP・120🪙・蛋糕" },
];
const subjLabel = (k: string) => SUBJECTS.find((s) => s.key === k)?.label ?? k;

interface Profile {
  nickname: string;
  xp: number;
  coins: number;
  equipped_theme: string | null;
  equipped_frame: string | null;
  equipped_nameplate: string | null;
  equipped_title: string | null;
  pet: string;
  pet_affection: number;
  pet_fed_at: string | null;
  pet_play_day: string | null;
  care_streak: number;
  avatar_url: string | null;
  role: string;
}

export default function MePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<Map<string, number>>(new Map());
  const [expedition, setExpedition] = useState<Expedition | null>(null);
  const [expSubject, setExpSubject] = useState("math");
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<AchStats | null>(null);
  const [tab, setTab] = useState<"achievements" | "pet">("achievements");
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

    const [{ data: p }, { data: inv }, shop, { data: exp }, { data: ach }, { data: mastery }, ac, an, conq, exam] =
      await Promise.all([
        supabase.from("profiles").select("nickname,xp,coins,equipped_theme,equipped_frame,equipped_nameplate,equipped_title,pet,pet_affection,pet_fed_at,pet_play_day,care_streak,avatar_url,role").eq("id", uid).maybeSingle(),
        supabase.from("inventory").select("item_key,qty").eq("user_id", uid),
        fetchShopItems(supabase),
        supabase.from("pet_expeditions").select("*").eq("user_id", uid).in("status", ["active", "done"]).order("id", { ascending: false }).limit(1),
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
    setShopItems(shop);
    setInventory(new Map((inv ?? []).map((r) => [r.item_key, r.qty])));
    setExpedition(((exp ?? []) as Expedition[])[0] ?? null);
    setUnlocked(already);
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const FOOD_ERR: Record<string, string> = {
    NOT_ENOUGH_COINS: "金幣不足 🪙",
    NO_FOOD: "沒有這個食物了,先去買吧!",
  };

  async function buyFood(key: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc("buy_food", { p_key: key });
    if (error) { setMsg(FOOD_ERR[error.message] ?? "購買失敗:" + error.message); return; }
    setMsg("購買成功!到下方點「餵食」給夥伴吃 🍪");
    load();
  }

  async function feed(key: string) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("feed_pet", { p_key: key });
    if (error) { setMsg(FOOD_ERR[error.message] ?? "餵食失敗:" + error.message); return; }
    const aff = Array.isArray(data) ? data[0]?.affection : data?.affection;
    setMsg(`夥伴吃得好開心!好感度 ${aff ?? ""} ❤️`);
    load();
  }

  const EXP_ERR: Record<string, string> = {
    ALREADY_RUNNING: "已經有一個探險進行中了",
    NOT_DONE: "探險還沒完成",
    BAD_TIER: "探險難度錯誤",
  };
  async function rpcExp(fn: string, args: object, ok: string) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { setMsg(EXP_ERR[error.message] ?? "操作失敗:" + error.message); return; }
    setMsg(ok);
    load();
  }
  const startExp = (tier: number) =>
    rpcExp("start_expedition", { p_subject: expSubject, p_tier: tier }, `🧭 夥伴出發${subjLabel(expSubject)}探險!做題就會推進進度`);
  const claimExp = (id: number) => rpcExp("claim_expedition", { p_id: id }, "🎁 探險獎勵已領取!");
  const cancelExp = (id: number) => rpcExp("cancel_expedition", { p_id: id }, "已召回夥伴");

  async function petPlay() {
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("pet_play");
    setBusy(false);
    if (error) {
      const m = error.message === "ALREADY_PLAYED" ? "今天已經陪過夥伴囉,明天再來!"
        : error.message === "NEED_STUDY" ? "先完成今天至少 5 題,夥伴才有體力陪你玩 📚"
        : "操作失敗:" + error.message;
      setMsg(m);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setMsg(`夥伴超開心!好感度 +5${row?.bonus_coins ? `,連續照顧 ${row.streak} 天獎勵 ${row.bonus_coins}🪙!` : ` ❤️(連續照顧 ${row?.streak ?? 1} 天)`}`);
    load();
  }

  if (loading || !profile || !stats)
    return <p className="py-12 text-center text-slate-500">載入中…</p>;

  const lv = levelFromXp(profile.xp);
  const frame = itemByKey(shopItems, profile.equipped_frame);
  const nameplate = itemByKey(shopItems, profile.equipped_nameplate);
  const title = itemByKey(shopItems, profile.equipped_title);
  const petAff = profile.pet_affection ?? 0;
  const aff = affectionProgress(petAff);
  const stage = petStage(lv.level, petAff);
  const nextReq = nextStageReq(lv.level, petAff);
  const foods = shopItems.filter((i) => i.type === "food" && i.active);

  // 心情:距上次照顧(餵食或陪伴)的天數
  const tpe = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const todayStr = tpe(new Date());
  const careDates = [
    profile.pet_fed_at ? tpe(new Date(profile.pet_fed_at)) : null,
    profile.pet_play_day,
  ].filter(Boolean) as string[];
  const lastCare = careDates.sort().pop() ?? null;
  const daysSinceCare = lastCare ? Math.round((Date.parse(todayStr) - Date.parse(lastCare)) / 86400000) : 3;
  const mood = petMood(daysSinceCare);
  const playedToday = profile.pet_play_day === todayStr;

  return (
    <div className="space-y-5">
      {/* 個人卡 */}
      <section className="accent-hero rounded-2xl p-6 text-white shadow"
        style={nameplate ? { background: nameplate.value } : undefined}>
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
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl font-bold">{profile.nickname}</p>
              {title && <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-semibold">{title.value}</span>}
              <button onClick={() => { setNameInput(profile.nickname); setEditing(!editing); }}
                className="rounded-full bg-white/20 px-2 py-0.5 text-xs">✏️ 編輯</button>
            </div>
            <p className="text-sm opacity-90">Lv{lv.level}|XP {profile.xp}|🪙 {profile.coins}</p>
          </div>
          <div className="text-center">
            <div className={`text-4xl ${stage >= FINAL_STAGE ? "pet-final" : ""}`}>{petEmoji(profile.pet, lv.level, petAff)}</div>
            <div className="text-xs opacity-80">{STAGE_NAMES[stage]}</div>
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

      {/* 管理者:帳號管理入口 */}
      {(profile.role === "teacher" || profile.role === "parent") && (
        <a href="/admin"
          className="flex items-center justify-between rounded-2xl bg-slate-800 px-5 py-4 text-white shadow-sm transition hover:bg-slate-700">
          <span className="flex items-center gap-3">
            <span className="text-2xl">🛠️</span>
            <span>
              <span className="block font-bold">帳號管理</span>
              <span className="block text-xs opacity-70">新增/編輯/刪除帳號(管理者)</span>
            </span>
          </span>
          <span className="text-xl">→</span>
        </a>
      )}

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
        <a href="/shop"
          className="flex-1 rounded-full bg-white py-2 text-center text-sm font-semibold text-slate-600 hover:bg-slate-100">
          🏪 商店 →
        </a>
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
          <div className={`rounded-2xl p-5 text-center shadow-sm ${stage >= FINAL_STAGE ? "bg-gradient-to-b from-amber-50 to-violet-50" : "bg-white"}`}>
            <div className="pet-showcase mx-auto grid h-24 w-24 place-items-center">
              {stage >= FINAL_STAGE && <span className="pet-aura" />}
              {stage >= FINAL_STAGE && (
                <>
                  <span className="pet-spark left-0 top-1 text-lg" style={{ animationDelay: "0s" }}>✨</span>
                  <span className="pet-spark right-1 top-3 text-base" style={{ animationDelay: ".6s" }}>⭐</span>
                  <span className="pet-spark bottom-1 left-3 text-base" style={{ animationDelay: "1.1s" }}>💫</span>
                </>
              )}
              <span className={`relative text-6xl ${stage >= FINAL_STAGE ? "pet-final" : ""}`}>
                {petEmoji(profile.pet, lv.level, petAff)}
              </span>
            </div>
            <p className="mt-2 font-bold">
              {PETS.find((p) => p.key === profile.pet)?.name ?? "夥伴"}・{STAGE_NAMES[stage]}
              {stage >= FINAL_STAGE && <span className="ml-1 text-amber-500">完全體!</span>}
            </p>
            {nextReq ? (
              <p className="text-xs text-slate-500">
                下一階段「{STAGE_NAMES[nextReq.stage]}」:需 Lv{nextReq.level}
                {nextReq.affection > 0 && ` 且好感度 ${nextReq.affection}`}
                (目前 Lv{lv.level}・好感度 {petAff})
              </p>
            ) : (
              <p className="text-xs text-amber-600">已進化到完全體!繼續做題與照顧維持最佳狀態 ✨</p>
            )}

            {/* 心情 + 每日陪伴 */}
            <div className="mt-3 flex items-center justify-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                心情 {mood.emoji} {mood.name}
              </span>
              {playedToday ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-700">今天已陪伴 ✅</span>
              ) : (
                <button onClick={petPlay} disabled={busy}
                  className="rounded-full accent-bg px-4 py-1 text-sm font-semibold text-white disabled:opacity-50">
                  🫶 陪伴夥伴
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              連續照顧 {profile.care_streak ?? 0} 天・需今天先做 5 題才能陪伴
            </p>

            {/* 好感度 */}
            <div className="mt-4 text-left">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold">
                  {"❤️".repeat(aff.level)}{"🤍".repeat(MAX_AFFECTION_LEVEL - aff.level)}
                  <span className="ml-2 text-slate-500">{AFFECTION_NAMES[aff.level]}</span>
                </span>
                <span className="text-xs text-slate-400">好感度 {profile.pet_affection ?? 0}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-rose-400" style={{ width: `${(aff.into / aff.span) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {aff.toNext > 0 ? `再 ${aff.toNext} 好感度可提升親密度` : "已達最高親密度!✨"}
              </p>
            </div>
          </div>

          {/* 夥伴技能(好感度解鎖) */}
          <div>
            <h3 className="mb-2 font-bold">✨ 夥伴技能(好感度解鎖,做題自動加成)</h3>
            <div className="grid grid-cols-3 gap-2">
              {PET_SKILLS.map((sk) => {
                const on = petAff >= sk.affection;
                return (
                  <div key={sk.key}
                    className={`rounded-2xl p-3 text-center shadow-sm ${on ? "bg-white" : "bg-slate-100 opacity-60"}`}>
                    <div className={`text-2xl ${on ? "" : "grayscale"}`}>{on ? sk.emoji : "🔒"}</div>
                    <p className="mt-1 text-sm font-bold">{sk.name}</p>
                    <p className="text-[11px] text-slate-500">{sk.desc}</p>
                    <p className="text-[10px] text-slate-400">{on ? "已啟用" : `好感度 ${sk.affection}`}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 夥伴探險 */}
          <div>
            <h3 className="mb-2 font-bold">🧭 夥伴探險(做題推進)</h3>
            {expedition ? (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">
                    {petEmoji(profile.pet, lv.level, petAff)} {subjLabel(expedition.subject)}・
                    {EXP_TIERS[expedition.tier - 1]?.label}
                  </p>
                  <span className="text-xs text-slate-400">
                    {Math.min(expedition.progress_count, expedition.target_count)}/{expedition.target_count} 題
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full accent-bg"
                    style={{ width: `${Math.min(100, (expedition.progress_count / expedition.target_count) * 100)}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  獎勵:{expedition.reward_xp} XP・{expedition.reward_coins}🪙・好感 +{expedition.reward_affection}
                  {expedition.reward_food && "・食物"}
                </p>
                {expedition.status === "done" ? (
                  <button onClick={() => claimExp(expedition.id)} disabled={busy}
                    className="mt-2 w-full rounded-full bg-amber-500 py-2 text-sm font-bold text-white disabled:opacity-50">
                    🎁 探險完成!領取獎勵
                  </button>
                ) : (
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-slate-400">去「{subjLabel(expedition.subject)}」做題推進探險吧!</span>
                    <button onClick={() => cancelExp(expedition.id)} disabled={busy}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs disabled:opacity-50">召回</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="mb-2 text-sm text-slate-500">選一個科目派夥伴出發,做題就能推進進度、完成後領大獎!</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {SUBJECTS.map((s) => (
                    <button key={s.key} onClick={() => setExpSubject(s.key)}
                      className={`rounded-full px-3 py-1 text-sm ${expSubject === s.key ? "accent-bg text-white" : "bg-slate-100 text-slate-600"}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {EXP_TIERS.map((t) => (
                    <button key={t.tier} onClick={() => startExp(t.tier)} disabled={busy}
                      className="rounded-xl border border-slate-200 p-2 text-center hover:border-indigo-300 disabled:opacity-50">
                      <p className="text-sm font-bold">{t.label}</p>
                      <p className="text-xs text-slate-400">{t.target} 題</p>
                      <p className="mt-1 text-xs accent-text">{t.reward}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 餵食 */}
          <div>
            <h3 className="mb-2 font-bold">🍽️ 餵食(提升好感度)</h3>
            {foods.length === 0 ? (
              <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-400 shadow-sm">目前沒有食物商品</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {foods.map((f) => {
                  const qty = inventory.get(f.key) ?? 0;
                  return (
                    <div key={f.key} className="rounded-2xl bg-white p-3 text-center shadow-sm">
                      <div className="text-3xl">{f.key.includes("cookie") ? "🍪" : f.key.includes("fish") ? "🐟" : f.key.includes("cake") ? "🍰" : "🍖"}</div>
                      <p className="mt-1 text-sm font-semibold">{f.label}</p>
                      <p className="text-xs text-slate-400">好感 +{f.value}|擁有 {qty}</p>
                      <div className="mt-2 flex gap-1">
                        <button onClick={() => buyFood(f.key)}
                          className="flex-1 rounded-full bg-amber-500 px-2 py-1 text-xs text-white">🪙 {f.price}</button>
                        <button onClick={() => feed(f.key)} disabled={qty <= 0}
                          className="flex-1 rounded-full accent-bg px-2 py-1 text-xs text-white disabled:opacity-40">餵食</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-bold">選擇夥伴(換夥伴會沿用目前等級與好感度)</h3>
            {(["經典", "寶可夢", "皮克敏"] as const).map((origin) => (
              <div key={origin} className="mt-2">
                <p className="mb-1 text-xs font-semibold text-slate-400">{origin}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {PETS.filter((p) => p.origin === origin).map((p) => {
                    const active = profile.pet === p.key;
                    return (
                      <button key={p.key} onClick={() => choosePet(p.key)}
                        className={`rounded-2xl p-3 text-center shadow-sm ${active ? "accent-border border-2 bg-white" : "bg-white"}`}>
                        <div className="text-3xl">{p.stages[stage]}</div>
                        <p className="mt-1 text-xs font-semibold">{p.name}</p>
                        {active && <span className="text-[10px] accent-text">使用中</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
