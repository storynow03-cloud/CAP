-- 自訂夥伴圖片:玩家可用自己上傳的圖片(或內建範例)當夥伴。
-- pet = 'custom' 時,顯示 pet_image_url 的圖片(進化光環/階段/好感度/技能照常運作)。
-- 圖片沿用既有的 avatars storage bucket(路徑 <uid>/pet_*),不需新 bucket。

alter table public.profiles
  add column if not exists pet_image_url text;
