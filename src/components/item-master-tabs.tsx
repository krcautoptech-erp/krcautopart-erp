"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export type ItemMasterTabType = { code: string; formTemplate: string; name: string };

export function ItemMasterTabs({
  activeType = "ALL",
  itemTypes,
  onTypeChange,
  stayInCatalog = false,
}: {
  activeType?: string;
  itemTypes: ItemMasterTabType[];
  onTypeChange?: (code: string) => void;
  stayInCatalog?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const tabs = [
    { code: "ALL", href: "/items", label: "ทั้งหมด", mode: "catalog" },
    ...itemTypes.map((item) => ({
      code: item.code,
      href: `/items?type=${encodeURIComponent(item.code)}`,
      label:
        item.formTemplate === "finished_good"
          ? "สินค้าสำเร็จรูป"
          : item.formTemplate === "raw_material"
            ? "วัตถุดิบ"
            : `${item.code} ${item.name}`,
      mode:
        stayInCatalog ? ("catalog" as const) : ("route" as const),
    })),
  ];

  useEffect(() => {
    router.prefetch("/items");
  }, [router]);

  return (
    <nav
      aria-label="สลับหมวดสินค้าและวัตถุดิบ"
      className="flex min-h-11 w-full items-end gap-6 overflow-x-auto border-b border-outline-variant"
    >
      {tabs.map((tab) => {
        const isActive = tab.mode === "catalog"
          ? pathname === "/items" && activeType === tab.code
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        if (tab.mode === "catalog" && onTypeChange) {
          return <button aria-current={isActive ? "page" : undefined} className={`relative inline-flex h-11 min-w-max items-center px-1 text-[14px] font-bold transition-colors ${isActive ? "text-primary after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-primary" : "text-secondary hover:text-on-surface"}`} key={tab.code} onClick={() => onTypeChange(tab.code)} type="button">{tab.label}</button>;
        }

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`relative inline-flex h-10 items-center px-1 text-[14px] font-bold transition-colors ${
              isActive
                ? "text-primary after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-primary"
                : "text-secondary hover:text-on-surface"
            }`}
            href={tab.href}
            key={tab.code}
            prefetch
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
