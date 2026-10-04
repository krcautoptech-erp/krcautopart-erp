"use client";

import { MoreVertical } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type RowAction = {
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onSelect: () => void;
};

export function RowActionMenu({ actions, contextId }: { actions: RowAction[]; contextId: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const close = () => setPosition(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const handleContextMenu = (event: MouseEvent) => {
      const row = (event.target as Element | null)?.closest<HTMLElement>("[data-row-actions]");
      if (row?.dataset.rowActions !== contextId) return;
      event.preventDefault();
      setPosition({
        left: Math.min(event.clientX, window.innerWidth - 210),
        top: Math.min(event.clientY, window.innerHeight - actions.length * 40 - 16),
      });
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [actions.length, contextId]);

  const openFromButton = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(8, Math.min(rect.right - 192, window.innerWidth - 200)),
      top: Math.min(rect.bottom + 4, window.innerHeight - actions.length * 40 - 16),
    });
  };

  return <>
    <button
      aria-expanded={Boolean(position)}
      aria-haspopup="menu"
      aria-label="เมนูจัดการ"
      className="grid size-8 place-items-center rounded-[3px] text-on-surface transition-colors hover:bg-surface-container"
      onClick={(event) => {
        event.stopPropagation();
        if (position) setPosition(null);
        else openFromButton();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      ref={buttonRef}
      type="button"
    >
      <MoreVertical size={19} />
    </button>
    {position && typeof document !== "undefined" ? createPortal(
      <div
        className="fixed z-[170] w-48 overflow-hidden rounded-[5px] border border-outline-variant bg-surface-container-lowest py-1 text-on-surface shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        role="menu"
        style={position}
      >
        {actions.map((action, index) => <button
          className={`flex h-10 w-full items-center gap-3 px-3 text-left text-[13px] font-semibold transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40 ${action.danger ? "mt-1 border-t border-outline-variant pt-1 text-primary" : ""}`}
          disabled={action.disabled}
          key={`${action.label}-${index}`}
          onClick={() => {
            setPosition(null);
            action.onSelect();
          }}
          role="menuitem"
          type="button"
        >
          <span className="grid size-5 place-items-center">{action.icon}</span>
          {action.label}
        </button>)}
      </div>,
      document.body,
    ) : null}
  </>;
}
