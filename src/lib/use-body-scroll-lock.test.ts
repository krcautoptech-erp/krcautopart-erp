import assert from "node:assert/strict";
import test from "node:test";
import { lockBodyScroll, unlockBodyScroll } from "./use-body-scroll-lock.ts";

test("lockBodyScroll and unlockBodyScroll correctly toggle overflow and handle nested locks", () => {
  // Mock document and window for node environment
  const mockBody = {
    style: {
      overflow: "",
      overscrollBehavior: "",
      paddingRight: "",
    },
  };
  const mockHtml = {
    style: {
      overscrollBehavior: "",
    },
    clientWidth: 1000,
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { body: mockBody, documentElement: mockHtml },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { innerWidth: 1015 },
  });

  // 1. Initial lock
  lockBodyScroll();
  assert.equal(mockBody.style.overflow, "hidden");
  assert.equal(mockBody.style.overscrollBehavior, "none");
  assert.equal(mockHtml.style.overscrollBehavior, "none");
  assert.equal(mockBody.style.paddingRight, "15px");

  // 2. Nested lock (second modal opens)
  lockBodyScroll();
  assert.equal(mockBody.style.overflow, "hidden");

  // 3. First unlock (child modal closes, parent modal still open)
  unlockBodyScroll();
  assert.equal(mockBody.style.overflow, "hidden", "Body should remain locked for outer modal");

  // 4. Second unlock (outer modal closes)
  unlockBodyScroll();
  assert.equal(mockBody.style.overflow, "");
  assert.equal(mockBody.style.overscrollBehavior, "");
  assert.equal(mockHtml.style.overscrollBehavior, "");
  assert.equal(mockBody.style.paddingRight, "");
});
