/** 題目欄位可能含受控 HTML(img/sup/sub,由轉換管線產生)*/
export function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/<img[^>]*>/gi, "[圖]")
    .replace(/<[^>]+>/g, "")
    .trim();
}
