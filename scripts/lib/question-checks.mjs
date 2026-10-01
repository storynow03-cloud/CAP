// 題庫品質檢查的共用工具(repair-answer-tail.mjs、patch-lo-images.mjs 共用)。

export const plain = (s) =>
  String(s ?? "").replace(/<img[^>]*>/g, "[圖]").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
const hasImg = (s) => /<img/i.test(s ?? "");

// 數學/自然「靜默遺失」的算式:「若＝，＝2」「則＋＋＝？」(原本是線段、絕對值、分數)
export const LOST_EXPR = /(^|[^0-9a-zA-Z）)\]])＝(?=[＝：，。]|$)|(^|[^0-9a-zA-Z）)\]])：(?=[＝：，。])|＝＝|：：|[＋－×÷]＝/;
// 題組子題標記「(　)(2)」「（　）２」:出現在選項或題幹尾 = 多題被併成一題
const GROUP = /[（(][\s　]*[）)]\s*(?:[（(]\s*\d+\s*[）)]|[0-9０-９]+\s*[.．]?)/;
// 指涉附圖/附表的字眼。「數線上表示」「下表皮」這類黏在別的詞裡的,由 FIGURE_FALSE 排除
const FIGURE = /如圖|下圖|附圖|右圖|左圖|上圖|如下表|下表|附表|右表|左表|上表/;
const FIGURE_FALSE = /線上表|[上下]表皮|上表面|下表面|地表/g;

/**
 * 嚴格可用性檢查:回傳問題清單,空陣列 = 學生看得懂、答案對得上。
 * 寧可誤判成有問題(繼續隱藏),也不要把壞題放給孩子。
 */
export function problems(q) {
  const p = [];
  const texts = [q.question, ...(q.options ?? [])];
  const all = texts.join("\n");
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(all)) p.push("控制字元");
  if (/《答案》|詳解：/.test(all)) p.push("題目含答案");
  if (/[A-Z]{2,3}[a-z]?\d{11,12}(?!\d)/.test(all)) p.push("夾代碼");
  const qp = plain(q.question).trim();
  if (qp.replace(/[（(][\s　]*[）)]/g, "").trim().length < 2 && !hasImg(q.question)) p.push("題幹太短");
  if (FIGURE.test(all.replace(FIGURE_FALSE, "")) && !hasImg(all)) p.push("說有圖沒圖");
  if ((q.subject === "math" || q.subject === "science") && texts.some((t) => LOST_EXPR.test(plain(t)))) p.push("遺失算式");
  if (q.type === "single_choice") {
    if (q.answer == null) p.push("無答案");
    if (!q.options || q.options.length < 3 || q.options.length > 5) p.push("選項數異常");
    else {
      if (q.options.some((o) => !plain(o).trim() && !hasImg(o))) p.push("選項空白");
      if (q.answer != null && q.answer >= q.options.length) p.push("答案超出選項");
      if (q.options.some((o) => GROUP.test(plain(o)) || plain(o).length > 220)) p.push("選項夾題組");
      const po = q.options.map((o) => String(o).replace(/<(?!img)[^>]+>/g, "").trim());
      if (po.every(Boolean) && new Set(po).size < po.length) p.push("選項重複");
    }
    if (GROUP.test(qp.slice(-60))) p.push("疑似題組");
  } else if (!q.answer_text || !String(q.answer_text).trim()) {
    p.push("非選無答案");
  }
  return p;
}

// ── 尾巴題號 ──
// 解析器用「題號：」切題,下一題的顯示編號(「4.」)會黏在上一題「最後一個欄位」的尾巴
// (有詳解就在詳解尾,沒詳解就在答案尾)。
const toN = (s) => Number(String(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
export const TAIL = /^([\s\S]*?\S)\s*([0-9０-９]{1,3})[.．]\s*$/;
// 段落標題 + 1.:這一段的最後一題,後面黏著下一段的標題(「…選擇 1.」「…題組 1.」)
const SECTION = "選擇|題組|解釋|選詞|翻譯|延伸素養題|素養題|填充|簡答|看圖回答問題|依提示回答問題|閱讀測驗|克漏字選擇|文法測驗|對話與完成句子|句子重組|字彙測驗|字音|字形|字音字形|成語|修辭|改錯|默寫|注釋";
export const SECTION_NAMES = SECTION;
export const SECTION_TAIL = new RegExp(`^([\\s\\S]*?\\S)\\s*(?:${SECTION})\\s*[0-9０-９]{1,2}[.．]\\s*$`);
// 英文答案尾巴只黏著下一段標題、沒有編號(「…is Sam.填充」)
export const EN_LABEL_TAIL = new RegExp(`^([\\s\\S]*?[a-zA-Z.?!)’"])\\s*(?:${SECTION})\\s*$`);
export const lastField = (q) =>
  q.explanation && String(q.explanation).trim() ? "explanation" : q.answer_text ? "answer_text" : null;

/**
 * 找出確定是「下一題題號」的尾巴:同一來源檔依 id 排序後,相鄰題目的尾巴數字連續。
 * 真正屬於答案的數字(「since 2018.」「NT$5,000.」)不會剛好跟鄰題連號,不會被誤刪。
 * 回傳 Map<id, { field, body }>
 */
export function tailNumbers(rows) {
  const bySrc = new Map();
  for (const q of rows) {
    const k = q.subject + "|" + q.source;
    if (!bySrc.has(k)) bySrc.set(k, []);
    bySrc.get(k).push(q);
  }
  const accepted = new Map();
  for (const list of bySrc.values()) {
    list.sort((a, b) => (a.id < b.id ? -1 : 1));
    const t = list.map((q) => {
      const f = lastField(q);
      if (!f) return null;
      const m = String(q[f]).match(TAIL);
      return m ? { field: f, body: m[1], n: toN(m[2]) } : null;
    });
    for (let i = 0; i < list.length; i++) {
      if (!t[i]) continue;
      const prev = t[i - 1], next = t[i + 1];
      if ((prev && prev.n === t[i].n - 1) || (next && next.n === t[i].n + 1)) accepted.set(list[i].id, t[i]);
    }
  }
  return accepted;
}
