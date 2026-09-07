"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

export function BackToTopButton({ showAfter = 480 }: { showAfter?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > showAfter);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [showAfter]);

  function scrollToTop() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  if (!visible) return null;

  return (
    <button
      aria-label="กลับไปด้านบนสุดของหน้า"
      className="fixed bottom-28 right-6 z-[55] flex h-11 w-11 items-center justify-center rounded-md border border-primary bg-primary text-white shadow-[0_12px_30px_-18px_rgba(170,17,25,0.75)] transition-all hover:bg-primary/90 active:scale-95"
      onClick={scrollToTop}
      title="กลับไปด้านบน"
      type="button"
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

