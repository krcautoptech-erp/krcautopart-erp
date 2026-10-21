import assert from "node:assert/strict";
import test from "node:test";
import { attachTableTouchScroll } from "./table-touch-scroll.ts";

function fixture() {
  const listeners = new Map<string, EventListener>();
  const frames = new Map<number, FrameRequestCallback>();
  const windowListeners = new Map<string, EventListener>();
  let now = 0, next = 0;
  const element = {
    scrollLeft: 200, scrollTop: 120, scrollWidth: 1500, clientWidth: 375, isConnected: true, style: { touchAction: "pan-x pan-y pinch-zoom" },
    ownerDocument: { getSelection: () => null, defaultView: {
      performance: { now: () => now },
      requestAnimationFrame: (fn: FrameRequestCallback) => { frames.set(++next, fn); return next; },
      cancelAnimationFrame: (id: number) => { frames.delete(id); },
      addEventListener: (type: string, fn: EventListener) => windowListeners.set(type, fn),
      removeEventListener: (type: string) => windowListeners.delete(type),
    } },
    addEventListener: (type: string, fn: EventListener) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  const detach = attachTableTouchScroll(element as unknown as HTMLElement);
  const touch = (type: string, x: number, y: number, time: number, count = 1, cancelable = true) => {
    now = time;
    let prevented = false;
    const event = { touches: Array.from({ length: count }, () => ({ clientX: x, clientY: y })), timeStamp: time, cancelable, preventDefault: () => { prevented = true; } };
    listeners.get(type)?.(event as unknown as Event);
    return prevented;
  };
  const tick = () => { now += 16; const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn(now)); };
  return { element, touch, tick, frames, listeners, windowListeners, detach };
}

test("horizontal swipe stays horizontal when the finger later drifts vertically", () => {
  const f = fixture();
  f.touch("touchstart", 200, 200, 0);
  assert.equal(f.touch("touchmove", 180, 203, 16), true);
  assert.equal(f.element.scrollLeft, 220);
  f.touch("touchmove", 150, 280, 32);
  assert.equal(f.element.scrollLeft, 250);
  assert.equal(f.element.scrollTop, 120);
  f.detach();
});

test("vertical swipe stays native even when it later drifts horizontally", () => {
  const f = fixture();
  f.touch("touchstart", 200, 200, 0);
  assert.equal(f.touch("touchmove", 203, 180, 16), false);
  f.element.scrollTop = 140; // Browser's native vertical movement.
  assert.equal(f.touch("touchmove", 100, 160, 32), false);
  assert.equal(f.element.scrollLeft, 200);
  assert.equal(f.element.scrollTop, 140);
  f.detach();
});

test("tap jitter and multi-touch are not swallowed; a new gesture can choose the other axis", () => {
  const f = fixture();
  f.touch("touchstart", 100, 100, 0);
  assert.equal(f.touch("touchmove", 103, 102, 16), false);
  assert.equal(f.touch("touchmove", 80, 100, 32, 2), false);
  f.touch("touchend", 0, 0, 40, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.element.scrollLeft, 200);
  f.touch("touchstart", 100, 100, 50);
  assert.equal(f.touch("touchmove", 80, 100, 66), true);
  f.detach();
});

test("horizontal momentum coasts without vertical drift and stops at an edge", () => {
  const f = fixture();
  f.element.scrollLeft = 1100;
  f.touch("touchstart", 200, 200, 0);
  f.touch("touchmove", 180, 203, 16);
  f.touch("touchend", 0, 0, 20, 0);
  assert.equal(f.frames.size, 1);
  for (let i = 0; i < 300 && f.frames.size; i++) f.tick();
  assert.equal(f.element.scrollLeft, 1125);
  assert.equal(f.element.scrollTop, 120);
  assert.equal(f.frames.size, 0);
  f.detach();
});

test("pause before release prevents unwanted coasting; cancellation and cleanup stop animation", () => {
  const f = fixture();
  f.touch("touchstart", 200, 200, 0);
  f.touch("touchmove", 180, 203, 16);
  f.touch("touchend", 0, 0, 150, 0);
  assert.equal(f.frames.size, 0);
  f.touch("touchstart", 200, 200, 200);
  f.touch("touchmove", 180, 203, 216);
  f.touch("touchend", 0, 0, 220, 0);
  assert.equal(f.frames.size, 1);
  f.touch("touchcancel", 0, 0, 230, 0);
  assert.equal(f.frames.size, 0);
  f.detach();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.windowListeners.size, 0);
  assert.equal(f.element.style.touchAction, "pan-x pan-y pinch-zoom");
});

test("does not fight a noncancelable browser gesture or open a row after a drag", () => {
  const f = fixture();
  f.touch("touchstart", 200, 200, 0);
  assert.equal(f.touch("touchmove", 180, 201, 16, 1, false), false);
  assert.equal(f.element.scrollLeft, 200);
  f.touch("touchstart", 200, 200, 50);
  f.touch("touchmove", 180, 201, 66);
  let blocked = false;
  f.listeners.get("click")?.({ detail: 1, preventDefault: () => { blocked = true; }, stopPropagation() {} } as unknown as Event);
  assert.equal(blocked, true);
  f.detach();
});

test("touch control keeps pinch zoom available and stops coasting when the scrollbar is grabbed", () => {
  const f = fixture();
  assert.equal(f.element.style.touchAction, "pan-y pinch-zoom");
  f.touch("touchstart", 200, 200, 0);
  f.touch("touchmove", 180, 200, 16);
  f.touch("touchend", 0, 0, 20, 0);
  assert.equal(f.frames.size, 1);
  f.windowListeners.get("pointerdown")?.({} as Event);
  assert.equal(f.frames.size, 0);
  f.detach();
});

test("a flick continues after release rather than stopping at the last finger position", () => {
  const f = fixture();
  f.touch("touchstart", 200, 200, 0);
  f.touch("touchmove", 160, 202, 16);
  f.touch("touchmove", 120, 203, 32);
  const releasedAt = f.element.scrollLeft;
  f.touch("touchend", 0, 0, 36, 0);
  for (let i = 0; i < 20; i++) f.tick();
  assert.ok(f.element.scrollLeft > releasedAt + 200);
  assert.equal(f.element.scrollTop, 120);
  assert.equal(f.frames.size, 1);
  f.detach();
});
