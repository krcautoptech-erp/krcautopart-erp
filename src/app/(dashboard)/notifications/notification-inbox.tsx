"use client";

import { useRememberedListUrl } from "@/lib/use-list-state";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCheck } from "lucide-react";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import {
  ListDateRangeFilter,
  ListFilterSelect,
  ListSearchField,
  MobileListFilters,
} from "@/components/list-filters";
import { PushNotificationControl } from "@/components/push-notification-control";
import {
  buildNotificationInboxHref,
  getNotificationDocumentNumber,
  groupNotificationInboxItems,
  NOTIFICATION_PAGE_SIZE,
  notificationTypeIcon,
  notificationTypeLabel,
  type NotificationInboxFilters,
} from "@/lib/notification-inbox";
import type { AppNotification } from "@/lib/notifications";

type NotificationInboxProps = {
  error: string | null;
  filters: NotificationInboxFilters;
  items: AppNotification[];
  nowIso: string;
  totalItems: number;
  vapidPublicKey: string | null;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(new Date(value));
}

function FilterFields({ filters }: { filters: NotificationInboxFilters }) {
  return (
    <>
      <ListFilterSelect defaultValue={filters.status} label="สถานะ" name="status">
        <option value="all">ทั้งหมด</option>
        <option value="unread">ยังไม่อ่าน</option>
        <option value="read">อ่านแล้ว</option>
      </ListFilterSelect>
      <ListFilterSelect defaultValue={filters.type} label="ประเภท" name="type">
        <option value="all">ทุกประเภท</option>
        <option value="purchase_requisition">ใบขอซื้อ (PR)</option>
        <option value="purchase_order">ใบสั่งซื้อ (PO)</option>
        <option value="goods_receipt">รับสินค้า (GR)</option>
        <option value="stock_count">ตรวจนับสต็อก</option>
      </ListFilterSelect>
      <ListDateRangeFilter
        active={Boolean(filters.startDate || filters.endDate)}
        defaultEndValue={filters.endDate}
        defaultStartValue={filters.startDate}
        endName="endDate"
        startName="startDate"
      />
    </>
  );
}

function PaginationLinks({
  filters,
  totalItems,
}: {
  filters: NotificationInboxFilters;
  totalItems: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / NOTIFICATION_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const start = totalItems === 0 ? 0 : (page - 1) * NOTIFICATION_PAGE_SIZE + 1;
  const end = Math.min(page * NOTIFICATION_PAGE_SIZE, totalItems);
  const linkClass =
    "inline-flex size-9 items-center justify-center rounded-[4px] border border-outline-variant bg-surface-container-lowest text-[13px] font-bold text-on-surface transition-colors hover:border-primary hover:text-primary";

  return (
    <footer className="flex flex-col gap-3 border-t border-outline-variant px-4 py-3 text-[13px] font-semibold md:flex-row md:items-center md:justify-between">
      <p>
        แสดง {start.toLocaleString("th-TH")}–{end.toLocaleString("th-TH")} จาก {totalItems.toLocaleString("th-TH")} รายการ
      </p>
      <div className="flex items-center justify-between gap-3 md:justify-end">
        <span className="text-secondary">25 รายการต่อหน้า</span>
        <nav aria-label="เปลี่ยนหน้าการแจ้งเตือน" className="flex items-center gap-2">
          {page > 1 ? (
            <Link className={linkClass} href={buildNotificationInboxHref(filters, page - 1)} aria-label="หน้าก่อนหน้า">
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </Link>
          ) : (
            <span aria-hidden="true" className={`${linkClass} opacity-35`}>
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </span>
          )}
          <span className="inline-flex size-9 items-center justify-center rounded-[4px] bg-primary text-[13px] font-bold text-white">
            {page}
          </span>
          {page < totalPages ? (
            <Link className={linkClass} href={buildNotificationInboxHref(filters, page + 1)} aria-label="หน้าถัดไป">
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </Link>
          ) : (
            <span aria-hidden="true" className={`${linkClass} opacity-35`}>
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </span>
          )}
        </nav>
      </div>
    </footer>
  );
}

export function NotificationInbox({
  error,
  filters,
  items: initialItems,
  nowIso,
  totalItems,
  vapidPublicKey,
}: NotificationInboxProps) {
  useRememberedListUrl();
  const router = useRouter();
  const [locallyReadIds, setLocallyReadIds] = useState<number[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();
  const localReadAt = nowIso;
  const items = initialItems.map((item) =>
    locallyReadIds.includes(item.id) && !item.readAt
      ? { ...item, readAt: localReadAt }
      : item,
  );
  const pageIds = items.map((item) => item.id);
  const validSelectedIds = selectedIds.filter((id) => pageIds.includes(id));
  const groups = groupNotificationInboxItems(items, new Date(nowIso));
  const activeFilterCount = [
    filters.status !== "all",
    filters.type !== "all",
    Boolean(filters.startDate || filters.endDate),
  ].filter(Boolean).length;

  const openNotification = (item: AppNotification) => {
    if (!item.readAt) {
      setLocallyReadIds((current) =>
        current.includes(item.id) ? current : [...current, item.id],
      );
    }
    startTransition(async () => {
      const result = await markNotificationReadAction(item.id);
      if (!result.success) router.refresh();
      else if (item.actionUrl) router.push(item.actionUrl);
      else router.refresh();
    });
  };

  const markAllRead = () => {
    const targetIds = validSelectedIds.length
      ? validSelectedIds
      : items.filter((item) => !item.readAt).map((item) => item.id);
    setLocallyReadIds((current) =>
      Array.from(new Set([...current, ...targetIds])),
    );
    startTransition(async () => {
      if (validSelectedIds.length) {
        await Promise.all(
          validSelectedIds.map((id) => markNotificationReadAction(id)),
        );
        setSelectedIds([]);
      } else {
        await markAllNotificationsReadAction();
      }
      router.refresh();
    });
  };

  const allPageItemsSelected =
    pageIds.length > 0 && pageIds.every((id) => validSelectedIds.includes(id));
  const toggleItem = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  };
  const togglePage = () => {
    setSelectedIds(allPageItemsSelected ? [] : pageIds);
  };

  return (
    <section className="mx-auto w-full max-w-[1600px] text-on-surface">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[12px] font-semibold text-secondary">หน้าหลัก&nbsp;&nbsp;›&nbsp;&nbsp;<strong className="text-on-surface">การแจ้งเตือนทั้งหมด</strong></p>
          <h1 className="text-[30px] font-extrabold leading-[1.35] tracking-[-0.02em] sm:text-[34px]">
            การแจ้งเตือนทั้งหมด
          </h1>
          <p className="mt-1 text-[14px] font-medium leading-6 text-secondary">
            รายการแจ้งเตือนล่าสุดจากระบบ เพื่อให้คุณไม่พลาดทุกความเคลื่อนไหวที่สำคัญ
          </p>
        </div>
        <div className="w-full sm:max-w-[360px]">
          <PushNotificationControl publicKey={vapidPublicKey} />
        </div>
      </div>

      <form key={`desktop:${JSON.stringify(filters)}`} action="/notifications" className="mb-3 hidden grid-cols-[minmax(250px,1.45fr)_190px_170px_minmax(285px,1fr)_220px] items-center gap-2 md:grid" method="get">
        <ListSearchField defaultValue={filters.q} name="q" placeholder="ค้นหาหัวข้อ ข้อความ หรือเลขที่เอกสาร..." />
        <div className="grid h-[38px] grid-cols-2 overflow-hidden rounded-[4px] border border-outline-variant bg-surface-container-lowest">
          <button className={`text-[13px] font-bold transition-colors ${filters.status === "all" ? "bg-primary text-white" : "hover:text-primary"}`} name="status" type="submit" value="all">ทั้งหมด</button>
          <button className={`border-l border-outline-variant text-[13px] font-bold transition-colors ${filters.status === "unread" ? "bg-primary text-white" : "hover:text-primary"}`} name="status" type="submit" value="unread">ยังไม่อ่าน</button>
        </div>
        <ListFilterSelect
          defaultValue={filters.type}
          label="ประเภท"
          name="type"
          onNativeChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          <option value="all">ทุกประเภท</option>
          <option value="purchase_requisition">ใบขอซื้อ (PR)</option>
          <option value="purchase_order">ใบสั่งซื้อ (PO)</option>
          <option value="goods_receipt">รับสินค้า (GR)</option>
          <option value="stock_count">ตรวจนับสต็อก</option>
        </ListFilterSelect>
        <ListDateRangeFilter
          active={Boolean(filters.startDate || filters.endDate)}
          defaultEndValue={filters.endDate}
          defaultStartValue={filters.startDate}
          endName="endDate"
          startName="startDate"
          submitOnChange
        />
        <button
          className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[4px] border border-outline-variant bg-surface-container-lowest px-4 text-[13px] font-bold transition-colors hover:border-primary hover:text-primary disabled:opacity-45"
          disabled={isPending || !items.some((item) => !item.readAt)}
          onClick={markAllRead}
          type="button"
        >
          <CheckCheck size={18} />
          {validSelectedIds.length ? `ทำเครื่องหมายว่าอ่าน (${validSelectedIds.length})` : "ทำเครื่องหมายว่าอ่านทั้งหมด"}
        </button>
        <button className="sr-only" type="submit">ค้นหา</button>
      </form>

      <form key={`mobile:${JSON.stringify(filters)}`} action="/notifications" className="mb-3 md:hidden" id="notification-mobile-filter-form" method="get">
        <MobileListFilters
          activeCount={activeFilterCount}
          formId="notification-mobile-filter-form"
          onClear={() => router.push("/notifications")}
          resultLabel="แสดงรายการ"
          search={<ListSearchField defaultValue={filters.q} name="q" placeholder="ค้นหาเลขเอกสารหรือข้อความ..." />}
          title="ตัวกรองการแจ้งเตือน"
        >
          <FilterFields filters={filters} />
        </MobileListFilters>
      </form>

      {error ? (
        <div className="border border-red-300 bg-red-50 px-4 py-3 text-[14px] font-bold text-red-700 dark:bg-red-950/30 dark:text-red-200" role="alert">
          {error}
        </div>
      ) : (
        <div className="overflow-hidden border-y border-outline-variant bg-surface-container-lowest md:rounded-[4px] md:border">
          {groups.length ? (
            <>
              <div className="hidden min-h-10 grid-cols-[42px_54px_minmax(300px,1.6fr)_minmax(170px,.8fr)_140px_145px_140px] items-center gap-3 border-b border-outline-variant bg-surface-container-low px-3 text-[12px] font-bold md:grid">
                <label className="grid place-items-center">
                  <input aria-label="เลือกการแจ้งเตือนทั้งหมดในหน้านี้" checked={allPageItemsSelected} className="size-4 accent-primary" onChange={togglePage} type="checkbox" />
                </label>
                <span aria-hidden="true" />
                <span>หัวข้อและข้อความ</span>
                <span>เอกสารที่เกี่ยวข้อง</span>
                <span>ประเภท</span>
                <span>เวลา</span>
                <span className="text-center">การดำเนินการ</span>
              </div>
              {groups.map((group) => (
              <section key={group.key} aria-labelledby={`notification-group-${group.key}`}>
                <h2 className="border-b border-outline-variant bg-primary/[0.045] px-3 py-2 text-[14px] font-bold" id={`notification-group-${group.key}`}>
                  {group.label}
                </h2>
                <div>
                  {group.items.map((item) => {
                    const documentNumber = getNotificationDocumentNumber(item);
                    return (
                    <article className={`border-b border-outline-variant/75 last:border-b-0 ${item.readAt ? "" : "bg-primary/[0.025]"}`} key={item.id}>
                      <div className="hidden min-h-[78px] grid-cols-[42px_54px_minmax(300px,1.6fr)_minmax(170px,.8fr)_140px_145px_140px] items-center gap-3 px-3 py-2.5 md:grid">
                        <label className="grid place-items-center"><input aria-label={`เลือก ${item.title}`} checked={selectedIds.includes(item.id)} className="size-4 accent-primary" onChange={() => toggleItem(item.id)} type="checkbox" /></label>
                        <div className="relative grid size-10 place-items-center text-on-surface">
                          {!item.readAt ? <span aria-label="ยังไม่อ่าน" className="absolute left-0 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary" /> : null}
                          <span className="material-symbols-outlined text-[27px]">{notificationTypeIcon(item.type)}</span>
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-[15px] font-bold leading-[1.55]">{item.title}</h3>
                          <p className="line-clamp-2 text-[13px] font-medium leading-[1.55] text-secondary">{item.message}</p>
                        </div>
                        <div className="min-w-0 text-[13px] font-semibold">
                          {documentNumber ? <strong className="block text-primary">{documentNumber}</strong> : <span className="text-secondary">—</span>}
                          <span className="block text-[12px] font-medium text-secondary">เอกสารต้นทาง</span>
                        </div>
                        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-secondary"><span className="material-symbols-outlined text-[20px] text-on-surface">{notificationTypeIcon(item.type)}</span>{notificationTypeLabel(item.type)}</span>
                        <time className="text-[12px] font-semibold leading-5 text-secondary" dateTime={item.createdAt}><span className="block">{formatDate(item.createdAt)}</span><span className="block">{formatTime(item.createdAt)} น.</span></time>
                        <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[4px] border border-outline-variant px-3 text-[12px] font-bold hover:border-primary hover:text-primary disabled:opacity-50" disabled={isPending} onClick={() => openNotification(item)} type="button">
                          <span className="material-symbols-outlined text-[17px]">open_in_new</span>
                          {item.actionUrl ? "เปิดเอกสาร" : "อ่านแล้ว"}
                        </button>
                      </div>

                      <button className="flex w-full gap-3 px-4 py-4 text-left md:hidden" disabled={isPending} onClick={() => openNotification(item)} type="button">
                        <span className="relative grid size-10 shrink-0 place-items-center rounded-[5px] bg-surface-container-low text-primary">
                          <span className="material-symbols-outlined text-[21px]">{notificationTypeIcon(item.type)}</span>
                          {!item.readAt ? <span aria-label="ยังไม่อ่าน" className="absolute -left-1 top-1 size-2 rounded-full bg-primary" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-3">
                            <strong className="text-[15px] leading-6">{item.title}</strong>
                            <time className="shrink-0 text-[11px] font-semibold text-secondary" dateTime={item.createdAt}>{formatTime(item.createdAt)} น.</time>
                          </span>
                          <span className="mt-0.5 block text-[13px] font-medium leading-5 text-secondary">{item.message}</span>
                          <span className="mt-2 flex items-center justify-between gap-2 text-[12px] font-semibold">
                            <span className="text-secondary">{notificationTypeLabel(item.type)}</span>
                            <span className="inline-flex items-center gap-1 text-primary">{item.actionUrl ? "เปิดเอกสาร" : "ทำเครื่องหมายว่าอ่าน"}<span className="material-symbols-outlined text-[16px]">chevron_right</span></span>
                          </span>
                        </span>
                      </button>
                    </article>
                  );})}
                </div>
              </section>
              ))}
            </>
          ) : (
            <div className="px-4 py-16 text-center">
              <span className="material-symbols-outlined text-[38px] text-secondary/60">notifications_off</span>
              <h2 className="mt-2 text-[16px] font-bold">ไม่พบการแจ้งเตือน</h2>
              <p className="mt-1 text-[13px] font-medium text-secondary">ลองเปลี่ยนคำค้นหรือช่วงวันที่ แล้วแสดงรายการอีกครั้ง</p>
            </div>
          )}
          <PaginationLinks filters={filters} totalItems={totalItems} />
        </div>
      )}

      <p className="mt-3 text-right text-[11px] font-medium text-secondary">
        แสดงประวัติการแจ้งเตือนล่าสุด ข้อมูลเก่าควรจัดเก็บตามนโยบายของระบบ
      </p>
    </section>
  );
}
