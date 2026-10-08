"use client";

import { useEffect } from "react";

let activeLocksCount = 0;
let originalBodyOverflow = "";
let originalBodyOverscroll = "";
let originalHtmlOverscroll = "";
let originalPaddingRight = "";

/**
 * Modern 2026 standard Body Scroll Lock utility:
 * - Stack / Nested-modal safe via reference counter.
 * - Prevents layout shift from disappearing scrollbars on desktop.
 * - Prevents iOS Safari & Chrome mobile rubber-banding by locking overscroll-behavior.
 */
export function lockBodyScroll(): void {
  if (typeof document === "undefined") return;

  if (activeLocksCount === 0) {
    const documentElement = document.documentElement;
    const body = document.body;

    originalBodyOverflow = body.style.overflow;
    originalBodyOverscroll = body.style.overscrollBehavior;
    originalHtmlOverscroll = documentElement.style.overscrollBehavior;
    originalPaddingRight = body.style.paddingRight;

    // Compensate scrollbar width to prevent desktop layout jump
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    documentElement.style.overscrollBehavior = "none";

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  activeLocksCount += 1;
}

export function unlockBodyScroll(): void {
  if (typeof document === "undefined") return;

  activeLocksCount = Math.max(0, activeLocksCount - 1);

  if (activeLocksCount === 0) {
    const documentElement = document.documentElement;
    const body = document.body;

    body.style.overflow = originalBodyOverflow;
    body.style.overscrollBehavior = originalBodyOverscroll;
    documentElement.style.overscrollBehavior = originalHtmlOverscroll;
    body.style.paddingRight = originalPaddingRight;
  }
}

/**
 * React hook to lock body scroll while component is mounted or condition is true.
 */
export function useBodyScrollLock(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;

    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [enabled]);
}
