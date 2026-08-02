/** 題目欄位可能含受控 HTML(img/sup/sub,由轉換管線產生)*/

const SUP_MAP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", x: "ˣ", a: "ᵃ", b: "ᵇ", c: "ᶜ",
};
const SUB_MAP: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎", n: "ₙ", x: "ₓ", a: "ₐ",
};

/** 把 <sup>2</sup> 轉成 ²,轉不了的字元退回原樣(至少不會像以前直接被刪掉變成 3.992)。 */
function toSmall(inner: string, map: Record<string, string>): string {
  const plain = inner.replace(/<[^>]+>/g, "");
  return [...plain].map((ch) => map[ch] ?? ch).join("");
}

/**
 * 轉純文字預覽用(單行日誌、摘要)。
 * 注意:上下標要轉成 Unicode 小字而不是整段刪掉——直接刪會讓 3.99² 變成「3.992」、
 * 1.36×10¹⁸ 變成「1.36×1018」,數字全黏在一起看不懂。
 * 需要「看得到圖」的地方(如錯題本清單)請直接渲染 HTML,不要用這個函式。
 */
export function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/<sup[^>]*>(.*?)<\/sup>/gi, (_, inner) => toSmall(inner, SUP_MAP))
    .replace(/<sub[^>]*>(.*?)<\/sub>/gi, (_, inner) => toSmall(inner, SUB_MAP))
    .replace(/<img[^>]*>/gi, "[圖]")
    .replace(/<[^>]+>/g, "")
    .trim();
}
