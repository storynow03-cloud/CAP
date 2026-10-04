"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 計算紙:蓋在題目上的透明畫布,平板 + 觸控筆可以直接在題目上演算。
 * - 「✏️ 計算紙」開啟後進入書寫模式(畫布接收筆觸);切到「👆 作答」時筆跡保留、畫布不擋點擊。
 * - 偵測到觸控筆後忽略手指/手掌的觸碰(防誤觸);滑鼠也能畫。
 * - 換題(resetKey 改變)自動清空。
 */
export default function ScratchPad({ resetKey, children }: { resetKey: string; children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false); // 有沒有開啟計算紙(筆跡是否顯示)
  const [drawing, setDrawing] = useState(true); // true=書寫模式,false=作答模式
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#2563eb");
  const penSeen = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // 畫布大小跟著題目區塊(含高解析螢幕)
  useEffect(() => {
    if (!open) return;
    const wrap = wrapRef.current, cv = canvasRef.current;
    if (!wrap || !cv) return;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (cv.width === w && cv.height === h) return;
      // 保留既有筆跡
      const old = document.createElement("canvas");
      old.width = cv.width; old.height = cv.height;
      if (cv.width && cv.height) old.getContext("2d")?.drawImage(cv, 0, 0);
      cv.width = w; cv.height = h;
      cv.style.width = `${r.width}px`; cv.style.height = `${r.height}px`;
      const ctx = cv.getContext("2d");
      if (ctx && old.width) ctx.drawImage(old, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [open]);

  // 換題清空
  useEffect(() => {
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function clear() {
    const cv = canvasRef.current;
    cv?.getContext("2d")?.clearRect(0, 0, cv.width, cv.height);
  }

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === "pen") penSeen.current = true;
    if (penSeen.current && e.pointerType === "touch") return; // 用筆時忽略手掌
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = pos(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!last.current) return;
    if (penSeen.current && e.pointerType === "touch") return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    const dpr = window.devicePixelRatio || 1;
    const pressure = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = (tool === "eraser" ? 22 : 1.5 + pressure * 2.5) * dpr;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  function up() {
    last.current = null;
  }

  const btn = "rounded-full px-3 py-1 text-xs font-semibold";
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {!open ? (
          <button className={`${btn} bg-sky-100 text-sky-700`} onClick={() => { setOpen(true); setDrawing(true); }}>
            ✏️ 計算紙
          </button>
        ) : (
          <>
            <button className={`${btn} ${drawing ? "bg-sky-600 text-white" : "bg-sky-100 text-sky-700"}`} onClick={() => setDrawing(true)}>
              ✏️ 書寫
            </button>
            <button className={`${btn} ${!drawing ? "bg-sky-600 text-white" : "bg-sky-100 text-sky-700"}`} onClick={() => setDrawing(false)}>
              👆 作答
            </button>
            {drawing && (
              <>
                {["#2563eb", "#dc2626", "#111827"].map((c) => (
                  <button key={c} aria-label="筆的顏色" onClick={() => { setColor(c); setTool("pen"); }}
                    className={`h-6 w-6 rounded-full border-2 ${tool === "pen" && color === c ? "border-slate-700" : "border-white"}`}
                    style={{ background: c }} />
                ))}
                <button className={`${btn} ${tool === "eraser" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-700"}`} onClick={() => setTool("eraser")}>
                  🧽 橡皮擦
                </button>
              </>
            )}
            <button className={`${btn} bg-slate-100 text-slate-700`} onClick={clear}>🗑️ 清除</button>
            <button className={`${btn} bg-slate-100 text-slate-500`} onClick={() => { clear(); setOpen(false); }}>✕ 關閉</button>
          </>
        )}
      </div>
      <div ref={wrapRef} className="relative">
        {children}
        {open && (
          <canvas
            ref={canvasRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            className={`absolute left-0 top-0 z-10 rounded-2xl ${drawing ? "cursor-crosshair ring-2 ring-sky-300" : "pointer-events-none"}`}
            style={{ touchAction: drawing ? "none" : "auto" }}
          />
        )}
      </div>
    </div>
  );
}
