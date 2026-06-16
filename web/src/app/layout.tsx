import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_THEME, darken } from "@/lib/gamify";

export const metadata: Metadata = {
  title: "會考衝刺站",
  description: "國中會考分階挑戰練習系統",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 讀取使用者裝備的主題色 → 設為 CSS 變數 --accent
  let accent = DEFAULT_THEME;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("equipped_theme")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.equipped_theme) {
        const { data: item } = await supabase
          .from("shop_items")
          .select("value,type")
          .eq("key", data.equipped_theme)
          .maybeSingle();
        if (item?.type === "theme") accent = item.value;
      }
    }
  } catch {
    // 未登入或讀取失敗 → 用預設色
  }

  return (
    <html lang="zh-TW" className="h-full antialiased">
      <body
        className="min-h-screen bg-slate-50 text-slate-900"
        style={
          {
            ["--accent" as string]: accent,
            ["--accent-dark" as string]: darken(accent),
          } as React.CSSProperties
        }
      >
        <Nav />
        <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">{children}</main>
      </body>
    </html>
  );
}
