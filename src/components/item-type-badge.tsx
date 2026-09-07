import React from "react";

export type ItemTypeBadgeProps = {
  code?: string | null;
  name?: string | null;
  title?: string;
  className?: string;
};

/**
 * Standard ERP item type/category badge.
 * Renders the type code in primary red with bold white text,
 * and shows full code + name in tooltip on hover.
 */
export function ItemTypeBadge({
  code,
  name,
  title,
  className = "",
}: ItemTypeBadgeProps) {
  if (!code || code === "-") {
    return <span className="text-secondary/50">-</span>;
  }

  const tooltip = title || (name ? `${code} · ${name}` : code);

  return (
    <span
      className={`inline-block shrink-0 rounded-[3px] bg-primary px-2 py-0.5 text-[11px] font-bold text-white shadow-2xs ${className}`}
      title={tooltip}
    >
      {code}
    </span>
  );
}
