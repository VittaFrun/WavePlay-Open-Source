// Signed edge pressure for the JS fallback. The native list already uses the
// exact gesture position; its fallback only has the visible placeholder index.
export function dragEdgePressure(placeholder: number, first: number, last: number) {
  if (placeholder < 0 || first < 0 || last - first < 3) return 0;
  const topDistance = Math.max(0, placeholder - first);
  const bottomDistance = Math.max(0, last - placeholder);
  if (topDistance <= 2 && topDistance < bottomDistance) return -(3 - topDistance) / 3;
  if (bottomDistance <= 2 && bottomDistance < topDistance) return (3 - bottomDistance) / 3;
  return 0;
}
