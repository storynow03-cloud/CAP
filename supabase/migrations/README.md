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
