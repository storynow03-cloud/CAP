"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUBJECTS } from "@/lib/types";

interface Pet {
  id: number;
  key: string;
  name: string;
  origin: string;
  kind: "emoji" | "image" | string;
  stage1: string;
  stage2: string;
  stage3: string;
  rarity: string;
  sort: number;
  active: boolean;
  price: number;
  is_legendary: boolean;
  bonus_xp: number;
  bonus_coins: number;
  bonus_affection: number;
  bonus_subjects: string[];
}

const STAGE_LABELS = ["幼年", "成長期", "完全體"];
const emptyForm = () => ({
  key: "", name: "", origin: "自訂", kind: "emoji" as const,
  stage1: "", stage2: "", stage3: "", rarity: "common", sort: 0,
  price: 0, is_legendary: false, bonus_xp: 0, bonus_coins: 0, bonus_affection: 0,
  bonus_subjects: [] as string[],
});

type BonusVals = {
  price: number; is_legendary: boolean; bonus_xp: number; bonus_coins: number;
  bonus_affection: number; bonus_subjects: string[];
};

// 購買 + 加成設定(任何夥伴皆可設;新增與編輯共用)
function BonusFields({ v, set }: { v: BonusVals; set: (patch: Partial<BonusVals>) => void }) {
  function toggleSubj(k: string) {
    const has = v.bonus_subjects.includes(k);
    set({ bonus_subjects: has ? v.bonus_subjects.filter((s) => s !== k) : [...v.bonus_subjects, k] });
  }
  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-2">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={v.is_legendary} onChange={(e) => set({ is_legendary: e.target.checked })} />
        ✨ 傳說特效(作答時夥伴有華麗特效)
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-xs text-slate-500">售價🪙(0=免費)
          <input type="number" className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" value={v.price}
            onChange={(e) => set({ price: Number(e.target.value) })} /></label>
        <label className="text-xs text-slate-500">XP +%
          <input type="number" className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" value={v.bonus_xp}
            onChange={(e) => set({ bonus_xp: Number(e.target.value) })} /></label>
        <label className="text-xs text-slate-500">金幣 +%
          <input type="number" className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" value={v.bonus_coins}
            onChange={(e) => set({ bonus_coins: Number(e.target.value) })} /></label>
        <label className="text-xs text-slate-500">每答對好感
          <input type="number" className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" value={v.bonus_affection}
            onChange={(e) => set({ bonus_affection: Number(e.target.value) })} /></label>
      </div>
      <div className="mt-2">
        <p className="text-xs text-slate-500">加成考科(不選=全科加成)</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {SUBJECTS.map((s) => (
            <button key={s.key} type="button" onClick={() => toggleSubj(s.key)}
              className={`rounded-full px-2 py-0.5 text-xs ${v.bonus_subjects.includes(s.key) ? "accent-bg text-white" : "bg-slate-200 text-slate-600"}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StageThumb({ kind, value }: { kind: string; value: string }) {
  if (!value) return <span className="text-slate-300">—</span>;
  if (kind === "image")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={value} alt="" className="h-9 w-9 rounded-full object-cover" />;
  return <span className="text-2xl">{value}</span>;
}

export default function AdminPetsPage() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [edit, setEdit] = useState<Pet | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/pets");
    if (r.status === 403 || r.status === 401) { setDenied(true); setLoading(false); return; }
    const d = await r.json();
    setPets(d.pets ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function uploadStage(file: File, slot: string): Promise<string | null> {
    if (!file.type.startsWith("image/")) { setMsg("請選圖片檔"); return null; }
    if (file.size > 5 * 1024 * 1024) { setMsg("圖片請小於 5MB"); return null; }
    setUploading(slot);
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "png";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("pet-images").upload(path, file, { upsert: true });
    setUploading("");
    if (error) { setMsg("上傳失敗:" + error.message); return null; }
    return supabase.storage.from("pet-images").getPublicUrl(path).data.publicUrl;
  }

  async function api(method: string, body: object) {
    const r = await fetch("/api/admin/pets", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { setMsg("失敗:" + d.error); return false; }
    setMsg("已儲存 ✅"); load(); return true;
  }
  async function create() {
    if (!form.key || !form.name || !form.stage1 || !form.stage2 || !form.stage3) { setMsg("需填 key、名稱、三階段"); return; }
    if (await api("POST", form)) setForm(emptyForm());
  }
  async function saveEdit() {
    if (!edit) return;
    if (await api("PATCH", edit)) setEdit(null);
  }
  async function del(p: Pet) {
    if (!confirm(`刪除夥伴「${p.name}」?已選用此夥伴的玩家會被重設。`)) return;
    api("DELETE", { id: p.id });
  }

  // 階段輸入:emoji → 文字;image → 上傳
  function StageInputs({ kind, get, set }: {
    kind: string; get: (k: "stage1" | "stage2" | "stage3") => string;
    set: (k: "stage1" | "stage2" | "stage3", v: string) => void;
  }) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {(["stage1", "stage2", "stage3"] as const).map((s, i) => (
          <div key={s} className="rounded-lg border border-slate-200 p-2 text-center">
            <p className="mb-1 text-xs text-slate-400">{STAGE_LABELS[i]}</p>
            <div className="mb-1 flex h-9 items-center justify-center"><StageThumb kind={kind} value={get(s)} /></div>
            {kind === "image" ? (
              <label className="block cursor-pointer rounded bg-slate-100 px-2 py-1 text-xs">
                {uploading === s + (get(s) || "") ? "上傳中…" : "上傳"}
                <input type="file" accept="image/*" className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const url = await uploadStage(f, s + (get(s) || "")); if (url) set(s, url);
                  }} />
              </label>
            ) : (
              <input value={get(s)} onChange={(e) => set(s, e.target.value)} placeholder="emoji"
                className="w-full rounded border border-slate-300 px-1 py-1 text-center" />
            )}
          </div>
        ))}
      </div>
    );
  }

  if (denied)
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-bold">🔒 需要管理者權限</p>
        <p className="mt-1 text-sm text-slate-500">只有老師/家長角色能管理夥伴。</p>
      </div>
    );
  if (loading) return <p className="py-12 text-center text-slate-500">載入中…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🐾 夥伴管理</h1>
        <a href="/admin" className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">← 帳號管理</a>
      </div>
      {msg && <p className="rounded-lg bg-amber-50 p-2 text-center text-sm text-amber-700">{msg}</p>}

      {/* 新增 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold">➕ 新增夥伴</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="key(唯一,如 pik_red)"
            value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
          <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="顯示名稱"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="分類(如 皮克敏)"
            value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
          <select className="rounded-lg border border-slate-300 px-3 py-2"
            value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "emoji" })}>
            <option value="emoji">emoji 文字</option>
            <option value="image">上傳圖片</option>
          </select>
        </div>
        <p className="mb-1 mt-3 text-sm font-semibold text-slate-500">三階段外觀</p>
        <StageInputs kind={form.kind}
          get={(k) => form[k]} set={(k, v) => setForm({ ...form, [k]: v })} />
        <BonusFields v={form} set={(patch) => setForm({ ...form, ...patch })} />
        <button onClick={create} className="mt-3 w-full rounded-lg accent-bg py-2.5 font-semibold text-white">建立夥伴</button>
      </section>

      {/* 列表 */}
      <section className="space-y-2">
        <h2 className="font-bold">所有夥伴({pets.length})</h2>
        {pets.map((p) => (
          <div key={p.id} className="rounded-2xl bg-white p-4 shadow-sm">
            {edit?.id === p.id ? (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="名稱"
                    value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="分類"
                    value={edit.origin} onChange={(e) => setEdit({ ...edit, origin: e.target.value })} />
                  <select className="rounded-lg border border-slate-300 px-3 py-2"
                    value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>
                    <option value="emoji">emoji 文字</option>
                    <option value="image">上傳圖片</option>
                  </select>
                  <input type="number" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="排序"
                    value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} />
                </div>
                <StageInputs kind={edit.kind}
                  get={(k) => edit[k]} set={(k, v) => setEdit({ ...edit, [k]: v })} />
                <BonusFields v={edit} set={(patch) => setEdit({ ...edit, ...patch })} />
                <div className="flex gap-2">
                  <button onClick={saveEdit} className="rounded-lg accent-bg px-4 py-1.5 text-sm font-semibold text-white">儲存</button>
                  <button onClick={() => setEdit(null)} className="rounded-lg bg-slate-100 px-4 py-1.5 text-sm">取消</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <StageThumb kind={p.kind} value={p.stage1} />
                  <StageThumb kind={p.kind} value={p.stage2} />
                  <StageThumb kind={p.kind} value={p.stage3} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}{p.is_legendary && <span className="ml-1 text-amber-500">✨傳說</span>}</p>
                    <p className="truncate text-xs text-slate-400">
                      {p.origin}|{p.kind}|{p.key}{p.price ? `|🪙${p.price}` : ""}
                      {p.is_legendary ? `|XP+${p.bonus_xp}%·金幣+${p.bonus_coins}%·好感+${p.bonus_affection}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => setEdit(p)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">編輯</button>
                  <button onClick={() => del(p)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-600">刪除</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
