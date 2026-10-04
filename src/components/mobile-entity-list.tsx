import { MoreVertical } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

export function MobileEntityList<T>({
  items,
  getKey,
  primary,
  secondary,
  meta,
  status,
  onOpen,
  onAction,
  actionLabel,
  emptyText = "ไม่พบข้อมูล",
  disabled = false,
}: {
  items: T[];
  getKey: (item: T) => React.Key;
  primary: (item: T) => ReactNode;
  secondary: (item: T) => ReactNode;
  meta?: (item: T) => ReactNode;
  status?: (item: T) => ReactNode;
  onOpen?: (item: T) => void;
  onAction?: (item: T, event: MouseEvent<HTMLButtonElement>) => void;
  actionLabel?: (item: T) => string;
  emptyText?: string;
  disabled?: boolean;
}) {
  if (items.length === 0) {
    return <p className="px-4 py-14 text-center text-[14px] text-on-surface-variant">{emptyText}</p>;
  }

  return (
    <div className={`transition-opacity ${disabled ? "opacity-50" : "opacity-100"}`}>
      {items.map((item) => (
        <article className="min-h-[92px] border-b border-outline-variant py-3" key={getKey(item)}>
          <div className="flex min-w-0 items-start gap-2 px-4">
            <button className="min-w-0 flex-1 text-left disabled:cursor-default" disabled={!onOpen} onClick={() => onOpen?.(item)} type="button">
              <strong className="line-clamp-2 [overflow-wrap:anywhere] text-[17px] font-extrabold leading-5 text-primary">{primary(item)}</strong>
            </button>
            {status ? <span className="shrink-0 pt-0.5">{status(item)}</span> : null}
            {onAction ? (
              <button aria-label={actionLabel?.(item) ?? "จัดการรายการ"} className="-my-2 -mr-2 grid size-11 shrink-0 place-items-center" onClick={(event) => onAction(item, event)} type="button">
                <MoreVertical size={22} />
              </button>
            ) : null}
          </div>
          <button className="mt-1 block w-full px-4 text-left disabled:cursor-default" disabled={!onOpen} onClick={() => onOpen?.(item)} type="button">
            <span className="block line-clamp-2 [overflow-wrap:anywhere] text-[15px] font-semibold leading-5">{secondary(item)}</span>
            {meta ? <span className="mt-1 block truncate text-[13px] font-medium text-on-surface-variant">{meta(item)}</span> : null}
          </button>
        </article>
      ))}
    </div>
  );
}
