export type WorkspaceTab = {
  closable: boolean;
  href: string;
  icon: string;
  pinned: boolean;
  title: string;
};

const WORKSPACE_TAB_REGISTRY: WorkspaceTab[] = [
  {
    closable: true,
    href: "/items",
    icon: "inventory_2",
    pinned: false,
    title: "รายการสินค้า",
  },
  {
    closable: true,
    href: "/assets",
    icon: "devices",
    pinned: false,
    title: "สินทรัพย์และอุปกรณ์",
  },
  {
    closable: true,
    href: "/partners",
    icon: "storefront",
    pinned: false,
    title: "คู่ค้า",
  },
  {
    closable: true,
    href: "/purchase/pr",
    icon: "assignment",
    pinned: false,
    title: "ใบขอซื้อ (PR)",
  },
  {
    closable: true,
    href: "/purchase/po",
    icon: "receipt_long",
    pinned: false,
    title: "ใบสั่งซื้อ (PO)",
  },
  {
    closable: true,
    href: "/purchase/receipts",
    icon: "local_shipping",
    pinned: false,
    title: "รับสินค้า",
  },
  {
    closable: true,
    href: "/inventory/stock",
    icon: "inventory",
    pinned: false,
    title: "สต็อกสินค้า",
  },
  {
    closable: true,
    href: "/partner-settings",
    icon: "tune",
    pinned: false,
    title: "ตั้งค่าคู่ค้า",
  },
  {
    closable: true,
    href: "/settings/materials",
    icon: "settings",
    pinned: false,
    title: "ตั้งค่าวัตถุดิบ",
  },
  {
    closable: true,
    href: "/settings/item-types",
    icon: "category",
    pinned: false,
    title: "ตั้งค่าประเภทสินค้า",
  },
  {
    closable: true,
    href: "/settings/warehouses",
    icon: "warehouse",
    pinned: false,
    title: "ข้อมูลคลัง",
  },
  {
    closable: true,
    href: "/settings/departments",
    icon: "corporate_fare",
    pinned: false,
    title: "ตั้งค่าแผนก",
  },
  {
    closable: true,
    href: "/settings/users",
    icon: "manage_accounts",
    pinned: false,
    title: "ผู้ใช้งานและสิทธิ์",
  },
  {
    closable: true,
    href: "/settings/company",
    icon: "domain",
    pinned: false,
    title: "ข้อมูลบริษัท",
  },
];

export function getDefaultWorkspaceTabs(): WorkspaceTab[] {
  return [];
}

export function getWorkspaceTabForPath(pathname: string): WorkspaceTab | null {
  return (
    WORKSPACE_TAB_REGISTRY.find(
      (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`),
    ) ?? null
  );
}
