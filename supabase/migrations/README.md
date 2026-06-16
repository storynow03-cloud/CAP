# 資料庫 Migration

這是系統完整的資料庫結構(Supabase / PostgreSQL),依檔名時間戳順序套用即可重建整個資料庫。

## 檔案(依序套用)

| 順序 | 檔案 | 內容 |
|:--:|------|------|
| 1 | `20260610143524_init_schema.sql` | 核心表:profiles, questions, attempts, mastery, wrong_book, exam_sessions, daily_stats + 註冊觸發器 + RLS |
| 2 | `20260610151753_get_topics_rpc.sql` | `get_topics(subj)` — 取某科完整單元清單(繞過 client 1000 列上限) |
| 3 | `20260611135228_contests_module.sql` | 大會考:contests, contest_entries + 排行榜 RPC |
| 4 | `20260614010526_gamification.sql` | 遊戲化 Phase A:XP/金幣欄位、daily_quests, user_achievements, user_items + 作答觸發器 `on_attempt_gamify` |
| 5 | `20260614030934_gamification_phase_bc.sql` | Phase B/C:寵物、週 XP、friendships, duels, boss_clears + add_friend/get_friends_board RPC(並更新觸發器加週 XP) |
| 6 | `20260614031320_create_duel_rpc.sql` | PK 對戰 RPC:create_duel, get_duel, my_duels |
| 7 | `20260614060000_profile_avatar.sql` | profiles 加 avatar_url + avatars storage bucket |
| 8 | `20260614120000_self_assessment.sql` | self_assessment 表 + get_chapter_overview RPC(自評 vs 系統掌握度) |
| 9 | `20260615000000_shop_db.sql` | 商城資料庫化:shop_categories, shop_items(取代寫死的 SHOP_ITEMS)+ seed + staff-only 寫入 RLS |
| 10 | `20260615010000_pet_feeding.sql` | 寵物餵食:profiles.pet_affection/pet_fed_at、inventory 表(消耗品)、buy_food/feed_pet RPC(原子交易) |
| 11 | `20260615020000_market.sql` | 玩家交易所:market_listings 表 + create_listing/cancel_listing/buy_listing/get_market RPC(security definer 原子交易、託管制) |
| 12 | `20260616000000_shop_pro.sql` | 商城專業化:shop_items.rarity、名牌底圖/稱號商品、profiles.equipped_nameplate/title、shop_featured_keys/get_shop/buy_item RPC(每日精選 7 折、server 端統一購買) |
| 13 | `20260616010000_pets_evolution.sql` | 夥伴進化改吃等級+好感度:get_friends_board RPC 加回傳 pet_affection |

## 如何重建資料庫

### 方法 A:Supabase Dashboard(最簡單)
到 Supabase 專案 → SQL Editor → 依序貼上每個 `.sql` 檔內容執行。

### 方法 B:Supabase CLI
```bash
supabase link --project-ref <your-project-ref>
supabase db push        # 會依序套用 supabase/migrations/ 內所有檔案
```

## 注意
- 觸發器 `on_attempt_gamify` 在第 4 個檔建立、第 5 個檔更新(加入週 XP),屬正常演進。
- 套用後,題庫資料用 `scripts/import-questions.mjs`(或 `rebuild-math-science.mjs`)匯入。
- 測試帳號需另外用 Supabase Admin API 建立(見 HANDOFF.md)。
