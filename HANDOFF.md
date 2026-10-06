# 🏁 開發交接文件(新對話請先讀這份)

> **給 AI**:這是「國中會考線上系統」的開發進度總覽。開新對話時先讀這份 + `docs/` 內文件,即可接續開發。每完成一個里程碑請更新本檔底部的「進度日誌」。
> **最後更新**:2026-10-04

## 🔴 新對話第一件事:確認目前運行狀態

> **2026-10-05 收工交接(最新,先看這段)**:正式站 https://cap-three-ruddy.vercel.app 最新部署 commit `16afda37`(之後只有本機
> split-groups.mjs/文件未 commit)。**可見題 91,139 題**;全庫 hide-qa-failures 試算 0 題。先讀 task_checklist.md 最上方。
> 這兩天:題目附圖全面看圖 + 從原檔重畫(數學/自然 7,372、社會等 2,119+126)、LO 匯出失敗圖從 .doc 救回 1,498 張、
> 數學公式 OMML→HTML(8,561 全對應)、EQ 上標補回、非選答案拆欄位、數學隱藏題由原始 docx 重建、題組小題補圖與重新拆題。
> 重要工具:scripts/lib/visible-checks.mjs(放回前必過)、lib/rest.mjs fetchAll 已自動 order=id(以前分頁會漏題)。
> 自然科本輪刻意不放回(無法確認公式完整)。data/lowres-images.json 只在本機(已移除重畫好的,剩 141)。
> 使用者偏好:品質優先、可長時間自主工作;commit/push 依當次授權。

> **2026-10-04 晚上交接(最新,先看這段)**:**先讀 task_checklist.md 開頭「▶️ 新對話從這裡接續」**。
> 進行中:用 Claude 子代理看完 17,333 張題目附圖(拼圖頁已備妥在 data/image-review/,1,441 頁)。
> 已上線(commit 24d8320a):選單 4 大類、兩個積分榜(舊版)、每日兌換上限 50、防刷題提示、計算紙計算區。
> SQL 1~5 份使用者都已執行並查證(第 5 份防刷題待以作答紀錄驗證)。
> **未 commit**:兩種會考積分(練習/真題,每科 ≥20 題才給等級)、第二層選單、回報自動結案、中文姓名登入
> (lib/login-name.ts,姓名→n.<hex>@cap.local,已在正式 Supabase 測過)、圖片檢查腳本。
> 使用者偏好:Claude 額度充足(MAX),品質優先、時間不限;考卷診斷暫不處理;commit/push 要使用者同意。
>
> **2026-10-04 下午更新**:夜間功能已 commit/push(`e5f16b53`)並上線;SQL 第 1、2 份已生效,**第 3 份未生效需重跑**,
> 第 4 份 `20261004030000_guardian_rewards_ratio.sql`(L2 家長 + 現金券 100:1)待執行。題庫最終檢查與 4 支修正腳本備妥,
> 執行順序見 task_checklist.md「2026-10-04 白天」。新增 L2 角色 guardian(/admin 只看到學習狀況、發放獎勵)。
>
> **2026-10-04 最新狀態(新對話先看這段)**
> - **數學/自然缺字修復已寫入正式資料庫**(使用者在終端機執行):補回 Word EQ 算式 3,472 題 + 詳解 1,580 題、
>   Symbol 符號 2,633 題;可見數學 8,025 → 9,192 題、自然 11,672 題;可見題的題幹/選項已無空白符號。
>   CSS(.frac 等)已隨 commit `fbeae928` 上線。
> - **夜間一次做完的功能(程式已改、本機驗證,尚未 commit/push)**:章節標籤(年級・冊・單元・知識點,全模組)、
>   社會拆歷史/地理/公民、選項排除、計算紙、管理後台會考等級預估、題目管理(隱藏題可修正放回)、操作紀錄+還原、
>   好友 PK 押金幣+即時對戰房間、現金券/特權券、魔王 5 科×5 級、排行榜 8 項、金幣防竄改。
> - **上線步驟(順序很重要)**:① SQL Editor(專案 CAP)依序執行 `supabase/migrations/20261004000000_audit_log.sql`、
>   `20261004010000_vouchers_duel_wager.sql`、`20261004020000_boss_tiers_leaderboard_lock.sql`
>   ② **馬上** commit + push 新程式(SQL 跑完到新程式上線之間,舊版扭蛋會不扣錢、舊版 PK 交不了卷)。
>   SQL 已在本機 PGlite 跑過全部 migration + 38 項情境測試(`node scripts/sql-test/scenarios.mjs`)。
> - **待使用者決定**:金幣經濟方案 A/B/C(`docs/10-經驗值與金幣經濟分析.md`,現況「亂按刷題」賺最多,現金券上線前建議先決定);
>   要啟用哪些特權券;題目回報 4 題 `node scripts/fix-reported-2026-10-04.mjs --apply`。
> - 本機另有別的對話的 `next dev` 在 3000 埠(Next 16 不允許同資料夾開第二個),驗證時直接用它。
>
> **2026-10-03 狀態(部分已被上面取代)**
> - **正式站** https://cap-three-ruddy.vercel.app ,最新已部署 commit `c00946ad`(函式機房搬到首爾)。
>   `web/vercel.json` 的 `regions: ["icn1"]` 絕不能拿掉(資料庫在首爾,拿掉整站每頁慢 1~2 秒)。
> - **Supabase 請認明專案 CAP**(`lwdziaamuygqfgfcmffd`,首爾),不是 CAP-review。我沒有資料庫密碼,DDL/RLS 要請使用者到 SQL Editor 執行。
> - **可見題目 84,733 題**(國文 22,794/英文 12,182/數學 8,025/自然 11,753/社會 29,979)。所有題庫修改都有備份在
>   `D:\Claude\國中會考-DB備份\2026-09-30-*`、`2026-10-01-*`、`2026-10-03-*`,各腳本都有 `--restore` / `--undo`。
> - **工作規則**:CLAUDE.md 已加入 Opus 5.5 工作方式(不無意義停頓、先講終點、維護 `task_checklist.md`、驗證證據)。
>   **開工時讀 `task_checklist.md` 接續未完成項目。** 根目錄有使用者放的「要修正的內容.docx」= 下一輪需求,開工要讀。
> - **git**:2026-10-03 收工時本輪所有腳本與文件已 commit 並 push 到 main(使用者同意)。
>   根目錄「要修正的內容.docx」是使用者的需求文件,**刻意未加入 git**。
> - **待使用者處理**:① 換 Supabase secret key 與 Gemini key(曾出現在對話截圖)② 到 SQL Editor 執行
>   `20261003000000_rls_initplan.sql`(權限規則加速)③ 關閉公開註冊、正式使用前換掉 111111 密碼。
> - Gemini 金鑰:`GEMINI_API_KEY_1`(也支援 `GEMINI_API_KEYS` 逗號清單),模型可用 `GEMINI_MODELS` 覆寫。區網 IP 目前 192.168.8.174(會變)。
> - skill:`vercel-supabase-latency`、`supabase-key-usage`、`shift-log` 都已接到 ~/.claude/skills(收藏庫 D:\Claude\skill 已更新到最新)。

**⚠️ 2026-07-14 搬遷 + push + Vercel 上線 + 密碼重設全部完成,以下是最新狀態,舊資訊已作廢:**

- **Supabase 專案已搬遷**:從舊帳號的「CAP」(`bghglvfbyhfjuvgyzyzy`)搬到 **`storynow03-cloud` 帳號**的新專案「CAP」
  (`lwdziaamuygqfgfcmffd`,ap-northeast-2 Seoul)。`web/.env.local` **已經改指向新專案**,搬遷已用
  `scripts/restore-5-verify.mjs` 驗證 25 張表筆數全部一致(81,192 筆)、登入/RLS 都已實測正常。
  舊專案還在,尚未刪除,純備用。
  - ✅ **6 個帳號密碼已統一改成 `111111`**(方便家人測試,清單在
    `D:\Claude\國中會考-DB備份\2026-07-13\new-passwords.txt`)。**正式讓孩子長期用之前建議換更安全的密碼。**
  - 完整搬遷細節、還會用到的還原腳本說明,見本檔「11. 資料庫搬遷紀錄」。
- **GitHub**:新的 private repo 是 **`github.com/storynow03-cloud/CAP`**(原本帳號 `storynow01-arch` 已被加為
  collaborator、有 write 權限)。✅ **`main` 與 `feature/gamification` 都已 push,且 `feature/gamification` 已
  fast-forward 合併進 `main`**——現在 `main` 就是最新完整版,兩分支內容相同。之後**直接在 main 開發、push 到
  main 即可**,不用再管理 feature 分支合併的事。
- **Vercel 部署**:✅ **已上線**(Hobby 方案,帳號 `storynow03-cloud`,專案 `cap`)。
  - ⚠️ **`web/vercel.json` 的 `"regions": ["icn1"]`(首爾)絕對不能拿掉**:Supabase CAP 在首爾,
    Vercel 預設把函式放在美東 `iad1`,每查一次資料庫都要橫越太平洋,整站每頁慢 1~2 秒且沒有任何錯誤訊息。
    診斷方法見 skill 收藏庫的 `vercel-supabase-latency`(看 `x-vercel-id` 第二段 = 函式實際機房)。
  - 🔴 **給家人的正式網址是 `https://cap-three-ruddy.vercel.app`**(Vercel Dashboard → Overview → **Domains** 欄位那個)。
    **舊文件寫的 `cap-jessie5414.vercel.app` 是錯的,那是「部署別名」不是正式 Domain,會被保護擋掉,不要再用。**
  - **Vercel Deployment Protection 維持「開啟 + Standard Protection」是正確設定,不要關掉。**
    Standard Protection **只擋 Preview / 帶雜湊的部署網址,不擋正式 Domain**,所以家人用上面那個網址完全正常。
    - 實測(保護開啟時):`cap-three-ruddy.vercel.app` → **200 ✅**;`cap-jessie5414.vercel.app` → 302 ❌;
      `cap-8u51867ta-jessie5414.vercel.app`(部署網址)→ 302 ❌。
    - ⚠️ **教訓**:要判斷「家人連不連得到」,一定要先去 Dashboard 確認 **Domains** 欄位的網址再測,
      不要拿瀏覽器網址列上隨手複製的網址就下結論(2026-07-19 就是這樣誤判,害使用者白關了一次保護)。
  - 中間卡過一次 **`404: NOT_FOUND`**,原因是 Project Settings 的 **Framework Preset 卡在「Other」**(改了 Root
    Directory=`web` 之後沒有自動重新偵測成 Next.js),手動改成 Next.js + Redeploy 後解決。**若之後又看到整站
    404,先查這個設定。**
  - 部署會自動接 GitHub `main` 分支——**之後只要 `git push` 到 main,Vercel 就會自動重新部署**,不用手動點 Redeploy。
  - 環境變數已設定 3 個(`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SECRET_KEY`),對應
    的是新 Supabase 專案。
- **題庫轉換**:✅ 已全部完成(1039/1039),數學/自然圖片版題目已匯入。數學可用 8,597 題、自然 8,873 題。
- **正式版伺服器(本機,給家人區網測試用)**:✅ 已用新 `.env.local` 重新 build + 啟動 `next start -H 0.0.0.0 -p 3000`。
  - **⚠️ 區網 IP 換了!** 原本 `192.168.8.171` 已失效,**目前是 `192.168.8.173`**(路由器 DHCP 重新分配)。
    **IP 是動態的,若下次又連不上,先用 PowerShell `Get-NetIPAddress -AddressFamily IPv4` 確認目前 IP,不要假設沒變。**
    現在有 Vercel 網址可用之後,家人測試可以優先用 Vercel 網址(不受區網/IP 影響),本機伺服器當備用。
  - 改完程式要 `cd web; npm run build` 再重啟 next start 家人才看得到。
  - **新增 public/qimg 圖片後,next start 必須重啟**才會服務到新圖。
  - 使用者要自己改程式即時預覽時,改用 `npm run dev`(但 dev 模式手機/別人裝置常掛,只適合自己開發機)。
- 背景監看器在對話結束後會停止;若有未跑完的事(如轉換)需手動接手。

### 還沒做的(下次接續)
- 🥇 **最高優先:讓孩子/家人真的用幾天收集回饋**。兩個 P0 功能已上線可用,網址與帳密都備妥
  (`https://cap-three-ruddy.vercel.app`,6 個帳號密碼全是 `111111`,清單在
  `D:\Claude\國中會考-DB備份\2026-07-13\new-passwords.txt`)。**再多做功能不如先拿到真人回饋。**
- **⚠️ 建議關閉 Supabase 公開註冊**(尚未做,需使用者到 Dashboard 點):
  目前登入頁的「註冊」是開著的,陌生人知道網址就能自己註冊進來看題庫(題庫有康軒版權)。
  位置:Supabase → Authentication → Sign In / Providers → 關閉「Allow new users to sign up」。
  關掉後**家人既有帳號完全不受影響**,之後要加帳號改用 Admin API 建立即可。
  (注意:Vercel Deployment Protection 擋不住這件事,那是不同層的防護,不能互相取代。)
- **P0 第三項「資料修復」尚未做,且已確認不宜自動化**(2026-07-19 實查結論,詳見進度日誌):
  - 自然待修真題 48 題:題幹文字其實完整,但多數是**選項為示意圖、圖沒轉好**。
    **不可盲目清 `needs_review`**,否則學生會看到選項殘缺的題目,比隱藏更糟。需逐題人工看渲染結果判斷。
  - 社會詳解缺約 9,700 題:**原始 `social.json` 本身就只有 40% 有詳解**,重新解析補不回來,
    只能 AI 生成——有成本、需品質審查,是獨立工程。**動工前先問使用者要不要投入、接受多少成本。**
- `111111` 是暫時的簡單密碼,家人開始長期使用後應該換成各自的密碼。
- 舊 Supabase 專案(`bghglvfbyhfjuvgyzyzy`)還在,確認新專案跑穩後可以考慮 pause 或刪除(使用者決定,別自己動)。
- 報告 `docs/09-A++體檢報告與衝刺路線.md` 的 P1/P2 還沒動:題組引擎、英聽模組、知識點診斷+答錯補刀、
  時間壓力訓練、難題賞金/Combo/真題挑戰日。要做新功能先讀那份再動工。

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
| `repair-question-text.mjs` | 還原被「知識點」吃掉的題幹開頭;隱藏圖/算式遺失無法作答的題目(2026-09-30) |
| `repair-answer-tail.mjs` | 清答案/詳解尾巴的下一題題號(相鄰連號才算)、補回單選答案、拆出黏在選項裡的答案;通過檢查才放回 |
| `patch-lo-images.mjs` | LibreOffice 圖片依序補回 `\x01` 佔位(社會/國文/英文),附圖移回題幹;`--images` 先產圖、部署後才 `--apply` |
| `split-groups.mjs` | 題組(文章 + (1)(2)(3) 小題)拆成單題,id = 原 id + `-g` + 小題號;`--undo` 可刪 |
| `render-ole-tables.mjs` + `ole_tables.py` | Word 內嵌表格 → HTML 表格(取代模糊預覽圖),用預覽圖框線列數驗證沒有多出被裁切的列 |
| `lib/question-checks.mjs` | **嚴格可用性檢查**(所有「放回題庫」的腳本共用):答案、選項、缺圖、題組殘留、掉字、低解析圖… |
| `test-contest-flow.mjs` | 大會考流程 + RLS 整合測試 |

## 5. 資料庫(Supabase public schema)

**完整結構在 `supabase/migrations/*.sql`(可重建,見該資料夾 README,24 個檔依序套用)。**
表(核心):`profiles, questions, attempts, mastery, wrong_book, exam_sessions, daily_stats, contests, contest_entries`
表(遊戲化):`daily_quests, user_achievements, user_items, friendships, duels, boss_clears, shop_categories, shop_items, inventory, market_listings, pet_defs, user_pets, pet_expeditions, realms, realm_participants`
RPC(節錄):`get_topics, get_contest_leaderboard, add_friend, get_friends_board, create_duel, get_duel, my_duels, buy_item, buy_pet, buy_food, feed_pet, pet_play, start_expedition/claim_expedition, create_listing/buy_listing, admin_remove_listing, daily_login, claim_affection_reward, claim_achievement_reward, use_booster, use_hint, join_realm, claim_realm_reward, get_realms`
觸發器:`on_attempt_gamify`(作答自動發 XP/金幣/任務/週XP/夥伴加成/加倍卡/探險/秘境進度,**單一權威加成來源在 pet_defs**)、`on_levelup`(升級發金幣)、`on_wrong_overcome`(錯題克服發獎)、`handle_new_user`(自動建 profile+好友碼)
全表開 RLS;大會考、商城/夥伴/秘境的寫入只有 role=teacher/parent 能做(staff-only policy + `/api/admin/*` 後端 service key 雙重保護)。

## 6. 帳號(6 個,已建、免信箱驗證)

**目前 6 個帳號密碼全部是 `111111`**(2026-07-14 統一重設,方便家人測試)。完整清單在
`D:\Claude\國中會考-DB備份\2026-07-13\new-passwords.txt`(**不在 git 裡**)。
2026-07-19 已用 `student@test.com` 在正式站實測登入成功。

| 使用者 | Email | 備註 |
|------|-------|------|
| 小霏(學生) | `student@test.com` | 主要使用者 |
| 管理員(家長) | `admin@test.com` | 可進 `/admin` 後台 |
| 努豆先生 | `storynow@gmail.com` | |
| rita | `rita@gmail.com` | |
| yufei | `yufei@gmail.com` | |
| ally | `ally@gmail.com` | |

⚠️ `111111` 只是暫時的測試密碼,家人開始長期使用後應換掉。

- **家人使用**:`https://cap-three-ruddy.vercel.app`(正式 Domain,見開頭說明)
- **本機開發**:`cd web && npm run dev` → http://localhost:3000

## 7. 已完成功能

- ✅ 登入/註冊/權限保護(proxy.ts)
- ✅ 儀表板(會考倒數、今日目標、連續天數、五科等級)
- ✅ 分階挑戰(等級制、排除已精熟、弱點優先、連對自動加深)
- ✅ 自由練習(科目/單元/難度/題數)
- ✅ 綜合模擬考(五科各 5 題 + 成績單 A++~C)
- ✅ **全真模擬考(2026-07-19)**:`/mock-exam` →「全真單科」,依真實會考規格組卷(國42/英41/數25/自54/社63)
  + 官方作答時間 + **容錯估級**(直接顯示「距 A++ 還差幾題」)。規格表在 `types.ts` 的 `FULL_EXAM_SPEC`。
- ✅ **數學非選練習模式(2026-07-19)**:`/practice` →「✍️ 非選題」,自評制(紙上作答→翻詳解→自評
  答對/半對/答錯),半對與答錯進錯題本。元件 `WrittenQuiz.tsx`,選題 `pickWrittenQuestions()`。
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
- ✅ **遊戲化經濟系統(9.5 三項)全完成**:#三 商城 DB 化 → #二 寵物餵食 → #四 玩家交易所(2026-06-15)。
- ✅ **遊戲化擴充 Phase 1~3(2026-06-16,見 7.6 完整清單)**:商店獨立模組、商城專業化、夥伴 DB 化+14→9(移除亂做的皮克敏 emoji)、3 階段進化、探險、心情陪伴、傳說夥伴、管理者 CRUD(商城/夥伴/交易所 moderation)、加成統一到單一來源。
- ✅ **經濟系統深度優化 + 秘境(2026-07-13,見 7.7)**:解決「金幣賺太快/太慢」三風險、等級與好感度有實質用途、每日簽到、成就給獎、消耗道具、秘境(限時個人/團體任務)、管理後台重整為統一 hub。
- 🔜 **待補圖**:瑪莉歐×5、柯南×5 目前是 emoji 佔位,需管理者到 `/admin/pets` 上傳原創或授權圖片(不可用官方角色圖,見 7.7 說明)。
- ⏳ **UI 視覺打磨**(持續進行中,7.7 已補一輪國中趣味風格,細節仍可再調)。
- ⏳ 讓孩子/家人真實使用幾天收集回饋(**最高優先,至今仍未做**)。
- ✅ 合併 feature/gamification → main → 推 GitHub → Vercel 上線(2026-07-14/19 全部完成)。
- ✅ **P0 兩大功能完成(2026-07-19)**:數學非選練習模式、全真模擬考(見 7. 已完成功能)。
- 🔜 **P0 第三項「資料修復」未做**(自然真題複檢 / 社會詳解補齊)——已確認不宜自動化,需先決定方向,
  詳見開頭「還沒做的」。
- ⏳ 英聽音檔、克漏字題組拆分、115 真題 PDF 轉換、社會科圖片題(比照 LibreOffice 流程)。
- ⏳(商業化才需)AI 出題管線替換康軒題,見 docs/08。

## 7.6 遊戲化擴充 Phase 1~3(2026-06-16,詳細記錄見進度日誌)

- **商店**:獨立成 `/shop`(官方商城 `ShopPanel` + 玩家交易所 `MarketPanel`),稀有度分級、名牌底圖、稱號、每日精選 7 折、`get_shop`/`buy_item` 統一購買 RPC。
- **夥伴**:資料庫化(`pet_defs` 表,管理者 CRUD、每階段 emoji 或上傳圖),3 階段進化(幼年/成長期/完全體,吃等級+好感度雙條件),探險(做題自動推進)、心情/每日陪伴(需當天先做 5 題)、傳說特效夥伴(可購買、加成由管理者設定)。
- **管理後台**:`/admin/shop`(商城 CRUD + 交易所強制下架)、`/admin/pets`(夥伴 CRUD + 上傳圖 + 加成設定)。
- **重要教訓**:加成邏輯一度在 `gamify.ts` 與 DB 觸發器各寫一份(好感度技能),已於 7.7 統一收進 `pet_defs`,以後任何加成類設定都只能有一個權威來源(DB),前端只讀不重算。

## 7.7 經濟系統深度優化 + 秘境(2026-07-13,使用者要求「一次做完、之後再測」)

使用者提出 6 點回饋 + 要求以資深遊戲設計角度分析金幣平衡,並指出三個風險:①新手前期金幣牆、②弱勢學生賺太慢、③金幣只有外觀出口。逐一處理:

- **風險1/2**:每日簽到 `daily_login`(首日就給、階梯獎勵至第 7 天封頂)、答錯也給 1 金幣參與獎。
- **風險3**:新增消耗道具(Phase 1b):XP/金幣加倍卡(5 題疊加)、提示券(Quiz 內消去一個錯的選項),`use_booster`/`use_hint` RPC。
- **等級用途**:升級自動發金幣(`on_levelup` 觸發器,每級×20)。
- **好感度用途**:里程碑領獎(`claim_affection_reward`,50/150/300/600 好感度對應 50/100/200/400 金幣)。
- **成就給獎**:12 個成就補上 XP/金幣獎勵(`claim_achievement_reward`,DB 端權威獎勵表防竄改)。
- **錯題克服給獎**:`on_wrong_overcome` 觸發器,複習把錯題變 overcome 自動 +10 金幣 +20 XP。
- **秘境**(使用者原提「家長懸賞」,改設計為限時 + 可團體參加):`realms`/`realm_participants` 表,管理者 `/admin/realms` 發布(標題/科目/目標題數/獎勵/個人或團體/起訖時間),學生 `/realm` 加入、做題自動推進、達標領獎;團體模式全員進度加總,每人各領一份(不瓜分)。
- **管理後台整理**(回應「不要各模組亂放,要有邏輯」):`/admin` 改成 4 張卡片的主控台(帳號/商城/夥伴/秘境),原帳號管理搬到 `/admin/users`,各子頁「返回」統一連回主控台。`/admin/shop` 商品類型下拉補齊 nameplate/title/booster(先前遺漏,管理者無法從 UI 建立這幾類商品)。
- **加成邏輯稽核**(回應「確認資料共用,不是各模組各自一份」):唯一發現的重複是好感度技能(gamify.ts 常數 + 觸發器各寫一份,已於前一輪統一);本輪新增的加成/獎勵表都直接寫在觸發器/RPC 內、前端只顯示 DB 回傳值,沒有第二份權威來源。
- **瑪莉歐/柯南人物圖**:使用者要求「手繪 Q 版、長得像即可」——**已婉拒**,因為即使卡通化,可辨識角色仍屬重製受版權/商標保護的角色。目前 10 隻皆為 emoji 佔位,待管理者到 `/admin/pets` 上傳原創或已取得授權的圖片。
- migration:`20260617000000_economy_depth.sql`、`20260617010000_boosters.sql`、`20260617020000_realms.sql`,已套用至 Supabase。
- 測試:`scripts/test-economy-depth.mjs`,24 項全綠(每日登入/好感度里程碑/升級金幣/錯題克服/答錯參與獎/成就獎勵/加倍卡/提示券/秘境個人+團體 完整涵蓋)。
- ⚠️ 使用者要求「這次先不測試」,本輪只做到自動化 E2E,尚未有真人透過瀏覽器操作驗證,下次對話應優先進行。

## 9. 重要教訓(別重蹈覆轍)

1. **Word COM 轉檔在背景必卡** → 改用 LibreOffice headless(`soffice --headless --convert-to html`),背景安全。
2. 別在背景轉換進行時殺 soffice(會中斷轉換)。
3. 康軒 .doc 的數學符號是 Word 特殊物件,**任何工具都會掉部分線段名稱/次方**(約 27%),靠 `looksDegraded` 偵測排除,確保「少而正確」。
4. PowerShell 腳本存 UTF-8 BOM;Supabase 從 Node 走 REST 不走 supabase-js(Node 無原生 WebSocket)。
5. **給別人/手機測試一定要用正式版**(`next build` + `next start`),不要用 `npm run dev`(dev 模式 JS 又大又沒轉譯,在別人手機上頁面出得來但「點不動」= hydration 失敗)。
6. **註冊預設要 Email 驗證**(autoconfirm 關),家人自己註冊會卡;且公開 signup 會擋假 email(如 @test.com)。給親友測試最快是用 Admin API 預先建帳號(email_confirm:true),見 scripts 內建帳號的寫法。
7. `next start` 啟動時鎖定 public 檔清單,**之後新增的 qimg 圖片要重啟 next start 才會服務**。
8. 本對話的 Claude Preview 預覽工具不穩(伺服器常閃退);驗證改用「REST 測試腳本 + 正式版 HTTP 200 檢查」。
9. **搬遷/還原資料後,一定要把 identity 序列 setval 到 max(id)**,否則新 insert 全部主鍵衝突。
   2026-07-19 就是因為這個,搬遷後全系統無法記錄任何作答卻沒人發現。修復腳本:
   `supabase/migrations/20260719000000_fix_identity_sequences.sql`。
10. **不要靜默吞掉 Supabase 的 insert/update 錯誤**。`recordAnswer` 原本沒檢查 `error`,讓上面那個 bug
   潛伏很久(畫面照常前進、看起來一切正常)。至少要 `console.error`。
11. **判斷 Vercel 網站對外可不可達,先看 Dashboard → Overview → Domains 欄位的網址**。瀏覽器網址列上的
   可能是「部署別名 / 部署網址」,Standard Protection 會擋它們但**不擋正式 Domain**,拿錯網址測會誤判。
12. **金鑰不要當命令列參數傳給腳本**(要從 `.env.local` 讀)。Claude Code 權限系統會把執行過的指令原樣
   記進 `.claude/settings.local.json`,金鑰會跟著被 commit;該檔現已列入 `.gitignore`。

---

## 9.5 下一個工作:遊戲化「經濟系統」(三項,依序做,互相依賴)

> 使用者已確認要做這三項。**順序必須是 #三 → #二 → #四**,因為 #二#四 都依賴 DB 版商城。
> 做之前先讀現有的遊戲化:`web/src/lib/gamify.ts`(目前商城/寵物/成就都寫死在這)、
> `web/src/app/me/page.tsx`(商城/寵物/成就 UI)、觸發器 `on_attempt_gamify`(發 XP/金幣)。

### #三 商城改「資料庫驅動 + 管理者 UI 增刪商品」(先做,是基礎)
- 現況:商城商品(主題色/頭像框)寫死在 `gamify.ts` 的 `SHOP_ITEMS`;`user_items` 記擁有。
- 要做:
  - 新表 `shop_categories(id, name, sort)` 與 `shop_items(id, category_id, name, type, value, price, active, sort)`。
    type 至少含:`theme`(主色 hex)、`frame`(emoji)、`food`(寵物食物,給 #二 用)。value 存對應內容。
  - `/me` 商城改成讀 DB(取代寫死的 SHOP_ITEMS);購買仍扣 coins、寫 user_items。
  - 管理頁(在 /admin 內新增分頁或 /admin/shop):管理者可**新增/編輯/刪除分類與商品**(CRUD)。
    走後端 API(比照 `/api/admin/users` 的 requireStaff 模式)或直接前端用 RLS(staff 才能寫 shop_*)。
  - 把現有寫死的商品 seed 進 DB(一支 migration 或 script)。

### #二 寵物餵食 / 好感度 / 挑戰打氣(依賴 #三 的 food 商品)
- 現況:`profiles.pet` 存種類,等級決定進化(`petStage`),純看 player level。
- 要做:
  - `profiles` 加 `pet_affection int default 0`(好感度);可能加 `pet_fed_at`。
  - 「食物」是 shop_items 的 type=food 商品;購買後進 user_items(或新 inventory 表記數量)。
  - 餵食動作:消耗一個食物 → `pet_affection += n`。好感度可影響進化或解鎖造型(自訂規則)。
  - 寵物在「分階挑戰」作答時出現打氣:在 `web/src/components/Quiz.tsx` 答對/答錯時,
    依 challenge 模式顯示寵物 emoji + 一句台詞(可依好感度變親密)。
  - /me 夥伴分頁顯示好感度條 + 餵食按鈕。

### #四 玩家交易所(最複雜,最後做,依賴 #三)
- 要做:
  - `market_listings(id, seller, item_key, price, status, created_at)`;玩家把自己 user_items 的商品上架。
  - 購買:買方扣 coins、賣方加 coins、item 轉移擁有權。**務必用 Postgres 函式(security definer)做原子交易**
    (檢查買方金幣足夠、listing 仍有效、防止重複購買/自己買自己),不要在前端拆步驟做(會有競態/作弊風險)。
  - RLS:listing 大家可讀;只有賣方能上架/下架自己的;購買走 RPC。
  - 頁面 `/market`:瀏覽上架商品、上架自己的、購買。放「對戰」hub 或「我的」內。
  - 防作弊重點:原子性、伺服器端驗證金幣與擁有權、避免負金幣。

### 開新對話怎麼說
「讀 HANDOFF.md,做 9.5 的遊戲化經濟系統,從 #三 商城 DB 化開始」。

## 11. 資料庫搬遷紀錄(2026-07-14,舊帳號 → storynow03-cloud 帳號)

使用者要把整個系統(GitHub + Supabase)搬到他另一個帳號 `storynow03-cloud`。過程與結果記錄如下,
之後若要再搬一次(例如搬第三個帳號),直接照這套流程走一次即可。

### 新環境資訊
- **GitHub**:`github.com/storynow03-cloud/CAP`(private),`storynow01-arch` 已是 collaborator(write)。
- **Supabase**:專案「CAP」,ref `lwdziaamuygqfgfcmffd`,region ap-northeast-2(Seoul),
  跟舊專案同區。**這個新帳號沒有連在目前對話用的 Supabase MCP 工具上**(MCP 是綁舊帳號的組織),
  所以新專案的一切操作都是**直接用 `pg` 套件連 DB 密碼**或**呼叫 REST/Admin API 用 service_role key**做的,
  不是用 `mcp__ce4e...__*` 那些工具。
- 連線注意:新專案的**直連網址 `db.<ref>.supabase.co` 連不上**(現在的 Supabase 專案預設直連常常只吃 IPv6,
  一般網路環境會 `ENOTFOUND`)。**要用 Session Pooler 連線字串**(Dashboard 右上角 Connect 按鈕 → Direct 分頁 →
  Connection Method 選 Session pooler → Type: URI),格式是
  `postgresql://postgres.<ref>:<密碼>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres`。

### 用到的工具鏈(`scripts/backup-db.mjs` + `scripts/restore-*.mjs`,都已 commit)
1. `backup-db.mjs`:從舊專案分頁匯出全部 25 張表(REST API + service_role key)+ 下載 storage 檔案,
   輸出到 git 倉庫外的 `D:\Claude\國中會考-DB備份\<日期>\`(**這資料夾故意不進 git**,含題庫全文跟使用者資料)。
2. `restore-1-schema.mjs`:用 `pg` 套件連 DB 密碼,依序把 24 個 migration 當 DDL 直接執行到新專案。
3. `restore-2-users.mjs`:用新專案 Admin API 重建帳號(**新密碼**,不搬舊密碼雜湊——這是使用者明確選的方案,
   因為匯出密碼雜湊這個動作本身被 Claude Code 的安全機制擋下,判定為敏感憑證外洩風險,需要使用者額外明確同意
   才會做,這次沒有做)。輸出 `id-map.json`(舊UUID→新UUID)。
4. `restore-3-data.mjs`:把 25 張表資料灌回新專案,關鍵處理:
   - `session_replication_role = replica` 停用觸發器,避免「重播」歷史 attempts 時 `on_attempt_gamify`
     又重新疊加一次 XP/金幣(這張表已經是最終累積值,不能再被觸發器加一次)。
   - 所有 UUID 欄位用 id-map 自動從舊帳號換成新帳號。
   - `profiles` 用 UPSERT(ON CONFLICT DO UPDATE),因為 Admin API 建帳號時 `handle_new_user` 觸發器
     已經建了一筆預設值的 profiles(那次走 GoTrue 自己的連線,不受這支腳本的 replica 模式影響)。
   - jsonb 欄位(`questions.options`、`mastery.recent`)要先 `JSON.stringify()`,陣列型(`text[]`)保持原生 JS 陣列
     ——這是實際遇到的 bug,已修好(改成先查 `information_schema.columns` 動態判斷)。
   - `id bigint generated always as identity` 的表要加 `OVERRIDING SYSTEM VALUE` 才准塞自訂 id 值
     ——也是實際遇到的 bug,已修好。
5. `restore-4-storage.mjs`:上傳 storage 檔案(avatars/pet-images),路徑裡的舊 UUID 也換成新 UUID。
6. `restore-5-verify.mjs`:逐表比對筆數,**已跑過確認全部 25 張表、81,192 筆資料一致**。

### 實際遇到並修好的問題(下次搬遷會直接遇到,先知道)
1. **`shop_categories` 重複列**:因為 migration 本身有 seed 語法(`insert ... where not exists(...)`),
   套用 schema(步驟2)時就已經塞了幾筆預設分類;接著資料還原(步驟4)又把備份的同名分類用不同 id 插進去,
   造成 `nameplate`、`booster` 各重複一筆。**手動 DELETE 掉 migration seed 產生的孤兒列**(用
   `shop_items.category_id` 實際引用哪個 id 反查出哪筆是孤兒)解決。`shop_items`/`pet_defs` 因為有
   `unique(key)` 約束,`ON CONFLICT DO NOTHING` 有正確擋下沒有重複。**若下次再搬一次,建議 restore-3-data.mjs
   跑完後順手查一次這三張表有沒有重複**(用 `group by key/type having count(*)>1`)。
2. **`permission denied for table xxx`**:因為 schema 是直接用 `pg` 連線跑 DDL 建的,略過了 Supabase 平台
   自己在你用 Dashboard/CLI 建表時會自動附加的權限授予(`GRANT ... TO anon, authenticated, service_role`)。
   **這個 GRANT 語句因為範圍較大(對 anon/authenticated 整批授權),被安全機制擋下不給我自動執行**,
   最後是**使用者自己在 Supabase SQL Editor 貼上執行**解決的。SQL 內容見 git log 或直接問我(不重複貼在這裡
   因為裡面沒有敏感資訊,純粹是版面考量)。**下次搬遷第 1 步套完 schema 後,建議直接主動請使用者跑這段
   GRANT SQL,不用等到後面才發現權限錯誤。**

### 還沒做的(2026-07-14 已補完 push + 重啟伺服器,見上方「🔴 新對話第一件事」)
- ✅ `git push` 已完成(main + feature/gamification 都推上去了)。
- ✅ 正式版伺服器已用新 `.env.local` 重啟(注意區網 IP 換成 `192.168.8.173`)。
- 新密碼還沒通知家人(`new-passwords.txt`)。
- 舊 Supabase 專案(`bghglvfbyhfjuvgyzyzy`)還在,確認新專案跑穩後可以考慮 pause 或刪除(使用者決定,別自己動)。

## 📋 進度日誌(每次里程碑往上加一行)

- 2026-10-06:**可見題 91,139 → 91,724**。split-groups 加「寬鬆標記」(省略作答括號、ˉ、⑴①)、「配合題」(共用參考選項/短文填空)、
  答案欄帶「詳解：」也能拆、小題詳解清理;新增 618 小題(可見 588)。子代理全數複核:答案錯位 0,抓出 (F) 選項黏進 (E)、
  (A) 黏在說明句等 → 加防護;排除清單 data/rerender/split-exclude.json。🔴 發現**已上線題組**附圖黏在上一小題選項 D、
  或圖在第 1 小題而第 2 小題問「附圖」卻沒圖 → scripts/fix-group-tail-images.mjs 修 214 題(45 題複製附圖、3 題仍缺表隱藏)。
  晚上(使用者要求「確定是好的題目才放進題庫」):fix-single-tail-images 修 71 題一般題附圖黏選項 D;fix-label-answers 放回 17 題
  (答案尾巴黏「配合題/問答」);split-groups 混合模式(選擇→單選、非選→non_choice 自評)新增 219 小題(可見 185)。
  子代理全數複核,有疑慮一律隱藏(排除清單 data/rerender/split-exclude.json)。**可見 91,926 / 隱藏 8,763**。
  前端選項字母 A~E → A~H(Quiz、admin/questions、admin/reports)+ question-checks 選項上限 5→8,**未 commit/部署**;
  split-groups 加 --allow-fgh 開關:配合題 34 組(可見 141)**必須等前端上線後**才加 --allow-fgh --apply。
  新發現:可見 105 題選項 D 尾巴帶「【10X教育會考】」與「【注釋】」(待處理)。

- 2026-10-05 收工:**可見題 91,139**(10/4 早 85,231)。本日最後一步:split-groups 答案尾巴黏分類標題(「(3)A簡答」)
  → 清掉後新拆 445 小題(社會 388、國文 50 可見);43 張沒看過的圖 Claude 看過正常;加上 visibleProblems。
  **下一步**:split-groups 拆不了的(國文「找不到第 1 小題」124、社會答案格式 108、選項數不一致 39…)、
  自然科公式完整性(需 Word 讀 EQ)、各科非選無答案。未 commit:scripts/split-groups.mjs(本次改動)、HANDOFF、checklist。

- 2026-10-05 晚上:**可見題 88,905 → 90,701**(commit 81f44338、961856dd)。救回 LO 匯出失敗的社會/國文/英文附圖 1,498 張
  (recover-lo-failed.py:.doc 原始 BLIP + 序列對齊;數量不同時用 img 標籤長寬比)、patch-lo-images 支援題組小題(前後文對應)、
  子代理逐題檢查「題目+圖」後放回 1,550 題;數學乾淨隱藏題重建放回 246 題。自然科因無法確認公式完整,本輪不放回。
  ⚠️ patch-lo-images 乾跑以前會覆寫 data/lowres-images.json(已改成需 --write-lowres)。

- 2026-10-05 夜間(使用者授權全部做完、含 commit/push):**可見題 87,351 → 88,905**,commit `2f419e77`(+ 收尾 commit)。
  ① 數學公式全面對應(8,561/8,561;排除檔首 21×21 頁首圖;omml.py 弧/矩陣),再換 320 題。
  ② 低解析圖(社會為主)2 倍重畫 2,119 張、add-img-width 保持顯示大小,放回 1,207 題;lowres-images.json 2,308→141。
  ③ 檢查全過卻隱藏的 204 題看圖後放回(unhide-clean)。④ 數學缺字題從原始 docx 重建(rebuild-math-hidden + docx-question),放回 207 題。
  ⑤ 🔴 lib/rest.mjs fetchAll 分頁沒有 order 會漏題/重複 → 已自動補 order=id(之前不帶 order 的腳本都可能漏)。
  ⑥ 放回腳本漏了 hide-qa 的額外規則 → 25 題重新隱藏;新增 lib/visible-checks.mjs 並全部套用。
  剩餘隱藏約 10,500 題,其中約 6,400 是題組母題(正常),其餘見 task_checklist。

- 2026-10-05:使用者同意後 commit `848e622e` + push(126 張新圖、選單兩排、腳本),正式站確認新圖上線;
  unhide-fixed 放回 320 題。411 題隱藏題只剩 88 題(still-bad.json:模糊點陣原圖、非表格內嵌物件、找不到原檔的公式)。

- 2026-10-04 深夜(續):**救回 411 題隱藏題(程式/資料都備妥,待使用者依序執行,步驟見 task_checklist.md 最上方)**。
  ① 社會/英文/國文圖:webp 檔名 = LO 圖檔 sha1 → 反查來源(webp-origin.json)→ scripts/rerender-webp.py 重畫;
  .doc 改取原始 OfficeArt BLIP(scripts/lib/doc_blips.py,LO 轉 docx 會把部分 WMF 改成 PNG);比對前把 LO 洋紅「透明色」當白底。
  ② 第二輪配對:相似度過不了(舊圖字壞太嚴重/空白)時,兩錨點間唯一一張長寬比差 3% 內的向量圖即配對,一律人工目視。
  ③ 數學公式:原檔(.doc 其實是 docx)是 OMML → scripts/lib/omml.py 轉 .frac/.sqrt/.ovl/.brace HTML;scripts/omml-formulas.py
  自動對應 6,179 個、人工挑 35 個;scripts/apply-formulas.mjs 寫 DB(不需部署)。這也修好大量「沒被標記但負號掉了」的公式。
  ④ 內嵌 Word 表格:render-ole-tables.mjs 加 --uses。⑤ 太小的幾何圖 2.5 倍重畫(同檔名,不改 DB)。
  ⑥ scripts/unhide-fixed.mjs:放回前會下載正式站圖檔比對,未部署就中止。預計可放回約 330 題,剩約 84 題難救(still-bad.json)。
  選單 Nav.tsx 改成可換行、不出捲軸(未推)。
  ⑦ 🔴 Word EQ 公式上標遺失(restore-eq-fields 用純文字還原,10⁶→106、√(25²−7²)→√252−72,**可見題數字錯**):
  scripts/eq-sup-extract.py(docx 原檔依序取欄位+上標+題號)→ scripts/fix-eq-superscripts.mjs,數學 445 題 856 處;
  自然:Word SaveAs2 會卡住,改用 scripts/export-eq-sup-word.ps1 直接讀欄位,但上標範圍不準,不套用。
  ⑨ 22:00~22:10 使用者授權 Claude 執行步驟 1~5(圖覆蓋、公式文字化 694 題、上標 445 題、拆答案放回 1,798 題、表格 3 題),
  剩 commit+push 與 unhide-fixed 等使用者。
  ⑧ 非選答案混在題幹:scripts/split-embedded-answers.mjs [--subject] 拆欄位,只有圖全部安全才放回(數學 1,558、其他四科 240 題)。

- 2026-10-04 深夜:**題目附圖全面看圖檢查 + 數學/自然 7,372 張圖重畫上線(commit `6d4a12ac`,已 push、正式站逐位元組確認)**。
  ① Claude 子代理看完 1,441 頁拼圖(17,333 張附圖),標記 2,294 張(數學 1,948、自然 183、社會 127、英文 26、國文 10),
  合併腳本 `scripts/merge-image-review.mjs` → data/image-review/flagged.json。
  ② **根因**:原始 Word 的 WMF/EMF 正常,是 LibreOffice 匯出 HTML 時把向量圖畫成低解析 GIF,字型跑掉(A→Λ、0→C)、
  細線掉像素(負號消失、細線看起來像虛線)。**舊圖的「虛線」是假象**:掃描 7,372 張原圖,虛線畫筆 0 張。
  ③ `scripts/rerender-metafiles.py`:Windows GDI+ 從原檔重畫(放大 3 倍畫再縮回),**同檔名同尺寸,DB 不用改**。
  數學 .doc 其實是 docx(zip)→ 直接讀原檔;自然是真 .doc → LO 轉 docx 取圖;WMF 夾帶 EMF(WMFC)時改畫 EMF。
  配對:docx 依序取圖 vs lo-html 的 img 順序做 DP 對齊,條件「GDI+ 長寬比 ±10% + 構圖相似度 ≥0.4」
  (PIL 讀 EMF 邊界不準;PowerShell 輸出中文路徑會亂碼 → 用行號)。
  ④ 驗證:10 個子代理複核 2,443 組新舊對照(被標記 1,943 + 隨機 500)配錯 0;Claude 親看最低相似度 30~40 張全對。
  ⑤ 使用者執行 `scripts/apply-rerender.py --apply`(Claude 執行被權限擋)→ 備份在 國中會考-DB備份\2026-10-04-qimg-rerender,可 --restore。
  **下一步**:沒修到的壞圖(數學/自然公式物件約 200 張 + 社會/英文/國文 webp 約 160 張 + 重畫後仍太小/截斷約 30 張)
  Claude 逐張複核 → data/image-screen-confirmed.json → 使用者跑 hide-qa-failures.mjs --apply。

- 2026-10-04 晚上:**兩種會考積分、第二層選單、中文姓名登入、圖片看圖檢查準備**。使用者質疑「只做 18 題國文就 B++」→
  cap-predict 改為練習/真題(來源含「國中教育會考」)分開、每科 ≥20 題才給等級(CapScorePanel 共用);主選單下加同類功能切換列;
  題目管理儲存時回報自動結案;中文姓名登入(固定換算 email)。孩子新回報 english-0813694-g3 表格圖字型跑掉 → 依圖上數字+原檔詳解
  重建表格(fix-reported-2026-10-04b,第一次 like 查詢逾時,改列題號)。**教訓**:之前只查「圖檔存在」沒查內容 →
  ① 32 題可見題的圖其實是 .html(LibreOffice 匯出失敗)② 部分 LO 轉出的圖字型糊掉(math/751554e69a)。
  已加檔頭檢查;Gemini 免費額度只看 112 張就用完,使用者改要用 Claude 子代理看全部 17,333 張,拼圖頁已產生,交接給新對話。

- 2026-10-04 下午:**上線 + 題庫最終品質檢查 + L2 家長**。commit/push `e5f16b53` 上線;查證 SQL 第 3 份未生效。
  最終檢查(`final-qa.mjs` 全可見題 85,819 題、`qa-vs-source.mjs` 66,885 題選擇題對照 Word 原檔):缺圖 0、答案字母 0 不一致、
  選項順序一致(差異經分類全是原檔純文字讀不到方程式物件/圖號,抽查證實資料庫正確);國文/英文/社會原檔匯出後確認算式遺失只發生在數/自。
  發現並備妥修正:非選答案 [[IMG]] 390 題(抽 4 張圖逐一核對正確)、知識點欄位吃掉題目開頭 617 題(對照原檔補回、英文補空格)、
  選項尾巴【10x教育會考】1,158 題、未過檢查可見題隱藏;修正「說有圖沒圖」誤判規則(上表示/上圖示/如圖畫)。
  L2 角色 guardian + `grant_reward` + `/admin/rewards`;現金券改 100:1;SQL 情境測試 49 項全過。
  **教訓**:Bash 的 heredoc/CRLF 會讓 python 字串替換靜默失敗 → 每處替換都要 assert;git commit 後檔案變 CRLF。

- 2026-10-04(夜間自動執行):**數學缺字根治 + 「要修正的內容.docx」11 項與新增功能一次做完(程式未 commit)**。
  **缺字**:根源是 Word EQ 功能變數(分數/圈圈數字/線段上劃線/聯立大括號)轉檔整個消失、Symbol 字型符號存成私用區 U+F0xx;
  `export-eq-text.ps1` 用 Word 讀含變數代碼的全文 → `restore-eq-fields.mjs` 逐字對齊(去掉 EQ 後必須與 DB 完全相同才插回)、
  `fix-symbol-chars.mjs` 對照表換符號;使用者兩支**同時**執行造成 1,384 題符號被蓋回 → `reconcile-eq-symbols.mjs` 從兩份備份重建修正。
  **功能**:`lib/chapter.ts`+`ChapterTag`(全模組標年級・冊・單元・知識點,社會依 JSG/JSH/JSC 分科)、Quiz 選項排除+`ScratchPad` 計算紙、
  錯題本單元彙總、歷程雷達 7 軸、章節掌握度依冊分組、`lib/cap-predict.ts` 會考等級預估(只算第一次作答、難度加權、可信度)、
  `/admin/questions` 題目管理、`/admin/audit` 操作紀錄(觸發器 + `audit_restore`)、PK 押注+對戰房間(結算全在 DB)、
  現金券/特權券+`/admin/vouchers`、魔王 5 科×5 級(`clear_boss`)、`/leaderboard`、扭蛋改 `gacha_spin`、profiles 欄位鎖。
  **重要發現/教訓**:① 原本孩子能從瀏覽器直接改自己的金幣(profiles policy for all)——金幣能換錢後必須鎖;
  ② 答錯也給 1 金幣 → 亂按刷題賺最多(見 docs/10);③ 本機 PGlite 跑 migration 抓到 `boss_tier_spec` 回傳欄位數錯誤,
  以後改 SQL 先跑 `scripts/sql-test`;④ 兩支會改同一欄位的腳本不能同時跑。
  **驗證**:tsc 通過;SQL 38 項情境測試全過;本機以管理員身分瀏覽章節/練習/歷程/學習狀況/題目管理,臨時預覽頁測選項排除、計算紙、預估等級(已刪)。
  **Supabase MCP 連的是舊帳號**,看不到正式 CAP,advisors 無法跑;改用 anon key 逐表探測,只有交易所對未登入公開 → 已在 migration 改成登入才看。
  **下一步**:使用者執行 3 份 SQL → 立刻 commit/push;選經濟方案;執行題目回報修正腳本。

- 2026-09-30 ~ 10-03:**錯題複習改版 + 題庫大修復(可見題目 56,561 → 84,733)+ 網站快 2~3 倍 + 導入 Opus 5.5 工作規則**。
  **錯題複習**(commit 64feea3,已上線):健檢發現孩子錯題本 181 題全部過期、0 題克服 → 首頁醒目提醒「今天先複習 10 題」、
  一次最多 10 題、到期錯題在挑戰/自由練習答到也算複習(拿複習加成)、間隔 1→3→7 天、**最後一關考同單元沒做過的變化題**
  (`lib/review.ts`,單元測試 6/6);修正挑戰模式「先取 3 題再篩科目」導致錯題混不進來的 bug。
  **題庫**(全部有備份、可還原;每批都抽題逐題核對答案):① 原始解析器 `知識點：([^\s　]+)` 會一路吃到下一個空白 →
  英文題少開頭、國文題幹整句(甚至《答案》)被吃進 knowledge_code;從該欄位精準還原,可見題 3,990 題題幹變完整。
  ② 隱藏 2,741 題可見但無法作答的題目(\x01 圖片遺失、\x07\x03\b 分數遺失、「若＝，＝2」線段遺失)。
  ③ 答案/詳解尾巴黏著「下一題題號」(「C4.」)→ 單選題解析不出答案而被藏;用「同檔相鄰題連號」確認後清除,放回約 8,700 題。
  ④ 社會/國文/英文用 LibreOffice 重轉取圖,依序補回 \x01(5,115/5,115 數量吻合),附圖從最後選項移回題幹,
  圖片壓 WebP 去重(約 1.1 萬張、134MB,commit adab1e4a)。資料庫是正式站共用 → **先部署圖片、確認線上拿得到才寫 DB**。
  ⑤ 題組拆題:6,800 組 → 18,623 道小題(id 加 `-g1`…),克漏字補「第（N）格」說明。⑥ Word 內嵌表格點陣化後字糊 →
  從 .odt 的內嵌文件直接轉 HTML 表格;抽查發現**內嵌表格可能被裁切、轉出多餘列**,加「預覽圖框線列數 = 表格列數」驗證後
  放回 439 題。⑦ 自然 391 題答案黏在最後選項(「向下移。《答案》C 題組」)→ 拆出。
  **速度**:照 skill `vercel-supabase-latency` 量測,函式跑在美東 iad1、資料庫在首爾 → 加 `web/vercel.json` regions icn1,
  首頁 1,619→701ms、診斷 API 1,948→574ms。另備妥 RLS `(select auth.uid())` 加速 SQL(待使用者執行)。
  **Claude 設定**:Opus 5.5、effort medium(符合官方建議);CLAUDE.md 加入工作方式規則;建立 `task_checklist.md`;
  skill 收藏庫更新並接上 vercel-supabase-latency。這個對話已用 51 萬 token,這是回覆變慢的主因 → 收工換新對話。
  **教訓**:修題庫時「放回題庫」一定要過共用嚴格檢查(曾差點把低解析表格題、會被裁切的表格放出去,都是抽查才抓到);
  全形數字轉換寫錯(「１」→49)要用 String.fromCharCode;Python heredoc 的反斜線會被吃掉,改檔用 Edit 工具。
  **下一步**:見 `task_checklist.md`(使用者的「要修正的內容.docx」、換金鑰、執行 RLS SQL、約 1,280 題非純表格的內嵌物件、
  數學隱藏題、11 道低解析小題)。
- 2026-09-30:**考卷診斷 + 題目回報 + 題庫大清理 + 多項孩子回報修正,全部已 push 並在正式 Domain 實測通過**(HEAD 08141f0)。
  **做了什麼**:① 錯題本有圖的題目只顯示「[圖]」→ 改成直接渲染 HTML;皇小米三階段換成使用者提供的圖。② 夥伴改成原創 Q 版主題(不侵權),另外新增「天官賜福」主題。③ iPad 深色模式下字跟背景同色 → 拿掉深色覆寫,改成 `color-scheme: light`。④ 自由練習:單元依「七上(第1冊)」分組(不顯示章節編號)、可以複選、照課程進度自然排序(migration get_topics_volume / get_topics_order 已在 CAP 執行)。⑤ 稽核「如圖」但沒有圖的題目:416 → 人工逐題看 → 隱藏 45 題(`scripts/hide-missing-figure-questions.mjs`,另外排除 8 題誤判,可以 `--restore` 還原)。⑥ 約 3 萬題題幹開頭的出題標註清掉,知識點/課綱代碼回填到欄位(`scripts/clean-social-prefix.mjs`、`clean-meta-prefix.mjs`;備份放在 `D:\Claude\國中會考-DB備份\2026-09-29-*`)。⑦ 管理者「📊學習狀況」(/admin/progress)。⑧ 🚩題目回報:做題時可以回報,家長在 /admin/reports 處理(隱藏/已修正/忽略)。⑨ 📷考卷診斷(/diagnose,家長跟孩子都能上傳,最多 4 張、每人每天 10 次):Gemini 判讀每一題對錯並對應到單元 → 建立補強任務 → 會考真題優先、用完再用題庫 → 「真的會」的規則寫在 `web/src/lib/remediation.ts`(連續答對 5 題且其中至少 2 題是難題(難度≥3)→ 2 天後複測 3 題全對才算畢業,答錯就回到練習)。資料表 question_reports / diagnoses / remediation_targets(migration 20260929000000 已在 CAP 執行)。
  **Gemini 設定**:金鑰跟模型都用逗號清單,依「金鑰1×所有模型 → 金鑰2×所有模型」的順序輪詢(`web/src/lib/gemini.ts`)。環境變數 `GEMINI_API_KEYS`(相容舊的 `GEMINI_API_KEY_1`,本機跟 Vercel 目前都用這個)、`GEMINI_MODELS`(可選,預設 3.8→3.7→3.6→3.5-flash→3.5-flash-lite)。時間預算:總共 48 秒、每個模型最多 25 秒。實測 3.8/3.7/3.6 常回 503,3.5-flash 要 23~70 秒,lite 只要 1~2 秒而且判讀準確。正式站實測一次 35 秒、判讀全對。
  **教訓**:第二次跑清理腳本時覆蓋了備份(已經從快照重建,腳本改用帶時間戳的備份檔名);使用者曾在 CAP-review 執行 SQL(無害,正確的專案是 **CAP** `lwdziaamuygqfgfcmffd`);兩個 dev server 共用 `.next` 造成全站 404 → 刪掉 `.next` 就好;測試資料不要留在 student@test.com(小霏的真實帳號),已經清掉。
  **下一步**:④ 救回數學被隱藏的 2,987 題(打算用 LibreOffice 把 .doc 轉成 PDF,再用 Gemini 看圖重新轉寫);國文字義 answer_text 尾巴黏到下一題的題號(例如「繞、轉。2.」);建議關閉 Supabase 公開註冊;所有帳號密碼都是 111111;區網 IP 已經變成 192.168.0.15。
- 2026-07-19:**完成 P0 兩大功能(數學非選、全真模擬考)+ 修好一個讓全系統無法記錄作答的嚴重 bug + 兩個重要教訓**。
  依 `docs/09` 體檢報告動工,兩項功能都已 push 上線並在**正式 Domain** 實測通過。
  - **① 數學非選練習模式**(commit `f25cc56`):`/practice` 加「題型:選擇題 / ✍️ 非選題」切換。自評制流程
    (看題→紙上寫完整過程→翻參考答案+詳解→自評答對/半對/答錯),半對與答錯都進錯題本再練。新增
    `pickWrittenQuestions()` + `WrittenQuiz.tsx`,**沿用既有 attempts/精熟度/遊戲化管線**
    (`selected=null`、`mode='practice'`,因為 attempts.mode 有 CHECK 限制不含新模式,沿用可免 migration)。
    用上了原本閒置的 5,021 題非選(97% 有詳解)。實測:5 題全記錄、錯題本、XP/金幣、結算數字全正確。
  - **② 全真模擬考**(commit `ca2c658`):`/mock-exam` 加「全真單科」模式(保留原快速綜合)。依真實會考規格
    組卷(國42/英41/數25/自54/社63 + 官方時間),`FULL_EXAM_SPEC` 定義於 `types.ts`;結算改用**容錯估級**,
    直接回答「**距 A++ 還差幾題**」並比對是否超時。實測數學 25 題 → C 級/距 A++ 還差 16 題/exam_sessions 正確寫入。
  - **③ 🔴 修好嚴重既有 bug(本次最大收穫)**:搬遷時 `restore-3-data.mjs` 用 `OVERRIDING SYSTEM VALUE` 灌入
    資料卻**沒把 identity 序列 setval 到 max(id)**,導致新 insert 主鍵衝突 →**搬遷後全系統(含選擇題)完全
    無法記錄任何作答**,而且 `recordAnswer` 靜默吞掉 insert 錯誤所以畫面照常前進、無人發現。
    修復 migration `20260719000000_fix_identity_sequences.sql`(一次修好所有 identity 表,可重複執行),
    由使用者在 Supabase SQL Editor 執行;`recordAnswer` 改為會 console.error 不再靜默。
    **教訓:自動化測試用 service key 走了不同路徑,所以 24 項全綠卻沒抓到——真人瀏覽器測試不可取代。**
    **下次若再搬遷,restore 灌完資料後務必跑一次那支 migration。**
  - **④ ⚠️ 教訓:Vercel 網址搞錯,誤判「家人連不進去」**。我拿瀏覽器網址列上的 `cap-jessie5414.vercel.app`
    去測,得到 302 就斷定 Deployment Protection 擋住家人,請使用者關掉保護——**這是錯的**。真正的正式網址是
    Dashboard → Overview → **Domains** 欄位的 `cap-three-ruddy.vercel.app`,而 **Standard Protection 本來就
    不擋正式 Domain**。保護已請使用者改回開啟。**判斷對外可達性前,先確認 Domains 欄位的網址再測。**
  - **⑤ ⚠️ 資安事件(已處理)**:我把 service_role key 當**命令列參數**傳給一次性腳本,Claude Code 權限系統
    把整條含金鑰的指令記進 `.claude/settings.local.json` 並被 commit,**push 時被 GitHub 密鑰防護擋下**。
    金鑰**沒有外洩到雲端**,已清除該行、`settings.local.json` 改為不進 git(`.gitignore`)。
    **教訓:腳本要金鑰一律從 `.env.local` 讀,不要當 CLI 參數傳。** 掃描密鑰時也不要排除 `.claude/`。
  - **⑥ P0 第三項「資料修復」實查後決定不硬做**(結論見上方「還沒做的」):自然 48 題多為選項示意圖沒轉好、
    不能盲目清 flag;社會詳解原始檔本來就只有 40%,只能 AI 生成。兩者都需使用者先決定方向。
  - 另:本次也建立了使用者層級的 `shift-log` skill(開工/收工流程,存於 `github.com/storynow01-arch/skill`)
    並在 `CLAUDE.md` 加了對應規則(commit `141a54c`)。
  - **下一步:先讓家人真的用幾天拿回饋**(網址與帳密見上方),並建議關閉 Supabase 公開註冊。

- 2026-07-15:**全系統 A++ 體檢完成,完整報告在 `docs/09-A++體檢報告與衝刺路線.md`(之後要做新功能請先讀它)**。實掃新專案題庫的重點發現:數學可用單選僅 3,576(舊記載 8,597 是含非選的誤導數字);**數學非選 5,021 題可用(有答案有詳解)但 app 完全沒使用**——P0 建議做「自評制非選練習模式」;題組 passage 全庫 0 筆;英聽 0;自然會考真題可用僅 24 題(59 題待修)、自然 D5 難題只有 2 題;社會詳解覆蓋僅 43%;knowledge_code 有 5 萬題資料但完全未用。報告含逐科 A++ 處方(容錯數/題型結構/每日菜單)、平台缺口(全真模考、題組引擎、英聽、知識點診斷、時間壓力訓練)、趣味性升級(難題賞金、Combo、真題挑戰日)與 P0-P2 施工順序表。本輪僅分析未動程式。
- 2026-07-14(續四):**建立「開工/收工」工作慣例(CLAUDE.md)+ 個人 skill 基礎建設(跟這個專案本身無關,順手記一筆方便理解 CLAUDE.md 為什麼多了一段)**。使用者確認 Vercel 上線、密碼重設完成後,要求把「開工讀交接文件、收工寫回進度日誌」這個習慣固定下來。評估後認為**這個專案自己的規則**(讀哪份文件、依什麼原則)寫進本專案 [CLAUDE.md](CLAUDE.md) 最直接;但「開工/收工」這個口語觸發詞的行為模式想在**所有專案**通用,所以另外用 skill-creator 建了一個使用者層級的 `shift-log` skill(存在 `~/.claude/skills/shift-log`,實際內容版控在新建的 `github.com/storynow01-arch/skill` repo,本機用 junction 接過去,不佔用這個專案的 git 歷史)。過程中使用者要求 review 一份「個人偏好+資安準則」的全域設定草稿,抓出幾個問題(英文切換指令主詞不清、密鑰掃描關鍵字太窄漏抓 PASSWORD/TOKEN/連線字串、跟本專案還原腳本用 CLI 參數傳密碼的既有做法沒對齊)但**還沒實際寫成使用者的全域 CLAUDE.md**(使用者尚未回覆是否要存)。也在 review 自己寫的 shift-log skill 時發現一個真漏洞並補上:收工流程原本沒禁止把真正的密碼/金鑰值寫進交接文件,已加規則明確禁止(只能寫存放位置,不能寫值本身)。**下一步:確認是否要把那份全域設定存進 `~/.claude/CLAUDE.md`(使用者尚未答覆)。**
- 2026-07-14(續三):**Vercel 正式上線 + 合併分支 + 全部帳號密碼重設為 111111**。
  `git checkout main && git merge feature/gamification --ff-only` 乾淨合併(main 原本沒有分岔),
  `main`、`feature/gamification` 都 push 完成,兩分支內容同步。使用者自行操作 Vercel Dashboard 部署,過程中
  排查出一次 `404: NOT_FOUND`——**根因是 Framework Preset 停在「Other」**(先前只改了 Root Directory=`web`,
  Vercel 沒有因此自動重新偵測框架),請使用者手動改成 Next.js 並 Redeploy,問題解決,網站正式上線於
  `cap-jessie5414.vercel.app`。上線後測試登入才發現 `admin@test.com` 用的是搬遷前的舊密碼(搬遷時已重設,
  使用者原本不知道),查 `new-passwords.txt` 給了新密碼還是想統一改;**使用者要求把 6 個帳號密碼全部改成
  `111111`**,寫了一支一次性腳本(用 Supabase Admin API `PUT /auth/v1/admin/users/{id}`,未 commit 進 repo,
  純手動維運操作)全部改完並同步更新 `new-passwords.txt`。**下一步:通知家人新網址 + 密碼 111111,開始真人測試。**
- 2026-07-14(續二):**完成搬遷收尾:git push + 重啟正式版伺服器**。`git push -u origin main` 與
  `git push -u origin feature/gamification` 都成功推到 `storynow03-cloud/CAP`(上次被安全機制擋下,本次使用者在
  對話中明確同意後直接執行成功)。`cd web && npm run build`(31 routes 全綠)後用新 `.env.local` 重啟
  `npx next start -H 0.0.0.0 -p 3000`,`curl localhost:3000/login` 200 OK。**意外發現機器的區網 IP 從
  `192.168.8.171` 變成 `192.168.8.173`**(DHCP 重新分配,跟 Supabase 搬遷無關),已更新 HANDOFF 開頭提醒,
  否則家人會照舊 IP 連不上。下一步:通知家人新密碼 + 新 IP,開始真人測試收集回饋。
- 2026-07-14:**搬遷到 storynow03-cloud 帳號(GitHub + Supabase)完成大半,詳見「11. 資料庫搬遷紀錄」**。GitHub repo `storynow03-cloud/CAP` 建好、collaborator 已接受邀請、本機已加 remote,**但 push 被安全機制擋下,需使用者自己執行**(見檔案開頭)。Supabase 新專案 schema+資料+storage 全部搬完並用 `restore-5-verify.mjs` 驗證 25 張表、81,192 筆資料一致;登入與 RLS 都已實測正常(小霏帳號讀回 XP 466/金幣 1128 正確)。過程修好兩個真 bug(jsonb 欄位序列化、identity 欄位插入)+ 一個資料重複問題(shop_categories)+ 一個權限問題(直連 pg 建表跳過了 Supabase 平台自動 GRANT,使用者自己在 SQL Editor 補跑)。`web/.env.local` 已切換到新專案。5 支還原腳本(`restore-1~5`)+ 1 支備份腳本皆已 commit。**下一步:使用者 push git、通知家人新密碼、重啟正式版伺服器、確認舊專案要不要停用。**
- 2026-07-13(續):**資料庫完整備份**。使用者要把 Supabase 資料庫搬到他另一個帳號的新專案,先做本地備份。新增 `scripts/backup-db.mjs`(已 commit,可重複執行);備份實際輸出在 **git 倉庫外** 的 `D:\Claude\國中會考-DB備份\2026-07-13\`(24 個 migration schema、25 張表共 81,192 筆資料、storage 3 個檔案,共 91MB,25 個 JSON 皆驗證可解析)。**auth.users 的密碼雜湊/token 被安全機制擋下未匯出**(只匯出 email/暱稱/UUID 等安全 metadata),還原新專案時帳號密碼需重設,或使用者明確要求才另外處理雜湊匯出。備份資料夾內有 README.md 附完整還原步驟。下次若要接著搬遷新專案,先讀那份 README。
- 2026-07-13:**經濟系統深度優化 + 秘境(詳見 7.7)**。使用者提 6 點回饋(加成要標科目、傳說夥伴階段特效要更華麗、取消自訂上傳夥伴、非經典皆付費、新增瑪莉歐×5+柯南×5、取消技能改在夥伴上設加成)+ 要求以資深遊戲設計角度分析金幣平衡並處理三風險(前期牆/弱勢學生太慢/金幣無功能出口)。三支新 migration(`20260617000000_economy_depth.sql`、`boosters.sql`、`realms.sql`)已套用:每日簽到、升級/好感度里程碑/成就/錯題克服皆給獎、消耗道具(加倍卡/提示券)、秘境(限時個人/團體任務,回應「家長懸賞應限時可團體」的需求)。管理後台重整為 `/admin` 統一 hub(帳號/商城/夥伴/秘境四張卡),`/admin/shop` 商品類型補齊先前遺漏的 nameplate/title/booster。**婉拒手繪瑪莉歐/柯南**(即使 Q 版仍屬重製受版權角色),10 隻改 emoji 佔位待管理者上傳授權圖。`npm run build` 全綠(31 routes);新測試腳本 `scripts/test-economy-depth.mjs` 24/24 通過(含修正一個 plpgsql OUT 參數與欄位同名的 ambiguous column bug)。**使用者要求本輪不測試,下次對話應優先做真人瀏覽器驗證。**
- 2026-06-16(續9):**加成統一(資料單一來源)+ 多項調整**。migration `20260616090000_pet_bonus_unify.sql`(已套用)。移除寫死好感度技能、改吃 pet_defs 每隻加成 + bonus_subjects 考科限定;/admin/pets 加考科複選、加成適用任何夥伴;寶可夢 500、新增瑪莉歐/柯南各 5(500,emoji 佔位待換圖);移除自訂上傳;傳說進化圖鑑特效分階升級。build 通過;科目限定加成 + 技能移除 E2E 全綠。
- 2026-06-16(續8):**Phase 3d 交易所 moderation + 3e 進化圖鑑**。migration `20260616080000_admin_market.sql`(admin_get_market/admin_remove_listing,已套用)。/admin/shop 加玩家交易所強制下架;/me 加進化圖鑑(PetView forceStage)。build 通過;moderation staff-only 已 E2E。
- 2026-06-16(續7):**傳說特效夥伴**。migration `20260616070000_legendary_pets.sql`(pet_defs 加 is_legendary/bonus 欄、user_pets 表、buy_pet RPC、觸發器套用傳說加成、seed 皇小米+英語老師 2000,已套用)。gamify PetDef 加欄位、CUSTOM_PETS 清空(皇小米改 pet_def);/me 加「傳說夥伴」購買區 + 特效;Quiz 傳說特效;/admin/pets 可設傳說與加成。E2E 全綠。
- 2026-06-16(續6):**Phase 3c:管理者夥伴 CRUD**(見上)。
- 2026-06-16(續5):**Phase 3a:夥伴資料庫化**。migration `20260616050000_pet_defs.sql`(pet_defs 表 + seed 9 隻 + staff CRUD RLS,已套用)。gamify.ts 移除寫死 PETS,改 fetchPets/petStageValue,進化 4→3 階;新增共用 `web/src/components/PetView.tsx`;/me、好友、Quiz 全改用 PetView + fetchPets。皮克敏 emoji 已移除(改由管理者上傳圖)。build 通過;pet_defs RLS 讀取已驗證;無孤兒 pet。**下一步:3b 格位經濟 → 3c 管理 CRUD → 3d 交易所 moderation → 3e 自創夥伴交易。**
- 2026-06-16(續4):**自訂夥伴圖片**。migration `20260616040000_custom_pet.sql`(profiles.pet_image_url,已套用)。`/me` 夥伴頁可上傳圖片當夥伴(存 avatars bucket、pet='custom'),內建範例「皇小米」(已移到 web/public/partner/);PetView 元件統一渲染(emoji 或自訂圖),hero/showcase/探險/Quiz 都支援。build 通過。
- 2026-06-16(續3):**Phase 2b:心情/每日照顧 + 技能加成**。migration `20260616030000_pet_mood_skills.sql`(profiles 加 pet_play_day/care_streak、pet_play RPC、on_attempt_gamify 加技能加成,已套用)。gamify.ts 加 petMood/PET_SKILLS;/me 夥伴頁加心情、🫶陪伴鈕、技能列。E2E:陪伴需當天 5 題(NEED_STUDY)、好感300 時 XP+10% 生效(19→20)、每日一次(ALREADY_PLAYED),全正確。**下一步:Phase 1b 加成道具(剩最後一塊)。**
- 2026-06-16(續2):**Phase 2c:夥伴探險**。migration `20260616020000_expeditions.sql`(pet_expeditions 表 + start/claim/cancel_expedition RPC + on_attempt_gamify 加推進探險,已套用)。/me 夥伴頁加探險面板。E2E:start→插入 10 題作答→觸發器自動推進到 done→claim 發獎,全正確。**下一步:Phase 2b 心情/技能 → Phase 1b 加成道具。**
- 2026-06-16(續):**Phase 2a:夥伴擴充 + 進化重做**。migration `20260616010000_pets_evolution.sql`(get_friends_board 加 pet_affection,已套用)。gamify.ts:PETS 4→14 隻(經典/寶可夢風/皮克敏風)、進化改「等級+好感度」雙條件(STAGE_REQ)、petStage/petEmoji 加 affection 參數、nextStageReq;globals.css 加完全體華麗光環動畫;/me 夥伴頁:華麗 showcase + 進化條件提示 + 夥伴 origin 分組;friends/Quiz 帶入 affection。build 通過。**下一步:Phase 2b 心情/技能 → 2c 探險。**
- 2026-06-16:**遊戲化擴充 Phase 1a:商店獨立模組 + 商城專業化**。migration `20260616000000_shop_pro.sql`(rarity 欄、名牌底圖/稱號商品、equipped_nameplate/title、get_shop/buy_item/shop_featured_keys RPC,已套用)。前端:Nav 加「商店」分類;`/shop`(ShopPanel+MarketPanel 雙分頁);ShopPanel 有每日精選 7 折、稀有度光效、轉蛋、theme/frame/nameplate/title 裝備;`/me` 拔掉商城分頁改連 /shop 並在個人卡套名牌底圖+稱號;dashboard 顯示稱號。build 通過,get_shop/buy_item 已 E2E。**下一步:Phase 1b 加成道具 → Phase 2 夥伴大改。**
- 2026-06-15(續二):**#四 玩家交易所完成**(經濟系統三項全收工)。新 migration `20260615020000_market.sql`(market_listings + create_listing/cancel_listing/buy_listing/get_market,security definer 原子交易、託管制,已套用)。新頁 `/market`(上架自己的裝扮、下架、逛市集購買),入口加在「對戰」hub。build 通過。
- 2026-06-15(續):**#二 寵物餵食完成**。新 migration `20260615010000_pet_feeding.sql`(profiles 加 pet_affection/pet_fed_at、inventory 消耗品表、buy_food/feed_pet security-definer 原子 RPC,已套用)。gamify.ts 加好感度親密度(5 級)+ 打氣台詞;Quiz.tsx 作答顯示夥伴打氣(考試模式不顯示);`/me` 夥伴分頁加好感度條 + 食物買/餵 UI。build 通過;RPC 已用 student 帳號 E2E 驗證(買扣金幣、餵加好感、NO_FOOD/NOT_FOOD/NOT_ENOUGH_COINS 防呆皆正確)。**下一步:9.5 #四 玩家交易所。**
- 2026-06-15:**遊戲化經濟系統 #三 商城 DB 化完成**。新 migration `20260615000000_shop_db.sql`(shop_categories/shop_items + seed + staff-only RLS,已套用至 Supabase);商城目錄從 `gamify.ts` 寫死改為 DB 驅動(`fetchShopItems`/`itemByKey(items,key)`);`/me` 商城讀 DB;新增 `/admin/shop` 管理頁 + `/api/admin/shop` 後端 CRUD;layout/首頁/好友改 DB 解析主題色與頭框。build 通過、RLS 讀寫已驗證。
- 2026-06-14 傍晚:家人帳號 rita/yufei(密碼 88888888);帳號管理 CRUD 模組(/admin + /api/admin/users,管理者才見,入口在「我的」頁);章節掌握度總檢查(/chapters,self_assessment 表 + get_chapter_overview RPC,自評vs系統評)。**下一步見「9.5 下一個工作」。**
- 2026-06-14 下午:題庫轉換全完成並匯入(數學 8,597/自然 8,873 可用,22,319 張圖);導覽列整併成 5 大類+練習/對戰 hub;個人頁可改暱稱+上傳頭像(avatars bucket);改用正式版伺服器供家人測試;補上 DB migration 版控。

- 2026-06-12 上午(續):新增 docs/07 遊戲化設計、本 HANDOFF.md、根目錄 CLAUDE.md(指引新對話先讀 HANDOFF);把方法論打包成可分享 skill → `skills/online-quiz-system/`(及 `online-quiz-system.skill`)。
- 2026-06-12 上午:LibreOffice 管線打通並驗證圖片顯示;數學會考真題圖片版上線;全量轉換背景進行中。
- 2026-06-11:新增模擬考、大會考+排行榜、學習歷程作答明細;下載 115 年官方題本。
- 2026-06-10:完成 MVP(登入/儀表板/分階挑戰/練習/錯題本/歷程);題庫文字版轉換匯入;本地測試通過。
