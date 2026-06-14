import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync("D:/Claude/國中會考/web/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const url = env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/questions?subject=eq.math&needs_review=eq.false&question=like.*img*&select=id,question,options,answer&limit=3";
const r = await fetch(url, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: "Bearer " + env.SUPABASE_SECRET_KEY } });
const d = await r.json();
console.log("DB 中含圖的數學可用題:", d.length, "題範例");
for (const q of d) {
  const imgs = q.question.match(/qimg[^"]+/g) || [];
  console.log("---", q.id);
  console.log("  題目:", q.question.replace(/<img[^>]*>/g, "[圖]").slice(0, 70));
  for (const im of imgs) {
    const p = "D:/Claude/國中會考/web/public/" + im;
    console.log("  圖檔存在?", fs.existsSync(p), im);
  }
}
