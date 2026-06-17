"use client";

import { petStage, petStageValue, type PetDef } from "@/lib/gamify";

/** 統一渲染夥伴外觀:圖片夥伴用 <img>,emoji 夥伴用文字,依進化階段取對應外觀。 */
export default function PetView({
  petKey, defs, level, affection, px, emojiClass = "", forceStage,
}: {
  petKey: string | null | undefined;
  defs: PetDef[];
  level: number;
  affection: number;
  px: number;
  emojiClass?: string;
  forceStage?: number; // 指定階段(進化圖鑑用),省略則依等級+好感度計算
}) {
  const def = defs.find((d) => d.key === petKey);
  const val = petStageValue(def, forceStage ?? petStage(level, affection));
  if (def?.kind === "image" && val)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={val} alt={def.name} style={{ width: px, height: px }} className="inline-block rounded-full object-cover" />;
  return <span className={emojiClass} style={emojiClass ? undefined : { fontSize: px }}>{def?.kind === "image" ? "🆕" : val}</span>;
}
