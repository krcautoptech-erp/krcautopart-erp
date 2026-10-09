"use client";

import { useEffect } from "react";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/use-body-scroll-lock";

/** Covers native dialogs and legacy modal surfaces that do not own a hook yet. */
export function ModalScrollGuard() {
  useEffect(() => {
    let locked = false;
    const sync = () => {
      const open = Array.from(document.querySelectorAll<HTMLElement>('dialog[open], [aria-modal="true"]')).some((node) => node.getClientRects().length > 0);
      if (open === locked) return;
      locked = open;
      if (locked) lockBodyScroll(); else unlockBodyScroll();
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-modal", "hidden", "class"] });
    sync();
    return () => { observer.disconnect(); if (locked) unlockBodyScroll(); };
  }, []);
  return null;
}
