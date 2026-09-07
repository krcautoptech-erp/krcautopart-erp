"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, {
  useState,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useApp } from "@/components/app-context";
import { logoutAction } from "@/app/actions/auth";
import { createClient } from "@/utils/supabase/client";
import { getWorkspaceTabForPath } from "@/components/workspace-tabs";
import { NotificationBell } from "@/components/notification-bell";
import { CompanyLogo } from "@/components/company-logo";
import type { CompanyBranding } from "@/lib/company-settings";
import type { AppNotification } from "@/lib/notifications";
import { 
  HelpCircle, 
  X, 
  Package, 
  Layers, 
  Info, 
  PlusCircle, 
  Eye, 
  Edit, 
  Trash2, 
  BookOpen, 
  Lightbulb, 
  Compass, 
  Moon,
  FileText,
  ShoppingCart,
  Truck,
  TrendingUp,
  Building,
  Users,
  LayoutDashboard
} from "lucide-react";

type SidebarNavItem = {
  fill?: boolean;
  href: string;
  icon: string;
  label: string;
  ownerOnly?: boolean;
};

type SidebarNavGroup = {
  items: SidebarNavItem[];
  title?: string;
};

const navGroups: SidebarNavGroup[] = [
  {
    items: [{ label: "แดชบอร์ด", href: "#", icon: "dashboard" }],
  },
  {
    title: "ข้อมูลกลาง",
    items: [
      { label: "รายการสินค้า", href: "/items", icon: "inventory_2", fill: true },
      { label: "สินทรัพย์และอุปกรณ์", href: "/assets", icon: "devices", fill: true },
      { label: "คู่ค้า", href: "/partners", icon: "storefront" },
    ],
  },
  {
    title: "จัดซื้อ",
    items: [
      { label: "ใบขอซื้อ (PR)", href: "/purchase/pr", icon: "assignment" },
      { label: "ใบสั่งซื้อ (PO)", href: "/purchase/po", icon: "receipt_long" },
      { label: "รับสินค้า", href: "/purchase/receipts", icon: "local_shipping" },
      { label: "คืนสินค้า", href: "#", icon: "assignment_return" },
      { label: "รายงานจัดซื้อ", href: "#", icon: "bar_chart" },
    ],
  },
  {
    title: "คลังสินค้า",
    items: [
      { label: "สต็อกคงเหลือ", href: "/inventory/stock", icon: "inventory" },
    ],
  },
  {
    title: "งานหลัก",
    items: [
      { label: "การผลิต", href: "#", icon: "factory" },
      { label: "รายงาน", href: "#", icon: "assessment" },
    ],
  },
  {
    title: "ตั้งค่าระบบ",
    items: [
      {
        label: "ข้อมูลบริษัท",
        href: "/settings/company",
        icon: "domain",
        ownerOnly: true,
      },
      { label: "ตั้งค่าคู่ค้า", href: "/partner-settings", icon: "tune" },
      { label: "ตั้งค่าวัตถุดิบ", href: "/settings/materials", icon: "settings" },
      { label: "ตั้งค่าประเภทสินค้า", href: "/settings/item-types", icon: "category" },
      { label: "เงื่อนไขเอกสาร", href: "/settings/document-terms", icon: "description", ownerOnly: true },
      {
        label: "ข้อมูลคลัง",
        href: "/settings/warehouses",
        icon: "warehouse",
        ownerOnly: true,
      },
      {
        label: "ตั้งค่าแผนก",
        href: "/settings/departments",
        icon: "corporate_fare",
      },
      {
        label: "ผู้ใช้งานและสิทธิ์",
        href: "/settings/users",
        icon: "manage_accounts",
        ownerOnly: true,
      },
    ],
  },
];

type AppShellProps = {
  branding: CompanyBranding;
  children: ReactNode;
  initialNotifications: AppNotification[];
  initialUnreadNotificationCount: number;
  isOwner: boolean;
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
  userId,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    searchQuery,
    setSearchQuery,
    toggleDarkMode,
    isDarkMode,
    workspaceTabs,
    syncWorkspaceTab,
    closeWorkspaceTab,
  } = useApp();
  const isDesktop = useIsDesktop();
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const isSidebarOpen = isDesktop ? !isDesktopCollapsed : isMobileDrawerOpen;
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

  // Extract clean username from email
  const username = userEmail ? userEmail.split("@")[0] : "ERP User";

  const handleTabClose = (href: string) => {
    const currentIndex = workspaceTabs.findIndex((tab) => tab.href === href);
    const fallbackTab =
      workspaceTabs[currentIndex - 1] ??
      workspaceTabs[currentIndex + 1] ??
      null;

    closeWorkspaceTab(href);

    if (activeWorkspaceHref !== href) {
      return;
    }

    if (fallbackTab) {
      router.push(fallbackTab.href);
      return;
    }

    router.push("/workspace");
  };

  return (
    <div className="bg-background text-on-surface min-h-screen">
      {/* SideNavBar (Fixed Left) */}
      <aside className={`w-[224px] h-screen fixed left-0 top-0 bg-surface-container-lowest dark:bg-surface-container-lowest border-r border-outline-variant flex flex-col py-md px-sm z-50 transition-all duration-300 ease-in-out ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-lg px-sm">
          <CompanyLogo branding={branding} priority size="sidebar" />
          <p className="font-body-md text-body-md text-on-surface font-medium">ระบบจัดการทรัพยากร</p>
        </div>

        <nav className="flex-1 space-y-3 overflow-y-auto pr-1">
          {navGroups.map((group, groupIndex) => (
            <div key={`group-${groupIndex}`} className="space-y-1">
              {group.title ? (
                <p className="px-sm pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-secondary">
                  {group.title}
                </p>
              ) : null}
              {group.items
                .filter((item) => !item.ownerOnly || isOwner)
                .map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "#" &&
                    item.href !== "/" &&
                    pathname.startsWith(`${item.href}/`));

                if (isActive) {
                  return (
                    <Link
                      key={item.label}
                      className="flex items-center gap-sm rounded-lg border-r-4 border-primary bg-surface-container-low px-sm py-2.5 font-bold transition-colors duration-200"
                      href={item.href}
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
                      <span className="font-label-md text-[14px] text-primary dark:text-white">
                        {item.label}
                      </span>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    className="flex items-center gap-sm rounded-lg px-sm py-2.5 font-medium text-on-surface transition-colors duration-200 hover:bg-surface-container-low"
                    href={item.href}
                    onClick={() => {
                      if (!isDesktop) setIsSidebarOpen(false);
                    }}
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    <span className="font-label-md text-[14px]">{item.label}</span>
                  </Link>
                );
                })}
            </div>
          ))}
        </nav>
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
      <header className={`h-14 fixed top-0 right-0 z-40 bg-surface-container-lowest dark:bg-surface-container-lowest border-b border-outline-variant flex items-center justify-between transition-all duration-300 ease-in-out px-md w-full ml-0 ${isSidebarOpen ? "lg:w-[calc(100%-224px)] lg:ml-[224px]" : ""}`}>
        <div className="flex items-center gap-sm w-1/3">
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
          <div className={`relative w-full max-w-sm ${pathname === "/assets" ? "hidden sm:block" : ""}`}>
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface">
              search
            </span>
            <input
              className="w-full rounded-full border-none bg-surface-container-low py-1.5 pl-10 pr-4 text-[14px] text-on-surface outline-none focus:ring-2 focus:ring-primary"
              placeholder="ค้นหารายการสินค้า..."
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {pathname === "/assets" ? (
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center leading-none sm:hidden">
            <p className="text-[24px] font-black tracking-tight text-primary">KRC</p>
            <p className="mt-0.5 text-[8px] font-black tracking-[0.12em] text-primary">ERP</p>
          </div>
        ) : null}

        <div className="flex items-center gap-sm">
          <div className={`items-center gap-sm ${pathname === "/assets" ? "hidden sm:flex" : "flex"}`}>
            <button
              className="rounded-full p-1.5 transition-colors active:opacity-80 cursor-pointer hover:bg-surface-container-low"
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
                key={`${userId}:${initialNotifications[0]?.id ?? 0}:${initialUnreadNotificationCount}`}
                userId={userId}
              />
            ) : null}
            <button
              className="flex items-center justify-center rounded-full p-1.5 transition-colors active:opacity-80 cursor-pointer hover:bg-surface-container-low"
              onClick={() => setIsHelpOpen(true)}
              type="button"
              title="คู่มือการใช้งานหน้านี้"
            >
              <span className="material-symbols-outlined text-on-surface">help</span>
            </button>
          </div>
          <div className={`h-7 w-[1px] bg-outline-variant ${pathname === "/assets" ? "hidden sm:block" : ""}`}></div>
          
          {/* Profile Dropdown Container */}
          <div className="relative">
            <div
              onClick={(e) => {
                e.stopPropagation();
                setIsProfileDropdownOpen(!isProfileDropdownOpen);
              }}
              className="flex items-center gap-sm rounded-lg p-1 transition-colors cursor-pointer select-none hover:bg-surface-container-low"
            >
              <div className="text-right hidden sm:block">
                <p className="font-label-md text-label-md text-on-surface uppercase">{username}</p>
                <p className="text-[10px] text-on-surface font-medium opacity-80">ระบบ ERP ส่วนกลาง</p>
              </div>
              {pathname === "/assets" ? (
                <span className="grid size-8 place-items-center rounded-full bg-primary text-[13px] font-bold text-white sm:hidden">
                  {(username || "N").slice(0, 1).toUpperCase()}
                </span>
              ) : null}
              <Image
                alt="รูปโปรไฟล์ผู้ใช้งาน"
                className={`h-9 w-9 rounded-full border border-outline-variant object-cover ${pathname === "/assets" ? "hidden sm:block" : ""}`}
                height={36}
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCcygaRfElQ06QZyPiPPL-JX73wzUaDJRbPmKS_1OrGkbI0LHqc2N_Uvul9Pk7jQ789ZS6g0fzm0mdu0wq-C35OQPN_87I19Y4U8EtkvXVM8aEp1Jiq2Q5BIpsohvamKaWSjOUn1XL6DrgvB6pNXb6YFfNPlQCh0Y2UgLt3wSjN62xTbyYbUtylH9oKkn6jNPcazHLVX7tmLY7OQue4vncgpvWqBIZsicG3lvsRL4Xs6Z4JSYdHAtFHytFW-7Nz22_muKeavD81pI3D"
                unoptimized
                width={36}
              />
            </div>

            {/* Dropdown Menu */}
            {isProfileDropdownOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-12 w-56 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg py-sm z-50 animate-in fade-in slide-in-from-top-2 duration-150"
              >
                <div className="px-md py-sm border-b border-outline-variant">
                  <p className="text-[10px] text-secondary font-medium tracking-wider uppercase opacity-70">
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
        className={`fixed top-14 right-0 z-30 h-9 border-b border-outline-variant bg-surface-container-low/70 px-md backdrop-blur-sm transition-all duration-300 ease-in-out w-full ml-0 ${pathname === "/assets" ? "hidden sm:block" : ""} ${isSidebarOpen ? "lg:w-[calc(100%-224px)] lg:ml-[224px]" : ""}`}
      >
        <div className="flex h-full items-stretch overflow-x-auto">
          {workspaceTabs.map((tab) => {
            const isActive = activeWorkspaceHref === tab.href;

            return (
              <div
                key={tab.href}
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
                  onClick={() => router.push(tab.href)}
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
      <main className={`${pathname === "/assets" ? "pt-14 sm:pt-[92px]" : "pt-[92px]"} min-h-screen bg-background transition-all duration-300 ease-in-out ml-0 ${isSidebarOpen ? "lg:ml-[224px]" : ""}`}>
        <div className="p-md">
          {pathname === "/workspace" ? (
            <section className="flex min-h-[calc(100vh-9rem)] items-center justify-center rounded-2xl border border-dashed border-outline-variant/70 bg-surface-container-lowest/50">
              <div className="max-w-md space-y-sm px-xl text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-container-low text-primary">
                  <span className="material-symbols-outlined text-[32px]">tab_group</span>
                </div>
                <h2 className="text-[20px] font-bold text-on-surface">ยังไม่มีแท็บที่เปิดอยู่</h2>
                <p className="text-sm leading-6 text-secondary">
                  เลือกเมนูจากด้านซ้ายเพื่อเปิดหน้าทำงานใหม่ ระบบจะแสดงเป็นแท็บด้านบนให้สลับไปมาได้
                </p>
              </div>
            </section>
          ) : (
            children
          )}
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
        <HelpModal pathname={pathname} onClose={() => setIsHelpOpen(false)} />
      )}
    </div>
  );
}

interface HelpModalProps {
  pathname: string;
  onClose: () => void;
}

type HelpCategory = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  subtopics: Array<{
    content: React.ReactNode;
    icon: React.ComponentType<{ className?: string }>;
    id: string;
    partnerTab?: "customer" | "shared" | "vendor";
    title: string;
  }>;
  title: string;
};

function HelpModal({ pathname, onClose }: HelpModalProps) {
  const renderText = (text: string) => {
    const boldParts = text.split(/\*\*([^*]+)\*\*/g);

    return boldParts.map((part, idx) => {
      if (idx % 2 === 1) {
        return (
          <strong key={`b-${idx}`} className="font-bold text-on-surface">
            {part}
          </strong>
        );
      }

      const codeParts = part.split(/`([^`]+)`/g);

      return codeParts.map((subPart, subIdx) => {
        if (subIdx % 2 === 1) {
          return (
            <code
              key={`c-${idx}-${subIdx}`}
              className="bg-surface-container-high dark:bg-white/10 px-1 py-0.5 rounded border border-outline-variant dark:border-white/5 font-mono text-xs font-semibold text-primary"
            >
              {subPart}
            </code>
          );
        }

        return subPart;
      });
    });
  };

  const categories: HelpCategory[] = [
    {
      id: "products",
      title: "ข้อมูลสินค้า",
      icon: Package,
      subtopics: [
        {
          id: "add_product",
          title: "วิธีเพิ่มสินค้าใหม่",
          icon: PlusCircle,
          content: (
            <div className="space-y-md">
              <div>
                <h4 className="font-bold text-on-surface text-sm">1. เปิดหน้าต่างเพิ่มสินค้า</h4>
                <p className="text-secondary text-[13px] leading-relaxed mt-xs">
                  คลิกปุ่ม {renderText("`+` (เพิ่มชิ้นส่วนใหม่)")} ที่มุมขวาบนสุดของหน้าจอ เพื่อเปิดฟอร์มสำหรับกรอกข้อมูลสินค้าใหม่ครับ
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">2. กรอกข้อมูลสำคัญให้ครบถ้วน</h4>
                <p className="text-secondary text-[13px] leading-relaxed mt-xs">
                  ข้อมูลที่จำเป็นต้องใส่ (มีเครื่องหมาย *) คือ {renderText("`หมายเลขชิ้นส่วน (Part Number)`")} และ {renderText("`ชื่อชิ้นงาน (Part Name)`")} สองช่องนี้ห้ามเว้นว่างเด็ดขาดนะครับ
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">3. เลือกเกรดวัสดุและใส่ข้อมูลการผลิต</h4>
                <p className="text-secondary text-[13px] leading-relaxed mt-xs">
                  เลือกเกรดเหล็กจากตัวเลือก (ดึงมาจากข้อมูลเกรดเหล็กหลัก) จากนั้นระบุรายละเอียด เช่น {renderText("`จำนวนแผ่นวัตถุดิบ (Sheet Count)`")} หรือ {renderText("`จำนวนชิ้นต่อแผ่น`")} เพื่อใช้คำนวณสเปกและปริมาณวัตถุดิบในการปั๊มชิ้นงานให้แม่นยำ
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">4. อัปโหลดรูป Drawing ทางเทคนิค</h4>
                <p className="text-secondary text-[13px] leading-relaxed mt-xs">
                  คลิกปุ่มเลือกไฟล์รูปภาพ Drawing (รองรับไฟล์ทั่วไป เช่น PNG หรือ JPG) จากเครื่องคอมพิวเตอร์ของคุณ เพื่ออัปโหลดเก็บบันทึกเข้าระบบ
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">5. กำหนดราคาขายกลางและบันทึกข้อมูล</h4>
                <p className="text-secondary text-[13px] leading-relaxed mt-xs">
                  กรอก {renderText("`ราคาทุนกลาง`")} และ {renderText("`ราคาขายกลาง`")} (เพื่อใช้เป็นราคากลางอ้างอิงตอนที่เราเอาไปทำระบบผูกราคากับลูกหนี้/ลูกค้าแต่ละคนในหน้าจัดการราคาถัดไป) เมื่อเรียบร้อยแล้วให้กดปุ่ม {renderText("`บันทึกข้อมูลชิ้นงาน`")} ได้ทันทีเลยครับ
                </p>
              </div>
            </div>
          ),
        },
        {
          id: "view_drawing",
          title: "วิธีเปิดดูรูป Drawing",
          icon: Eye,
          content: (
            <div className="space-y-md">
              <div>
                <h4 className="font-bold text-on-surface text-sm">1. เปิดขยายภาพ Drawing ขนาดใหญ่</h4>
                <p className="text-secondary text-[13px] leading-relaxed mt-xs">
                  เลื่อนตารางข้อมูลสินค้าไปขวาสุด ในคอลัมน์การจัดการจะมีปุ่มไอคอนรูปดวงตา {renderText("`visibility`")} ให้คลิกเพื่อเปิดดูภาพ Drawing ได้ทันทีครับ
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">2. เคล็ดลับเลื่อนดูรูปชิ้นงานอื่นได้ทันที</h4>
                <p className="text-secondary text-[13px] leading-relaxed mt-xs">
                  เมื่อเปิดหน้าป๊อปอัปภาพขึ้นมาแล้ว คุณไม่จำเป็นต้องกดปิดเพื่อไปเปิดดูชิ้นอื่นนะครับ สามารถกดปุ่มลูกศร {renderText("`ซ้าย (←)`")} หรือ {renderText("`ขวา (→)`")} บนแป้นพิมพ์ หรือคลิกที่ปุ่มลูกศรในหน้าจอเพื่อสไลด์เลื่อนดูรูปสินค้าชิ้นก่อนหน้าหรือชิ้นถัดไปได้ทันทีเลยครับ สะดวกมากๆ
                </p>
              </div>
            </div>
          ),
        },
        {
          id: "edit_product",
          title: "วิธีแก้ไขและระงับใช้งานสินค้า",
          icon: Edit,
          content: (
            <div className="space-y-md">
              <div>
                <h4 className="font-bold text-on-surface text-sm">1. แก้ไขสเปกและรายละเอียดชิ้นงาน</h4>
                <p className="text-secondary text-[13px] leading-relaxed mt-xs">
                  คลิกที่ปุ่มดินสอสีเทา {renderText("`edit`")} ที่อยู่ท้ายแถวตารางสินค้าแถวที่ต้องการ เพื่อเปิดหน้าต่างฟอร์มสำหรับแก้ไขรายละเอียดชิ้นงานนั้นๆ ครับ
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">2. วิธีสลับสถานะเพื่อระงับการใช้งาน</h4>
                <p className="text-secondary text-[13px] leading-relaxed mt-xs">
                  หากตัวสินค้าชิ้นนี้ยกเลิกการผลิตหรืออยากซ่อนชั่วคราว ให้เปลี่ยนตัวเลือกสถานะสินค้าเป็น {renderText("`ระงับการใช้งาน`")} แล้วกดบันทึก สินค้าตัวนี้จะถูกซ่อนจากรายการเลือกในหน้าจออื่นๆ ทันที
                </p>
              </div>
            </div>
          ),
        },
        {
          id: "delete_product",
          title: "วิธีลบข้อมูลชิ้นงานสินค้า",
          icon: Trash2,
          content: (
            <div className="space-y-md">
              <div>
                <h4 className="font-bold text-on-surface text-sm">1. ดำเนินการลบข้อมูล</h4>
                <p className="text-secondary text-[13px] leading-relaxed mt-xs">
                  คลิกปุ่มถังขยะสีแดง {renderText("`delete`")} ท้ายแถวสินค้าที่ต้องการจะลบ
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">2. ตรวจสอบและกดยืนยันการลบ</h4>
                <p className="text-secondary text-[13px] leading-relaxed mt-xs">
                  ระบบจะมีกล่องป๊อปอัปแจ้งเตือนสีแดงขึ้นมาเพื่อความปลอดภัย ให้ตรวจสอบหมายเลขชิ้นส่วน (Part Number) ให้มั่นใจว่าตรงชิ้น แล้วค่อยกดปุ่ม {renderText("`ยืนยันการลบ`")} เพื่อทำการลบข้อมูลออกจากระบบอย่างถาวรนะครับ
                </p>
              </div>
            </div>
          ),
        },
        {
          id: "fields_glossary",
          title: "ความหมายของข้อมูลแต่ละช่อง (Field)",
          icon: BookOpen,
          content: (
            <div className="space-y-sm">
              <h4 className="font-bold text-on-surface text-sm">คำอธิบายรายละเอียดแต่ละช่องข้อมูลในตารางสินค้า</h4>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ชื่อช่องข้อมูล</th>
                      <th className="px-sm py-xs text-left">คำอธิบายภาษาคนเข้าใจง่าย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "ลำดับ", desc: "เลขลำดับรายการที่แสดงในหน้าปัจจุบัน ใช้ช่วยไล่ดูข้อมูลในตารางได้ง่ายขึ้น" },
                      { name: "รหัสสินค้า (ERP Code)", desc: "รหัสสินค้าอ้างอิงตามระบบบัญชีหรือระบบ ERP ของโรงงาน KRC" },
                      { name: "หมายเลขชิ้นส่วน (Part Number)", desc: "หมายเลขพาร์ทชิ้นส่วนดิบทางเทคนิคหรือรหัสแบบ Drawing ที่ใช้ในไลน์ผลิต" },
                      { name: "ชื่อชิ้นงาน (Part Name)", desc: "ชื่อเรียกของชิ้นงานหรือชิ้นส่วนพาร์ทเหล็กปั๊ม เพื่อสื่อสารให้เข้าใจตรงกัน" },
                      { name: "เกรดวัสดุ (Material Grade)", desc: "เกรดวัสดุหลักของสินค้าสำเร็จรูป เช่น SPCC, SPHC-P/O หรือ SS400 โดยดึงจากหน้าตั้งค่าวัตถุดิบ" },
                      { name: "หน่วยนับ", desc: "หน่วยที่ใช้ในการเก็บสต็อก นับจำนวน และอ้างอิงในเอกสารของระบบ เช่น ชิ้น หรือ ชุด" },
                      { name: "รูปเขียนแบบ", desc: "รูปสินค้า หรือรูป Drawing ที่ใช้ช่วยตรวจสอบหน้าตาชิ้นงานก่อนเปิดดูรายละเอียดเพิ่มเติม" },
                      { name: "การจัดการ", desc: "ปุ่มคำสั่งประจำรายการ ใช้สำหรับดูรายละเอียด แก้ไขข้อมูล หรือลบสินค้า" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          id: "tech_notes",
          title: "เทคนิคและเคล็ดลับการใช้งานตาราง",
          icon: Lightbulb,
          content: (
            <div className="space-y-md">
              <div>
                <h4 className="font-bold text-on-surface text-sm">1. ช่องค้นหาข้อมูลด่วนแบบอัจฉริยะ</h4>
                <p className="text-secondary text-[13px] leading-relaxed mt-xs">
                  คุณสามารถพิมพ์แค่บางคำหรือบางส่วนของรหัสสินค้า (ERP Code) หมายเลขชิ้นส่วน (Part Number) หรือรุ่นรถลงในช่องค้นหาด้านบน ตารางจะรีบกรองผลลัพธ์ให้เห็นทันใจเลยครับ
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">2. ขยายพื้นที่การดูตารางสินค้าให้กว้างขึ้น</h4>
                <p className="text-secondary text-[13px] leading-relaxed mt-xs">
                  ถ้าหน้าจอตารางสินค้าดูเบียดเกินไป ให้ลองคลิกปุ่มขีดสามเส้นที่อยู่ตรงด้านซ้ายบนสุดของระบบ เมนูแถบด้านข้างจะพับเก็บเข้าไปชั่วคราว ทำให้เหลือพื้นที่แสดงผลตารางกว้างและสะดวกขึ้นมากเลยครับ
                </p>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "partners",
      title: "คู่ค้า",
      icon: BookOpen,
      subtopics: [
        {
          id: "partner_overview",
          title: "หน้านี้ใช้ทำอะไร",
          icon: Info,
          partnerTab: "shared",
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                หน้าคู่ค้าใช้เก็บข้อมูลผู้ขายหรือเจ้าหนี้ของระบบ เพื่อให้ข้อมูลชุดเดียวกันถูกนำไปใช้ต่อในงานจัดซื้อ เอกสาร PR/PO การออกเอกสาร และการอ้างอิงที่อยู่หรือข้อมูลภาษีได้อย่างถูกต้อง
              </p>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ส่วนของหน้า</th>
                      <th className="px-sm py-xs text-left">หน้าที่การใช้งาน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "ปุ่มเพิ่ม / ส่งออก Excel", desc: "ใช้เพิ่มข้อมูลคู่ค้าใหม่ และส่งออกรายการคู่ค้าออกไปใช้งานภายนอกระบบ" },
                      { name: "ตารางคู่ค้า", desc: "ใช้ดูรายการคู่ค้าทั้งหมดแบบสรุป โดยแสดงเฉพาะข้อมูลหลักที่ใช้ค้นหาและตรวจสอบได้เร็ว" },
                      { name: "ปุ่มจัดการ", desc: "ใช้ดูรายละเอียด แก้ไข หรือลบข้อมูลคู่ค้าแต่ละราย" },
                      { name: "หน้ารายละเอียด / ฟอร์มเพิ่มแก้ไข", desc: "ใช้ดูข้อมูลเต็มของคู่ค้า เช่น เครดิตเทอม ภาษี วิธีชำระเงิน ผู้ติดต่อ และรายการที่อยู่หลายชุด" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          id: "partner_flow",
          title: "ขั้นตอนเพิ่มคู่ค้า",
          icon: PlusCircle,
          partnerTab: "vendor",
          content: (
            <div className="space-y-md">
              <div>
                <h4 className="font-bold text-on-surface text-sm">1. เปิดฟอร์มเพิ่มคู่ค้า</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  กดปุ่มเพิ่มคู่ค้า แล้วเริ่มจากกรอกชื่อผู้ขาย เลขผู้เสียภาษี สาขา และกลุ่มผู้ขายก่อน
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">2. เลือกค่ามาตรฐานจาก dropdown</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  เลือกกลุ่มผู้ขาย เครดิตเทอม วิธีชำระเงิน และประเภทภาษีจากรายการตั้งค่าที่มีอยู่ในระบบ เพื่อให้ข้อมูลไปในมาตรฐานเดียวกัน
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">3. เพิ่มที่อยู่ตามการใช้งานจริง</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  เพิ่มที่อยู่ออกเอกสารและที่อยู่จัดส่งแยกกันได้ เพื่อให้เลือกใช้ต่อในเอกสารแต่ละประเภท
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">4. ตรวจสอบสถานะก่อนบันทึก</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ถ้าคู่ค้ารายนี้ยังใช้งานอยู่ ให้เปิดสถานะเป็นใช้งาน แล้วค่อยบันทึกข้อมูลเข้าระบบ
                </p>
              </div>
            </div>
          ),
        },
        {
          id: "customer_flow",
          title: "การใช้งานแท็บลูกหนี้ / ลูกค้า",
          icon: Compass,
          partnerTab: "customer",
          content: (
            <div className="space-y-md">
              <div>
                <h4 className="font-bold text-on-surface text-sm">1. ใช้แท็บบนหน้าเดียวกัน</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ในหน้า <strong>คู่ค้า</strong> จะมี 2 แท็บ คือ <code>ผู้ขาย / เจ้าหนี้</code> และ <code>ลูกหนี้ / ลูกค้า</code> ให้สลับไปทำงานได้ทันทีโดยไม่ต้องออกจากหน้าเดิม
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">2. ฟอร์มลูกค้าใช้โครงสร้างเดียวกับผู้ขาย</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ระบบจะแยกข้อมูลเป็นข้อมูลหลักลูกค้า ข้อมูลภาษีและการวางบิล ข้อมูลติดต่อ และตารางที่อยู่ลูกค้า เพื่อให้กรอกข้อมูลได้ครบก่อนนำไปใช้ในใบเสนอราคา ใบแจ้งหนี้ และใบกำกับภาษี
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">3. ที่อยู่ลูกค้ามีได้หลายชุด</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  สามารถเพิ่มหลายที่อยู่ เช่น ที่อยู่ออกเอกสาร และที่อยู่จัดส่ง แล้วตั้งค่าให้รายการใดเป็นค่าเริ่มต้นได้
                </p>
              </div>
            </div>
          ),
        },
        {
          id: "partner_table_fields",
          title: "ความหมายของข้อมูลแต่ละช่อง (Field)",
          icon: BookOpen,
          partnerTab: "shared",
          content: (
            <div className="space-y-sm">
              <h4 className="font-bold text-on-surface text-sm">คำอธิบายรายละเอียดแต่ละช่องข้อมูลในตารางคู่ค้า</h4>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ชื่อช่องข้อมูล</th>
                      <th className="px-sm py-xs text-left">คำอธิบายภาษาคนเข้าใจง่าย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "ลำดับ", desc: "เลขลำดับรายการที่แสดงในหน้าปัจจุบัน ใช้ช่วยไล่ดูข้อมูลในตารางได้เร็วขึ้น" },
                      { name: "รหัส", desc: "รหัสคู่ค้าของระบบ เช่น SUP001 ใช้เป็นรหัสอ้างอิงหลักเวลาไปใช้ต่อในเอกสาร" },
                      { name: "ชื่อผู้ขาย / ชื่อลูกค้า", desc: "ชื่อบริษัทหรือชื่อคู่ค้าที่ใช้จริงในเอกสารซื้อขาย" },
                      { name: "กลุ่มผู้ขาย / ประเภทลูกค้า", desc: "หมวดของคู่ค้าเพื่อช่วยกรองและจัดกลุ่มข้อมูลให้ตรงกับการใช้งาน" },
                      { name: "เลขภาษี", desc: "เลขประจำตัวผู้เสียภาษีของคู่ค้า ใช้ในเอกสารภาษีและการตรวจสอบข้อมูลนิติบุคคล" },
                      { name: "สาขา", desc: "สาขาที่ออกเอกสาร เช่น สำนักงานใหญ่ หรือสาขาย่อย" },
                      { name: "สถานะ", desc: "บอกว่าคู่ค้ารายนั้นยังเปิดใช้งานอยู่หรือถูกระงับไว้ชั่วคราว" },
                      { name: "จัดการ", desc: "ปุ่มคำสั่งสำหรับดูรายละเอียด แก้ไข หรือลบข้อมูลคู่ค้าแต่ละราย" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          id: "partner_form_fields",
          title: "ความหมายของช่องในฟอร์มคู่ค้า",
          icon: Lightbulb,
          partnerTab: "shared",
          content: (
            <div className="space-y-sm">
              <h4 className="font-bold text-on-surface text-sm">คำอธิบายช่องหลักในฟอร์มเพิ่มและแก้ไขคู่ค้า</h4>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ชื่อช่องข้อมูล</th>
                      <th className="px-sm py-xs text-left">คำอธิบายภาษาคนเข้าใจง่าย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "ชื่อผู้ขาย / ชื่อลูกค้า", desc: "ชื่อบริษัทหรือชื่อคู่ค้าที่จะใช้ในเอกสารจริง" },
                      { name: "กลุ่มผู้ขาย / ประเภทลูกค้า", desc: "ใช้จัดประเภทคู่ค้าเพื่อให้เลือกใช้งานและกรองข้อมูลได้ง่ายขึ้น" },
                      { name: "เลขผู้เสียภาษี / สาขา", desc: "ใช้เก็บข้อมูลภาษีที่ต้องอ้างอิงในเอกสารและการออกใบกำกับ" },
                      { name: "เครดิตเทอม", desc: "จำนวนวันเครดิตที่ใช้เป็นค่าเริ่มต้นของคู่ค้ารายนี้ในเอกสาร" },
                      { name: "วิธีชำระเงิน", desc: "รูปแบบการจ่ายเงินให้คู่ค้า เช่น โอน เงินสด หรือเช็ค โดยใช้ในฝั่งผู้ขาย" },
                      { name: "ประเภทภาษี", desc: "กำหนดว่าเอกสารของคู่ค้ารายนี้คิด VAT แบบไหน" },
                      { name: "ชื่อผู้ติดต่อ / เบอร์โทร / อีเมล", desc: "ใช้เก็บข้อมูลผู้ประสานงานของคู่ค้าเพื่อติดต่อในการสั่งซื้อและติดตามงาน" },
                      { name: "ที่อยู่ผู้ขาย / ที่อยู่ลูกค้า", desc: "สามารถมีหลายรายการ เพื่อแยกที่อยู่ออกเอกสาร ที่อยู่จัดส่ง หรือที่ใช้งานเฉพาะกรณี" },
                      { name: "หมายเหตุ", desc: "ใช้บันทึกข้อมูลเสริมที่ทีมงานควรรู้ แต่ไม่เหมาะจะเก็บไว้ในช่องหลัก" },
                      { name: "สถานะใช้งาน", desc: "ใช้เปิดหรือปิดการใช้งานคู่ค้าโดยไม่ต้องลบข้อมูลทิ้ง" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "partner-settings",
      title: "ตั้งค่าคู่ค้า",
      icon: Layers,
      subtopics: [
        {
          id: "partner_settings_overview",
          title: "หน้านี้ใช้ทำอะไร",
          icon: Info,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                หน้านี้ใช้จัดการค่าเริ่มต้นกลางที่ต้องนำไปเลือกในฟอร์มหน้าคู่ค้าและเอกสารสั่งซื้อต่าง ๆ ระบบจะแบ่งเป็น **5 แท็บย่อย** เพื่อให้สามารถป้อนข้อมูลได้อย่างรวดเร็วและเป็นไปตามระเบียบมาตรฐานเดียวกันของบริษัท KRC ครับ
              </p>
            </div>
          ),
        },
        {
          id: "partner_settings_tabs",
          title: "รายละเอียดการใช้งานในแต่ละแท็บย่อย (5 แท็บ)",
          icon: BookOpen,
          content: (
            <div className="space-y-md">
              <div>
                <h4 className="font-bold text-on-surface text-sm">1. แท็บ &quot;กลุ่มผู้ขาย&quot; (Vendor Groups)</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ใช้สืบค้นและจัดหมวดคู่ค้าเพื่อแยกความแตกต่างในการทำบัญชีและการกรองรายงาน เช่น กลุ่มจัดหาเหล็กม้วน (Coil Steel Vendor), กลุ่มจัดหาบรรจุภัณฑ์ (Packaging), หรือกลุ่มขนส่งเหล็กแผ่น
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">2. แท็บ &quot;ประเภทลูกค้า&quot; (Customer Types)</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ใช้แบ่งประเภทธุรกิจของฝั่งลูกหนี้ผู้รับจ้างปั๊มเหล็กหรือจำหน่ายอะไหล่ เช่น ลูกค้าแบบ OEM (รับจ้างผลิตตามแบบชิ้นส่วนรถยนต์), ลูกค้าทั่วไป (Retailer), หรือลูกค้าเฉพาะโครงการ (Project-Based)
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">3. แท็บ &quot;เครดิตเทอม&quot; (Credit Terms)</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ใช้ระบุเครดิตจำนวนวันชำระเงินมาตรฐาน (ป้อนเป็นจำนวนวัน เช่น 30 วัน, 60 วัน, หรือ 90 วัน) เมื่อผูกคู่ค้าคนนี้เข้าในเอกสาร PO ระบบจะนำจำนวนวันเครดิตนี้ไปบวกกับวันที่เอกสารเพื่อคำนวณหา <strong>&quot;วันครบกำหนดชำระ (Due Date)&quot;</strong> ให้พนักงานบัญชีและการเงินอัตโนมัติ
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">4. แท็บ &quot;วิธีชำระเงิน&quot; (Payment Methods)</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  กำหนดตัวเลือกช่องทางจ่ายเงินที่เป็นมาตรฐานของบริษัท เช่น การโอนเงินผ่านธนาคาร (Bank Transfer), จ่ายด้วยเช็คสั่งจ่ายล่วงหน้า (Cheque), หรือเงินสดสำรองจ่าย (Cash)
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">5. แท็บ &quot;ประเภทภาษี&quot; (Tax Types)</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ใช้ควบคุมพฤติกรรมการคิดราคาสินค้าในเอกสารและใบส่งของ เช่น <strong>แยกนอก (Exclude VAT 7%)</strong>, <strong>รวมใน (Include VAT 7%)</strong>, หรือ <strong>ได้รับการยกเว้นภาษีมูลค่าเพิ่ม (Non-VAT)</strong> เพื่อคำนวณราคาสรุปสุดท้ายได้ตรงตามเอกสารใบกำกับภาษีจริงของคู่ค้า
                </p>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "materials",
      title: "ตั้งค่าวัตถุดิบ",
      icon: Layers,
      subtopics: [
        {
          id: "materials_settings_overview",
          title: "หน้านี้ใช้ทำอะไร",
          icon: Info,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                หน้านี้ใช้ตั้งค่าค่าเริ่มต้นของวัตถุดิบและเกรดวัสดุสำหรับสั่งซื้อเหล็กดิบ เพื่อให้นำไปดึงสเปกปั๊มเหล็กและผูกสูตรสินค้าสำเร็จรูปได้ถูกต้อง โดยแบ่งการตั้งค่าเป็น **3 แท็บหลัก** ครับ
              </p>
            </div>
          ),
        },
        {
          id: "materials_settings_tabs",
          title: "รายละเอียดการใช้งานในแต่ละแท็บย่อย (3 แท็บ)",
          icon: BookOpen,
          content: (
            <div className="space-y-md">
              <div>
                <h4 className="font-bold text-on-surface text-sm">1. แท็บ &quot;กลุ่มวัตถุดิบ&quot; (Material Groups)</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ใช้แบ่งประเภทวัตถุดิบในโรงงานตามลักษณะกายภาพ เช่น เหล็กม้วนดิบ (Coil Steel), เหล็กแผ่นตัดย่อย (Sheet Steel), หรืออะไหล่ตัวยึดประกอบ เพื่อช่วยพนักงานจัดกลุ่มสต็อกและรายงานการรับส่งวัตถุดิบเข้าคลัง
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">2. แท็บ &quot;เกรดวัสดุ&quot; (Material Grades)</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  เป็นส่วนจัดระดับเกรดวัสดุมาตรฐานของอุตสาหกรรมโลหะและเหล็กแผ่น เช่น SPHC-P/O (เหล็กแผ่นรีดร้อนชุบน้ำมันป้องกันสนิม), SPCC (เหล็กแผ่นรีดเย็น), หรือ SS400 (เหล็กรูปพรรณทั่วไป) สำหรับพนักงานจัดซื้อดึงไปใช้สร้างรายละเอียดสินค้า
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">3. แท็บ &quot;หน่วยนับ&quot; (Units of Measure)</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ตั้งค่าสัญลักษณ์และหน่วยวัดนับสินค้า เช่น ชิ้น (Pcs), กิโลกรัม (Kg), แผ่น (Sheet) หรือม้วน (Coil) โดยผู้ใช้สามารถเปิดสลับสวิตช์ <strong>&quot;ยอมรับตัวเลขทศนิยม (Allows Decimal)&quot;</strong> ได้ เพื่อให้สต็อกสามารถนับน้ำหนักที่มีจุดทศนิยมได้ตามจริง เช่น ชิ้นงานเป็นจำนวนเต็มชิ้น แต่เหล็กแผ่นเบิกชั่งน้ำหนักมีทศนิยมครับ
                </p>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "pr",
      title: "ใบขอซื้อ (PR)",
      icon: FileText,
      subtopics: [
        {
          id: "pr_overview",
          title: "หน้านี้ใช้ทำอะไร",
          icon: Info,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                หน้าใบขอซื้อ (Purchase Requisition - PR) ใช้สำหรับให้แผนกต่างๆ เสนอความต้องการซื้อสินค้าหรือวัตถุดิบดิบเข้ามาในระบบ เพื่อส่งขออนุมัติงบประมาณและรายละเอียดก่อนที่จะนำไปทำใบสั่งซื้อจริงต่อไปครับ
              </p>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ส่วนของหน้า</th>
                      <th className="px-sm py-xs text-left">หน้าที่การใช้งาน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "ปุ่มสร้างใบขอซื้อ", desc: "คลิกเพื่อเปิดหน้าต่างกรอกเอกสารใบขอซื้อใบใหม่" },
                      { name: "ตารางรายการ PR", desc: "แสดงใบ PR ทั้งหมดในระบบ สามารถค้นหาด่วนตามแผนก ผู้ขอซื้อ หรือสถานะของเอกสารได้" },
                      { name: "ปุ่มพิมพ์ใบขอซื้อ", desc: "ไอคอนเครื่องพิมพ์ท้ายตาราง ใช้เพื่อเปิดตัวอย่างก่อนพิมพ์และสั่งพิมพ์ออกกระดาษ" },
                      { name: "ปุ่มแก้ไขเอกสาร", desc: "ไอคอนดินสอ สำหรับเข้าไปแก้ไขข้อมูลเดิม (ในกรณีสถานะร่าง) หรือใช้เพื่อกดดูข้อมูลแบบจำกัดการแก้ไข" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          id: "pr_flow",
          title: "ขั้นตอนการสร้างใบขอซื้อ (PR)",
          icon: PlusCircle,
          content: (
            <div className="space-y-md">
              <div>
                <h4 className="font-bold text-on-surface text-sm">1. เปิดฟอร์มและเลือกวันที่ต้องการใช้</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  คลิกปุ่ม {renderText("`+ สร้างใบขอซื้อ (PR)`")} ที่มุมขวาบน เลือกวันที่ต้องการใช้ของจริง (Min วันที่วันนี้เป็นอย่างน้อย) ส่วนแผนกและชื่อผู้ขอซื้อจะดึงจากบัญชีปัจจุบันให้อัตโนมัติครับ
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">2. เพิ่มและระบุจำนวนวัตถุดิบ</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  คลิกที่ปุ่ม {renderText("`ค้นหาวัตถุดิบ`")} หรือ {renderText("`เพิ่มแถวเปล่า`")} เพื่อเลือกเกรดเหล็ก จากนั้นระบุจำนวนที่ต้องการสั่งและพิมพ์หมายเหตุระบุความจำเป็นประจำแถว
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">3. เขียนวัตถุประสงค์และบันทึก</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ใส่เหตุผลในช่อง {renderText("`วัตถุประสงค์ในการขอซื้อ`")} เพื่อประกอบการอนุมัติ จากนั้นกดปุ่ม {renderText("`บันทึกร่าง`")} หรือกด {renderText("`ส่งอนุมัติ`")} เพื่อส่งให้ผู้อนุมัติดำเนินการตรวจสอบ
                </p>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "po",
      title: "ใบสั่งซื้อ (PO)",
      icon: ShoppingCart,
      subtopics: [
        {
          id: "po_overview",
          title: "หน้านี้ใช้ทำอะไร",
          icon: Info,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                หน้าใบสั่งซื้อ (Purchase Order - PO) ใช้สำหรับสั่งซื้อวัตถุดิบจริงกับคู่ค้า/ผู้ขาย โดยดึงข้อมูลรายการที่ผ่านการขอซื้อและอนุมัติจากขั้นตอน PR มาดำเนินการต่อ เพื่อจัดทำราคารวมส่วนลด ภาษี และส่งออกเป็นใบสั่งซื้อที่เป็นทางการ
              </p>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ส่วนของหน้า</th>
                      <th className="px-sm py-xs text-left">หน้าที่การใช้งาน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "ปุ่มสร้างใบสั่งซื้อ", desc: "ใช้สร้างเอกสารสั่งผลิต/จัดซื้อใบใหม่" },
                      { name: "ตารางรายการ PO", desc: "แสดงใบสั่งซื้อทั้งหมดในระบบ สามารถค้นหาด่วนตามหมายเลขผู้ขาย หรือสถานะ PO ได้" },
                      { name: "ปุ่มพิมพ์ใบสั่งซื้อ", desc: "พิมพ์เอกสารใบ PO อย่างเป็นทางการในรูปแบบ A4 หรือ A5 พร้อมรายละเอียดราคารวมส่วนลดและเงื่อนไข" },
                      { name: "ปุ่มดูรายละเอียด", desc: "ไอคอนดินสอ สำหรับเข้าดูรายละเอียดใบสั่งซื้อในโหมดอ่านข้อมูลอย่างเดียวเพื่อความปลอดภัย" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          id: "po_flow",
          title: "ขั้นตอนการสร้างใบสั่งซื้อ (PO)",
          icon: PlusCircle,
          content: (
            <div className="space-y-md">
              <div>
                <h4 className="font-bold text-on-surface text-sm">1. กำหนดข้อมูลคู่ค้าและวันส่งของ</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  คลิกปุ่ม {renderText("`+ สร้างใบสั่งซื้อ (PO)`")} เลือกผู้ขาย (ระบบจะดึง เครดิตเทอม วิธีการจ่ายเงิน และประเภทภาษีมาตรฐานของคู่ค้ารายนั้นขึ้นมาให้โดยอัตโนมัติ) และป้อนวันที่ส่งมอบและสถานที่ส่งสินค้า
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">2. ดึงรายการจากใบขอซื้อ (PR)</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  คลิกปุ่ม {renderText("`เลือกรายการจาก PR`")} เพื่อสืบค้นข้อมูลและติ๊กเลือกรายการสินค้าจากใบ PR ที่ผ่านการอนุมัติแล้ว โดยระบบจะคำนวณจำนวนคงเหลือให้อย่างแม่นยำ
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">3. ตรวจสอบราคาส่วนลดและภาษี</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ป้อนราคาต่อหน่วย (Unit Price) และส่วนลดหากมี ระบบจะสรุปคำนวณยอดเงินภาษีมูลค่าเพิ่ม (VAT %) และแสดงยอดเงินสุทธิที่ด้านล่างสุดขวาของหน้าต่าง
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">4. บันทึกและพิมพ์เอกสาร</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  กรอกหมายเหตุถึงผู้ขายและข้อกำหนดเพิ่มเติม แล้วกดบันทึกร่างหรือส่งอนุมัติ จากนั้นสามารถกดพิมพ์ออกเป็นกระดาษหรือบันทึก PDF ส่งไปให้คู่ค้าได้ทันที
                </p>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "receipts",
      title: "ใบรับสินค้า (GR)",
      icon: Truck,
      subtopics: [
        {
          id: "gr_overview",
          title: "หน้านี้ใช้ทำอะไร",
          icon: Info,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                หน้าใบรับสินค้า (Goods Receipt - GR) ใช้สำหรับทำเรื่องบันทึกรับวัตถุดิบเข้าคลังจริงเมื่อผู้ขายขนส่งสินค้ามาส่งมอบโรงงาน โดยระบบจะทำการตัดยอดค้างรับจากใบ PO อ้างอิง และเพิ่มสต็อกคงคลังชิ้นส่วนวัตถุดิบโดยอัตโนมัติ
              </p>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ส่วนของหน้า</th>
                      <th className="px-sm py-xs text-left">หน้าที่การใช้งาน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "ปุ่มบันทึกรับสินค้า (GR)", desc: "คลิกเพื่อทำเอกสารบันทึกรับวัตถุดิบเข้าคลังใหม่" },
                      { name: "ตารางรายการ GR", desc: "แสดงใบรับสินค้าทั้งหมด สามารถอ้างอิงค้นหาด่วนตามใบ PO หรือผู้ส่งสินค้าได้" },
                      { name: "ปุ่มพิมพ์ใบรับสินค้า", desc: "จัดทำใบรับสินค้า Slip ขนาด A4 หรือ A5 เพื่อให้ฝ่ายคลังและพนักงานลงนามรับรองสินค้าจริง" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          id: "gr_flow",
          title: "ขั้นตอนการบันทึกรับสินค้า (GR)",
          icon: PlusCircle,
          content: (
            <div className="space-y-md">
              <div>
                <h4 className="font-bold text-on-surface text-sm">1. อ้างอิงเลขที่ใบสั่งซื้อ (PO Reference)</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  กดปุ่มสร้างเอกสาร GR แล้วระบุเลขที่ใบสั่งซื้อ (PO) ที่เราตกลงไว้กับผู้ขาย เพื่อดึงรายการวัตถุดิบที่ยังค้างรับเข้าระบบ
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">2. กรอกข้อมูลผู้ขายและเลขใบส่งของ</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ระบุเลขที่ใบส่งของ/ใบกำกับภาษีของผู้ขาย (Delivery Note / Invoice No.) เพื่อใช้เก็บหลักฐานในการตรวจสอบบัญชี
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">3. ตรวจนับและระบุจำนวนที่รับจริง</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  กรอกยอดจำนวนวัตถุดิบที่ตรวจสอบได้จริงในคอลัมน์ {renderText("`จำนวนที่รับครั้งนี้`")} โดยระบบจะไม่อนุญาตให้รับของเกินกว่ายอดค้างส่งในใบ PO นั้นๆ
                </p>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">4. บันทึกและพิมพ์ Slip รับของเข้าคลัง</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ตรวจสอบความถูกต้องแล้วกดบันทึกเพื่อเพิ่มยอดเข้าในตารางสต็อก จากนั้นจัดพิมพ์ใบ GR (รองรับ A4 สูงสุด 20 รายการต่อหน้าโดยไม่ทับช่องเซ็นชื่อ) เพื่อเป็นเอกสารแนบการจ่ายเงินต่อไปครับ
                </p>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "stock",
      title: "สต็อกสินค้า",
      icon: TrendingUp,
      subtopics: [
        {
          id: "stock_overview",
          title: "หน้านี้ใช้ทำอะไร",
          icon: Info,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                หน้าสต็อกสินค้าใช้ในการตรวจสอบจำนวนวัตถุดิบและเกรดวัสดุคงคลัง ณ ปัจจุบัน ซึ่งจะอัปเดตแบบเรียลไทม์เมื่อมีการทำรับสินค้า (GR) หรือนำไปใช้ในไลน์ผลิต เพื่อช่วยวางแผนการสั่งซื้อเหล็กดิบและการผลิตไม่ให้สะดุดครับ
              </p>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ส่วนของหน้า</th>
                      <th className="px-sm py-xs text-left">หน้าที่การใช้งาน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "ตารางสรุปสต็อกคงเหลือ", desc: "แสดงรายการเกรดเหล็กวัตถุดิบ รหัส ชื่อ ยอดจำนวนคงคลังปัจจุบัน และยอดจองพร้อมใช้" },
                      { name: "บัตรควบคุมสต็อก (Stock Card)", desc: "ใช้สำหรับกดดูประวัติความเคลื่อนไหว (ประวัติรับเข้า-จ่ายออก) อย่างละเอียดของวัตถุดิบแต่ละรายการ" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          id: "stock_card_tip",
          title: "เคล็ดลับการตรวจสอบประวัติ Stock Card",
          icon: Lightbulb,
          content: (
            <div className="space-y-md">
              <div>
                <h4 className="font-bold text-on-surface text-sm">1. ตรวจสอบการรับ-จ่ายเข้าออกคลัง</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  คลิกที่สัญลักษณ์ดูประวัติความเคลื่อนไหวหน้ารายการสินค้า จะแสดงรายการวันเวลาที่ทำธุรกรรม, หมายเลขอ้างอิงเอกสาร (เช่น GR-xxxx), ยอดนำเข้า, ยอดเบิกออก และยอดคงคันหลังทำรายการ ทำให้หาสาเหตุสต็อกคลาดเคลื่อนได้ง่ายและแม่นยำมากครับ
                </p>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "dashboard",
      title: "แดชบอร์ด",
      icon: LayoutDashboard,
      subtopics: [
        {
          id: "dashboard_overview",
          title: "หน้านี้ใช้ทำอะไร",
          icon: Info,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                หน้าแดชบอร์ด (Dashboard) หรือหน้าหลักของระบบ KRC ERP ใช้เพื่อแสดงสถิติผลงานภาพรวม ยอดเงินจัดซื้อ รายการงานที่กำลังรอการอนุมัติหรือดำเนินการด่วน และสรุปการเคลื่อนไหวสำคัญต่าง ๆ ภายในโรงงานครับ
              </p>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ส่วนของหน้า</th>
                      <th className="px-sm py-xs text-left">หน้าที่การใช้งาน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "กล่องสถิติภาพรวม (KPI Cards)", desc: "แสดงยอดรวมจำนวนสินค้า คู่ค้าทั้งหมด ใบสั่งซื้อ และประวัติการทำรับของที่สำคัญ" },
                      { name: "สถิติงานคงค้างเพื่อการดำเนินงาน", desc: "แสดงจำนวนรายการใบขอซื้อ PR ที่รอรับการอนุมัติจากผู้มีอำนาจ และใบ PO ที่รอการยืนยันราคา" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-outline-variant pt-sm">
                <h4 className="font-bold text-on-surface text-sm">⚠️ หมายเหตุสำคัญเกี่ยวกับหน้าแดชบอร์ด</h4>
                <p className="mt-xs text-secondary text-[13px] leading-relaxed">
                  ปัจจุบันระบบ **ยังไม่มีหน้าจอแดชบอร์ดสรุปนี้** (เป็นหน้ารองรับฟังก์ชันแดชบอร์ดสถิติวิเคราะห์ในเฟสถัดไป) เมื่อท่านทำการล็อกอินหรือเปิดระบบเข้ามาครั้งแรก ระบบจึงตั้งค่าเปลี่ยนเส้นทาง (Redirect) พาท่านไปยังหน้า **&quot;ข้อมูลสินค้า&quot;** โดยอัตโนมัติเพื่อให้เริ่มทำงานกับข้อมูลได้ทันทีครับ
                </p>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "company_settings",
      title: "ข้อมูลบริษัท",
      icon: Building,
      subtopics: [
        {
          id: "company_settings_overview",
          title: "หน้านี้ใช้ทำอะไร",
          icon: Info,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                หน้าข้อมูลบริษัทใช้สำหรับตั้งค่าข้อมูลทางการ สังกัดสาขา และรูปแบบโครงสร้างหน้าตาเอกสารใบจัดซื้อ/รับของสำหรับบริษัท เค.อาร์.ซี. ออโต้พาร์ท จำกัด โดยแบ่งออกเป็น **3 แท็บย่อย** ดังนี้ครับ
              </p>
            </div>
          ),
        },
        {
          id: "company_settings_tab1",
          title: "แท็บที่ 1: ข้อมูลทั่วไป (Company Info)",
          icon: BookOpen,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px]">แท็บสำหรับป้อนโปรไฟล์ผู้จัดซื้อที่จะถูกนำไปจัดวางบนหัวเอกสาร คอลัมน์ด้านบนซ้ายของใบสั่งซื้อ PO:</p>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ช่องข้อมูล (Input Field)</th>
                      <th className="px-sm py-xs text-left w-24 border-r border-outline-variant">ความจำเป็น</th>
                      <th className="px-sm py-xs text-left">คำอธิบายและรูปแบบการกรอก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "ชื่อบริษัท (ไทย)", req: "จำเป็น (Required)", desc: "ป้อนชื่อทางการ เช่น บริษัท เค.อาร์.ซี. ออโต้พาร์ท จำกัด เพื่อใช้พิมพ์ในแบบฟอร์มภาษาไทย" },
                      { name: "ชื่อบริษัท (อังกฤษ)", req: "จำเป็น (Required)", desc: "ป้อนชื่อสากล เช่น K.R.C. AUTOPART CO., LTD. สำหรับเอกสารส่งออกหรือภาษาอังกฤษ" },
                      { name: "เลขประจำตัวผู้เสียภาษี", req: "จำเป็น (Required)", desc: "เลขทะเบียนนิติบุคคล 13 หลัก ใช้สำหรับการยื่นเอกสารภาษีสรรพากรหลัก" },
                      { name: "สำนักงานใหญ่ / สาขา", req: "จำเป็น (Required)", desc: "ข้อความระบุ เช่น 'สำนักงานใหญ่' หรือระบุหมายเลขสาขาของบริษัท" },
                      { name: "เบอร์โทรศัพท์ / อีเมลหลัก", req: "จำเป็น (Required)", desc: "ข้อมูลเบอร์โทรบริษัทและอีเมลติดต่อกลางสำหรับใช้ติดต่อประสานงานจัดซื้อจัดจ้าง" },
                      { name: "เบอร์โทรสาร (Fax) / เว็บไซต์", req: "เลือกกรอก (Optional)", desc: "หมายเลขแฟกซ์ และที่อยู่เว็บไซต์หลักของบริษัท (สามารถเว้นว่างได้)" },
                      { name: "ที่อยู่ (ไทย) / ที่อยู่ (อังกฤษ)", req: "จำเป็น (Required)", desc: "ที่อยู่จดทะเบียนอย่างเป็นทางการของบริษัท ใช้พาดหัวใบสั่งซื้อเพื่อความถูกต้องทางกฎหมาย" },
                      { name: "อัปโหลดรูปภาพโลโก้", req: "เลือกกรอก (Optional)", desc: "อัปโหลดไฟล์ภาพ JPG/PNG โลโก้ของบริษัท KRC เพื่อให้แสดงผลบนหัวเอกสาร PO และ GR" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs font-semibold text-primary border-r border-outline-variant bg-surface-container-lowest">{f.req}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          id: "company_settings_tab2",
          title: "แท็บที่ 2: สาขา (Branches Management)",
          icon: BookOpen,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px]">ระบบใช้เพื่อลงทะเบียนคลังสินค้าหรือสถานที่จัดเก็บที่แยกเป็นสาขาต่าง ๆ ของบริษัท:</p>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ช่องข้อมูล & คอลัมน์ตาราง</th>
                      <th className="px-sm py-xs text-left w-24 border-r border-outline-variant">ความจำเป็น</th>
                      <th className="px-sm py-xs text-left">ความหมาย & สิ่งที่ต้องพิมพ์</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "รหัสสาขา", req: "จำเป็น (Required)", desc: "ตัวเลขเฉพาะประจำสาขา 5 หลักตามสรรพากร เช่น '00000' (สำนักงานใหญ่) หรือ '00001' (สาขาที่ 1)" },
                      { name: "ชื่อสาขา", req: "จำเป็น (Required)", desc: "ชื่อเรียกสาขาของโรงงาน เช่น 'คลังชิ้นงานผลิตแหลมฉบัง' หรือ 'คลังเก็บเหล็กหลัก'" },
                      { name: "ที่อยู่สาขา", req: "จำเป็น (Required)", desc: "ที่ตั้งทางภูมิศาสตร์และเบอร์ติดต่อประจำสาขานั้น ๆ เพื่อพิมพ์บนช่องผู้รับสินค้า" },
                      { name: "สถานะสาขา", req: "จำเป็น (Required)", desc: "สวิตช์ Toggle แสดงการเปิดใช้งาน (สีเขียว) หรือระงับใช้งานแผนก (สีเทา)" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs font-semibold text-primary border-r border-outline-variant bg-surface-container-lowest">{f.req}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          id: "company_settings_tab3",
          title: "แท็บที่ 3: รูปแบบเอกสาร (Document Formatting)",
          icon: BookOpen,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px]">แท็บสำหรับกำหนดหน้าตา และพารามิเตอร์การจัดพิมพ์ของใบสั่งซื้อ (PO) และใบรับสินค้า (GR) ขนาดกระดาษ:</p>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ช่องข้อมูล & องค์ประกอบ</th>
                      <th className="px-sm py-xs text-left w-24 border-r border-outline-variant">ความจำเป็น</th>
                      <th className="px-sm py-xs text-left">คำอธิบายและหน้าที่ในการทำงาน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "รูปแบบหัวเอกสาร", req: "จำเป็น (Required)", desc: "ตัวเลือก Dropdown เลือกระหว่าง 'มาตรฐาน (Standard)' และ 'กระชับ (Compact)' เพื่อกำหนดพื้นที่แสดงหัวข้อบริษัท" },
                      { name: "ความกว้างโลโก้ในเอกสาร (มม.)", req: "จำเป็น (Required)", desc: "ป้อนตัวเลขความกว้างของโลโก้หน่วยมิลลิเมตร (ตั้งแต่ 15 ถึง 60 มม.) สำหรับย่อหรือขยายโลโก้บนแบบฟอร์ม" },
                      { name: "ลำดับข้อมูลในหัวเอกสาร", req: "จำเป็น (Required)", desc: "รายการข้อมูลบริษัทที่มีสวิตช์ Toggle (แสดง/ซ่อน) รายละเอียด เช่น เลขผู้เสียภาษี เบอร์โทรศัพท์ และปุ่มลูกศรเพื่อเลื่อนลำดับบรรทัดการแสดงผล" },
                      { name: "ข้อความท้ายเอกสาร (ไทย/อังกฤษ)", req: "เลือกกรอก (Optional)", desc: "ป้อนคำชี้แจง ความยาวสูงสุดไม่เกิน 200 ตัวอักษร สำหรับจัดพิมพ์แสดงผลที่ด้านล่างสุดของเอกสารกระดาษ" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs font-semibold text-primary border-r border-outline-variant bg-surface-container-lowest">{f.req}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "departments",
      title: "ตั้งค่าแผนก",
      icon: Layers,
      subtopics: [
        {
          id: "departments_overview",
          title: "หน้านี้ใช้ทำอะไร",
          icon: Info,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                หน้าตั้งค่าแผนกใช้สร้างรายชื่อและรหัสย่อสำหรับแผนกงานใน เค.อาร์.ซี. ออโต้พาร์ท จำกัด (เช่น แผนกผลิต, แผนกจัดซื้อ, แผนกคลังสินค้า, ฝ่ายวิศวกรรม) เพื่อกำหนดสังกัดพนักงานในการสถิติการสั่งซื้อและการกรองเอกสารขอซื้อ (PR) ครับ
              </p>
            </div>
          ),
        },
        {
          id: "departments_fields",
          title: "คำอธิบายฟิลด์ข้อมูลการป้อนฟอร์มแผนก",
          icon: BookOpen,
          content: (
            <div className="space-y-md">
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ฟิลด์ในฟอร์ม / ตาราง</th>
                      <th className="px-sm py-xs text-left w-24 border-r border-outline-variant">ความจำเป็น</th>
                      <th className="px-sm py-xs text-left">คำอธิบายรายละเอียดการใช้งาน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "รหัสแผนก", req: "จำเป็น (Required)", desc: "อักษรย่อเฉพาะแผนก (ห้ามซ้ำ) เช่น 'PRD' (Production) หรือ 'PUR' (Purchasing) เพื่อใช้อ้างอิงหลังระบบ" },
                      { name: "ชื่อแผนก", req: "จำเป็น (Required)", desc: "ชื่อเรียกแผนกภาษาไทย เช่น 'แผนกคลังสินค้า' หรือ 'ฝ่ายวิศวกรรมการผลิต' สำหรับให้พนักงานสังกัด" },
                      { name: "หัวหน้าแผนก (Department Head)", req: "จำเป็น (Required)", desc: "กล่องตัวเลือกสำหรับค้นหาพนักงานในระบบ เพื่อทำหน้าที่เป็น 'ผู้อนุมัติเอกสารขอซื้อ (PR Approver)' ของแผนกนี้โดยตรง" },
                      { name: "สถานะใช้งาน", req: "จำเป็น (Required)", desc: "เปิด/ปิดสวิตช์ Toggle เพื่อกำหนดว่ายังให้เลือกใช้แผนกนี้สำหรับพนักงานใหม่หรือไม่" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs font-semibold text-primary border-r border-outline-variant bg-surface-container-lowest">{f.req}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          id: "departments_columns",
          title: "ตารางสรุปรายชื่อแผนกและคอลัมน์ (Table Columns)",
          icon: BookOpen,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">คำอธิบายคอลัมน์ในตารางที่แสดงผลหน้ารายการแผนกหลัก:</p>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ชื่อคอลัมน์ตาราง</th>
                      <th className="px-sm py-xs text-left">สิ่งที่แสดงและเอาไว้ทำอะไร</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "ลำดับ", desc: "เลขรันลำดับแถวตั้งแต่ 1 ขึ้นไปตามหน้าจอปัจจุบันเพื่อการตรวจสอบ" },
                      { name: "รหัสแผนก", desc: "รหัสย่อที่กรอกไว้ เช่น PRD เป็นตัวหนังสือสีน้ำเงินหลัก" },
                      { name: "ชื่อแผนก", desc: "ชื่อแผนกภาษาไทยเต็มรูปแบบ" },
                      { name: "หัวหน้าแผนก", desc: "แสดงชื่อ-นามสกุลพนักงานที่ได้รับบทบาทเป็นผู้อนุมัติเอกสารขอซื้อประจำแผนกนั้น" },
                      { name: "จำนวนสมาชิก", desc: "ตัวเลขคำนวณอัตโนมัติแสดงว่ามีพนักงานในบริษัทจำนวนกี่คนอยู่ภายใต้แผนกนี้" },
                      { name: "สถานะ", desc: "สวิตช์ Toggle แสดงการเปิดใช้งาน (สีเขียว) หรือระงับใช้งานแผนก (สีเทา)" },
                      { name: "จัดการ", desc: "ปุ่มรูปดินสอสำหรับกดเปิดหน้าต่างแก้ไขข้อมูล และปุ่มถังขยะสำหรับลบ (ลบได้เฉพาะแผนกที่ยังไม่มีสมาชิกลิงก์อยู่เท่านั้น)" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "users",
      title: "ผู้ใช้งานและสิทธิ์",
      icon: Users,
      subtopics: [
        {
          id: "users_overview",
          title: "หน้านี้ใช้ทำอะไร",
          icon: Info,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                หน้านี้จำกัดสิทธิ์ให้เฉพาะเจ้าของระบบ (Owner) เท่านั้น เพื่อสลับการจัดการพนักงานที่ล็อกอิน และกำหนดระดับ Role บทบาทเพื่อความปลอดภัยสูงสุดของโรงงาน โดยแบ่งออกเป็น **2 แท็บย่อย** ครับ
              </p>
            </div>
          ),
        },
        {
          id: "users_tab1",
          title: "แท็บที่ 1: ผู้ใช้งาน (Users Management)",
          icon: BookOpen,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px]">หน้าจอสำหรับ Owner เชิญพนักงาน, กำหนดสิทธิ์ และแก้ไขปัญหาการล็อกอิน:</p>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">ช่องข้อมูล & ปุ่มกดในตาราง</th>
                      <th className="px-sm py-xs text-left w-24 border-r border-outline-variant">ความจำเป็น</th>
                      <th className="px-sm py-xs text-left">คำอธิบายการป้อนข้อมูลและวัตถุประสงค์</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "ชื่อ-นามสกุล", req: "จำเป็น (Required)", desc: "ป้อนชื่อจริงและนามสกุลเต็มของพนักงาน เพื่อใช้อ้างอิงในเอกสารขอซื้อ (PR/PO)" },
                      { name: "อีเมลหลัก", req: "จำเป็น (Required)", desc: "อีเมลทางการสำหรับใช้ล็อกอินเข้าระบบ KRC ERP (ต้องไม่ซ้ำกับพนักงานคนอื่น)" },
                      { name: "บทบาท (Role)", req: "จำเป็น (Required)", desc: "เลือกระดับสิทธิ์: Owner (ผู้ดูแลระบบ), Buyer (พนักงานจัดซื้อ), หรือ Staff (พนักงานทั่วไป)" },
                      { name: "แผนก", req: "จำเป็น (Required)", desc: "เลือกแผนกสังกัดของพนักงานคนนั้น (ผูกจากแผนกที่สร้างไว้) ใช้เพื่อการจับคู่อนุมัติใบ PR" },
                      { name: "ปุ่มล้างรหัสผ่าน (Reset Password)", req: "ใช้เมื่อเจอปัญหา", desc: "ปุ่มรูปกุญแจในคอลัมน์การจัดการ ใช้คลิกเพื่อล้างและป้อนรหัสผ่านชุดใหม่ให้กับพนักงานที่ลืมรหัสผ่านหลัก" },
                      { name: "ปุ่ม Toggle สถานะใช้งาน", req: "จำเป็น (Required)", desc: "เปิด/ระงับ บัญชีผู้ใช้ หากระงับ (สีเทา) พนักงานรายนั้นจะไม่สามารถล็อกอินเข้าสู่ระบบได้อีก" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs font-semibold text-primary border-r border-outline-variant bg-surface-container-lowest">{f.req}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          id: "users_tab2",
          title: "แท็บที่ 2: Role และสิทธิ์ (Permissions Matrix)",
          icon: BookOpen,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px]">ตารางแสดงสิทธิ์การเข้าถึงข้อมูลของแต่ละกลุ่ม Role ในระบบ ERP:</p>
              <div className="border border-outline-variant rounded overflow-hidden text-[12px] bg-surface-container-lowest">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-secondary font-bold">
                      <th className="px-sm py-xs text-left w-1/3 border-r border-outline-variant">บทบาทหน้าตาราง (Role)</th>
                      <th className="px-sm py-xs text-left">ขอบเขตและหน้าที่การตรวจสอบในระบบ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "เจ้าของระบบ (Owner)", desc: "มีสิทธิ์สูงสุดในการเข้าดูข้อมูลบริษัท จัดการแผนก เชิญพนักงานใหม่ ปรับโครงสร้างสิทธิ์ และควบคุมความปลอดภัยทั้งหมด" },
                      { name: "พนักงานจัดซื้อ (Buyer)", desc: "มีสิทธิ์ออกเอกสารและจัดการในหมวดงานจัดซื้อ (PR, PO, GR) รวมถึงสืบค้นข้อมูลคู่ค้าและวัตถุดิบหลัก" },
                      { name: "พนักงานทั่วไป / อื่นๆ (Staff)", desc: "เข้าใช้งานเพื่อดูข้อมูลตามแผนก และเขียนใบเสนอซื้อเสนอแนะความต้องการวัตถุดิบ (PR) เท่านั้น" },
                    ].map((f, idx) => (
                      <tr key={idx} className="border-b border-outline-variant last:border-none hover:bg-surface-container-low/20">
                        <td className="px-sm py-xs font-bold text-on-surface border-r border-outline-variant bg-surface-container-lowest">{f.name}</td>
                        <td className="px-sm py-xs text-secondary bg-surface-container-lowest">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "general",
      title: "การใช้งานระบบทั่วไป",
      icon: Info,
      subtopics: [
        {
          id: "navigation",
          title: "การเปิดหลายแท็บและสลับงาน",
          icon: Compass,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                ระบบรองรับการเปิดหลายหน้าเป็นแท็บด้านบน คุณสามารถสลับไปมาระหว่างงานได้โดยไม่ต้องย้อนกลับหน้าเดิมทุกครั้ง
              </p>
              <p className="text-secondary text-[13px] leading-relaxed">
                ถ้าแท็บไหนไม่ใช้แล้ว ให้กดปิดที่ไอคอนกากบาทบนแท็บนั้นได้ทันที
              </p>
            </div>
          ),
        },
        {
          id: "help_usage",
          title: "การใช้ศูนย์ช่วยเหลือนี้",
          icon: HelpCircle,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                เมื่อคุณเปิดศูนย์ช่วยเหลือจากหน้าไหน ระบบจะเปิดหัวข้อของหน้านั้นให้ก่อนโดยอัตโนมัติ แต่คุณยังสามารถกดอ่านคู่มือของหน้าอื่นได้จากเมนูด้านซ้าย
              </p>
            </div>
          ),
        },
        {
          id: "theme",
          title: "การสลับโหมดสว่างและโหมดมืด",
          icon: Moon,
          content: (
            <div className="space-y-md">
              <p className="text-secondary text-[13px] leading-relaxed">
                กดปุ่มไอคอนมุมขวาบนของระบบเพื่อสลับระหว่างโหมดสว่างและโหมดมืด เลือกแบบที่อ่านสบายตาและเหมาะกับสภาพแสงที่ใช้งานจริง
              </p>
            </div>
          ),
        },
      ],
    },
  ];

  const getInitialCategoryId = () => {
    if (pathname === "/settings/materials") {
      return "materials";
    }
    if (pathname === "/items" || pathname.startsWith("/items/") || pathname === "/inventory/materials" || pathname.startsWith("/inventory/materials/") || pathname === "/products" || pathname.startsWith("/products/")) {
      return "products";
    }
    if (
      pathname === "/partners" ||
      pathname.startsWith("/partners/") ||
      pathname === "/vendors" ||
      pathname.startsWith("/vendors/")
    ) {
      return "partners";
    }
    if (
      pathname === "/partner-settings" ||
      pathname.startsWith("/partner-settings/") ||
      pathname === "/vendor-settings"
    ) {
      return "partner-settings";
    }
    if (pathname === "/purchase/pr" || pathname.startsWith("/purchase/pr/")) {
      return "pr";
    }
    if (pathname === "/purchase/po" || pathname.startsWith("/purchase/po/")) {
      return "po";
    }
    if (pathname === "/purchase/receipts" || pathname.startsWith("/purchase/receipts/")) {
      return "receipts";
    }
    if (pathname === "/inventory/stock" || pathname.startsWith("/inventory/stock/")) {
      return "stock";
    }
    if (pathname === "/settings/company" || pathname.startsWith("/settings/company/")) {
      return "company_settings";
    }
    if (pathname === "/settings/departments" || pathname.startsWith("/settings/departments/")) {
      return "departments";
    }
    if (pathname === "/settings/users" || pathname.startsWith("/settings/users/")) {
      return "users";
    }
    if (pathname === "/" || pathname === "/workspace" || pathname.startsWith("/workspace/")) {
      return "dashboard";
    }
    return "general";
  };

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(getInitialCategoryId());
  const [selectedPartnerTab, setSelectedPartnerTab] = useState<"customer" | "vendor">(
    "vendor",
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedCategoryId(getInitialCategoryId());
    // The helper maps the current pathname and does not carry independent state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const activeCategory = categories.find((c) => c.id === selectedCategoryId) || categories[0];
  const visibleSubtopics =
    activeCategory.id === "partners"
      ? activeCategory.subtopics.filter(
          (subtopic) =>
            !subtopic.partnerTab ||
            subtopic.partnerTab === "shared" ||
            subtopic.partnerTab === selectedPartnerTab,
        )
      : activeCategory.subtopics;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-md animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest border border-outline-variant dark:border-white/10 rounded-lg max-w-4xl w-full shadow-xl overflow-hidden flex flex-col h-[600px] animate-in fade-in zoom-in-98 duration-150">
        <div className="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low shrink-0">
          <div className="flex items-center gap-sm">
            <HelpCircle className="text-secondary w-5 h-5 shrink-0" />
            <div>
              <h3 className="font-title-md text-[14px] font-bold text-on-surface">
                ศูนย์ช่วยเหลือและคู่มือการใช้งานระบบ ERP
              </h3>
              <p className="text-[11px] text-secondary">
                เปิดจากหน้าไหน ระบบจะพาคุณมาที่คู่มือของหน้านั้นก่อน และยังเลือกอ่านหัวข้ออื่นได้จากเมนูด้านซ้าย
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-surface-container-high p-1.5 rounded-full transition-colors cursor-pointer border-none bg-transparent flex items-center justify-center text-secondary"
            type="button"
            title="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden divide-x divide-outline-variant">
          <div className="w-[280px] flex flex-col p-sm space-y-xs bg-surface-container-low overflow-y-auto select-none shrink-0">
            <span className="font-bold text-[10px] text-secondary px-sm py-xs uppercase tracking-wider">
              หัวข้อคู่มือหลักของระบบ
            </span>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`w-full text-left px-md py-sm rounded-lg font-bold text-[13px] transition-all cursor-pointer border-none flex items-center gap-xs ${
                  selectedCategoryId === cat.id
                    ? "bg-primary text-on-primary shadow-sm"
                    : "bg-transparent text-secondary hover:bg-surface-container-high hover:text-on-surface"
                }`}
                type="button"
              >
                <cat.icon className={`w-[18px] h-[18px] shrink-0 ${selectedCategoryId === cat.id ? "text-on-primary" : "text-secondary"}`} />
                <span>{cat.title}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 p-lg overflow-y-auto bg-surface-container-lowest flex flex-col">
            <h3 className="font-bold text-on-surface text-[15px] border-b border-outline-variant pb-xs mb-md flex items-center gap-xs">
              <activeCategory.icon className="w-5 h-5 text-primary shrink-0" />
              <span>{activeCategory.title}</span>
            </h3>

            {activeCategory.id === "partners" ? (
              <div className="mb-md flex flex-wrap gap-2">
                <button
                  className={`rounded-[8px] border px-md py-sm text-[13px] font-bold transition-colors ${
                    selectedPartnerTab === "vendor"
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container-high"
                  }`}
                  onClick={() => setSelectedPartnerTab("vendor")}
                  type="button"
                >
                  เจ้าหนี้ / ผู้ขาย
                </button>
                <button
                  className={`rounded-[8px] border px-md py-sm text-[13px] font-bold transition-colors ${
                    selectedPartnerTab === "customer"
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container-high"
                  }`}
                  onClick={() => setSelectedPartnerTab("customer")}
                  type="button"
                >
                  ลูกหนี้ / ลูกค้า
                </button>
              </div>
            ) : null}

            <div className="space-y-lg animate-in fade-in duration-150">
              {visibleSubtopics.map((sub, idx) => (
                <div key={sub.id} className="space-y-sm">
                  {idx > 0 ? <div className="border-t border-outline-variant/60 my-lg pt-md" /> : null}
                  <div className="flex items-center gap-xs text-primary">
                    <sub.icon className="w-[18px] h-[18px] shrink-0" />
                    <h4 className="font-bold text-on-surface text-[14px]">{sub.title}</h4>
                  </div>
                  <div className="pl-[26px]">{sub.content}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-lg py-sm border-t border-outline-variant flex items-center justify-between text-[11px] text-secondary bg-surface-container-low shrink-0">
          <span className="flex items-center gap-xs">
            <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>คู่มือแบบภาษาคน อ่านง่าย ใช้งานตามลำดับขั้นตอน</span>
          </span>
          <button
            onClick={onClose}
            className="px-md py-sm bg-primary text-on-primary hover:brightness-110 active:scale-95 rounded font-bold text-xs transition-all cursor-pointer border-none"
            type="button"
          >
            ปิดคู่มือ
          </button>
        </div>
      </div>
    </div>
  );
}
