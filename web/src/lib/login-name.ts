// 中文姓名登入(2026-10-04 使用者要求:家長帳號直接打中文姓名登入,不用 email)
//
// Supabase 的登入帳號必須是 email(只能英數字),所以把中文姓名「固定換算」成一個英數字 email:
//   「王小明」→ UTF-8 位元組轉 16 進位 →「n.e78e8be5b08fe6988e@cap.local」
// 建立帳號與登入都用同一個換算,使用者只需要打中文姓名;Supabase 看到的仍是正常 email。
// 輸入含「@」的照舊當 email 使用(既有的英文帳號不受影響)。

const DOMAIN = "cap.local";
const PREFIX = "n.";

/** 姓名最多 10 個字(email 帳號部分上限 64 字元,中文一字 = 6 個 16 進位字元) */
export const LOGIN_NAME_MAX = 10;

export function toLoginEmail(input: string): string {
  const v = input.trim();
  if (v.includes("@")) return v.toLowerCase();
  const hex = Array.from(new TextEncoder().encode(v)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${PREFIX}${hex}@${DOMAIN}`;
}

/** email → 顯示用的登入名稱(換算出來的 email 還原成中文姓名,其他照原樣) */
export function fromLoginEmail(email: string | null | undefined): string {
  const m = (email ?? "").match(/^n\.([0-9a-f]+)@cap\.local$/);
  if (!m) return email ?? "";
  try {
    const bytes = new Uint8Array(m[1].match(/../g)!.map((h) => parseInt(h, 16)));
    return new TextDecoder().decode(bytes);
  } catch {
    return email ?? "";
  }
}

/** 檢查登入名稱:email 或 1~10 字的姓名(不可含空白) */
export function loginNameError(input: string): string | null {
  const v = input.trim();
  if (!v) return "請輸入登入名稱";
  if (v.includes("@")) return null;
  if (/\s/.test(v)) return "姓名不能有空白";
  if ([...v].length > LOGIN_NAME_MAX) return `姓名最多 ${LOGIN_NAME_MAX} 個字`;
  return null;
}
