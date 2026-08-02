// 夥伴主題原創化:把受版權保護的角色(瑪利歐/柯南)換成原創角色,並新增「天官賜福」仙俠古風主題。
//
// 為什麼:原本 10 隻直接沿用瑪利歐、柯南等受保護的角色名稱,即使只是 emoji 佔位,
// 名稱本身仍屬他人智慧財產。改為原創角色(職業原型不受保護:勇者/偵探/怪盜/發明家…),
// 保留同樣的趣味,但不侵權。
//
// 「天官賜福」用的是**傳統道教三官大帝信仰**(天官賜福、地官赦罪、水官解厄),
// 是流傳數百年的民間吉祥語與神祇原型,屬公共領域;不是小說《天官賜福》的角色。
//
// 重要:key 一律沿用,不新增/刪除既有 key —— user_pets 靠 pet_key 記錄擁有權,
// 改 key 會讓已購買的玩家失去夥伴(目前 ally 擁有 conan_kid)。
//
// 用法:node scripts/reskin-pets.mjs [--dry]
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const env = fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8");
const KEY = env.match(/SUPABASE_SECRET_KEY=(\S+)/)[1].trim();
const URL_BASE = env.match(/NEXT_PUBLIC_SUPABASE_URL=(\S+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const DRY = process.argv.includes("--dry");

/** 既有 key → 原創角色設定(三階段:幼年 / 成長期 / 完全體) */
const RESKIN = [
  // A. 勇者冒險(原 origin=瑪莉歐)
  { key: "mario_mario",  origin: "勇者冒險", name: "蘑菇小勇者", s: ["🍄", "🗡️", "🛡️"] },
  { key: "mario_luigi",  origin: "勇者冒險", name: "藤蔓遊俠",   s: ["🌱", "🌿", "🏹"] },
  { key: "mario_peach",  origin: "勇者冒險", name: "星光公主",   s: ["🌷", "👸", "🌟"] },
  { key: "mario_bowser", origin: "勇者冒險", name: "岩殼龍王",   s: ["🥚", "🐢", "🐲"] },
  { key: "mario_yoshi",  origin: "勇者冒險", name: "蛋蛋騎士",   s: ["🥚", "🦖", "🐉"] },
  // B. 小小偵探社(原 origin=柯南)
  { key: "conan_conan",    origin: "小小偵探社", name: "放大鏡偵探", s: ["🔎", "🕵️", "🎓"] },
  { key: "conan_kid",      origin: "小小偵探社", name: "影子怪盜",   s: ["🎭", "🌙", "💎"] },
  { key: "conan_ran",      origin: "小小偵探社", name: "空手道少女", s: ["🥋", "👊", "🏆"] },
  { key: "conan_agasa",    origin: "小小偵探社", name: "發明博士",   s: ["🔧", "⚙️", "🤖"] },
  { key: "conan_haibara",  origin: "小小偵探社", name: "藥水學者",   s: ["🧫", "⚗️", "🧪"] },
];

/** C. 新增:天官賜福(道教三官大帝 + 仙俠古風,公共領域原型) */
const NEW_PETS = [
  { key: "tg_tian",  origin: "天官賜福", name: "天官・賜福", s: ["✨", "🏮", "👑"], sort: 40, bonus_xp: 5,  bonus_coins: 0,  bonus_affection: 0 },
  { key: "tg_di",    origin: "天官賜福", name: "地官・赦罪", s: ["⛰️", "🪨", "🗿"], sort: 41, bonus_xp: 0,  bonus_coins: 5,  bonus_affection: 0 },
  { key: "tg_shui",  origin: "天官賜福", name: "水官・解厄", s: ["💧", "🌊", "🐉"], sort: 42, bonus_xp: 0,  bonus_coins: 0,  bonus_affection: 1 },
  { key: "tg_hua",   origin: "天官賜福", name: "花神",       s: ["🌱", "🌸", "🌺"], sort: 43, bonus_xp: 3,  bonus_coins: 3,  bonus_affection: 0 },
  { key: "tg_jian",  origin: "天官賜福", name: "劍仙",       s: ["🗡️", "⚔️", "🌠"], sort: 44, bonus_xp: 5,  bonus_coins: 5,  bonus_affection: 0 },
];

async function req(method, pathname, body) {
  const r = await fetch(`${URL_BASE}/rest/v1/${pathname}`, {
    method, headers: { ...H, Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`${method} ${pathname} → ${r.status} ${text.slice(0, 200)}`);
  return data;
}

console.log(DRY ? "🔍 乾跑(不會實際寫入)\n" : "✍️  開始更新 pet_defs\n");

// 先看誰擁有這些夥伴,確保不會弄丟別人的東西
const owned = await req("GET", "user_pets?select=pet_key");
const ownedKeys = new Set((owned || []).map((r) => r.pet_key));

console.log("── A/B:既有夥伴改為原創角色(key 不變,擁有權保留)");
for (const p of RESKIN) {
  const mark = ownedKeys.has(p.key) ? " ⚠️已有人購買(擁有權會保留)" : "";
  console.log(`  ${p.key.padEnd(15)} → ${p.name.padEnd(7)} [${p.s.join(" → ")}]${mark}`);
  if (!DRY)
    await req("PATCH", `pet_defs?key=eq.${p.key}`, {
      name: p.name, origin: p.origin, kind: "emoji",
      stage1: p.s[0], stage2: p.s[1], stage3: p.s[2],
    });
}

console.log("\n── C:新增「天官賜福」(道教三官,公共領域原型)");
for (const p of NEW_PETS) {
  const exists = await req("GET", `pet_defs?key=eq.${p.key}&select=key`);
  const row = {
    key: p.key, name: p.name, origin: p.origin, kind: "emoji",
    stage1: p.s[0], stage2: p.s[1], stage3: p.s[2],
    rarity: "epic", price: 800, active: true, sort: p.sort,
    is_legendary: false, is_custom: false,
    bonus_xp: p.bonus_xp, bonus_coins: p.bonus_coins, bonus_affection: p.bonus_affection,
    bonus_subjects: [],
  };
  if (exists.length) {
    console.log(`  ${p.key.padEnd(10)} 已存在 → 更新`);
    if (!DRY) await req("PATCH", `pet_defs?key=eq.${p.key}`, row);
  } else {
    console.log(`  ${p.key.padEnd(10)} 新增 ${p.name} [${p.s.join(" → ")}] 🪙${row.price}`);
    if (!DRY) await req("POST", "pet_defs", row);
  }
}

console.log(DRY ? "\n🔍 乾跑結束" : "\n✅ 完成");
