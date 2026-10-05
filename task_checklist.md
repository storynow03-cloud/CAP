# 工作清單

> 規則見 CLAUDE.md「工作方式」:每完成一項就打勾,發現新任務就加進來;對話中斷時以這份檔案為準接續。

## ▶️ 新對話從這裡接續(2026-10-04 晚上交接)

**使用者要求:今天一定要用 Claude(不是 Gemini)把所有題目附圖看過一遍,確保題目絕對正確。Claude 是付費 MAX,額度很夠,放心開子代理。**
**考卷診斷今天不做,之後再說。**

### A. 圖片全面看圖檢查(進行中,最優先)
- 背景:文字檢查抓不到「圖檔在、但字型跑掉字母擠成一團」的壞圖(孩子回報 english-0813694-g3;抽查又發現
  math/751554e69a 相似三角形單元多張標籤糊掉)。可見題的題幹/選項/答案用到 **17,333 張圖**。
- 已備妥:`data/image-review/sheets/sheet-0001.png … sheet-1441.png`(每頁 12 張、3×4、黃色編號 #1~#12,小圖放大 2 倍)、
  `data/image-review/sheets/manifest.json`(頁 → [{n, p: 圖片路徑}])、檢查標準 `data/image-review/review-brief.md`。
  圖片清單(含每張圖被哪些題目使用)`data/image-screen-list.json`。產生工具 `scripts/make-contact-sheets.mjs`。
- [ ] **下一步**:用 Agent 工具開子代理(general-purpose),每個負責約 50 頁(約 29 個子代理,建議一次 8~10 個並行、背景執行)。
      每個子代理的提示:先 Read `data/image-review/review-brief.md`,再依序 Read 指定範圍的 sheet,
      結果 Write 到 `data/image-review/results/sheet-XXXX-YYYY.json`(格式見 brief)。
      - 2026-10-04 開工:第 1 批 10 個子代理已在背景開跑(sheet 0001~0500);完成後接第 2 批 0501~1000、第 3 批 1001~1441。
        中斷時以 results/ 內已有的 JSON 判斷哪些範圍做完。
      - 合併統計:`node scripts/merge-image-review.mjs` → data/image-review/flagged.json(圖→題號)。
        前 500 頁:標記 816 張(數學 650)、影響 925 題;數學幾何標籤字型跑掉最嚴重 → 全部看完後要決定「隱藏 vs 從原檔重轉圖」。
- [ ] 全部完成後:合併 results → 用 manifest 對回圖片路徑 → **Claude 親自逐張複核被標記的圖**(Read 原圖 web/public/<p>)
      → 確認壞的寫入 `data/image-screen-confirmed.json`(陣列,每筆 {p, why})。
- [ ] 請使用者執行 `node scripts/hide-qa-failures.mjs --apply`(會讀 confirmed 清單隱藏用到壞圖的題目,也會隱藏 32 題「圖片其實是 .html」的破圖題)。
- 參考:Gemini 篩過的前 112 張結果在 data/image-screen.json(使用者要求改用 Claude,可忽略或當對照)。

### A2. 數學/自然壞圖重繪(2026-10-04 新發現,取代「隱藏」)
- 根因:原始 Word 的向量圖(WMF/EMF)本身正常(字型是 Times New Roman/新細明體),是 **LibreOffice 把向量圖畫成 GIF 時字型/細線壞掉**
  (A→Λ、B→Z、負號消失)。用 Windows GDI+ 重畫同一張圖,標籤與負號都正確(已試做 1-1負數與數線 6 張對照確認)。
- 對應方法:LO 轉 docx → document.xml 依序取圖 → 與 lo-html 的 img 順序對齊(該檔 html 多一張開頭小圖,錯一位後 60 張長寬比全吻合)
  → 用長寬比驗證每一對;不吻合就不換。
- 輸出:**同檔名、同像素大小**(前端依原始像素顯示、DB 不用改),先放大 3 倍畫再縮小,避免細負號消失。
- **完成定義**:數學+自然所有 LO 向量圖重畫進暫存區 → 被標記的 2,120 張逐張新舊對照由 Claude 看過 → 備份原圖後覆蓋
  web/public/qimg → 請使用者同意 commit+push 部署 → 正式站抽查。重畫後仍壞的才進 confirmed 清單隱藏。
- 社會/國文/英文 webp(156 張標記)是另一條管線(內容雜湊檔名),之後再看能否同法處理,不行就隱藏。
- [x] 寫 scripts/rerender-metafiles.py(+ lib/render-metafile.ps1、lib/metafile-size.ps1)並在 5 個檔案驗證:
      137 張配對、只剩頁首小圖等 9 張對不上(保留原圖);對照頁 scripts/rerender-compare.py → 36 張被標記的圖重畫後全部清楚正確
- [x] 全量跑:1,039 檔、重畫 7,473 張(配對改為「長寬比 + 構圖相似度 ≥0.4」的序列對齊,修掉 LO 公式圖夾雜造成的錯位);
      被標記的數學/自然 2,131 張中 1,943 張已重畫;沒重畫到的 188 張(多為 LO 自己的公式物件)清單 data/rerender/flagged-not-rerendered.json
      相似度最低 40 張 Claude 親自看過全部正確(低分是因為舊圖壞太嚴重)
- [x] 子代理複核 data/rerender/review/(245 頁,10 個子代理全完成,結果 data/rerender/review-results/*.json):
      **wrong(配錯圖)0 張**;unreadable 約 29 張(多為原圖本來就太小或被截斷,新舊一樣);worse 4 張 = 虛線變實線。
      子代理說「a−b 變 a+b」的 cmp-0244 #1,Claude 親自看高解析重畫確認新圖(y=−4)才正確。
- [x] 虛線調查結論:原始向量圖(含 WMF 夾帶的 EMF、LO 單獨轉檔)畫筆**全是實線**;舊 GIF 的「虛線」是 LO 低解析畫細線掉像素的假象
      (同一張圖 7 支相同畫筆,舊圖卻有實線/虛線/點線)。新圖畫成實線才忠於原檔。
      管線已改:數學原檔是 zip 就直接讀原檔(不經 LO);WMF 有夾帶 EMF(WMFC)就改畫 EMF。全量重跑中。
- [x] 重跑完(7,372 張,被標記的 1,925 張已重畫):scan-dashed-pens 結果原圖虛線畫筆 0 張;最低相似度 30 張 Claude 親自看全部正確
      (還補回線段上劃線、表格負號、不等式解的粗線段)
- [x] 使用者執行 apply-rerender.py --apply:7,372 張已覆蓋、備份 7,372 張(國中會考-DB備份6-10-04-qimg-rerender);
      本機 next dev 載入確認尺寸不變、顯示正確;tsc 型別檢查通過
- [x] commit 6d4a12ac + push(使用者同意);正式站 3 張圖逐位元組與本機相同、登入頁 200
- [x] 沒修到的壞圖 398 張 Claude 逐張複核(scripts/confirm-sheets.py → data/image-review/confirm/,判定 confirm-decisions.jsonl;
      拼圖頁被縮小的改用原尺寸複查,救回 2 張)→ 確認壞圖 331 張寫入 data/image-screen-confirmed.json
      (數學 169、社會 90、自然 50、英文 21、國文 1);hide-qa-failures 試算:可見 85,642 題中要隱藏 411 題
- [ ] **使用者執行** node scripts/hide-qa-failures.mjs --apply(會自動備份、可 --restore)
- [ ] 之後可救回(不急):數學約 150 張是 LO 自己的小公式圖(√10、DE 線段、分數、聯立式)→ 可改成 HTML 文字(.sqrt/.ovl/.frac)換掉 img;
      約 20 張原圖太小的幾何圖 → 放大重畫 + img 加 width 屬性(先備份到 國中會考-DB備份\<日期>-qimg-rerender,可 --restore)
- [ ] (舊)**下一步(先修虛線再覆蓋)**:虛線變實線的根因 = LibreOffice 把 .doc 轉 .docx 時**重新輸出了 WMF/EMF**(畫筆全變實線)。
      重大發現:**數學 393 個 .doc 其實是 docx(zip)**,裡面就是原始 WMF/EMF → rerender-metafiles.py 的 docx_seq 應改成:
      原檔是 zip 就直接讀原檔(不經 LO);自然 646 個是真 .doc(OLE),用 scripts/lib/doc_blips.py(olefile 已安裝,尚未測過)取原圖。
      改完重跑 → 再看 cmp-0057 #4、cmp-0064 #10、cmp-0067 #7(虛線)與 low-sim 清單 → 才覆蓋 web/public/qimg(先備份)→ 請使用者同意 commit+push。
- [ ] 存疑待查原檔:cmp-0037 #1(x 列 1,1,3 疑少負號)、cmp-0144 #1 三視圖、cmp-0107 #5(A′ 撇號)、cmp-0059 #5、cmp-0192 #2、cmp-0194 #7
- [ ] 新舊對照逐張看 → 覆蓋 → 部署

### B. 使用者待執行
- [x] `node scripts/fix-reported-2026-10-04b.mjs --apply`(2026-10-04 使用者已執行並查證:4 題已換成表格、回報已結案)(english-0813694 題組:壞掉的表格圖換成重建的 HTML 表格 + 回報結案;
      第一次執行時資料庫查詢逾時沒改到任何資料,已改成直接列題號)
- [ ] `node scripts/hide-qa-failures.mjs --apply`(建議等 A 的 confirmed 清單做完再一起跑;現在跑會先隱藏 32 題破圖題)
- [ ] 同意後 commit + push(尚未 commit 的:兩種會考積分 CapScorePanel、第二層選單 Nav、回報自動結案、中文姓名登入、
      圖片檢查相關腳本、final-qa/hide-qa 新增「檔案不是圖片」檢查)

### C. 等使用者決定
- [ ] 寵物夥伴 5 個決定(提示來源、用技能的題目金幣、可用模式、每天次數、皮膚取得方式)— 見對話,規劃已提出
- [ ] 防刷題觸發器(第 5 份 SQL)上線後,用孩子新的作答紀錄驗證(<5 秒、答錯無金幣)

## ▶️ 2026-10-05 夜間:題庫再更新(使用者:照建議順序全部做完、不要問、遇到問題自己克服;明早看結果)

**完成定義**:每項都要「改資料前備份 + Claude 抽查證據」;能放回的題目必須通過 question-checks,且圖都看過/重畫過。
使用者已授權本輪需要的 commit + push(為了讓新圖上線後放回題目)。
- [x] 4. 數學公式:排除檔首頁首圖(21×21)後段落全部對上;omml.py 加弧/矩陣 → 8,561/8,561 全部對應;
      人工挑的 35 個與自動對應 100% 一致;抽查 96+30 個正確 → 再換 320 題、2,347 個公式圖(可見數學題剩 143 張非公式舊圖)
- [x] 1. 低解析圖 2,258 張:rerender-webp --scale-out 2 重畫 2,142 張;子代理複核 1,939 + Claude 抽看 203 → 排除 23 張
      (配錯 1、缺線 2、段首□□ 20);add-img-width 加 width 保持大小;commit 2f419e77 部署後 unhide-lowres 放回 1,207 題;
      data/lowres-images.json 移除已修好的(2,308→141,舊檔 lowres-images.before-2026-10-05.json)
- [x] 2. 檢查全過卻隱藏:英文/社會/國文 + 昨天 hide-qa 的 204 題,153 張沒看過的圖 Claude 逐張看過 → unhide-clean 放回 204 題
      (其餘數學 281 題由第 3 項處理)
- [x] 3. 數學缺字 381 題:rebuild-math-hidden(docx-question.mjs 直接讀原檔 EQ+OMML+圖)重建 269 題、放回 207 題;
      防護:圖片必須是原題的圖、斷點偵測、出處標記清除;eq-field 加弧與全等;抽查 30 題正確
- [x] 全庫檢查發現今晚放回的 25 題有 PUA 符號/佔位符/破圖(放回腳本少了 hide-qa 的額外規則)→ 已隱藏;
      新增 lib/visible-checks.mjs,所有放回腳本都加上;hide-qa 試算 0 題
- [x] 收尾:可見 85,231(10/4)→ 87,351(10/5 早)→ **88,905**;fetchAll 分頁排序修正

## ▶️ 救回 411 題隱藏題(2026-10-04 深夜,使用者休息中、要求今天處理完整個題庫)

- [x] 使用者執行 hide-qa-failures --apply:可見 85,642 → 85,231(隱藏 411 題,備份 2026-10-04-hide-qa/original-…12-19-21…json)
- [x] 選單改兩排(Nav.tsx flex-wrap、手機縮小間距)——本機驗證,**等一起推**
- [x] 社會/英文/國文壞圖:由 webp 雜湊反查 lo-html 來源(data/rerender/webp-origin.json,112/112)→ scripts/rerender-webp.py
      重畫 65 張,Claude 逐張看 64 張完全正確、1 張缺字排除(data/rerender/exclude.json)
- [x] 數學公式:原檔是 OMML → scripts/lib/omml.py 轉 HTML(.frac/.sqrt/.ovl/.brace、射線/直線箭頭疊字)
      scripts/omml-formulas.py 對應 6,179/8,561 個公式(data/rerender/formulas.json);Claude 在瀏覽器抽查 243 個全對
- [x] 第二輪配對(錨點之間只有一張長寬比差 3% 內的向量圖)+ .doc 直接取原始 BLIP(doc_blips.py)+ 忽略 LO 洋紅底色
      → 社會/英文/國文再救 36 張、自然/數學再救 28 張(全部 Claude 目視確認;舊圖空白的 5 張用題目文字核對點名)
- [x] 太小的幾何圖 9 張:2.5 倍重畫(同檔名、不改 DB,顯示變大約 330px)
- [x] 數學公式段落數量對不上的 36 張:Claude 從候選公式目視挑 35 張(data/rerender/formulas-manual.json)
- [x] 內嵌物件表格:render-ole-tables.mjs 加 --uses,data/rerender/ole-uses.json → 10 題轉成文字表格(9 題可放回),內容已核對
      (「以□□取代」是題目刻意的空格,不是缺字)
- [x] 🔴 新發現:Word EQ 公式的**上標遺失**(10⁶→106、√(25²−7²)→√252−72),在**可見題**裡數字是錯的。
      scripts/eq-sup-extract.py 從 docx 原檔抽出 1,327 個含上標的 EQ(含題號)→ scripts/fix-eq-superscripts.mjs
      只在同題號題目逐字找到舊 HTML 才換:445 題、856 處(抽樣 13 組全對)
- [x] 數學非選「答案混在題幹」:scripts/split-embedded-answers.mjs 拆成題目/答案/詳解;
      隱藏題的圖沒看過 → 只有圖全部「已重畫/已檢查/會換文字」才放回。預計放回 1,558 題(抽查 30 題拆分正確)
- [x] 2026-10-04 22:00~22:10 使用者授權後 Claude 執行(全部有備份,在 國中會考-DB備份6-10-04-*):
      1. apply-rerender --map map-webp.json:覆蓋 126 張新圖(本機,尚未上線)
      2. apply-formulas:數學 694 題、6,214 個公式圖換成文字(重跑試算 0 題 = 已全部生效)
      3. fix-eq-superscripts:數學 445 題、856 處補回上標(重跑 0 處);已稽核沒有「無結構純文字」的替換
      4. split-embedded-answers 五科:放回 數學 1,558、英文 105、社會 77、自然 43、國文 15 = 1,798 題
         (已確認放回的題目沒有用到「本機已換、尚未上線」的新圖)
      5. render-ole-tables --uses:3 題換成文字表格(social-8210059 組因圖已重畫、改由 unhide-fixed 放回)
- [x] 自然科上標:SaveAs2 在本機會卡住 → 改寫 scripts/export-eq-sup-word.ps1(Word 直接讀欄位與上標,641 檔 2 分鐘)
      結果只對到 1~2 題且 Word 回報的上標範圍不準(連 EQ 代碼都標成上標)→ **不套用**;fix-eq-superscripts 加防護
- [x] 6. commit 848e622e + push(使用者同意 2026-10-05),正式站新圖逐位元組確認已上線
- [x] 放回後全庫檢查:math-0943810 的 Symbol 空白(U+F020)換成一般空白;social-1054341 表格「曝光程度」是無法辨識的符號(U+F0EA,疑為星等)→ 重新隱藏(備份 2026-10-05-pua-fix)。hide-qa 試算 0 題
- [x] 7. unhide-fixed --apply:放回 320 題(線上檢查 121 張 0 張未部署);confirmed 清單移除已修好的 245 張,剩 88 題仍隱藏
- [ ] 仍會留隱藏約 84 題(不易救):自然非表格內嵌物件 ~30 張、數學公式找不到原檔對應 24 張、
      社會原檔就是模糊點陣圖 11 張、零星空白/截斷圖。清單 data/rerender/still-bad.json

## 2026-10-04 晚上

- [x] 會考積分改為兩種:📘 練習會考積分(不含真題)、🎯 真題會考積分(來源含「國中教育會考」);每科 ≥ 20 題才給等級、不足不計分
      → 共用元件 CapScorePanel(診斷頁、管理後台)、排行榜兩個積分榜改成這兩種(練習積點移除)
- [x] 第二層選單:每一類(學習/診斷/挑戰/獎勵/我的+管理)在主選單下方列出同類功能,可直接互相切換;L2 只看到能用的
- [x] 題目管理儲存時,該題待處理回報自動結案(放回=已修正、隱藏=已隱藏)
- [x] 孩子新回報 english-0813694-g3(表格圖壞掉)→ 依圖上數字 + 原檔詳解重建 HTML 表格:`scripts/fix-reported-2026-10-04b.mjs`
- [x] 使用者執行 `node scripts/fix-reported-2026-10-04b.mjs --apply`(已查證生效;第一次執行時資料庫查詢逾時、沒改到任何資料;已改成直接列題號,請重跑)
- [x] 中文姓名登入:lib/login-name.ts(姓名 → 固定換算的 email `n.<16進位>@cap.local`);登入頁、帳號管理(建立/改登入名稱)支援;
      已在正式 Supabase 建立+刪除測試帳號驗證可行(profile 無殘留)
- [ ] **圖片全面 AI 篩檢**(`scripts/screen-images.mjs`,結果 data/image-screen.json):可見題用到 17,333 張圖;
      樣本測試 3 張已知壞圖全抓到,另抓到 math/751554e69a(相似三角形的應用)多張標籤糊掉的圖,人工看過確認是真的壞
      → 免費額度每天約 500 次,背景已開始跑;等使用者決定是否改用付費金鑰加速
- [ ] 篩檢完:Claude 逐張複核被標記的圖 → 備妥隱藏/修正腳本給使用者執行
- [ ] 使用者同意後 commit + push
- [ ] 寵物夥伴:等使用者回覆 5 個決定(提示來源、用技能的題目金幣、可用模式、每天次數、皮膚取得方式)

## 2026-10-04 傍晚

- [x] 檢查 4 支題庫腳本:390 / 617 / 1,158 / 136 筆全部生效;重跑最終檢查 → 可見 85,674 題,未過嚴格檢查 0 題、缺圖 0
- [x] 查證 **SQL 第 3、4 份仍未生效**(boss_progress、reward_grants、get_leaderboard 都不存在、現金券仍 500)→ 排行榜看不到的原因
- [x] 每日兌換上限 50 元(鎖兌換不鎖賺金幣;家長送的不算;100/500 元券下架)→ 併入第 4 份 SQL;商城顯示「今天還能換 X 元」
- [x] 防刷題(第 5 份 SQL `20261004040000_anti_spam.sql`):答錯 0 金幣、<5 秒不給獎勵也不算任務、同題同日只給一次金幣;作答畫面提示
- [x] 兩個積分榜(/api/leaderboard,不依賴 SQL):🎯 會考積分(預估,滿分 35)、💪 練習積點(近 30 天認真答對難度加總)
- [x] 管理後台學生詳細加「預估會考積分 X/35」
- [x] SQL 情境測試 57 項全過
- [x] 使用者執行第 3、4、5 份 SQL → 查證:boss_progress、reward_grants、get_leaderboard 都在,現金券 5,000/上限 50(第 5 份觸發器無法從外部讀,待孩子作答後以紀錄確認)
- [x] 模組重新分類(使用者同意):導覽列 首頁/📚學習/📊診斷/🎮挑戰/🎁獎勵/🙂我的;新增 /insight 診斷頁(自己的預估會考積分+練習積點);
      學習頁移出考卷診斷、加非選題入口;獎勵頁連到夥伴;管理後台分「看孩子/管題庫/管獎勵/系統」
- [x] 計算紙:題目下方加方格計算區(約半個螢幕高),與題目同一張畫布(使用者 iPad 截圖反映空間不夠)
- [x] commit + push 24d8320a(兩個積分榜、每日上限顯示、防刷提示、積分卡、新選單、計算區),正式站確認已上線
- [ ] 防刷題觸發器上線後,用孩子的新作答紀錄驗證(<5 秒無金幣、答錯無金幣)

## 2026-10-04 白天(使用者要求:commit/push、方案 B 試算、最終題庫品質檢查、L2 家長)

- [x] commit + push e5f16b53(夜間功能);確認正式站已換新版
- [x] 檢查 SQL:第 1、2 份已生效;**第 3 份(魔王/排行榜/金幣鎖)沒有生效** → 請使用者重跑
- [x] 方案 B 在 100:1 下的時間試算(docs/10 第 7 節)
- [x] L2 家長(guardian):只能看學習狀況 + 發放獎勵(/admin/rewards);migration 20261004030000(含現金券改 100:1)
- [x] SQL 情境測試擴充到 49 項全過(含 L2 權限、100:1 價格)
- [x] 最終品質檢查(scripts/final-qa.mjs、qa-vs-source.mjs):缺圖 0、答案字母與原檔 0 不一致、選項順序一致;
      國文/英文/社會原檔也匯出檢查:國文 0 個算式、英文填空空格已正確、社會只有 1 題(已隱藏)
- [x] 發現並備妥修正(待使用者執行):非選答案殘留 [[IMG]] 390 題、知識點欄位吃掉題目開頭 617 題、
      選項尾巴出處標記 1,158 題、未過嚴格檢查的可見題隱藏;修掉「說有圖沒圖」11 題誤判
- [ ] **使用者依序執行**:SQL 第 3、4 份 → `fix-answer-placeholders` → `fix-misparsed-kc` → `clean-option-tags` → `hide-qa-failures`(各加 --apply)
- [ ] 已知限制:部分 LibreOffice 轉出的幾何圖字母標籤糊掉(例 math-1050540 答案圖),無法自動偵測,靠孩子回報

## 待使用者處理(2026-10-04 早上)

- [ ] **① SQL Editor(專案 CAP)依序執行 3 份**:`20261004000000_audit_log.sql` → `20261004010000_vouchers_duel_wager.sql` → `20261004020000_boss_tiers_leaderboard_lock.sql`
- [ ] **② 執行完立刻 commit + push**(新程式上線;中間空窗舊版扭蛋不扣錢、舊版 PK 交不了卷)
- [ ] ③ 選金幣經濟方案 A/B/C(docs/10;建議現金券開放前先決定,否則「亂按刷題」賺最多)
- [ ] ④ 題目回報 4 題:`node scripts/fix-reported-2026-10-04.mjs --apply`
- [ ] ⑤ 商城管理裡決定要啟用哪些特權券


- [ ] **換金鑰**:使用者決定等整站開發完再一起換(2026-10-03)
- [x] 到 Supabase SQL Editor(專案 **CAP**)執行權限規則加速 migration(2026-10-03 使用者已執行,驗證查詢 0 列)
- [ ] 建議關閉 Supabase 公開註冊;帳號密碼都是 111111,正式長期使用前要換
- [x] commit/push:本輪的腳本與文件已 commit 並 push(2026-10-03)

## 之後的題庫工作

- [ ] 約 1,280 題的圖是內嵌物件但不是純表格(文字框、圖片組合、圖表)→ 研究其他轉換方式
- [ ] 388 張 LibreOffice 匯出失敗的圖(img src 指回 html 本身)→ 該題仍隱藏
- [ ] 數學隱藏題約 3,500 題(算式遺失/掉字)→ 需要從原始 .doc 重轉算式
- [ ] 拆不了的題組(自然 427、社會 273、數學 94 組:答案格式含非選擇題小題等)
- [ ] 11 道題組小題因用到低解析圖被藏回(social-1054510-g1 等),待表格轉換後重新評估
