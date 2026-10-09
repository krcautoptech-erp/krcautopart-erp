import test from "node:test";
import assert from "node:assert/strict";
import { lockBodyScroll, unlockBodyScroll } from "./use-body-scroll-lock.ts";

test("nested locks freeze page and restore exact styles and scroll only after last close", () => {
  const originalDescriptors = ["document", "window", "getComputedStyle"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const style = { overflow: "auto", overscrollBehavior: "contain", paddingRight: "4px", position: "relative", top: "2px", left: "", width: "90%" };
  const initial = { ...style };
  const html = { overflow: "", overscrollBehavior: "auto" };
  const restored: unknown[] = [];
  Object.defineProperty(globalThis, "document", { configurable: true, value: { body: { style }, documentElement: { style: html, clientWidth: 980 } } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 1000, scrollX: 12, scrollY: 640, scrollTo: (options: unknown) => restored.push(options) } });
  Object.defineProperty(globalThis, "getComputedStyle", { configurable: true, value: () => style });
  try {
    lockBodyScroll(); lockBodyScroll();
    assert.equal(style.position, "fixed");
    assert.equal(style.top, "-640px");
    assert.equal(style.left, "-12px");
    assert.equal(style.paddingRight, "24px");
    assert.equal(html.overflow, "hidden");
    unlockBodyScroll();
    assert.equal(style.position, "fixed");
    assert.equal(restored.length, 0);
    unlockBodyScroll();
    assert.deepEqual(style, initial);
    assert.deepEqual(html, { overflow: "", overscrollBehavior: "auto" });
    assert.deepEqual(restored, [{ left: 12, top: 640, behavior: "instant" }]);
    unlockBodyScroll();
    assert.equal(restored.length, 1);
  } finally {
    for (const [key, descriptor] of originalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
