// 題組拆題(2026-09-30):把被合併成一題的「文章 + (1)(2)(3) 小題」拆回一題一題。
//
// 問題:解析器用選項標記 (A)(B)(C)(D) 切選項,題組的第 2、3 小題題幹就黏在上一小題最後一個選項尾巴:
//   題幹:「附圖為臺灣某處海岸地區的地圖。請問：\n(　)(1)這張地圖上的比例尺是用下列何種表示方式來呈現？」
//   選項:["圖示法", …, "實物顯示法\n(　)(2)若此圖要改用…", "涵蓋地表範圍變大", …]
//   答案:「(1)A　(2)B」→ 不是單一字母 → 整組被隱藏。
// 拆法:找小題標記「(　)(2)」「（　）２」「（　）2.」,切出文章、各小題題幹與各自的選項。
// 只有「小題數 = 答案數、每小題選項數 3~5 且一致、答案落在選項範圍內」全部成立才拆,否則不動。
// 每個小題成為新題:id = 原 id + "-g" + 小題號,題目 = 文章 + 小題題幹;原題組維持隱藏。
// 小題通過 lib/question-checks.mjs 嚴格檢查才設為可見,其餘先建但隱藏。
//
// 用法:node scripts/split-groups.mjs [--dump <檔>]  乾跑
//       node scripts/split-groups.mjs --apply           新增小題(備份新增的 id,可 --undo 刪除)
//       node scripts/split-groups.mjs --undo <備份檔>
import fs from "node:fs";
import { URL_BASE, H, fetchAll, runPool, BACKUP_DIR } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";
import { visibleProblems } from "./lib/visible-checks.mjs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const ALLOW_FGH = process.argv.includes("--allow-fgh");
const skippedFgh = new Set();
const undoIdx = process.argv.indexOf("--undo");
if (undoIdx !== -1) {
  const ids = JSON.parse(fs.readFileSync(process.argv[undoIdx + 1], "utf8"));
  // 小題可能已經有作答紀錄(attempts 參照 questions),刪不掉就改成隱藏
  let del = 0, hid = 0;
  await runPool(ids, async (id) => {
    const r = await fetch(`${URL_BASE}/rest/v1/questions?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: H });
    if (r.ok) { del++; return; }
    await fetch(`${URL_BASE}/rest/v1/questions?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: H, body: JSON.stringify({ needs_review: true }) });
    hid++;
  });
  console.log(`✅ 已刪除 ${del} 題,${hid} 題因已有作答紀錄改為隱藏`);
  process.exit(0);
}

const toN = (s) => {
  const c = String(s).codePointAt(0);
  if (c >= 0x2474 && c <= 0x2487) return c - 0x2473; // ⑴~⒇
  if (c >= 0x2460 && c <= 0x2473) return c - 0x245f; // ①~⑳
  return Number(String(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
};
const LETTER = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, Ａ: 0, Ｂ: 1, Ｃ: 2, Ｄ: 3, Ｅ: 4, Ｆ: 5, Ｇ: 6, Ｈ: 7 };
const DIG = "[0-9０-９]{1,2}";
// 小題標記:作答括號 +「(2)」或「２」或「2.」
const MARKER = new RegExp(String.raw`[（(][\s　]*[）)]\s*(?:[（(]\s*(${DIG})\s*[）)]|(${DIG})(?![0-9０-９])\s*[.．]?)\s*`, "g");

// 答案尾巴黏著的原檔分類標題(「(3)A簡答」「A配合題」「(3)A證明」)(2026-10-06 加 證明/應用/作圖 與「…題」結尾)
const LABEL_TAIL = /(?:簡答|問答|題組|選詞|選擇|計算|配合|填充|是非|閱讀測驗|非選擇?|證明|應用|作圖|綜合|填空|克漏字)題?\s*[0-9０-９]*[.．]?\s*$/;

/** 解析「(1)C　(2)B」「1. D　2. C」「１C　２A」→ 依小題號排好的答案字母;格式不對回 null */
function parseAnswers(t) {
  if (!t) return null;
  // 答案尾巴黏著原檔下一段的分類標題(「(3)A簡答」「(2)C問答」「…題組」)→ 先去掉(2026-10-05)
  const s = String(t).trim().replace(LABEL_TAIL, "").trim();
  const re = new RegExp(String.raw`[（(]?\s*(${DIG})\s*[）).．]?\s*([A-HＡ-Ｈ])(?![A-Za-z])`, "g"); // F~H 只有配合題用得到(一般題組會被「答案超出選項」擋下)
  const found = [...s.matchAll(re)];
  if (found.length < 2) return null;
  // 整串除了這些「號碼+字母」之外只能剩空白,避免把「(1)A (2)從氣候…」這種混合非選的也當成選擇題組
  if (s.replace(re, "").replace(/[\s　、,，;；]/g, "")) return null;
  const ans = found.map((m) => ({ n: toN(m[1]), a: LETTER[m[2]] }));
  if (ans.some((x, i) => x.n !== i + 1)) return null;
  return ans.map((x) => x.a);
}

// 寬鬆標記(2026-10-06,嚴格標記找不到時才用):作答括號可省略(但要在行首或句末標點後)、括號內是「ˉ」、
// 小題號寫成 ⑴ / ①。拆完仍要通過「小題數 = 答案數、選項數一致」等條件,誤判的會被擋下
const LOOSE = new RegExp(String.raw`(?:[（(][\s　ˉ]*[）)]\s*|(?<=(?:^|[\n。？?！!」』：:；;])[\s　]*))(?:[（(]\s*(${DIG})\s*[）)]|(${DIG})(?![0-9０-９])\s*[.．、]?|([⑴-⒇①-⑳]))[\s　]*`, "g");

/** 找出字串中「編號為 k」的小題標記(取最後一個) */
function findMarker(s, k, re = MARKER) {
  let hit = null;
  for (const m of String(s).matchAll(re)) if (toN(m[1] ?? m[2] ?? m[3]) === k) hit = m;
  return hit;
}

const tidyOpt = (o) => o.replace(/\s+\(\s[^()（）]*$/, "").replace(/[\s　]+$/, "").trim(); // 去掉英文字彙註解殘段「( learn 學習」

/** 詳解拆成各小題:「(1)…(2)…」或「１（D）…２（B）…」或「1. …2. …」;拆不乾淨就每小題都給完整詳解 */
function splitExplanation(ex, n) {
  if (!ex) return Array(n).fill(null);
  const s = String(ex);
  const pos = [];
  let from = 0;
  for (let k = 1; k <= n; k++) {
    // 用 lookbehind:前一句的句號/括號不要被切進這一小題的詳解(否則會變成「。(3)紅色物體…」)
    const re = new RegExp(String.raw`(?<=^|[\s　。）)])(?:[（(]\s*${k}\s*[）)]|[${k}${String.fromCharCode(0xff10 + k)}](?![0-9０-９])\s*[.．]?)`, "g");
    re.lastIndex = from;
    const m = re.exec(s);
    if (!m) return Array(n).fill(s);
    pos.push(m.index);
    from = m.index + m[0].length;
  }
  if (pos[0] > 3) return Array(n).fill(s);
  return pos.map((p, i) => s.slice(p, pos[i + 1] ?? s.length).trim());
}

/** 小題詳解清理(2026-10-06):去掉尾巴的分類標題/頁碼殘留(「…b＝55 計算」「…6.3。 3」);
 *  只剩小題號或算式遺失(「(2)(分)」「故所求＝ ⇒」)→ 不給詳解,免得孩子看到殘缺的說明 */
function tidyExplanation(ex) {
  if (!ex) return null;
  let s = String(ex).trim()
    .replace(/\s+(?:簡答|問答|題組|選擇|計算|配合|填充|是非|非選擇?題?)\s*$/, "")
    .replace(/(?<=[。．.)）])\s+[0-9０-９]{1,2}\s*$/, "").trim();
  if (/^[（(]\s*[0-9０-９]{1,2}\s*[）)]\s*(?:[（(][^()（）]{0,4}[）)])?\s*$/.test(s)) return null;
  if (/[＝=]\s*(?:⇒|$)/.test(s)) return null;
  return s || null;
}

const makeSub = (q, i, question, options, answer, explanation0, explanation = tidyExplanation(explanation0)) => ({
  id: `${q.id}-g${i + 1}`,
  subject: q.subject, volume: q.volume, topic: q.topic, subtopic: q.subtopic, difficulty: q.difficulty,
  type: "single_choice", question, options, answer, answer_text: null, explanation,
  source: q.source, curriculum_code: q.curriculum_code, knowledge_code: q.knowledge_code,
  tags: [...(q.tags ?? []), "題組"],
});

const IMG = /<img[^>]*>/g;
const mentionsFig = (t) => /圖|表格|[下上附此該本左右甲乙丙丁]表|表[中內裡上][的所]?|統計表|[如見依由據]表/.test(String(t ?? "").replace(/<[^>]+>/g, ""));
/** 附圖放錯小題(2026-10-06):第 1 小題題幹尾巴的圖,其實是第 2 小題「附圖中的何處」要用的。
 *  有小題提到圖/表、自己卻沒有圖 → 把「題幹沒提到圖的小題」題幹裡的圖複製過去(stems、extra 就地修改) */
function moveOrphanFigures(stems, extra) {
  const own = (i) => `${stems[i]}${extra[i]}`;
  const need = stems.map((_, i) => i).filter((i) => mentionsFig(stems[i]) && !/<img/.test(own(i)));
  if (!need.length) return;
  const orphans = [];
  stems.forEach((s, j) => {
    if (mentionsFig(s) || !/<img/.test(s) || !s.replace(IMG, "").trim()) return;
    orphans.push(...s.match(IMG)); // 複製不移除:原小題也可能用到這張圖(多一張無害)
  });
  if (orphans.length) for (const i of need) extra[i] += `\n${orphans.join("\n")}`;
}

function splitWith(q, answers, re) {
  const n = answers.length;
  const m1 = findMarker(q.question, 1, re);
  if (!m1) return { fail: "找不到第 1 小題" };
  const passage = q.question.slice(0, m1.index).trim();
  const stems = [q.question.slice(m1.index + m1[0].length).trim()];
  const groups = [[]];
  for (const o of q.options) {
    const k = groups.length + 1;
    const mk = k <= n ? findMarker(o, k, re) : null;
    if (mk) {
      groups[groups.length - 1].push(o.slice(0, mk.index));
      stems.push(o.slice(mk.index + mk[0].length).trim());
      groups.push([]);
    } else groups[groups.length - 1].push(o);
  }
  if (groups.length !== n) return { fail: `小題數 ${groups.length}≠答案數 ${n}` };
  const size = groups[0].length;
  if (size < 3 || size > 5 || groups.some((g) => g.length !== size)) return { fail: "選項數不一致" };
  if (answers.some((a) => a >= size)) return { fail: "答案超出選項" };
  const exps = splitExplanation(q.explanation, n);
  // 小題之間的附圖會黏在上一小題最後一個選項尾巴(「丁\n<img>」)。依題幹有沒有提到圖/表決定給哪一小題;
  // 兩邊都提到或都沒提到 → 無法判斷,兩小題都放(多一張圖無害,少一張圖題目就錯)(2026-10-06)
  const optsAll = groups.map((g) => g.map(tidyOpt));
  const extra = Array(n).fill("");
  const refFig = mentionsFig;
  optsAll.forEach((opts, i) => {
    const last = opts.length - 1;
    const ti = opts[last].match(/^([\s\S]*?\S)\s*\n\s*((?:<img[^>]*>\s*)+)$/);
    if (!ti || /<img/.test(ti[1])) return;
    opts[last] = ti[1];
    const cur = refFig(stems[i]), next = i + 1 < n && refFig(stems[i + 1]);
    const to = cur && !next ? [i] : !cur && next ? [i + 1] : [i, i + 1].filter((k) => k < n);
    for (const k of to) extra[k] += `\n${ti[2].trim()}`;
  });
  moveOrphanFigures(stems, extra);
  return {
    subs: optsAll.map((opts, i) => {
      // 小題最後一個選項常帶著分隔用的「。」,其他選項沒有 → 拿掉
      const last = opts.length - 1;
      if (/。$/.test(opts[last]) && !opts.slice(0, last).some((o) => /。$/.test(o))) opts[last] = opts[last].slice(0, -1);
      // 克漏字的小題沒有題幹(文章裡就是第 N 格空格),補一句說明,孩子才知道要看哪一格
      const stem = stems[i].replace(/\s+\(\s[^()（）]*$/, "").trim() || `請選出最適合填入文中第（${i + 1}）格的答案。`;
      return makeSub(q, i, `${passage}\n\n（第 ${i + 1} 小題）${stem}${extra[i]}`.trim(), opts, answers[i], exps[i]);
    }),
  };
}

/** 配合題(2026-10-06):選項是共用的參考選項,各小題全部黏在最後一個選項尾巴
 *  「出爾反爾\n（　）１做人要有主見…\n（　）２哥哥…」→ 每小題 = 說明 + 該小題文字,選項 = 同一組參考選項。
 *  小題在文章中間(「…：（１）　　好學不倦…（２）　　有口才…」)時,每小題都附完整短文,問第 k 格。 */
function splitPool(q, answers) {
  const n = answers.length;
  const opts = q.options;
  const last = opts.at(-1);
  const nl = last.indexOf("\n");
  if (nl < 0) return { fail: "配合題:沒有小題" };
  if (opts.slice(0, -1).some((o) => [...String(o).matchAll(LOOSE)].length)) return { fail: "配合題:其他選項有標記" };
  const tail = last.slice(nl + 1);
  const marks = [...tail.matchAll(LOOSE)];
  if (marks.length !== n || marks.some((m, i) => toN(m[1] ?? m[2] ?? m[3]) !== i + 1)) return { fail: "配合題:小題號不連續" };
  // 最後一個參考選項後面常接著作答說明(「中國。請依照下列題目敘述的方位，選出…」)→ 說明移到題目
  let lastOpt = last.slice(0, nl), note = "";
  const dot = lastOpt.search(/[。，,][\s　]*請/);
  if (dot >= 0) { note = lastOpt.slice(dot + 1).trim(); lastOpt = lastOpt.slice(0, dot).replace(/這[一二三四五兩幾]+[條個種項]$/, ""); }
  // 社會的參考選項是一句話切出來的(「地形、」「緯度、」「季風。」)→ 去掉尾端標點
  let pool = [...opts.slice(0, -1), lastOpt].map((o) => tidyOpt(o).replace(/[、，,；;。]+$/, ""));
  // 第一個參考選項黏在說明句尾巴(「…填入正確代號。（Ａ）春」)→ 移回選項
  let qText = q.question;
  const a0 = qText.match(/[（(]\s*[AＡ]\s*[）)]\s*([^\s（()）]+)\s*$/);
  if (a0) { pool = [a0[1], ...pool]; qText = qText.slice(0, a0.index); }
  // 原題 6 個以上參考選項時,(F)(G) 會黏在 (E) 裡(「鬼針草　（Ｆ）飛魚」)→ 依字母拆開;字母必須剛好接續,否則不拆
  const unglued = [];
  for (const o of pool) {
    const seg = o.split(/\s*[（(]\s*([A-HＡ-Ｈ])\s*[）)]\s*/);
    unglued.push(seg[0]);
    for (let j = 1; j < seg.length; j += 2) {
      if (LETTER[seg[j]] !== unglued.length) return { fail: "配合題:選項黏在一起" };
      unglued.push(seg[j + 1]);
    }
  }
  pool = unglued.map((o) => tidyOpt(o).replace(/[、，,；;。]+$/, ""));
  if (pool.length < 3 || pool.length > 8 || pool.some((o) => !o)) return { fail: "配合題:選項數" };
  if (pool.some((o) => /[（(]\s*[A-ZＡ-Ｚ]\s*[）)]/.test(o))) return { fail: "配合題:選項黏在一起" };
  if (answers.some((a) => a >= pool.length)) return { fail: "答案超出選項" };
  // 說明句沒結束(「…鄰國眾多，包含」)→ 參考選項本來就是這句話的一部分,接回去再接作答說明
  const qs = qText.trim();
  const intro = note && !/[。？?！!）)」]$/.test(qs) ? `${qs}${pool.join("、")}。${note}` : [qs, note].filter(Boolean).join("");
  const exps = splitExplanation(q.explanation, n);
  // 每個標記都在行首 → 一行一小題;否則是短文填空
  const lineItems = marks.every((m) => /(^|\n)[\s　]*$/.test(tail.slice(0, m.index)));
  return {
    subs: marks.map((m, i) => {
      const question = lineItems
        ? `${intro}\n\n（第 ${i + 1} 小題）${tail.slice(m.index + m[0].length, marks[i + 1]?.index ?? tail.length).trim()}`
        : `${intro}\n${tail.trim()}\n\n（第 ${i + 1} 小題）請選出最適合填入文中第（${i + 1}）格的答案。`;
      return makeSub(q, i, question, pool, answers[i], exps[i]);
    }),
  };
}

/** 選擇+非選混合題組的答案(2026-10-06):「(1)B　(2)因位於西風背風側…　(3)密西西比河」
 *  → [{ k: "choice", a: 1 }, { k: "text", t: "因位於西風背風側…" }, …];至少要有一個選擇、一個非選,否則回 null */
function parseMixedAnswers(t0) {
  const t = String(t0 ?? "").replace(/(?:詳解|解析)\s*[:：][\s\S]*$/, "").trim().replace(LABEL_TAIL, "").trim();
  if (!t) return null;
  const pos = [];
  let from = 0;
  for (let k = 1; k <= 20; k++) {
    const K = `(?:${k}|${String.fromCharCode(0xff10 + k)})`;
    const re = new RegExp(String.raw`[（(]\s*${K}\s*[）)]|(?<![0-9０-９.．])${K}\s*[.．、](?![0-9０-９])|(?<![0-9０-９])${K}(?=\s*[A-EＡ-Ｅ](?![A-Za-z]))`, "g");
    re.lastIndex = from;
    const m = re.exec(t);
    if (!m) break;
    pos.push([m.index, m.index + m[0].length]);
    from = m.index + m[0].length;
  }
  if (pos.length < 2 || t.slice(0, pos[0][0]).trim()) return null;
  const parts = pos.map(([, e], i) => t.slice(e, pos[i + 1]?.[0] ?? t.length).trim().replace(/[\s　;；,，、]+$/, ""));
  if (parts.some((p) => !p)) return null;
  const res = parts.map((p) => {
    const m = p.match(/^[（(]?\s*([A-EＡ-Ｅ])\s*[）)]?\s*[。.]?$/);
    return m ? { k: "choice", a: LETTER[m[1]] } : { k: "text", t: p };
  });
  if (!res.some((r) => r.k === "choice") || !res.some((r) => r.k === "text")) return null;
  // 「Ｆ」「Ｇ」(選項超過 E)或複選「BC」「Bˇ、Cˇ」不是非選答案 → 不當混合題組拆(選項會被丟掉)
  if (res.some((r) => r.k === "text" && /^[A-HＡ-Ｈ\s、,，ˇ()（）]+$/.test(r.t))) return null;
  return res;
}

/** 混合題組拆題:題目 + 選項攤成一串,依序找小題標記 1…n。
 *  選擇小題 = 標記後到該段結尾是題幹、接下來的完整選項(到下一個標記前)是選項;
 *  非選小題 = 標記後到下一個標記前的文字(必須在同一段裡,不能吃到選項)→ 建成 non_choice、答案放 answer_text */
function splitMixed(q, parts, re) {
  const n = parts.length;
  const items = [q.question, ...(q.options ?? [])];
  const marks = []; // [item, start, end]
  let ci = 0, cp = 0;
  for (let k = 1; k <= n; k++) {
    let hit = null;
    for (let i = ci; i < items.length && !hit; i++) {
      let ms = [...String(items[i]).matchAll(re)].filter((m) => toN(m[1] ?? m[2] ?? m[3]) === k && (i > ci || m.index >= cp));
      // 有括號的「(2)」優先於裸數字「2.」:小題內的清單「1.…2.…」不能被當成小題標記
      const paren = ms.filter((m) => m[1] || m[3]);
      if (paren.length) ms = paren;
      if (ms.length) hit = [i, ms.at(-1).index, ms.at(-1).index + ms.at(-1)[0].length];
    }
    if (!hit) return { fail: `混合:找不到第 ${k} 小題` };
    marks.push(hit);
    [ci, cp] = [hit[0], hit[2]];
  }
  if (marks[0][0] !== 0) return { fail: "混合:第 1 小題不在題幹" };
  const passage = items[0].slice(0, marks[0][1]).trim();
  const stems = [], optsAll = [];
  for (let k = 0; k < n; k++) {
    const [i, , e] = marks[k];
    const nx = marks[k + 1]; // 下一個標記;沒有 = 到最後
    if (parts[k].k === "text") {
      if (nx ? nx[0] !== i : i !== items.length - 1) return { fail: "混合:非選小題後面接著選項" };
      stems.push(items[i].slice(e, nx ? nx[1] : undefined).trim());
      optsAll.push(null);
    } else {
      if (nx && nx[0] === i) return { fail: "混合:選擇小題沒有選項" };
      stems.push(items[i].slice(e).trim());
      const opts = items.slice(i + 1, nx ? nx[0] : items.length);
      if (nx && items[nx[0]].slice(0, nx[1]).trim()) opts.push(items[nx[0]].slice(0, nx[1]));
      optsAll.push(opts.map(tidyOpt));
    }
  }
  for (let k = 0; k < n; k++) {
    const o = optsAll[k];
    if (!o) continue;
    if (o.length < 3 || o.length > 5 || o.some((x) => !x)) return { fail: "混合:選項數" };
    if (o.some((x) => /\n\s*[（(]\s*[0-9０-９]{1,2}\s*[）)]/.test(x))) return { fail: "混合:選項夾著小題標記" };
    if (parts[k].a >= o.length) return { fail: "答案超出選項" };
  }
  // 附圖黏在選擇小題最後一個選項尾巴 → 依題幹提到圖/表決定給哪一小題(與 splitWith 相同規則)
  const extra = Array(n).fill("");
  optsAll.forEach((opts, i) => {
    if (!opts) return;
    const last = opts.length - 1;
    const ti = opts[last].match(/^([\s\S]*?\S)\s*\n\s*((?:<img[^>]*>\s*)+)$/);
    if (!ti || /<img/.test(ti[1])) return;
    opts[last] = ti[1];
    const cur = mentionsFig(stems[i]), next = i + 1 < n && mentionsFig(stems[i + 1]);
    const to = cur && !next ? [i] : !cur && next ? [i + 1] : [i, i + 1].filter((k) => k < n);
    for (const k of to) extra[k] += `\n${ti[2].trim()}`;
  });
  moveOrphanFigures(stems, extra);
  const exps = splitExplanation(q.explanation, n);
  return {
    subs: stems.map((stem, i) => {
      const question = `${passage}\n\n（第 ${i + 1} 小題）${stem}${extra[i]}`.trim();
      if (parts[i].k === "text")
        return { ...makeSub(q, i, question, null, null, exps[i]), type: "non_choice", answer_text: parts[i].t };
      const opts = optsAll[i];
      const last = opts.length - 1;
      if (/。$/.test(opts[last]) && !opts.slice(0, last).some((o) => /。$/.test(o))) opts[last] = opts[last].slice(0, -1);
      return makeSub(q, i, question, opts, parts[i].a, exps[i]);
    }),
  };
}

function split(q0) {
  let q = q0, answers = parseAnswers(q.answer_text);
  if (!answers) {
    // 答案欄後面接著詳解(「(1)D　(2)A 詳解：(1)烤箱…」)或每個答案帶句號(「(1)D　(2)D。」)(2026-10-06)
    const m = String(q.answer_text ?? "").match(/^([\s\S]*?)\s*(?:詳解|解析)\s*[:：]\s*([\s\S]*)$/);
    const ansPart = (m ? m[1] : String(q.answer_text ?? "")).replace(/(?<=[A-EＡ-Ｅ])\s*[。.]/g, " ");
    answers = parseAnswers(ansPart);
    if (answers) q = { ...q, explanation: q.explanation || (m ? m[2].trim() : null) || null };
  }
  if (!answers && q.options?.length) {
    // 選擇+非選混合(2026-10-06):選擇小題 → 單選、非選小題 → non_choice(孩子用自評作答)
    const parts = parseMixedAnswers(q.answer_text);
    if (parts) {
      const qq = { ...q, explanation: q.explanation || (String(q.answer_text).match(/(?:詳解|解析)\s*[:：]\s*([\s\S]*)$/)?.[1]?.trim() ?? null) };
      const r1 = splitMixed(qq, parts, MARKER);
      if (!r1.fail) return { ...r1, mode: "混合" };
      const r2 = splitMixed(qq, parts, LOOSE);
      if (!r2.fail) return { ...r2, mode: "混合" };
      return r2;
    }
  }
  if (!answers || !q.options?.length) return { fail: "答案格式" };
  const r = splitWith(q, answers, MARKER);
  if (!r.fail) return r;
  // 嚴格標記拆不了才試寬鬆標記與配合題(已拆好的題組結果不變)
  const r2 = splitWith(q, answers, LOOSE);
  if (!r2.fail) return { ...r2, mode: "寬鬆標記" };
  const r3 = splitPool(q, answers);
  if (!r3.fail) return { ...r3, mode: "配合題" };
  return r;
}

// 人工/子代理檢查排除的小題(建立但隱藏):data/rerender/split-exclude.json = [{id, why}]
const EXCLUDE = new Map((fs.existsSync("data/rerender/split-exclude.json") ? JSON.parse(fs.readFileSync("data/rerender/split-exclude.json", "utf8")) : []).map((x) => [x.id, x.why]));
const rows = await fetchAll("questions?select=*&needs_review=eq.true&type=eq.single_choice&answer=is.null&order=id");
const existing = new Set((await fetchAll("questions?select=id&id=like.*-g*&order=id")).map((r) => r.id));
console.log(`候選(隱藏、單選、沒答案):${rows.length} 題`);
const fails = {}, out = [];
let groupsOk = 0;
for (const q of rows) {
  const r = split(q);
  if (r.fail) { fails[`${q.subject}|${r.fail}`] = (fails[`${q.subject}|${r.fail}`] ?? 0) + 1; continue; }
  groupsOk++;
  for (const s of r.subs) {
    if (existing.has(s.id)) continue;
    const p = [...problems(s), ...visibleProblems(s)];
    if (/ˉ/.test(s.question)) p.push("殘留ˉ符號"); // 原檔空格/作答線轉成 ˉ,詩文裡會看到「很苦ˉ很彷徨」
    const exWhy = EXCLUDE.get(s.id) ?? EXCLUDE.get(q.id); // 可指定小題 id 或整組(母題 id)
    if (exWhy) p.push(`人工排除:${exWhy}`);
    // 選項超過 5 個(F~H)要等前端支援 A~H 上線才可以寫入:沒加 --allow-fgh 就整組跳過(不建立,下次還能拆)
    if (!ALLOW_FGH && s.options && s.options.length > 5) { skippedFgh.add(q.id); continue; }
    out.push({ ...s, needs_review: p.length > 0, _problems: p, _parent: q.id, _mode: r.mode ?? "嚴格" });
  }
}
if (skippedFgh.size) console.log(`選項超過 5 個、等前端 A~H 上線(--allow-fgh)才寫入:${skippedFgh.size} 組`);
const stat = {};
for (const s of out) { const k = `${s.subject} ${s._mode} ${s.needs_review ? "建立但隱藏" : "可見"}`; stat[k] = (stat[k] ?? 0) + 1; }
console.log(`可拆題組 ${groupsOk} 組 → 小題 ${out.length} 題`, stat);
console.log("拆不了的原因:", Object.fromEntries(Object.entries(fails).sort((a, b) => b[1] - a[1]).slice(0, 15)));
const hidReasons = {};
for (const s of out) for (const p of s._problems) hidReasons[`${s.subject}|${p}`] = (hidReasons[`${s.subject}|${p}`] ?? 0) + 1;
console.log("小題隱藏原因:", hidReasons);

const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx !== -1) fs.writeFileSync(process.argv[dumpIdx + 1], JSON.stringify(out), "utf8");
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }

const dir = path.join(BACKUP_DIR, `${new Date().toISOString().slice(0, 10)}-split-groups`);
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `inserted-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify(out.map((s) => s.id)), "utf8");
console.log(`💾 新增的 id 清單 → ${file}`);
const clean = out.map(({ _problems, _parent, _mode, ...s }) => s);
for (let i = 0; i < clean.length; i += 500) {
  const r = await fetch(`${URL_BASE}/rest/v1/questions`, {
    method: "POST", headers: { ...H, Prefer: "return=minimal,resolution=ignore-duplicates" }, body: JSON.stringify(clean.slice(i, i + 500)),
  });
  if (!r.ok) throw new Error(`POST ${r.status} ${await r.text()}`);
}
console.log(`✅ 已新增 ${clean.length} 題小題`);
console.log(`復原:node scripts/split-groups.mjs --undo "${file}"`);
