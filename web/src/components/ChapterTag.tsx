import { chapterInfo, type ChapterFields } from "@/lib/chapter";

/** 題目的年級・冊・單元・知識點小標籤(錯題本、歷程、作答畫面等共用) */
export default function ChapterTag({ q, compact = false }: { q: ChapterFields; compact?: boolean }) {
  const c = chapterInfo(q);
  const chip = "rounded px-1.5 py-0.5 whitespace-nowrap";
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${compact ? "text-[11px]" : "text-xs"}`}>
      {c.branch && <span className={`${chip} bg-orange-100 text-orange-700`}>{c.branch}</span>}
      {(c.grade || c.volume) && (
        <span className={`${chip} bg-sky-100 text-sky-700`}>{[c.grade, c.volume].filter(Boolean).join("・")}</span>
      )}
      {c.unit && <span className={`${chip} bg-slate-100 text-slate-700`}>{c.unit}</span>}
      {c.point && <span className={`${chip} bg-violet-100 text-violet-700`} title="課綱學習內容(知識點)">知識點 {c.point}</span>}
    </span>
  );
}
