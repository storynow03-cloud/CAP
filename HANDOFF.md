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
- 🔜 **遊戲化經濟系統(三項):見 9.5**。順序 #三 商城DB化 → #二 寵物餵食 → #四 交易所。
  - ✅ **#三 商城 DB 化完成**(2026-06-15):shop_categories/shop_items 表 + seed(8 主題/4 框/3 食物)、`/me` 商城改讀 DB、`/admin/shop` 管理 CRUD、`/api/admin/shop` 後端(requireStaff)。`itemByKey` 改吃商品陣列;layout/page/friends 改用 DB 解析主題色/頭框。
  - ✅ **#二 寵物餵食完成**(2026-06-15):profiles.pet_affection/pet_fed_at、inventory 消耗品表、buy_food/feed_pet 原子 RPC(防作弊);`/me` 夥伴分頁有好感度條(5 級親密度)+ 買/餵食物;Quiz.tsx 作答時夥伴打氣(台詞依好感度變親密,考試模式不打擾)。
  - ✅ **#四 玩家交易所完成**(2026-06-15):market_listings 表 + create_listing/cancel_listing/buy_listing/get_market 原子 RPC(託管制:上架即從 user_items 移出並卸下裝備,防一物多賣;購買檢查金幣/非自己/未擁有);`/market` 頁(上架/下架/購買),入口在「對戰」hub。**經濟系統三項全完成。**

- 🔜 **遊戲化擴充(使用者 6/16 要求,分階段)**:
  - ✅ **Phase 1a 商店獨立模組 + 商城專業化完成**(2026-06-16):導覽列新增「🏪 商店」(6 大類),`/shop` 雙分頁(官方商城 `ShopPanel` / 玩家交易所 `MarketPanel`);商品加稀有度(普通/稀有/史詩/傳說,有光效)、名牌底圖、稱號;`get_shop`/`buy_item` RPC(server 算每日精選 7 折、統一購買);`/me` 移除商城分頁(改連 /shop),個人卡套用名牌底圖+稱號。商城/交易所原 /me、/arena 入口已移除。
  - 🔜 **Phase 1b 消耗道具/加成包**(XP 加倍卡、提示券…需 buff 表 + 觸發器/Quiz 整合)。
  - ✅ **Phase 2a 夥伴擴充 + 進化重做完成**(2026-06-16):PETS 從 4→14 隻(經典4/寶可夢風5/皮克敏風5,emoji 致敬);進化改吃「等級+好感度」雙條件(STAGE_REQ:Lv3→Lv7+好感50→Lv15+好感200),petStage/petEmoji 加 affection 參數;完全體有華麗光環/漂浮/閃光(globals.css);/me 夥伴頁顯示進化條件提示、夥伴按 origin 分組;get_friends_board 加回傳 pet_affection。
  - ✅ **Phase 2b 心情/每日照顧 + 技能加成完成**(2026-06-16):夥伴心情(距上次照顧天數,😊→😢);每日陪伴 `pet_play` RPC **需當天先做 5 題才能陪伴**(互動綁做題)、+好感度、照顧 streak(每 7 天給金幣);夥伴技能依好感度解鎖(🍀80金幣+20%、⚡200 XP+10%、🛡️400 XP+5%),作答觸發器自動加成。E2E 驗證 NEED_STUDY 門檻、技能加成數值、每日一次皆正確。
  - ✅ **Phase 2c 探險/遠征完成**(2026-06-16):pet_expeditions 表 + start/claim/cancel_expedition RPC;**作答觸發器自動推進該科探險進度**(做題=探險燃料),達標可領 XP/金幣/食物/好感度;/me 夥伴頁有探險面板(選科目+3 種規模、進度條、領獎/召回)。E2E 驗證做題自動推進+領獎正確。
  - ✅ **自訂夥伴圖片完成**(2026-06-16):profiles.pet_image_url;`/me` 夥伴頁可上傳自己的圖當夥伴(pet='custom'),內建範例「皇小米」(web/public/partner/);個人卡/showcase/探險/Quiz 打氣都會顯示自訂圖,進化光環/好感度/技能照常。
  - 🔜 **Phase 1b 消耗道具/加成包**(XP 加倍卡、提示券…buff 表+觸發器/Quiz)。
- 🔜 **遊戲化擴充 Phase 3(使用者 6/16 第二批要求,分階段):夥伴 DB 化 + 格位經濟 + 管理者 CRUD + 交易**:
  - ✅ **Phase 3a 夥伴資料庫化完成**(2026-06-16):pet_defs 表(管理者可 CRUD、3 階段、每階段 emoji 或上傳圖)取代寫死的 PETS;進化 4 階改 3 階(幼年/成長期/完全體);新增共用 `PetView` 元件(emoji/圖片統一渲染),/me、好友、Quiz 全改 DB 驅動。seed 9 隻起始夥伴(經典4+寶可夢風5);皮克敏改由管理者上傳正確圖(避免版權)。
  - 🔜 **Phase 3b 夥伴格位經濟**:免費 1 隻、每多開 1 隻 2000 金幣、上限 5(user_pets 表 + unlock_pet RPC)。
  - ✅ **Phase 3c 管理者夥伴 CRUD 完成**(2026-06-16):`/admin/pets` + `/api/admin/pets`(requireStaff);可新增/編輯/刪除夥伴,每階段 emoji 或上傳圖片(pet-images bucket);入口在 /admin。
  - ✅ **傳說特效夥伴完成**(2026-06-16):pet_defs 加 is_legendary + bonus_xp/coins/affection(管理者於 /admin/pets 設定);新增 user_pets 表 + buy_pet RPC(夥伴可購買、免費=直接可用);**作答觸發器套用傳說加成**(XP%/金幣%/每答對好感度);Quiz 作答對傳說夥伴有光環/閃光特效;/me「選擇夥伴」自訂下方加「✨傳說夥伴」區(購買/裝備);皇小米、英語老師 seed 為 2000 元傳說夥伴。E2E:買扣 2000、ALREADY_OWNED、傳說 XP+10%(19→20)、+好感皆正確。
  - ✅ **Phase 3d 管理者交易所 moderation 完成**(2026-06-16):admin_get_market / admin_remove_listing RPC(staff-only,強制下架退回賣家);UI 在 /admin/shop 底部「玩家交易所」區。
  - ✅ **Phase 3e 進化圖鑑完成**(2026-06-16):/me 夥伴頁「📖 進化圖鑑」顯示當前夥伴 3 階段(幼年/成長期/完全體)外觀,未解鎖灰階+顯示條件,完全體/傳說有光環特效(PetView 加 forceStage)。
  - ✅ **加成統一 + 多項調整完成**(2026-06-16):
    - **加成單一來源**:移除寫死的好感度技能(原本 gamify PET_SKILLS + 觸發器各一份),全部改吃 pet_defs 每隻夥伴的 bonus_xp/coins/affection;新增 bonus_subjects(考科限定,空=全科)。觸發器/管理頁/個人頁讀同一份。
    - **管理頁加考科複選**(/admin/pets BonusFields);加成對任何夥伴生效,is_legendary 只決定華麗特效。
    - **非經典夥伴皆付費**:寶可夢 500;新增瑪莉歐×5、柯南×5(500,emoji 佔位,**待管理者於 /admin/pets 換上傳圖**)。
    - **移除自訂上傳夥伴**(pet=custom 玩家改回 cat;pet_image_url 欄位停用)。
    - **傳說進化圖鑑特效隨階段升級**。E2E:科目限定加成(數學+100%、國文 0)、舊技能已移除皆正確。
  - 🔜 **仍待做:Phase 3e 自創夥伴上架交易所**(自訂上傳已移除,此項待重新定義)、**1b 加成道具**。
  - 🔜 **Phase 3d 管理者交易所 CRUD**:可下架/刪除玩家 listing(moderation)。
  - 🔜 **Phase 3e 自創夥伴上架交易所 + 進化圖/特效展示**。
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

## 📋 進度日誌(每次里程碑往上加一行)

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
