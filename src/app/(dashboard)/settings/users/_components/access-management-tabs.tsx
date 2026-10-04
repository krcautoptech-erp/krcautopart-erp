"use client";

import Link from "next/link";
import { useHasPermission } from "@/components/permission-context";

type AccessManagementTab = "roles" | "users";

const TABS: Array<{
  href: string;
  id: AccessManagementTab;
  label: string;
}> = [
  {
    href: "/settings/users",
    id: "users",
    label: "ผู้ใช้งาน",
  },
  {
    href: "/settings/users?tab=roles",
    id: "roles",
    label: "Role และสิทธิ์",
  },
];

export function AccessManagementTabs({
  activeTab,
}: {
  activeTab: AccessManagementTab;
}) {
  const canViewUsers = useHasPermission("users.view");
  const canViewRoles = useHasPermission("roles.view");

  return (
    <nav
      aria-label="เมนูผู้ใช้งานและสิทธิ์"
      className="flex min-h-9 items-end gap-6 border-b border-outline-variant"
    >
      {TABS.filter((tab) => tab.id === "users" ? canViewUsers : canViewRoles).map((tab) => {
        const isActive = tab.id === activeTab;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`relative inline-flex h-9 items-center px-1 text-[13px] font-bold transition-colors ${
              isActive
                ? "text-primary after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-primary"
                : "text-secondary hover:text-on-surface"
            }`}
            href={tab.href}
            key={tab.id}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
