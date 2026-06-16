import type { LiturgyBlock } from "./service-plan";

export function splitLiturgyBlock(
  block: LiturgyBlock,
  itemIndex: number,
): [LiturgyBlock, LiturgyBlock] {
  if (itemIndex < 1 || itemIndex >= block.items.length) {
    throw new Error("split index out of range");
  }

  const firstHalf: LiturgyBlock = {
    kind: "liturgy",
    title: block.title,
    citation: block.citation,
    includeInSlides: block.includeInSlides,
    items: block.items.slice(0, itemIndex),
  };

  const secondHalf: LiturgyBlock = {
    kind: "liturgy",
    title: "",
    includeInSlides: block.includeInSlides,
    items: block.items.slice(itemIndex),
  };

  return [firstHalf, secondHalf];
}
