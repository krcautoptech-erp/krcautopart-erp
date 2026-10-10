"use client";

import { useEffect, useRef, useState } from "react";
import { selectTableRail, tableRailGeometry } from "@/lib/table-scroll-rail";

type Rail = { target: HTMLElement; selector: string; vertical: boolean; left: number; top: number; bottom: number; width: number; max: number; value: number; thumb: number };

/** A real control, independent of iPadOS's auto-hiding native scrollbars. */
export function TableScrollRail() {
  const [rail, setRail] = useState<Rail | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    let frame = 0;
    let active: HTMLElement | null = null;
    let targets: HTMLElement[] = [];
    const update = () => {
      frame = 0;
      const viewport = window.visualViewport;
      const bottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0);
      let footerHeight = 0;
      const scope = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')).filter((node) => node.getBoundingClientRect().height > 0).at(-1) ?? document.querySelector("main");
      const candidates: Rail[] = [];
      scope?.querySelectorAll("footer").forEach((footer) => {
        const rect = footer.getBoundingClientRect();
        if (["sticky", "fixed"].includes(getComputedStyle(footer).position) && rect.width > 0) footerHeight = Math.max(footerHeight, rect.height);
      });
      scope?.querySelectorAll("table").forEach((table) => {
        let node = table.parentElement;
        while (node && node !== document.body) {
          if (/(auto|scroll)/.test(getComputedStyle(node).overflowX) && node.scrollWidth > node.clientWidth + 1) {
            const rect = node.getBoundingClientRect();
            const geometry = tableRailGeometry(rect, window.innerWidth, bottom, node.clientWidth, node.scrollWidth, node === active);
            if (geometry) {
              // A stylesheet replaces the rail without mutating React-owned DOM during hydration.
              const path: string[] = [];
              for (let element: Element | null = node; element; element = element.parentElement) {
                const index = element.parentElement ? Array.from(element.parentElement.children).indexOf(element) + 1 : 1;
                path.unshift(`${element.tagName.toLowerCase()}:nth-child(${index})`);
              }
              candidates.push({ target: node, selector: path.join(" > "), vertical: node.scrollHeight > node.clientHeight + 1, ...geometry, bottom: 8 + footerHeight, value: node.scrollLeft });
            }
            break;
          }
          node = node.parentElement;
        }
      });
      const next = selectTableRail(candidates, active);
      targets = candidates.map((candidate) => candidate.target);
      if (active !== next?.target) {
        if (active) resize.unobserve(active);
        active = next?.target ?? null;
        if (active) resize.observe(active);
      }
      setRail((previous) => previous && next && Object.keys(next).every((key) => previous[key as keyof Rail] === next[key as keyof Rail]) ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    const syncScroll = (event: Event) => {
      if (event.target !== active || dragging.current) return;
      const value = active?.scrollLeft ?? 0;
      setRail((previous) => previous && previous.value !== value ? { ...previous, value } : previous);
    };
    const release = () => { dragging.current = false; schedule(); };
    const activate = (event: Event) => {
      if (!(event.target instanceof Node)) return;
      const target = targets.find((node) => node.contains(event.target as Node));
      if (target && target !== active) {
        if (active) resize.unobserve(active);
        active = target;
        resize.observe(active);
        schedule();
      }
    };
    document.addEventListener("scroll", syncScroll, true);
    document.addEventListener("pointerdown", activate, true);
    document.addEventListener("focusin", activate);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect(); resize.disconnect();
      document.removeEventListener("scroll", syncScroll, true);
      document.removeEventListener("pointerdown", activate, true);
      document.removeEventListener("focusin", activate);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, []);

  if (!rail) return null;
  return <div className="table-scroll-rail" style={{ left: rail.left, bottom: `calc(${rail.bottom}px + env(safe-area-inset-bottom))`, width: rail.width, "--rail-thumb": `${rail.thumb}px` } as React.CSSProperties}>
    <style>{`${rail.selector}::-webkit-scrollbar:horizontal{height:0}${!rail.vertical ? `${rail.selector}{scrollbar-width:none}` : ""}`}</style>
    <input aria-label="เลื่อนตารางซ้าย–ขวา" type="range" min={0} max={rail.max} step={1} value={rail.value}
      onPointerDown={() => { dragging.current = true; }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
      onBlur={() => { dragging.current = false; }}
      onChange={(event) => { const value = Number(event.target.value); rail.target.scrollTo({ left: value, behavior: "instant" }); setRail({ ...rail, value }); }} />
  </div>;
}
