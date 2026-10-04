"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { usePermissions } from "@/components/permission-context";
import {
  getSystemSettingsBreadcrumb,
  getSystemSettingsGroupForPath,
  getVisibleSystemSettings,
} from "@/lib/system-settings";

export function SettingsWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { codes, isOwner } = usePermissions();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [navigation, setNavigation] = useState({ pathname, href: "" });
  const groups = getVisibleSystemSettings(codes, isOwner, query);
  const activeGroup = getSystemSettingsGroupForPath(pathname);
  const breadcrumb =
    pathname === "/settings/users" && searchParams.get("tab") === "roles"
      ? (["ตั้งค่าระบบ", "บทบาทและสิทธิ์"] as const)
      : getSystemSettingsBreadcrumb(pathname);
  const [groupToggle, setGroupToggle] = useState({ pathname, title: activeGroup });
  const openGroup = groupToggle.pathname === pathname ? groupToggle.title : activeGroup;

  return (
    <div className="relative flex min-h-[calc(100vh-3.5rem)] min-w-0 lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden">
      <aside
        className={`hidden h-full shrink-0 overflow-hidden border-r border-outline-variant bg-surface-container-lowest transition-[width] duration-200 ease-out lg:block ${isCollapsed ? "w-0 border-r-0" : "w-[214px]"}`}
        data-settings-sidebar
      >
        <div className="flex h-full w-[214px] flex-col">
          <div className="flex h-14 items-center justify-between border-b border-outline-variant px-3">
            <h1 className="text-[18px] font-bold">การตั้งค่า</h1>
            <button
              aria-label="ซ่อนเมนูการตั้งค่า"
              className="grid size-8 place-items-center rounded-[4px] border border-outline-variant hover:bg-surface-container-low"
              onClick={() => setIsCollapsed(true)}
              title="ซ่อนเมนูการตั้งค่า"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">keyboard_double_arrow_left</span>
            </button>
          </div>
          <label className="relative mx-3 mt-3 block">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-secondary">search</span>
            <input
              aria-label="ค้นหาการตั้งค่า"
              className="h-9 w-full rounded-[4px] border border-outline-variant bg-surface-container-lowest pl-8 pr-2 text-[12px] outline-none focus:border-primary"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาการตั้งค่า..."
              type="search"
              value={query}
            />
          </label>
          <nav aria-label="เมนูการตั้งค่า" className="mt-2 flex-1 overflow-y-auto px-2 pb-3">
            {groups.map((group) => {
              const isOpen = openGroup === group.title;
              return (
                <div className="border-b border-outline-variant/70 py-1" key={group.title}>
                  <button
                    aria-expanded={isOpen}
                    className={`flex min-h-10 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[13px] font-semibold hover:bg-surface-container-low ${group.title === activeGroup ? "text-primary" : ""}`}
                    onClick={() => setGroupToggle({ pathname, title: isOpen ? null : group.title })}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[19px]">{group.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{group.title === "ผู้ใช้และความปลอดภัย" ? "ผู้ใช้และสิทธิ์" : group.title}</span>
                    <span className={`material-symbols-outlined text-[17px] transition-transform ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
                  </button>
                  <div className={`grid transition-[grid-template-rows] duration-200 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      {group.items.map((item) => {
                        const [itemPath, itemQuery = ""] = item.href.split("?");
                        const itemTab = new URLSearchParams(itemQuery).get("tab");
                        const isActive =
                          pathname === itemPath && searchParams.get("tab") === itemTab;
                        return (
                          <Link
                            aria-current={isActive ? "page" : undefined}
                            className={`relative flex min-h-9 items-center py-1.5 pl-10 pr-2 text-[12px] transition-colors hover:bg-surface-container-low hover:text-primary ${isActive ? "bg-primary/7 font-bold text-primary after:absolute after:inset-y-0 after:right-0 after:w-[3px] after:bg-primary" : "text-on-surface-variant"}`}
                            href={item.href}
                            key={item.href}
                            onClick={() => setNavigation({ pathname, href: item.href })}
                            prefetch
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>
        </div>
      </aside>

      {isCollapsed ? (
        <button
          aria-label="เปิดเมนูการตั้งค่า"
          className="sticky top-[4.25rem] z-20 mt-3 hidden size-8 shrink-0 -translate-x-px place-items-center rounded-r-[4px] border border-l-0 border-outline-variant bg-surface-container-lowest shadow-sm hover:text-primary lg:grid"
          onClick={() => setIsCollapsed(false)}
          title="เปิดเมนูการตั้งค่า"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">keyboard_double_arrow_right</span>
        </button>
      ) : null}

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px] lg:hidden" onMouseDown={(event) => { if (event.currentTarget === event.target) setIsMobileMenuOpen(false); }}>
          <aside aria-label="เมนูการตั้งค่า" aria-modal="true" className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-[24px] bg-surface-container-lowest px-4 pb-7 shadow-2xl" role="dialog">
            <div aria-hidden="true" className="mx-auto my-4 h-1.5 w-12 rounded-full bg-outline-variant" />
            <header className="mb-5 flex items-center justify-between">
              <h2 className="text-[30px] font-bold leading-none">เมนูการตั้งค่า</h2>
              <button aria-label="ปิดเมนูการตั้งค่า" className="grid size-11 place-items-center rounded-full hover:bg-surface-container-low" onClick={() => setIsMobileMenuOpen(false)} type="button">
                <span className="material-symbols-outlined text-[32px]">close</span>
              </button>
            </header>
            <label className="relative mb-5 block">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[30px]">search</span>
              <input aria-label="ค้นหาการตั้งค่า" autoFocus className="h-[58px] w-full rounded-[8px] border border-primary/50 bg-surface-container-lowest pl-14 pr-4 text-[19px] outline-none placeholder:text-secondary focus:border-primary" onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาการตั้งค่า..." type="search" value={query} />
            </label>
            <nav className="border-t border-outline-variant" aria-label="เมนูการตั้งค่าบนมือถือ">
              {groups.map((group) => {
                const isOpen = openGroup === group.title;
                return <section className="border-b border-outline-variant" key={group.title}>
                  <button aria-expanded={isOpen} className={`flex min-h-[76px] w-full items-center gap-4 px-2 text-left text-[22px] font-semibold ${group.title === activeGroup ? "text-primary" : ""}`} onClick={() => setGroupToggle({ pathname, title: isOpen ? null : group.title })} type="button">
                    <span className="material-symbols-outlined text-[34px]">{group.icon}</span>
                    <span className="min-w-0 flex-1">{group.title === "ผู้ใช้และความปลอดภัย" ? "ผู้ใช้และสิทธิ์" : group.title}</span>
                    <span className={`material-symbols-outlined text-[30px] transition-transform ${isOpen ? "rotate-180 text-primary" : ""}`}>expand_more</span>
                  </button>
                  {isOpen ? <div className="pb-2">{group.items.map((item) => {
                    const [itemPath, itemQuery = ""] = item.href.split("?");
                    const itemTab = new URLSearchParams(itemQuery).get("tab");
                    const isActive = pathname === itemPath && searchParams.get("tab") === itemTab;
                    return <Link aria-current={isActive ? "page" : undefined} className={`relative flex min-h-[66px] items-center gap-4 px-4 pl-7 text-[21px] font-medium ${isActive ? "bg-primary/8 text-primary before:absolute before:inset-y-1 before:left-0 before:w-[5px] before:rounded-r before:bg-primary" : "text-on-surface hover:bg-surface-container-low"}`} href={item.href} key={item.href} onClick={() => setIsMobileMenuOpen(false)} prefetch><span className="material-symbols-outlined text-[31px]">{item.icon}</span><span>{item.label}</span></Link>;
                  })}</div> : null}
                </section>;
              })}
            </nav>
          </aside>
        </div>
      ) : null}

      <div className="min-w-0 flex-1 px-3 py-3 sm:px-5 lg:overflow-y-auto lg:px-6" data-settings-content key={pathname}>
        {navigation.pathname === pathname && navigation.href ? (
          <div aria-label="กำลังเปิดหน้าตั้งค่า" aria-live="polite" className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-primary/15">
            <span className="block h-full w-1/3 animate-pulse bg-primary" />
          </div>
        ) : null}
        {breadcrumb ? (
          <div className="mb-2 flex h-7 items-center justify-between gap-2 lg:h-5">
            <nav aria-label="เส้นทางหน้าตั้งค่า" className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-secondary">
              <Link className="truncate transition-colors hover:text-primary hover:underline" href="/settings" prefetch>
                {breadcrumb[0]}
              </Link>
              <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[14px]">chevron_right</span>
              <span aria-current="page" className="truncate text-on-surface">{breadcrumb[1]}</span>
            </nav>
            <button aria-label="เปิดเมนูการตั้งค่า" className="grid size-7 shrink-0 place-items-center rounded-[4px] border border-outline-variant text-primary hover:bg-primary/5 lg:hidden" onClick={() => setIsMobileMenuOpen(true)} title="เมนูการตั้งค่า" type="button">
              <span className="material-symbols-outlined text-[18px]">tune</span>
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
