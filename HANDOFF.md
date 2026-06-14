# 🏁 開發交接文件(新對話請先讀這份)

> **給 AI**:這是「國中會考線上系統」的開發進度總覽。開新對話時先讀這份 + `docs/` 內文件,即可接續開發。每完成一個里程碑請更新本檔底部的「進度日誌」。
> **最後更新**:2026-06-14

## 🔴 新對話第一件事:確認目前運行狀態

- **題庫轉換**:✅ 已全部完成(1039/1039),數學/自然圖片版題目已匯入。數學可用 8,597 題、自然 8,873 題。
- **正式版伺服器**:目前用 `npx next start -H 0.0.0.0 -p 3000`(正式版,非開發模式)在跑,給家人從 `http://192.168.8.171:3000` 測試。
  - 改完程式要 `cd web; npm run build` 再重啟 next start 家人才看得到。
  - **新增 public/qimg 圖片後,next start 必須重啟**才會服務到新圖。
  - 使用者要自己改程式即時預覽時,改用 `npm run dev`(但 dev 模式手機/別人裝置常掛,只適合自己開發機)。
- **git**:本地 `feature/gamification` 分支,已 commit(尚未連 GitHub)。
- 背景監看器在對話結束後會停止;若有未跑完的事(如轉換)需手動接手。

---

## 1. 這是什麼

國中會考線上練習系統,核心是**分階挑戰**(不重複做會的題、持續挑戰能力邊緣)+ 完整學習歷程 + 多人帳號 + 大會考排行。
本地開發 → GitHub(需 Private,題庫有版權)→ Vercel 部署。

## 2. 技術架構

| 層 | 技術 | 備註 |
|----|------|------|
| 前端/後端 | **Next.js 16**(App Router, TypeScript) | 在 `web/` 子資料夾。**注意:用 `src/proxy.ts` 不是 middleware.ts**(N16 改名) |
| 樣式 | Tailwind CSS v4 | |
| 資料庫/登入 | **Supabase**(專案 CAP,id `bghglvfbyhfjuvgyzyzy`,Seoul) | 金鑰在 `web/.env.local` |
| 圖表 | Recharts | 學習歷程雷達圖/曲線 |

**重要環境細節**:
- Node 20,**不能在 Node 端用 supabase-js**(無原生 WebSocket 會炸)→ 所有腳本用 REST API(`fetch`)操作 Supabase。
- Windows + PowerShell。PowerShell 腳本檔**必須存成 UTF-8 with BOM**,否則中文變亂碼。
- 背景長指令會被工具丟到背景執行;**Word COM 在背景沒有桌面會卡死**(見題庫轉換教訓)。

## 3. 目錄結構

```
D:\Claude\國中會考\
├─ HANDOFF.md            ← 本檔
├─ README.md            ← 文件導覽
├─ docs\                ← 規劃文件 01~07
├─ web\                 ← Next.js 專案(主程式)
│   ├─ src\app\         ← 頁面:login, /(儀表板), challenge, mock-exam,
│   │                      practice, wrong-book, history, contest, contest/new
│   ├─ src\components\  ← Nav, Quiz(核心作答元件)
│   ├─ src\lib\         ← supabase/, engine.ts(出題引擎), types.ts, html.ts
│   ├─ public\qimg\     ← 題目圖片(數學式/幾何圖,LibreOffice 轉出)
│   └─ .env.local       ← Supabase 金鑰(不上 git)
├─ data\
│   ├─ questions\       ← 題庫 JSON(chinese/english/math/science/social .json)
│   ├─ extracted\       ← 第一版純文字抽取(Word COM)
│   ├─ lo-html\         ← LibreOffice 轉的 HTML(數學/自然,含圖)
│   ├─ raw\115會考\      ← 115 年官方題本 PDF(待轉)
│   └─ *.bak / *.html.json ← 中間檔
└─ scripts\             ← 見下方
```

## 4. 關鍵腳本(scripts\)

| 腳本 | 用途 |
|------|------|
| `extract-docs.ps1` | Word COM 抽純文字 → data/extracted(第一版,五科) |
| `parse-questions.mjs` | 解析文字 → data/questions/*.json |
| `import-questions.mjs` | JSON → Supabase(REST upsert,分批 500) |
| `convert-lo.ps1` | **LibreOffice 批次轉 HTML**(數學/自然,會考真題優先,背景安全) |
| `parse-questions-lo.mjs` | 解析 LibreOffice HTML(含圖/上標,`looksDegraded` 過濾破損題)→ *.html.json |
| `rebuild-math-science.mjs` | 一鍵:解析→合併→重建 DB 數學/自然題庫(破損題隱藏) |
| `test-contest-flow.mjs` | 大會考流程 + RLS 整合測試 |

## 5. 資料庫(Supabase public schema)

**完整結構在 `supabase/migrations/*.sql`(可重建,見該資料夾 README)。**
表:`profiles, questions, attempts, mastery, wrong_book, exam_sessions, daily_stats, contests, contest_entries, daily_quests, user_achievements, user_items, friendships, duels, boss_clears`
RPC:`get_topics, get_contest_leaderboard, add_friend, get_friends_board, create_duel, get_duel, my_duels`
觸發器:`on_attempt_gamify`(作答自動發 XP/金幣/任務/週XP)、`handle_new_user`(自動建 profile+好友碼)
全表開 RLS;大會考只有 role=teacher/parent 能建。

## 6. 測試帳號(已建,免信箱驗證)

| 角色 | Email | 密碼 |
|------|-------|------|
| 學生 | `student@test.com` | `test1234` |
| 管理者(家長) | `admin@test.com` | `admin1234` |

啟動:`cd web && npm run dev` → http://localhost:3000

## 7. 已完成功能

- ✅ 登入/註冊/權限保護(proxy.ts)
- ✅ 儀表板(會考倒數、今日目標、連續天數、五科等級)
- ✅ 分階挑戰(等級制、排除已精熟、弱點優先、連對自動加深)
- ✅ 自由練習(科目/單元/難度/題數)
- ✅ 綜合模擬考(五科各 5 題 + 成績單 A++~C)
- ✅ 錯題本(間隔複習 1→3→7→14 天)
- ✅ 學習歷程(雷達圖、每日曲線、弱點排行、作答明細含時間/日期下拉)
- ✅ 大會考 + 排行榜(管理者出題、全員同卷、名次)
- ✅ 題庫:五科約 4 萬可用單選題(文字版)
- ✅ 數學會考真題圖片版(LibreOffice 管線,已驗證圖片正常顯示)

## 7.5 遊戲化(feature/gamification 分支,A/B/C 全做完並測試通過)

- Phase A:XP+個人等級、每日 3 任務、金幣、商城(主題色/頭像框)、12 成就。觸發器 `on_attempt_gamify` 作答自動發獎勵。
- Phase B:學習夥伴寵物(隨等級進化)。
- Phase C:好友(好友碼互加)、本週 XP 排行、1v1 PK 對戰(非同步,duels 表)、轉蛋、每週王關(boss_clears)。
- 頁面:`/me`(成就/夥伴/商城)、`/friends`、`/duel`、`/boss`。RPC:add_friend/get_friends_board/create_duel/get_duel/my_duels。
- 測試:`scripts/test-gamify.mjs`、`scripts/test-gamify-bc.mjs`(全綠)。
- ⚠️ UI 視覺設計使用者說之後再修(目前堪用)。

## 8. 進行中 / 待辦

- ✅ LibreOffice 全量轉換(1039/1039 完成)+ 圖片版匯入(數學 8,597 / 自然 8,873 可用)。
- ✅ 遊戲化 A/B/C 全做完(見 7.5)。
- ✅ 導覽列分類(首頁/練習/對戰/歷程/我的)、個人頁改暱稱+上傳頭像。
- ⏳ **UI 視覺打磨**(使用者多次說之後再修;首頁已重排但細節待調)。
- ⏳ 讓孩子/家人真實使用幾天收集回饋(最高優先)。
- ⏳ 合併 feature/gamification → main → 推 Private GitHub → Vercel(Root Directory=web,填 3 個 Supabase env)。
- ⏳ 英聽音檔、克漏字題組拆分、115 真題 PDF 轉換、社會科圖片題(比照 LibreOffice 流程)。
- ⏳(商業化才需)AI 出題管線替換康軒題,見 docs/08。

## 9. 重要教訓(別重蹈覆轍)

1. **Word COM 轉檔在背景必卡** → 改用 LibreOffice headless(`soffice --headless --convert-to html`),背景安全。
2. 別在背景轉換進行時殺 soffice(會中斷轉換)。
3. 康軒 .doc 的數學符號是 Word 特殊物件,**任何工具都會掉部分線段名稱/次方**(約 27%),靠 `looksDegraded` 偵測排除,確保「少而正確」。
4. PowerShell 腳本存 UTF-8 BOM;Supabase 從 Node 走 REST 不走 supabase-js(Node 無原生 WebSocket)。
5. **給別人/手機測試一定要用正式版**(`next build` + `next start`),不要用 `npm run dev`(dev 模式 JS 又大又沒轉譯,在別人手機上頁面出得來但「點不動」= hydration 失敗)。
6. **註冊預設要 Email 驗證**(autoconfirm 關),家人自己註冊會卡;且公開 signup 會擋假 email(如 @test.com)。給親友測試最快是用 Admin API 預先建帳號(email_confirm:true),見 scripts 內建帳號的寫法。
7. `next start` 啟動時鎖定 public 檔清單,**之後新增的 qimg 圖片要重啟 next start 才會服務**。
8. 本對話的 Claude Preview 預覽工具不穩(伺服器常閃退);驗證改用「REST 測試腳本 + 正式版 HTTP 200 檢查」。

---

## 📋 進度日誌(每次里程碑往上加一行)

- 2026-06-14 下午:題庫轉換全完成並匯入(數學 8,597/自然 8,873 可用,22,319 張圖);導覽列整併成 5 大類+練習/對戰 hub;個人頁可改暱稱+上傳頭像(avatars bucket);改用正式版伺服器供家人測試;補上 DB migration 版控。

- 2026-06-12 上午(續):新增 docs/07 遊戲化設計、本 HANDOFF.md、根目錄 CLAUDE.md(指引新對話先讀 HANDOFF);把方法論打包成可分享 skill → `skills/online-quiz-system/`(及 `online-quiz-system.skill`)。
- 2026-06-12 上午:LibreOffice 管線打通並驗證圖片顯示;數學會考真題圖片版上線;全量轉換背景進行中。
- 2026-06-11:新增模擬考、大會考+排行榜、學習歷程作答明細;下載 115 年官方題本。
- 2026-06-10:完成 MVP(登入/儀表板/分階挑戰/練習/錯題本/歷程);題庫文字版轉換匯入;本地測試通過。
