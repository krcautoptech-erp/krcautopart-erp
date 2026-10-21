/** Keep native vertical scrolling and zoom; handle horizontal drags without diagonal drift. */
export function attachTableTouchScroll(element: HTMLElement) {
  const view = element.ownerDocument.defaultView;
  if (!view) return () => {};
  const previousTouchAction = element.style.touchAction;
  element.style.touchAction = "pan-y pinch-zoom";
  let frame = 0;
  let suppressClick = false;
  let gesture: { x: number; y: number; top: number; lastX: number; time: number; velocity: number; axis: "x" | "y" | null } | null = null;
  const stop = () => { view.cancelAnimationFrame(frame); frame = 0; };
  const moveLeft = (value: number) => {
    const previous = element.scrollLeft;
    element.scrollLeft = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, value));
    return element.scrollLeft - previous;
  };
  const start = (event: TouchEvent) => {
    stop();
    suppressClick = false;
    gesture = event.touches.length === 1 ? {
      x: event.touches[0].clientX, y: event.touches[0].clientY, top: element.scrollTop,
      lastX: event.touches[0].clientX, time: event.timeStamp, velocity: 0, axis: null,
    } : null;
  };
  const move = (event: TouchEvent) => {
    if (!gesture || event.touches.length !== 1 || element.ownerDocument.getSelection()?.isCollapsed === false) {
      gesture = null;
      return;
    }
    const { clientX: x, clientY: y } = event.touches[0];
    if (!gesture.axis) {
      const dx = Math.abs(x - gesture.x), dy = Math.abs(y - gesture.y);
      if (Math.max(dx, dy) < 8) return;
      gesture.axis = dx > dy && element.scrollWidth > element.clientWidth ? "x" : "y";
    }
    // Once the browser owns a vertical gesture, do not fight it or change axes.
    if (gesture.axis === "y") return;
    if (!event.cancelable) { gesture.axis = "y"; return; }
    event.preventDefault();
    suppressClick = true;
    element.scrollTop = gesture.top;
    const distance = moveLeft(element.scrollLeft + gesture.lastX - x);
    const elapsed = Math.max(1, event.timeStamp - gesture.time);
    gesture.velocity = elapsed > 80 ? distance / elapsed : gesture.velocity * 0.5 + distance / elapsed * 0.5;
    gesture.lastX = x;
    gesture.time = event.timeStamp;
  };
  const end = (event: TouchEvent) => {
    const completed = gesture;
    gesture = null;
    if (!completed || completed.axis !== "x" || event.touches.length || event.timeStamp - completed.time > 80) return;
    let velocity = Math.max(-3, Math.min(3, completed.velocity));
    let previousTime = view.performance.now();
    const coast = (time: number) => {
      frame = 0;
      if (!element.isConnected) return;
      const elapsed = Math.min(40, Math.max(1, time - previousTime));
      previousTime = time;
      const distance = moveLeft(element.scrollLeft + velocity * elapsed);
      velocity *= Math.exp(-elapsed / 500);
      if (Math.abs(velocity) >= 0.02 && distance !== 0) frame = view.requestAnimationFrame(coast);
    };
    if (Math.abs(velocity) >= 0.02) frame = view.requestAnimationFrame(coast);
  };
  const cancel = () => { gesture = null; stop(); };
  const click = (event: MouseEvent) => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  };
  element.addEventListener("touchstart", start, { passive: true });
  element.addEventListener("touchmove", move, { passive: false });
  element.addEventListener("touchend", end, { passive: true });
  element.addEventListener("touchcancel", cancel, { passive: true });
  element.addEventListener("click", click, true);
  element.addEventListener("wheel", cancel, { passive: true });
  element.addEventListener("keydown", cancel);
  view.addEventListener("pointerdown", stop, { passive: true });
  return () => {
    cancel();
    element.style.touchAction = previousTouchAction;
    element.removeEventListener("touchstart", start);
    element.removeEventListener("touchmove", move);
    element.removeEventListener("touchend", end);
    element.removeEventListener("touchcancel", cancel);
    element.removeEventListener("click", click, true);
    element.removeEventListener("wheel", cancel);
    element.removeEventListener("keydown", cancel);
    view.removeEventListener("pointerdown", stop);
  };
}
