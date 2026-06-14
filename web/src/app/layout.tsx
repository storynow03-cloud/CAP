import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "會考衝刺站",
  description: "國中會考分階挑戰練習系統",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-TW" className="h-full antialiased">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <Nav />
        <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">{children}</main>
      </body>
    </html>
  );
}
