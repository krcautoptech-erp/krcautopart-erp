"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import { PushNotificationControl } from "@/components/push-notification-control";
import type { AppNotification } from "@/lib/notifications";
import { createClient } from "@/utils/supabase/client";

type NotificationBellProps = {
  initialNotifications: AppNotification[];
  initialUnreadCount: number;
  userId: string;
};

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function NotificationBell({
  initialNotifications,
  initialUnreadCount,
  userId,
}: NotificationBellProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isPending, startTransition] = useTransition();

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

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notification-recipients:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          filter: `recipient_user_id=eq.${userId}`,
          schema: "public",
          table: "notification_recipients",
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  const handleOpenNotification = (item: AppNotification) => {
    setIsOpen(false);
    if (!item.readAt) {
      const readAt = new Date().toISOString();
      setUnreadCount((current) => Math.max(0, current - 1));
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, readAt } : entry,
        ),
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
    const readAt = new Date().toISOString();
    setUnreadCount(0);
    setItems((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt })),
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
          className="absolute right-0 top-11 z-[70] w-[360px] overflow-hidden rounded-[8px] border border-outline-variant bg-surface-container-lowest shadow-2xl max-sm:fixed max-sm:left-3 max-sm:right-3 max-sm:top-14 max-sm:w-auto"
          role="dialog"
        >
          <header className="flex h-12 items-center justify-between border-b border-outline-variant px-4">
            <div>
              <h2 className="text-[15px] font-bold text-on-surface">
                การแจ้งเตือน
              </h2>
              <p className="text-[11px] text-secondary">
                {unreadCount > 0
                  ? `ยังไม่ได้อ่าน ${unreadCount} รายการ`
                  : "อ่านครบทั้งหมดแล้ว"}
              </p>
            </div>
            {unreadCount > 0 ? (
              <button
                className="cursor-pointer text-[12px] font-semibold text-primary hover:underline disabled:opacity-50"
                disabled={isPending}
                onClick={handleMarkAllRead}
                type="button"
              >
                อ่านทั้งหมด
              </button>
            ) : null}
          </header>

          <div className="max-h-[420px] overflow-y-auto">
            {items.length > 0 ? (
              items.map((item) => (
                <button
                  className={`flex w-full cursor-pointer gap-3 border-b border-outline-variant/70 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-container-low ${
                    item.readAt ? "" : "bg-primary/[0.045]"
                  }`}
                  key={item.id}
                  onClick={() => handleOpenNotification(item)}
                  type="button"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-primary/10 text-primary">
                    <span className="material-symbols-outlined text-[18px]">
                      assignment
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                      <span className="flex-1 truncate text-[13px] font-bold text-on-surface">
                        {item.title}
                      </span>
                      {!item.readAt ? (
                        <span
                          aria-label="ยังไม่ได้อ่าน"
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                        />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-[12px] leading-5 text-secondary">
                      {item.message}
                    </span>
                    <time
                      className="mt-1 block text-[10px] text-secondary/80"
                      dateTime={item.createdAt}
                    >
                      {formatNotificationTime(item.createdAt)}
                    </time>
                  </span>
                </button>
              ))
            ) : (
              <div className="px-4 py-10 text-center">
                <span className="material-symbols-outlined text-[32px] text-secondary/60">
                  notifications_off
                </span>
                <p className="mt-2 text-[13px] font-semibold text-on-surface">
                  ยังไม่มีการแจ้งเตือน
                </p>
                <p className="mt-1 text-[11px] text-secondary">
                  เมื่อมีการสร้างใบขอซื้อ รายการจะแสดงที่นี่
                </p>
              </div>
            )}
          </div>
          <PushNotificationControl />
        </section>
      ) : null}
    </div>
  );
}
