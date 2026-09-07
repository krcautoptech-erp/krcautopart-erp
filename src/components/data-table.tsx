import type { ComponentPropsWithoutRef, ReactNode } from "react";

function join(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function DataTableFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={join("erp-data-table-frame", className)}><div className="erp-data-table-scroll">{children}</div></div>;
}

export function DataTable({ className, ...props }: ComponentPropsWithoutRef<"table">) {
  return <table className={join("erp-data-table", className)} {...props} />;
}

export function DataTableEmpty({ colSpan, children = "ไม่พบข้อมูล" }: { colSpan: number; children?: ReactNode }) {
  return <tr><td className="erp-data-table-empty" colSpan={colSpan}>{children}</td></tr>;
}

