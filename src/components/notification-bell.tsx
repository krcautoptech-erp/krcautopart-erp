"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  getNotificationBellAction,
} from "@/app/actions/notifications";
import {
  notificationTypeIcon,
  getNotificationVisualMeta,
  type NotificationStatusCategory,
} from "@/lib/notification-inbox";
import type { AppNotification } from "@/lib/notifications";
import {
  ensureCurrentSubscription,
  persistSubscription,
} from "@/components/push-notification-control";
import { createClient } from "@/utils/supabase/client";

type NotificationBellProps = {
  initialNotifications: AppNotification[];
  initialUnreadCount: number;
  userId: string;
  vapidPublicKey?: string | null;
};

function formatNotificationTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

const notificationStatusClass: Record<NotificationStatusCategory, string> = {
  approved: "text-emerald-700 dark:text-emerald-400",
  assigned: "text-blue-800 dark:text-blue-300",
  completed: "text-emerald-700 dark:text-emerald-400",
  info: "text-slate-600 dark:text-slate-300",
  rejected: "text-red-700 dark:text-red-400",
  revision: "text-amber-700 dark:text-amber-400",
  submitted: "text-blue-800 dark:text-blue-300",
};

const notificationStatusIcon: Record<NotificationStatusCategory, string> = {
  approved: "check_circle",
  assigned: "assignment_ind",
  completed: "check_circle",
  info: "info",
  rejected: "error",
  revision: "warning",
  submitted: "schedule",
};

export function NotificationBell({
  initialNotifications,
  initialUnreadCount,
  userId,
  vapidPublicKey,
}: NotificationBellProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"all" | "unread">("all");
  const [serverItems, setServerItems] = useState(initialNotifications);
  const [serverUnreadCount, setServerUnreadCount] = useState(initialUnreadCount);
  const [locallyReadIds, setLocallyReadIds] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [pushNotice, setPushNotice] = useState<string | null>(null);

  useEffect(() => {
    const permission =
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
        ? "unsupported"
        : Notification.permission;
    const timeout = window.setTimeout(() => setPushPermission(permission), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const handleEnablePush = async () => {
    if (!vapidPublicKey) return;
    setIsEnablingPush(true);
    setPushNotice(null);
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== "granted") {
        setPushNotice(
          permission === "denied"
            ? "เบราว์เซอร์ปิดกั้นการแจ้งเตือน คุณสามารถเปิดได้ที่การตั้งค่าไซต์ของเบราว์เซอร์"
            : null,
        );
        setIsEnablingPush(false);
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      const existing = await registration.pushManager.getSubscription();
      const subscription = await ensureCurrentSubscription(
        registration,
        existing,
        vapidPublicKey,
        true,
      );
      if (!subscription) throw new Error("PUSH_SUBSCRIPTION_MISSING");
      const result = await persistSubscription(subscription);
      if (!result.success) {
        setPushNotice(result.error);
      } else {
        setPushNotice("เปิดรับการแจ้งเตือนบนคอมพิวเตอร์เรียบร้อยแล้ว");
      }
    } catch {
      setPushNotice("เปิดการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsEnablingPush(false);
    }
  };

  const items = serverItems.map((item) =>
    locallyReadIds.includes(item.id) && !item.readAt
      ? { ...item, readAt: new Date().toISOString() }
      : item,
  );
  const locallyReadUnreadCount = serverItems.filter(
    (item) => !item.readAt && locallyReadIds.includes(item.id),
  ).length;
  const unreadCount = Math.max(0, serverUnreadCount - locallyReadUnreadCount);
  const visibleItems = (
    view === "unread" ? items.filter((item) => !item.readAt) : items
  ).slice(0, 5);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const refreshBell = useCallback(async () => {
    const result = await getNotificationBellAction();
    setServerItems(result.notifications);
    setServerUnreadCount(result.unreadCount);
    setLocallyReadIds([]);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notification-recipients:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `recipient_user_id=eq.${userId}`,
          schema: "public",
          table: "notification_recipients",
        },
        () => void refreshBell(),
      )
      .subscribe();

    const handleFocus = () => void refreshBell();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refreshBell();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshBell();
    }, 60_000);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, [refreshBell, userId]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "KRC_NOTIFICATION_RECEIVED") {
        if (!isOpen) void refreshBell();
      }
    };
    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    };
  }, [isOpen, refreshBell]);

  const handleOpenNotification = (item: AppNotification) => {
    setIsOpen(false);
    if (!item.readAt) {
      setLocallyReadIds((current) =>
        current.includes(item.id) ? current : [...current, item.id],
      );
      startTransition(async () => {
        const result = await markNotificationReadAction(item.id);
        if (!result.success) {
          router.refresh();
        }
      });
    }

    if (item.actionUrl) {
      router.push(item.actionUrl);
    }
  };

  const handleMarkAllRead = () => {
    setLocallyReadIds((current) =>
      Array.from(
        new Set([
          ...current,
          ...serverItems
            .filter((item) => !item.readAt)
            .map((item) => item.id),
        ]),
      ),
    );
    startTransition(async () => {
      const result = await markAllNotificationsReadAction();
      if (!result.success) {
        router.refresh();
      }
    });
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={
          unreadCount > 0
            ? `การแจ้งเตือนที่ยังไม่ได้อ่าน ${unreadCount} รายการ`
            : "การแจ้งเตือน"
        }
        className="relative cursor-pointer rounded-full p-1.5 transition-colors hover:bg-surface-container-low active:opacity-80"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="material-symbols-outlined text-on-surface">
          notifications
        </span>
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-white ring-2 ring-surface-container-lowest">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section
          aria-label="รายการแจ้งเตือน"
          className="absolute right-0 top-11 z-[70] w-[380px] overflow-hidden rounded-xl border border-slate-200 bg-surface-container-lowest shadow-xl dark:border-slate-700 max-sm:fixed max-sm:inset-x-2 max-sm:top-14 max-sm:w-auto"
          role="dialog"
        >
          <header className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <h2 className="text-[20px] font-extrabold text-on-surface">การแจ้งเตือน</h2>
              {unreadCount > 0 ? (
                <span className="grid min-h-7 min-w-7 place-items-center rounded-full bg-primary px-1.5 text-[12px] font-bold leading-none text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </div>
            {unreadCount > 0 ? (
              <button
                className="cursor-pointer rounded px-1 py-2 text-[12px] font-bold text-blue-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 dark:text-blue-300"
                disabled={isPending}
                onClick={handleMarkAllRead}
                type="button"
              >
                อ่านทั้งหมด
              </button>
            ) : null}
          </header>

          {pushPermission === "default" && vapidPublicKey ? (
            <div className="mx-3.5 mb-2.5 rounded-lg border border-primary/20 bg-primary/[0.04] p-2.5">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-[20px] text-primary shrink-0">
                    notifications_active
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-on-surface">
                      เปิดแจ้งเตือนบนคอมพิวเตอร์
                    </p>
                  <p className="break-words text-[10px] leading-4 text-secondary">
                      รับป๊อปอัปมุมขวาล่างทันที แม้พับจอหรือเปิดโปรแกรมอื่น
                    </p>
                  </div>
                </div>
                <button
                  className="shrink-0 cursor-pointer rounded-[4px] bg-primary px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-primary-hover active:opacity-90 disabled:opacity-50"
                  disabled={isEnablingPush}
                  onClick={handleEnablePush}
                  type="button"
                >
                  {isEnablingPush ? "กำลังเปิด..." : "เปิดแจ้งเตือน"}
                </button>
              </div>
              {pushNotice ? (
                <p className="mt-1.5 text-[10px] font-medium text-primary">{pushNotice}</p>
              ) : null}
            </div>
          ) : null}
          {pushNotice && pushPermission === "granted" ? (
            <div className="mx-3.5 mb-2.5 flex items-start gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 text-[11px] font-medium leading-4 text-emerald-600 dark:text-emerald-400">
              <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px]">check_circle</span>
              <span className="min-w-0 flex-1 break-words">{pushNotice}</span>
            </div>
          ) : null}
          {pushPermission === "denied" ? (
            <div className="mx-3.5 mb-2 flex items-start gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-1 text-[10px] leading-4 text-secondary">
              <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px] text-amber-500">info</span>
              <span className="min-w-0 flex-1 break-words">เบราว์เซอร์ปิดกั้นแจ้งเตือน (คลิกรูปกุญแจข้าง URL เพื่อเปิด)</span>
            </div>
          ) : null}

          <div className="grid h-11 grid-cols-2 border-b border-slate-200 dark:border-slate-700" role="tablist" aria-label="ตัวกรองสถานะการแจ้งเตือน">
            <button
              aria-selected={view === "all"}
              className={`relative text-[14px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${view === "all" ? "text-primary" : "text-secondary hover:text-on-surface"}`}
              onClick={() => setView("all")}
              role="tab"
              type="button"
            >
              ทั้งหมด
              {view === "all" ? <span className="absolute inset-x-5 bottom-0 h-[3px] bg-primary" /> : null}
            </button>
            <button
              aria-selected={view === "unread"}
              className={`relative text-[14px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${view === "unread" ? "text-primary" : "text-secondary hover:text-on-surface"}`}
              onClick={() => setView("unread")}
              role="tab"
              type="button"
            >
              ยังไม่อ่าน
              {view === "unread" ? <span className="absolute inset-x-5 bottom-0 h-[3px] bg-primary" /> : null}
            </button>
          </div>

          <div className="max-h-[480px] overflow-y-auto">
            {visibleItems.length > 0 ? (
              visibleItems.map((item) => {
                const visual = getNotificationVisualMeta(item);
                return (
                  <button
                    className={`grid min-h-[76px] w-full cursor-pointer grid-cols-[30px_minmax(0,1fr)_104px_14px] items-center gap-x-1.5 border-b border-slate-200 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-surface-container-low focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary dark:border-slate-700 max-sm:grid-cols-[28px_minmax(0,1fr)_14px] max-sm:gap-x-2 max-sm:px-3 ${
                      item.readAt ? "" : "bg-slate-500/[0.035]"
                    }`}
                    key={item.id}
                    onClick={() => handleOpenNotification(item)}
                    type="button"
                  >
                    <span className="relative grid size-7 place-items-center">
                      <span className="material-symbols-outlined text-[24px] text-on-surface">
                        {notificationTypeIcon(item.type)}
                      </span>
                      {!item.readAt ? (
                        <span
                          aria-label="ยังไม่ได้อ่าน"
                          className="absolute -left-1.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary"
                        />
                      ) : null}
                    </span>

                    <div className="col-start-2 min-w-0 self-center">
                      <strong className={`block break-words pl-0.5 text-[12.5px] leading-[18px] text-on-surface ${item.readAt ? "font-semibold" : "font-extrabold"}`}>
                        {item.title}
                      </strong>
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] font-medium leading-[18px] text-secondary">
                        {item.message}
                      </p>
                    </div>

                    <div className="col-start-3 flex min-w-0 flex-col items-start gap-1.5 self-center max-sm:col-start-2 max-sm:row-start-2 max-sm:mt-1 max-sm:flex-row max-sm:items-center max-sm:gap-2">
                      <time
                        className="whitespace-nowrap text-[10px] font-medium leading-4 text-secondary"
                        dateTime={item.createdAt}
                      >
                        {formatNotificationTime(item.createdAt)}
                      </time>
                      <span className={`inline-flex w-full min-w-0 items-center justify-start gap-0.5 text-[10px] font-bold leading-4 ${notificationStatusClass[visual.category]}`}>
                        <span className="material-symbols-outlined shrink-0 text-[18px]" aria-hidden="true">
                          {notificationStatusIcon[visual.category]}
                        </span>
                        <span className="shrink-0 whitespace-nowrap">{visual.badgeLabel}</span>
                      </span>
                    </div>

                    <span className="material-symbols-outlined col-start-4 text-[18px] text-secondary max-sm:col-start-3 max-sm:row-span-2 max-sm:row-start-1">
                      chevron_right
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-10 text-center">
                <span className="material-symbols-outlined text-[32px] text-secondary/60">
                  notifications_off
                </span>
                <p className="mt-2 text-[13px] font-semibold text-on-surface">
                  {view === "unread" ? "ไม่มีรายการที่ยังไม่อ่าน" : "ยังไม่มีการแจ้งเตือน"}
                </p>
                <p className="mt-1 text-[11px] text-secondary">
                  {view === "unread" ? "คุณอ่านการแจ้งเตือนครบแล้ว" : "รายการสำคัญจากระบบจะแสดงที่นี่"}
                </p>
              </div>
            )}
          </div>
          <footer className="border-t border-slate-200 bg-surface-container-lowest dark:border-slate-700">
            <Link
              className="flex h-11 items-center justify-center gap-1.5 text-[12px] font-bold text-blue-800 transition-colors hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary dark:text-blue-300"
              href="/notifications"
              onClick={() => setIsOpen(false)}
            >
              ดูการแจ้งเตือนทั้งหมด
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
            </Link>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
