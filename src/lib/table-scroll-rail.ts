export function tableRailGeometry(rect: { left: number; right: number; top: number; bottom: number; width: number }, viewportWidth: number, viewportBottom: number, clientWidth: number, scrollWidth: number) {
  if (scrollWidth <= clientWidth + 1 || rect.width <= 0 || rect.bottom <= 100 || rect.top >= viewportBottom - 60) return null;
  const left = Math.max(8, rect.left);
  const width = Math.min(viewportWidth - 8, rect.right) - left;
  if (width < 48) return null;
  return { left, width, top: viewportBottom - 36, max: scrollWidth - clientWidth, thumb: Math.min(width, Math.max(32, width * clientWidth / scrollWidth)) };
}
