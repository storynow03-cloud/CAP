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
| 14 | `20260616020000_expeditions.sql` | 夥伴探險:pet_expeditions 表 + start/claim/cancel_expedition RPC;作答觸發器 on_attempt_gamify 加推進該科探險進度 |
| 15 | `20260616030000_pet_mood_skills.sql` | 夥伴心情/每日陪伴:profiles.pet_play_day/care_streak、pet_play RPC(需當天作答);作答觸發器加夥伴技能加成(好感度 80/200/400 → 金幣/XP 加成) |
| 16 | `20260616040000_custom_pet.sql` | 自訂夥伴圖片:profiles.pet_image_url(pet='custom' 時顯示上傳圖,沿用 avatars bucket) |
| 17 | `20260616050000_pet_defs.sql` | 夥伴資料庫化:pet_defs 表(3 階段、emoji 或圖片、staff CRUD、自訂夥伴 owner)+ seed 9 隻起始夥伴 |
| 18 | `20260616060000_pet_images_bucket.sql` | 夥伴圖片儲存空間:pet-images bucket(公開讀、staff 寫),供管理者上傳夥伴階段圖 |
| 19 | `20260616070000_legendary_pets.sql` | 傳說特效夥伴:pet_defs 加 is_legendary/bonus_xp/bonus_coins/bonus_affection、user_pets 表 + buy_pet RPC、作答觸發器套用傳說加成;seed 皇小米/英語老師(2000) |
| 20 | `20260616080000_admin_market.sql` | 管理者交易所 moderation:admin_get_market / admin_remove_listing RPC(staff-only,下架退回賣家) |
| 21 | `20260616090000_pet_bonus_unify.sql` | 加成統一:移除寫死的好感度技能,改吃 pet_defs 每隻加成(單一來源)+ bonus_subjects 考科限定;寶可夢設 500、新增瑪莉歐/柯南各 5(500);停用自訂上傳(pet=custom→cat) |
| 22 | `20260617000000_economy_depth.sql` | 經濟系統深化:profiles 加 login_day/login_streak/affection_claimed;level_from_xp + on_levelup 觸發器(升級發金幣)、on_wrong_overcome 觸發器(錯題克服發獎)、daily_login RPC(每日簽到,首日就給)、claim_affection_reward RPC(好感度里程碑);user_achievements 加 rewarded 欄 + claim_achievement_reward RPC(成就給獎,DB 端權威獎勵表);作答觸發器改答錯也給 1 金幣參與獎 |
| 23 | `20260617010000_boosters.sql` | 加成道具/消耗品:profiles 加 boost_xp2x_left/boost_coin2x_left;新分類「加成道具」+ XP/金幣加倍卡、提示券商品;use_booster/use_hint RPC;作答觸發器套用加倍卡(任何作答消耗一次疊加機會) |
| 24 | `20260617020000_realms.sql` | 秘境(限時懸賞任務):realms + realm_participants 表;join_realm/claim_realm_reward/get_realms RPC(個人或團體進度加總,team 模式每人各領一份);作答觸發器加推進秘境進度(限時間內、限科目) |

## 如何重建資料庫

### 方法 A:Supabase Dashboard(最簡單)
到 Supabase 專案 → SQL Editor → 依序貼上每個 `.sql` 檔內容執行。

### 方法 B:Supabase CLI
```bash
supabase link --project-ref <your-project-ref>
supabase db push        # 會依序套用 supabase/migrations/ 內所有檔案
```

## 注意
- 觸發器 `on_attempt_gamify` 在第 4 檔建立,後續第 5(週 XP)、14(探險)、15、19、21(統一改吃 pet_defs 每隻加成、考科限定;移除寫死好感度技能)、22(答錯給參與獎)、23(加倍卡)、**24(秘境進度,最終版)** 逐步更新。
- 套用後,題庫資料用 `scripts/import-questions.mjs`(或 `rebuild-math-science.mjs`)匯入。
- 測試帳號需另外用 Supabase Admin API 建立(見 HANDOFF.md)。
