export function selectTableRail<T extends { target: unknown }>(candidates: T[], active: unknown): T | null {
  return candidates.find((candidate) => candidate.target === active) ?? candidates.at(-1) ?? null;
}

export function tableRailGeometry(rect: { left: number; right: number; top: number; bottom: number; width: number }, viewportWidth: number, viewportBottom: number, clientWidth: number, scrollWidth: number, active = false, railHeight = 28) {
  if (scrollWidth <= clientWidth + 1 || rect.width <= 0 || (!active && (rect.bottom <= 100 || rect.top >= viewportBottom - 60))) return null;
  const left = Math.max(8, rect.left);
  const width = Math.min(viewportWidth - 8, rect.right) - left;
  if (width < 48) return null;
  const viewportEdge = viewportBottom - railHeight - 8;
  const top = rect.bottom <= 100 ? viewportEdge : Math.min(rect.bottom - railHeight / 2, viewportEdge);
  return { left, width, top, max: scrollWidth - clientWidth, thumb: Math.min(width, Math.max(32, width * clientWidth / scrollWidth)) };
}
