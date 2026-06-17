"use client";

import { CUSTOM_PET, petStage, petStageValue, type PetDef } from "@/lib/gamify";

/** 統一渲染夥伴外觀:自訂圖 / 圖片夥伴用 <img>,emoji 夥伴用文字,依進化階段取對應外觀。 */
export default function PetView({
  petKey, defs, level, affection, customUrl, px, emojiClass = "", forceStage,
}: {
  petKey: string | null | undefined;
  defs: PetDef[];
  level: number;
  affection: number;
  customUrl?: string | null;
  px: number;
  emojiClass?: string;
  forceStage?: number; // 指定階段(進化圖鑑用),省略則依等級+好感度計算
}) {
  // legacy 自訂夥伴(pet === 'custom' + pet_image_url)
  if (petKey === CUSTOM_PET && customUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={customUrl} alt="夥伴" style={{ width: px, height: px }} className="inline-block rounded-full object-cover" />;

  const def = defs.find((d) => d.key === petKey);
  const val = petStageValue(def, forceStage ?? petStage(level, affection));
  if (def?.kind === "image")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={val} alt={def.name} style={{ width: px, height: px }} className="inline-block rounded-full object-cover" />;
  return <span className={emojiClass} style={emojiClass ? undefined : { fontSize: px }}>{val}</span>;
}
