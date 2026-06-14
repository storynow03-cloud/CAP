"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const supabase = createClient();
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nickname } },
      });
      if (error) setMsg(`註冊失敗:${error.message}`);
      else if (!data.session)
        setMsg("註冊成功!請到信箱點驗證連結後再登入。");
      else {
        router.push("/");
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(`登入失敗:${error.message}`);
      else {
        router.push("/");
        router.refresh();
      }
    }
    setLoading(false);
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl bg-white p-8 shadow">
      <h1 className="mb-1 text-2xl font-bold text-indigo-700">會考衝刺站</h1>
      <p className="mb-6 text-sm text-slate-500">國中會考分階挑戰練習系統</p>
      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="暱稱"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
          />
        )}
        <input
          type="email"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="密碼(至少 6 碼)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        <button
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "處理中…" : mode === "signin" ? "登入" : "註冊"}
        </button>
      </form>
      {msg && <p className="mt-3 text-sm text-rose-600">{msg}</p>}
      <button
        className="mt-4 text-sm text-indigo-600 underline"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? "還沒有帳號?註冊" : "已有帳號?登入"}
      </button>
    </div>
  );
}
