import type { PermissionCode } from "@/lib/access-control";

export type SystemSettingItem = {
  description: string;
  href: string;
  icon: string;
  label: string;
  permission: PermissionCode;
};

export type SystemSettingGroup = {
  description: string;
  icon: string;
  items: readonly SystemSettingItem[];
  title: string;
};

export const SYSTEM_SETTING_GROUPS = [
  {
    title: "บริษัทและองค์กร",
    description: "ข้อมูลที่ใช้ร่วมกันทั้งองค์กร",
    icon: "domain",
    items: [
      {
        label: "ข้อมูลบริษัท",
        description: "ชื่อบริษัท สาขา ที่อยู่ โลโก้ และรูปแบบเอกสาร",
        href: "/settings/company",
        icon: "apartment",
        permission: "company.view",
      },
      {
        label: "แผนก",
        description: "โครงสร้างหน่วยงานและผู้รับผิดชอบ",
        href: "/settings/departments",
        icon: "account_tree",
        permission: "departments.view",
      },
    ],
  },
  {
    title: "ผู้ใช้และความปลอดภัย",
    description: "บัญชีผู้ใช้ บทบาท และขอบเขตการเข้าถึง",
    icon: "shield_person",
    items: [
      {
        label: "ผู้ใช้งาน",
        description: "เพิ่ม แก้ไข และกำหนดสถานะบัญชีผู้ใช้",
        href: "/settings/users",
        icon: "manage_accounts",
        permission: "users.view",
      },
      {
        label: "บทบาทและสิทธิ์",
        description: "กำหนดสิทธิ์การดู เพิ่ม แก้ไข อนุมัติ และส่งออก",
        href: "/settings/users?tab=roles",
        icon: "admin_panel_settings",
        permission: "roles.view",
      },
      {
        label: "ลายเซ็นและการอนุมัติ",
        description: "จัดเตรียมลายเซ็นดิจิทัลส่วนบุคคลสำหรับการอนุมัติเอกสาร",
        href: "/settings/signature-approval",
        icon: "draw",
        permission: "approval_signature.manage",
      },
      {
        label: "Log การใช้งานระบบ",
        description: "ตรวจสอบกิจกรรม การเปลี่ยนแปลง และเหตุการณ์ด้านความปลอดภัย",
        href: "/settings/audit-logs",
        icon: "history",
        permission: "audit_logs.view",
      },
    ],
  },
  {
    title: "ข้อมูลจัดซื้อ",
    description: "ข้อมูลกลางที่ใช้ในกระบวนการจัดซื้อ",
    icon: "shopping_cart",
    items: [
      {
        label: "ตั้งค่าคู่ค้า",
        description: "กลุ่ม ประเภท เครดิตเทอม และเงื่อนไขของคู่ค้า",
        href: "/partner-settings",
        icon: "storefront",
        permission: "partner_settings.view",
      },
    ],
  },
  {
    title: "ข้อมูลสินค้าและคลัง",
    description: "สินค้า วัตถุดิบ ประเภท หน่วยนับ และคลังสินค้า",
    icon: "inventory_2",
    items: [
      {
        label: "ตั้งค่าวัตถุดิบ",
        description: "กลุ่มวัตถุดิบ เกรดวัสดุ และหน่วยนับ",
        href: "/settings/materials",
        icon: "deployed_code",
        permission: "material_settings.view",
      },
      {
        label: "ตั้งค่าประเภทสินค้า",
        description: "ประเภทสินค้า รูปแบบฟอร์ม และการควบคุมรายการ",
        href: "/settings/item-types",
        icon: "category",
        permission: "item_types.view",
      },
      {
        label: "ข้อมูลคลัง",
        description: "คลังสินค้า ที่อยู่ และผู้รับผิดชอบ",
        href: "/settings/warehouses",
        icon: "warehouse",
        permission: "warehouses.view",
      },
    ],
  },
  {
    title: "เอกสารและการอนุมัติ",
    description: "ข้อความมาตรฐานและการอนุมัติเอกสาร",
    icon: "description",
    items: [
      {
        label: "เงื่อนไขเอกสาร",
        description: "แม่แบบเงื่อนไขสำหรับ PR, PO และเอกสารที่เกี่ยวข้อง",
        href: "/settings/document-terms",
        icon: "contract_edit",
        permission: "document_terms.view",
      },
    ],
  },
] as const satisfies readonly SystemSettingGroup[];

export const SYSTEM_SETTINGS_PERMISSIONS = SYSTEM_SETTING_GROUPS.flatMap(
  (group) => group.items.map((item) => item.permission),
);

export function isSystemSettingsPath(pathname: string) {
  if (pathname === "/settings" || pathname === "/settings/roles") return true;

  return SYSTEM_SETTING_GROUPS.some((group) =>
    group.items.some((item) => {
      const path = item.href.split("?")[0];
      return pathname === path || pathname.startsWith(`${path}/`);
    }),
  );
}

export function getSystemSettingsBreadcrumb(pathname: string) {
  if (pathname === "/settings" || !isSystemSettingsPath(pathname)) return null;

  let currentLabel: string | null =
    pathname === "/settings/roles" ? "บทบาทและสิทธิ์" : null;
  for (const group of SYSTEM_SETTING_GROUPS) {
    const item = group.items.find(({ href }) => {
      const path = href.split("?")[0];
      return pathname === path || pathname.startsWith(`${path}/`);
    });
    if (item) currentLabel = item.label;
  }

  return currentLabel ? (["ตั้งค่าระบบ", currentLabel] as const) : null;
}

export function getSystemSettingsGroupForPath(pathname: string) {
  return SYSTEM_SETTING_GROUPS.find((group) =>
    group.items.some(({ href }) => {
      const path = href.split("?")[0];
      return pathname === path || pathname.startsWith(`${path}/`);
    }),
  )?.title ?? null;
}

export function getVisibleSystemSettings(
  permissions: readonly string[],
  isOwner: boolean,
  query = "",
) {
  const keyword = query.trim().toLocaleLowerCase("th");

  return SYSTEM_SETTING_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (isOwner || permissions.includes(item.permission)) &&
        (!keyword ||
          `${group.title} ${item.label} ${item.description}`
            .toLocaleLowerCase("th")
            .includes(keyword)),
    ),
  })).filter((group) => group.items.length > 0);
}
