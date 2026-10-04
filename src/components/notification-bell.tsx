"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  getNotificationBellAction,
} from "@/app/actions/notifications";
import { notificationTypeIcon } from "@/lib/notification-inbox";
import type { AppNotification } from "@/lib/notifications";
import { createClient } from "@/utils/supabase/client";

type NotificationBellProps = {
  initialNotifications: AppNotification[];
  initialUnreadCount: number;
  userId: string;
};

function formatNotificationTime(value: string) {
  const date = new Date(value);
  const time = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
  const day = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(date);
  const today = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(new Date());

  if (day === today) return `${time} น.`;
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function isUrgentNotification(item: AppNotification) {
  return /เกินกำหนด|เร่งด่วน|ด่วน/i.test(`${item.title} ${item.message}`);
}

export function NotificationBell({
  initialNotifications,
  initialUnreadCount,
  userId,
}: NotificationBellProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"all" | "unread">("all");
  const [serverItems, setServerItems] = useState(initialNotifications);
  const [serverUnreadCount, setServerUnreadCount] = useState(initialUnreadCount);
  const [locallyReadIds, setLocallyReadIds] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();
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
  ).slice(0, 7);

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
          className="absolute right-0 top-11 z-[70] w-[400px] overflow-hidden rounded-[8px] border border-outline-variant bg-surface-container-lowest shadow-2xl max-sm:fixed max-sm:inset-x-2 max-sm:top-14 max-sm:w-auto"
          role="dialog"
        >
          <header className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <h2 className="text-[18px] font-extrabold text-on-surface">การแจ้งเตือน</h2>
              {unreadCount > 0 ? (
                <span className="grid min-w-6 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </div>
            {unreadCount > 0 ? (
              <button
                className="cursor-pointer text-[12px] font-bold text-primary hover:underline disabled:opacity-50"
                disabled={isPending}
                onClick={handleMarkAllRead}
                type="button"
              >
                อ่านทั้งหมด
              </button>
            ) : null}
          </header>

          <div className="grid h-10 grid-cols-2 border-b border-outline-variant" role="tablist" aria-label="ตัวกรองสถานะการแจ้งเตือน">
            <button
              aria-selected={view === "all"}
              className={`relative text-[13px] font-bold transition-colors ${view === "all" ? "text-primary" : "text-secondary hover:text-on-surface"}`}
              onClick={() => setView("all")}
              role="tab"
              type="button"
            >
              ทั้งหมด
              {view === "all" ? <span className="absolute inset-x-3 bottom-0 h-0.5 bg-primary" /> : null}
            </button>
            <button
              aria-selected={view === "unread"}
              className={`relative text-[13px] font-bold transition-colors ${view === "unread" ? "text-primary" : "text-secondary hover:text-on-surface"}`}
              onClick={() => setView("unread")}
              role="tab"
              type="button"
            >
              ยังไม่อ่าน
              {view === "unread" ? <span className="absolute inset-x-3 bottom-0 h-0.5 bg-primary" /> : null}
            </button>
          </div>

          <div className="max-h-[460px] overflow-y-auto">
            {visibleItems.length > 0 ? (
              visibleItems.map((item) => (
                <button
                  className={`grid min-h-[76px] w-full cursor-pointer grid-cols-[38px_minmax(0,1fr)_68px] items-start gap-2.5 border-b border-outline-variant/70 px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-container-low ${
                    item.readAt ? "" : "bg-primary/[0.04]"
                  }`}
                  key={item.id}
                  onClick={() => handleOpenNotification(item)}
                  type="button"
                >
                  <span className="relative mt-0.5 grid size-9 place-items-center text-on-surface">
                    <span className="material-symbols-outlined text-[26px]">
                      {notificationTypeIcon(item.type)}
                    </span>
                    {!item.readAt ? (
                      <span aria-label="ยังไม่ได้อ่าน" className="absolute -right-0.5 top-0.5 size-2 rounded-full bg-primary" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <strong className="max-h-6 overflow-hidden text-[13px] font-bold leading-6 text-on-surface">{item.title}</strong>
                      {isUrgentNotification(item) ? (
                        <span className="shrink-0 rounded-[3px] bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">เร่งด่วน</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block max-h-10 overflow-hidden text-[12px] font-medium leading-5 text-secondary">
                      {item.message}
                    </span>
                  </span>
                  <time className="pt-1 text-right text-[10px] font-semibold leading-4 text-secondary" dateTime={item.createdAt}>{formatNotificationTime(item.createdAt)}</time>
                </button>
              ))
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
          <footer className="border-t border-outline-variant bg-surface-container-lowest">
            <Link
              className="flex h-11 items-center justify-center gap-1.5 text-[13px] font-bold text-primary transition-colors hover:bg-surface-container-low"
              href="/notifications"
              onClick={() => setIsOpen(false)}
            >
              ดูการแจ้งเตือนทั้งหมด
            </Link>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
