// 新增傳說夥伴「蘭波」(2026-10-14,使用者指定:價格與加成比照皇小米)
// 圖片要先部署(web/public/partner/lanbo-1~3.png)再跑這支。用法:node scripts/add-pet-lanbo.mjs [--apply]
import { fetchAll, URL_BASE, H } from "./lib/rest.mjs";

const [xmi] = await fetchAll("pet_defs?select=*&key=eq.legend_xmi");
const exists = await fetchAll("pet_defs?select=id&key=eq.legend_lanbo");
const sortMax = Math.max(...(await fetchAll("pet_defs?select=sort")).map((p) => p.sort));
const row = {
  key: "legend_lanbo", name: "蘭波", origin: "傳說", kind: "image",
  stage1: "/partner/lanbo-1.png", stage2: "/partner/lanbo-2.png", stage3: "/partner/lanbo-3.png",
  rarity: xmi.rarity, price: xmi.price, is_legendary: xmi.is_legendary, is_custom: false, active: true,
  bonus_xp: xmi.bonus_xp, bonus_coins: xmi.bonus_coins, bonus_affection: xmi.bonus_affection, bonus_subjects: xmi.bonus_subjects,
  sort: sortMax + 1,
};
console.log(exists.length ? "⚠️ 已存在,不重複新增" : "將新增:", row);
if (exists.length || !process.argv.includes("--apply")) process.exit(0);
const r = await fetch(`${URL_BASE}/rest/v1/pet_defs`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) });
console.log(r.status, await r.text());
