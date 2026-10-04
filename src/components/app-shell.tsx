"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import React, {
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useApp } from "@/components/app-context";
import { logoutAction } from "@/app/actions/auth";
import { createClient } from "@/utils/supabase/client";
import { getWorkspaceTabForPath } from "@/components/workspace-tabs";
import { NotificationBell } from "@/components/notification-bell";
import { CompanyBrandingProvider, CompanyLogo } from "@/components/company-logo";
import type { CompanyBranding } from "@/lib/company-settings";
import type { AppNotification } from "@/lib/notifications";
import { getNavigationHref } from "@/lib/access-control";
import { PermissionProvider } from "@/components/permission-context";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { isSystemSettingsPath, SYSTEM_SETTINGS_PERMISSIONS } from "@/lib/system-settings";
import { useUnsavedChangesContext } from "@/components/unsaved-changes";
import {
  findSidebarGroupForPath,
  SIDEBAR_NAV_GROUPS,
  type SidebarNavItem,
} from "@/lib/sidebar-navigation";

const ErpHelpCenter = dynamic(
  () => import("@/components/erp-help-center").then((module) => module.ErpHelpCenter),
  { ssr: false },
);

type AppShellProps = {
  branding: CompanyBranding;
  children: ReactNode;
  initialNotifications: AppNotification[];
  initialUnreadNotificationCount: number;
  isOwner: boolean;
  permissionCodes: string[];
  userId: string | null;
};

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia("(min-width: 1024px)");
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );
}
export function AppShell({
  branding,
  children,
  initialNotifications,
  initialUnreadNotificationCount,
  isOwner,
  permissionCodes,
  userId,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { requestNavigation } = useUnsavedChangesContext();
  const {
    toggleDarkMode,
    isDarkMode,
    workspaceTabs,
    syncWorkspaceTab,
    closeWorkspaceTab,
  } = useApp();
  const isDesktop = useIsDesktop();
  const isSettingsArea = isSystemSettingsPath(pathname);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const activeNavGroup = findSidebarGroupForPath(pathname);
  const [navGroupToggle, setNavGroupToggle] = useState({
    pathname,
    groupId: activeNavGroup,
  });
  const openNavGroup =
    navGroupToggle.pathname === pathname ? navGroupToggle.groupId : activeNavGroup;
  const isSidebarOpen = isDesktop ? !isDesktopCollapsed : isMobileDrawerOpen;
  const canViewSettings =
    isOwner ||
    SYSTEM_SETTINGS_PERMISSIONS.some((permission) =>
      permissionCodes.includes(permission),
    );
  const setIsSidebarOpen = (open: boolean) => {
    if (isDesktop) {
      setIsDesktopCollapsed(!open);
    } else {
      setIsMobileDrawerOpen(open);
    }
  };

  
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const activeWorkspaceHref = getWorkspaceTabForPath(pathname)?.href ?? "";
  const activeWorkspaceTabRef = useRef<HTMLDivElement>(null);

  const handleLogoutClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsProfileDropdownOpen(false);
    setIsLogoutConfirmOpen(true);
  };

  // Fetch logged in user on mount
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || null);
      }
    });
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isProfileDropdownOpen) return;
    const handleClose = () => setIsProfileDropdownOpen(false);
    window.addEventListener("click", handleClose);
    return () => window.removeEventListener("click", handleClose);
  }, [isProfileDropdownOpen]);

  useEffect(() => {
    syncWorkspaceTab(pathname);
  }, [pathname, syncWorkspaceTab]);

  useEffect(() => {
    if (!isDesktop || isSettingsArea) return;
    const timeout = window.setTimeout(() => {
      activeWorkspaceTabRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }, 320);
    return () => window.clearTimeout(timeout);
  }, [activeWorkspaceHref, isDesktop, isSettingsArea, isSidebarOpen]);

  // Extract clean username from email
  const username = userEmail ? userEmail.split("@")[0] : "ERP User";

  const handleTabClose = (href: string) => {
    const currentIndex = workspaceTabs.findIndex((tab) => tab.href === href);
    const fallbackTab =
      workspaceTabs[currentIndex - 1] ??
      workspaceTabs[currentIndex + 1] ??
      null;

    if (activeWorkspaceHref !== href) {
      closeWorkspaceTab(href);
      return;
    }

    requestNavigation(() => {
      closeWorkspaceTab(href);
      router.push(fallbackTab?.href ?? "/workspace");
    });
  };

  return (
    <CompanyBrandingProvider branding={branding}>
    <PermissionProvider codes={permissionCodes} isOwner={isOwner}>
    <div className="bg-background text-on-surface min-h-screen">
      {/* SideNavBar (Fixed Left) */}
      <aside className={`w-[208px] h-screen fixed left-0 top-0 bg-surface-container-lowest dark:bg-surface-container-lowest border-r border-outline-variant flex flex-col px-2 py-4 z-50 transition-all duration-300 ease-in-out ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-5 flex w-full justify-center">
          <CompanyLogo branding={branding} priority size="sidebar" />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
          {SIDEBAR_NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) => {
                  if (item.href === "#") return false;
                  if (isOwner) return true;
                  if (item.ownerOnly) return false;
                  if (!item.permission) return true;
                  const required = typeof item.permission === "string" ? [item.permission] : item.permission;
                  return required.some((permission) => permissionCodes.includes(permission));
                });
            if (items.length === 0) return null;
            const isOpen = !group.title || openNavGroup === group.id;
            const renderItem = (item: SidebarNavItem) => {
                const itemHref = getNavigationHref(item.href, permissionCodes);
                const isActive =
                  pathname === item.href ||
                  (item.href === "/settings/users" && pathname === "/settings/roles") ||
                  (item.href !== "#" && item.href !== "/" && pathname.startsWith(`${item.href}/`));

                return isActive ? (
                    <Link
                      key={item.label}
                      className={`flex items-center gap-sm rounded-lg border-r-4 border-primary bg-surface-container-low px-sm py-2.5 font-bold transition-colors duration-200 `}
                      href={itemHref}
                      onClick={() => {
                        if (!isDesktop) setIsSidebarOpen(false);
                      }}
                    >
                      <span
                        className="material-symbols-outlined text-primary"
                        style={{ fontVariationSettings: item.fill ? "'FILL' 1" : undefined }}
                      >
                        {item.icon}
                      </span>
                      <span className={`font-label-md text-[14px] text-primary dark:text-white `}>
                        {item.label}
                      </span>
                    </Link>
                ) : (
                  <Link
                    key={item.label}
                    className={`flex items-center gap-sm rounded-lg px-sm py-2.5 font-medium text-on-surface transition-colors duration-200 hover:bg-surface-container-low `}
                    href={itemHref}
                    onClick={() => {
                      if (!isDesktop) setIsSidebarOpen(false);
                    }}
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    <span className={`font-label-md text-[14px] `}>{item.label}</span>
                  </Link>
                );
            };

            return (
              <div key={group.id} className="space-y-1">
                {group.title ? (
                  <button
                    aria-controls={`sidebar-group-${group.id}`}
                    aria-expanded={isOpen}
                    className={`flex min-h-10 w-full items-center gap-sm rounded-lg px-sm text-left text-[13px] font-bold transition-colors hover:bg-surface-container-low ${activeNavGroup === group.id ? "text-primary" : "text-on-surface"} `}
                    onClick={() =>
                      setNavGroupToggle({
                        pathname,
                        groupId: isOpen ? null : group.id,
                      })
                    }
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[20px]">{group.icon}</span>
                    <span className="flex-1">{group.title}</span>
                    <span className={`material-symbols-outlined text-[18px] transition-transform ${isOpen ? "rotate-180" : ""} `}>
                      expand_more
                    </span>
                  </button>
                ) : null}
                {isOpen ? (
                  <div id={`sidebar-group-${group.id}`} className={`${group.title ? "space-y-1 pl-2" : "space-y-1"} `}>
                    {items.map(renderItem)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        {canViewSettings ? (
          <Link
            className={`mb-2 flex items-center gap-sm rounded-[3px] px-sm py-2.5 text-[14px] transition-colors  ${
              isSystemSettingsPath(pathname)
                ? "bg-primary font-bold text-on-primary"
                : "font-medium text-on-surface hover:bg-surface-container-low"
            }`}
            href="/settings"
            onClick={() => {
              if (!isDesktop) setIsSidebarOpen(false);
            }}
          >
            <span className="material-symbols-outlined">settings</span>
            <span>ตั้งค่า</span>
          </Link>
        ) : null}
        <button
          onClick={handleLogoutClick}
          className="mt-auto flex w-full items-center justify-center gap-sm rounded-lg border-none bg-primary px-sm py-2.5 font-label-md text-[14px] font-bold text-on-primary transition-all active:scale-95 cursor-pointer hover:bg-primary/95"
          type="button"
        >
          <span className="material-symbols-outlined text-on-primary">logout</span>
          ออกจากระบบ
        </button>
      </aside>

      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[45] bg-black/45 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
          onClick={() => setIsSidebarOpen(false)}
        />
      ) : null}

      {/* TopNavBar (Fixed Top) */}
      <header className={`h-14 fixed top-0 right-0 z-40 bg-surface-container-lowest dark:bg-surface-container-lowest border-b border-outline-variant flex items-center justify-between transition-all duration-300 ease-in-out px-md w-full ml-0 ${isSidebarOpen ? "lg:w-[calc(100%-208px)] lg:ml-[208px]" : ""}`}>
        <div className="flex min-w-0 items-center gap-sm">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="flex items-center justify-center rounded-full p-1.5 transition-colors active:scale-95 cursor-pointer hover:bg-surface-container-low"
            type="button"
            title={isSidebarOpen ? "ปิดเมนูด้านข้าง" : "เปิดเมนูด้านข้าง"}
          >
            <span className="material-symbols-outlined text-on-surface">
              {isSidebarOpen ? "menu_open" : "menu"}
            </span>
          </button>
        </div>

        {isSettingsArea ? (
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[18px] font-bold sm:hidden">
            ตั้งค่าระบบ
          </span>
        ) : null}

        {pathname === "/assets" ? (
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center leading-none sm:hidden">
            <p className="text-[24px] font-black tracking-tight text-primary">KRC</p>
            <p className="mt-0.5 text-[8px] font-black tracking-[0.12em] text-primary">ERP</p>
          </div>
        ) : null}

        <div className="flex items-center gap-sm">
          <div className={`items-center gap-sm ${pathname === "/assets" ? "hidden sm:flex" : "flex"}`}>
            <button
              className={`rounded-full p-1.5 transition-colors active:opacity-80 cursor-pointer hover:bg-surface-container-low ${isSettingsArea ? "hidden sm:block" : ""}`}
              onClick={toggleDarkMode}
              type="button"
            >
              <span className="material-symbols-outlined text-on-surface">
                {isDarkMode ? "light_mode" : "dark_mode"}
              </span>
            </button>
            {userId ? (
              <NotificationBell
                initialNotifications={initialNotifications}
                initialUnreadCount={initialUnreadNotificationCount}
                key={`${userId}:${initialUnreadNotificationCount}:${initialNotifications.map((item) => `${item.id}:${item.readAt ?? ""}`).join(",")}`}
                userId={userId}
              />
            ) : null}
            <button
              className={`items-center justify-center rounded-full p-1.5 transition-colors active:opacity-80 cursor-pointer hover:bg-surface-container-low ${isSettingsArea ? "hidden sm:flex" : "flex"}`}
              onClick={() => setIsHelpOpen(true)}
              type="button"
              title="คู่มือการใช้งานหน้านี้"
            >
              <span className="material-symbols-outlined text-on-surface">help</span>
            </button>
          </div>
          <div className={`h-7 w-[1px] bg-outline-variant ${pathname === "/assets" || isSettingsArea ? "hidden sm:block" : ""}`}></div>
          
          {/* Profile Dropdown Container */}
          <div className={`relative ${isSettingsArea ? "hidden sm:block" : ""}`}>
            <button
              aria-expanded={isProfileDropdownOpen}
              aria-label="เปิดเมนูบัญชีผู้ใช้"
              onClick={(e) => {
                e.stopPropagation();
                setIsProfileDropdownOpen(!isProfileDropdownOpen);
              }}
              className="flex items-center gap-sm rounded-lg p-1 transition-colors cursor-pointer select-none hover:bg-surface-container-low"
              type="button"
            >
              <div className="text-right hidden sm:block">
                <p className="font-label-md text-label-md text-on-surface uppercase">{username}</p>
                <p className="text-[12px] text-on-surface font-semibold opacity-80">ระบบ ERP ส่วนกลาง</p>
              </div>
              {pathname === "/assets" ? (
                <span className="grid size-8 place-items-center rounded-full bg-primary text-[13px] font-bold text-white sm:hidden">
                  {(username || "N").slice(0, 1).toUpperCase()}
                </span>
              ) : (
                <span className="material-symbols-outlined text-on-surface sm:hidden">account_circle</span>
              )}
            </button>

            {/* Dropdown Menu */}
            {isProfileDropdownOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-12 w-56 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg py-sm z-50 animate-in fade-in slide-in-from-top-2 duration-150"
              >
                <div className="px-md py-sm border-b border-outline-variant">
                  <p className="text-[11px] text-secondary font-semibold tracking-wide uppercase opacity-75">
                    ลงชื่อเข้าใช้เป็น
                  </p>
                  <p className="font-body-md font-bold text-on-surface truncate" title={userEmail || ""}>
                    {userEmail || "ไม่ระบุ"}
                  </p>
                </div>
                <div className="px-sm py-sm">
                  <button
                    onClick={handleLogoutClick}
                    className="w-full bg-primary hover:bg-primary/95 text-on-primary px-md py-sm rounded-lg font-bold text-label-md flex items-center justify-center gap-sm transition-all cursor-pointer border-none"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-on-primary text-[18px]">logout</span>
                    ออกจากระบบ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div
        className={`fixed right-0 top-14 z-30 hidden h-9 border-b border-outline-variant bg-surface-container-low/70 px-md backdrop-blur-sm transition-[left] duration-300 ease-in-out lg:block ${isSettingsArea ? "lg:hidden" : ""} ${isSidebarOpen ? "lg:left-[208px]" : "lg:left-0"}`}
      >
        <div className="flex h-full items-stretch overflow-x-auto">
          {workspaceTabs.map((tab) => {
            const isActive = activeWorkspaceHref === tab.href;

            return (
              <div
                key={tab.href}
                ref={isActive ? activeWorkspaceTabRef : undefined}
                className={`group relative flex h-full min-w-[132px] shrink-0 items-stretch border-r border-outline-variant first:border-l ${
                  isActive
                    ? "bg-background text-on-surface"
                    : "bg-surface-container-low/35 text-secondary hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-0.5 bg-primary"
                  />
                ) : null}
                <button
                  aria-current={isActive ? "page" : undefined}
                  className={`min-w-0 flex-1 truncate px-3 text-center text-[12px] transition-colors ${
                    isActive ? "font-bold" : "font-medium"
                  }`}
                  onClick={() => requestNavigation(() => router.push(tab.href))}
                  type="button"
                >
                  {tab.title}
                </button>
                {tab.closable ? (
                  <button
                    aria-label={`ปิดแท็บ ${tab.title}`}
                    className={`material-symbols-outlined flex w-8 shrink-0 items-center justify-center text-[16px] text-secondary transition-colors hover:bg-black/5 hover:text-on-surface focus-visible:opacity-100 dark:hover:bg-white/10 ${
                      isActive
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleTabClose(tab.href);
                    }}
                    title={`ปิดแท็บ ${tab.title}`}
                    type="button"
                  >
                    close
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main className={`${isSettingsArea ? "pt-14" : "pt-14 lg:pt-[92px]"} min-h-screen bg-background transition-all duration-300 ease-in-out ml-0 ${isSidebarOpen ? "lg:ml-[208px]" : ""}`}>
        <div className={isSettingsArea ? "" : "p-md"}>
          {isSettingsArea ? <SettingsWorkspace>{children}</SettingsWorkspace> : children}
        </div>
      </main>

      {/* Logout Confirmation Modal */}
      {isLogoutConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-md animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest dark:bg-surface-container-lowest border border-outline-variant dark:border-white/10 rounded-xl p-lg max-w-[360px] w-full shadow-2xl space-y-md text-center transform scale-100 transition-all animate-in zoom-in-95 duration-200">
            {/* Warning Icon */}
            <div className="mx-auto w-12 h-12 bg-primary/10 flex items-center justify-center rounded-full">
              <span className="material-symbols-outlined text-primary text-[28px]">logout</span>
            </div>
            
            <div className="space-y-xs">
              <h3 className="font-headline-md text-[18px] font-bold text-on-surface">
                ยืนยันการออกจากระบบ
              </h3>
              <p className="font-body-md text-secondary dark:text-secondary-fixed-dim text-sm">
                คุณต้องการออกจากระบบจัดการทรัพยากร KRC หรือไม่?
              </p>
            </div>

            <div className="flex gap-sm pt-sm">
              <button
                onClick={() => setIsLogoutConfirmOpen(false)}
                className="flex-1 py-sm px-md border border-outline-variant hover:bg-surface-container-low rounded-lg font-label-md text-label-md text-on-surface transition-colors cursor-pointer"
                type="button"
              >
                ไม่, อยู่ต่อ
              </button>
              <button
                onClick={() => {
                  setIsLogoutConfirmOpen(false);
                  logoutAction();
                }}
                className="flex-1 py-sm px-md bg-primary text-on-primary hover:bg-primary/95 active:scale-95 rounded-lg font-label-md text-label-md font-bold transition-all cursor-pointer border-none"
                type="button"
              >
                ใช่, ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {isHelpOpen && (
        <ErpHelpCenter
          isOwner={isOwner}
          onClose={() => setIsHelpOpen(false)}
          pathname={pathname}
          permissionCodes={permissionCodes}
        />
      )}
    </div>
    </PermissionProvider>
    </CompanyBrandingProvider>
  );
}
