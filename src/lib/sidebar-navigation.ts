import type { PermissionCode } from "@/lib/access-control";

export type SidebarNavItem = {
  fill?: boolean;
  href: string;
  icon: string;
  label: string;
  ownerOnly?: boolean;
  permission?: PermissionCode | readonly PermissionCode[];
};

export type SidebarNavGroup = {
  icon?: string;
  id: string;
  items: readonly SidebarNavItem[];
  title?: string;
};

export const SIDEBAR_NAV_GROUPS: readonly SidebarNavGroup[] = [
  {
    id: "home",
    items: [{ label: "หน้าหลัก", href: "/workspace", icon: "home" }],
  },
  {
    id: "purchase",
    title: "จัดซื้อ",
    icon: "shopping_cart",
    items: [
      { label: "ใบขอซื้อ (PR)", href: "/purchase/pr", icon: "assignment", permission: "pr.view" },
      { label: "ใบสั่งซื้อ (PO)", href: "/purchase/po", icon: "receipt_long", permission: "po.view" },
      { label: "รับสินค้า", href: "/purchase/receipts", icon: "local_shipping", permission: "inventory.view" },
      { label: "คืนสินค้า", href: "#", icon: "assignment_return" },
      { label: "รายงานจัดซื้อ", href: "#", icon: "bar_chart" },
    ],
  },
  {
    id: "inventory",
    title: "คลังสินค้า",
    icon: "warehouse",
    items: [
      { label: "สต็อกคงเหลือ", href: "/inventory/stock", icon: "inventory", permission: "inventory.view" },
      { label: "สต็อกตั้งต้น", href: "/inventory/opening-stock", icon: "upload_file", permission: "opening_stock.view" },
      { label: "ใบเบิกใช้สินค้า", href: "/inventory/issues", icon: "outbox", permission: "inventory_issue.view" },
      { label: "ตรวจนับสต็อกจริง", href: "/inventory/stock-counts", icon: "fact_check", permission: "stock_count.view" },
      { label: "ปรับปรุงสต็อก", href: "/inventory/adjustments", icon: "tune", permission: "inventory_adjustment.view" },
    ],
  },
  {
    id: "reports",
    items: [
      { label: "รายงาน", href: "/reports", icon: "assessment", permission: ["po.view", "inventory.view"] },
    ],
  },
  {
    id: "master-data",
    title: "ข้อมูลกลาง",
    icon: "database",
    items: [
      { label: "รายการสินค้า", href: "/items", icon: "inventory_2", fill: true, permission: "items.view" },
      { label: "สินทรัพย์และอุปกรณ์", href: "/assets", icon: "devices", fill: true, permission: "assets.view" },
      { label: "คู่ค้า", href: "/partners", icon: "storefront", permission: "partners.view" },
    ],
  },
  {
    id: "main-work",
    title: "งานหลัก",
    icon: "workspaces",
    items: [
      { label: "การผลิต", href: "#", icon: "factory" },
    ],
  },
];

export function findSidebarGroupForPath(pathname: string) {
  return (
    SIDEBAR_NAV_GROUPS.find(
      (group) =>
        group.title &&
        group.items.some((item) => {
          const path = item.href.split("?")[0];
          return path !== "#" && (pathname === path || pathname.startsWith(`${path}/`));
        }),
    )?.id ?? null
  );
}
