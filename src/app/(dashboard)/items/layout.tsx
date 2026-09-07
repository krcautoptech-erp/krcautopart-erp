import type { ReactNode } from "react";

export default function ItemMasterLayout({ children }: { children: ReactNode }) {
  return (
    <section className="min-w-0">{children}</section>
  );
}
