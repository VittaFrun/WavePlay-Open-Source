export function marqueePlan(content: number, viewport: number) {
  if (!Number.isFinite(content) || !Number.isFinite(viewport) || viewport <= 0 || content <= viewport + 4) return null;
  const gap = 32;
  const distance = content + gap;
  return {gap,distance,duration:Math.max(2500,Math.round(distance / 28 * 1000))};
}
