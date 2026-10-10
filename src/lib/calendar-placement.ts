export function calendarPlacement(
  trigger: { left: number; top: number; bottom: number },
  width: number, height: number, viewportWidth: number, viewportHeight: number,
) {
  const margin = 12;
  const maxHeight = Math.max(0, viewportHeight - margin * 2);
  const fittedHeight = Math.min(height, maxHeight);
  const below = trigger.bottom + 6;
  return {
    left: Math.max(margin, Math.min(trigger.left, viewportWidth - width - margin)),
    top: Math.max(margin, Math.min(below + fittedHeight <= viewportHeight - margin ? below : trigger.top - fittedHeight - 6, viewportHeight - fittedHeight - margin)),
    maxHeight,
  };
}
