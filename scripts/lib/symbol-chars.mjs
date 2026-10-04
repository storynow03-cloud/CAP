// Symbol/Wingdings 字型私用區字元(U+F0xx)→ 正確 Unicode 符號
// (fix-symbol-chars.mjs、reconcile-eq-symbols.mjs 共用)。每個碼位都對過題庫上下文。
// U+F0xx → 正確符號(只收上下文確認過的)
export const MAP = {
  0xde: "⇒", 0xdb: "⇔", 0x40: "≅", 0xb0: "°", 0xa2: "′", 0xa3: "≤", 0xb3: "≥",
  0x5e: "⊥", 0xd0: "∠", 0x70: "π", 0xb1: "±", 0xb4: "×", 0xb8: "÷", 0x2d: "−",
  0xbd: "|", 0x7c: "|", 0x3e: ">", 0x3c: "<", 0x2b: "+",
  0x72: "△", // Wingdings 3
  0xe0: "→", // Wingdings(自然:醣類→脂質→蛋白質)
  0x81: "①", 0x82: "②", 0x8c: "❶", 0x8d: "❷", 0x8e: "❸", 0x8f: "❹", // Wingdings
};
export const PUA = /[-]/g;
export const fixSymbols = (s) => (s == null ? s : s.replace(PUA, (c) => {
  const cp = c.codePointAt(0);
  return cp >= 0xf000 && cp <= 0xf0ff && MAP[cp - 0xf000] ? MAP[cp - 0xf000] : c;
}));
export const hasPUA = (s) => s != null && /[-]/.test(s);

