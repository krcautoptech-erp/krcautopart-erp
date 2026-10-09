"use client";

import { useEffect } from "react";

let activeLocksCount = 0;
let originalBodyOverflow = "";
let originalBodyOverscroll = "";
let originalHtmlOverscroll = "";
let originalPaddingRight = "";
let originalHtmlOverflow = "";
let originalPosition = "";
let originalTop = "";
let originalLeft = "";
let originalWidth = "";
let scrollX = 0;
let scrollY = 0;

/**
 * Shared, reference-counted lock; fixed body preserves the page on touch browsers.
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
    originalHtmlOverflow = documentElement.style.overflow;
    originalPosition = body.style.position;
    originalTop = body.style.top;
    originalLeft = body.style.left;
    originalWidth = body.style.width;
    scrollX = window.scrollX;
    scrollY = window.scrollY;

    // Compensate scrollbar width to prevent desktop layout jump
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `${-scrollY}px`;
    body.style.left = `${-scrollX}px`;
    body.style.width = "100%";
    body.style.overscrollBehavior = "none";
    documentElement.style.overscrollBehavior = "none";

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight || "0") + scrollbarWidth}px`;
    }
  }

  activeLocksCount += 1;
}

export function unlockBodyScroll(): void {
  if (typeof document === "undefined" || activeLocksCount === 0) return;

  activeLocksCount = Math.max(0, activeLocksCount - 1);

  if (activeLocksCount === 0) {
    const documentElement = document.documentElement;
    const body = document.body;

    body.style.overflow = originalBodyOverflow;
    body.style.overscrollBehavior = originalBodyOverscroll;
    documentElement.style.overscrollBehavior = originalHtmlOverscroll;
    body.style.paddingRight = originalPaddingRight;
    documentElement.style.overflow = originalHtmlOverflow;
    body.style.position = originalPosition;
    body.style.top = originalTop;
    body.style.left = originalLeft;
    body.style.width = originalWidth;
    window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
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
