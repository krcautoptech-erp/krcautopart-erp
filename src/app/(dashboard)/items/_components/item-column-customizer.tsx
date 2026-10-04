"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import {
  ALL_COLUMNS,
  type ColumnDefinition,
  type ColumnId,
} from "./item-dynamic-columns";

interface ItemColumnCustomizerProps {
  availableColumns?: ColumnDefinition[];
  visibleColumns: ColumnId[];
  onToggleColumn: (colId: ColumnId) => void;
  onReset: () => void;
  onSelectAll: () => void;
}

export function ItemColumnCustomizer({
  availableColumns,
  visibleColumns,
  onToggleColumn,
  onReset,
  onSelectAll,
}: ItemColumnCustomizerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const cols = availableColumns ?? ALL_COLUMNS;
  const activeCount = visibleColumns.filter((id) =>
    cols.some((c) => c.id === id),
  ).length;
  const totalCount = cols.length;

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={`flex h-10 items-center gap-2 rounded-[3px] border px-3 text-[14px] font-semibold transition-colors ${
          isOpen
            ? "border-primary bg-primary/5 text-primary"
            : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container"
        }`}
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
      >
        <SlidersHorizontal size={17} />
        <span>ปรับแต่งคอลัมน์</span>
        <span className="rounded-full bg-surface-container-high px-1.5 py-0.2 text-[11px] font-bold text-on-surface-variant">
          {activeCount}/{totalCount}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-72 rounded-[4px] border border-outline-variant bg-surface-container-lowest p-3 shadow-xl animate-in fade-in-50 zoom-in-95 duration-150">
          <div className="mb-2.5 flex items-center justify-between border-b border-outline-variant pb-2">
            <span className="text-[13px] font-bold text-on-surface">
              แสดง/ซ่อน คอลัมน์ในตาราง
            </span>
            <button
              aria-label="ปิดเมนู"
              className="grid h-6 w-6 place-items-center rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              <X size={15} />
            </button>
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto pr-1 text-[13px]">
            {cols.map((col: ColumnDefinition) => {
              const isChecked = visibleColumns.includes(col.id);
              const isLocked = col.isCore;

              return (
                <label
                  key={col.id}
                  className={`flex cursor-pointer items-center justify-between rounded px-2 py-1.5 hover:bg-surface-container ${
                    isLocked ? "cursor-not-allowed opacity-60" : ""
                  }`}
                >
                  <span className="flex items-center gap-2 text-on-surface">
                    <input
                      checked={isChecked}
                      className="rounded border-outline-variant text-primary focus:ring-0 focus:ring-offset-0"
                      disabled={isLocked}
                      onChange={() => !isLocked && onToggleColumn(col.id)}
                      type="checkbox"
                    />
                    <span>{col.label}</span>
                  </span>
                  {isLocked ? (
                    <span className="text-[11px] text-on-surface-variant">
                      คงที่
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-outline-variant pt-2.5 text-[12px]">
            <button
              className="flex items-center gap-1 font-semibold text-primary hover:underline"
              onClick={onReset}
              type="button"
            >
              <RotateCcw size={13} />
              ค่าเริ่มต้น
            </button>
            <button
              className="font-semibold text-on-surface-variant hover:text-on-surface"
              onClick={onSelectAll}
              type="button"
            >
              เลือกทั้งหมด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
