"use client";

import { MapPin, Phone, X } from "lucide-react";
import type { CustomerRecord } from "@/app/actions/customers";

type CustomerDetailModalProps = {
  customer: CustomerRecord;
  onClose: () => void;
};

export function CustomerDetailModal({
  customer,
  onClose,
}: CustomerDetailModalProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <article className="max-h-[92vh] w-full max-w-[1080px] overflow-hidden rounded-[10px] border border-red-200 bg-surface-container-lowest shadow-2xl dark:border-red-500/30">
        <header className="flex items-center justify-between border-b border-red-200 px-7 py-5 dark:border-red-500/25">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-primary">
              Customer Master
            </p>
            <h2 className="mt-1 text-[28px] font-bold text-on-surface">
              {customer.customer_name}
            </h2>
            <p className="text-[13px] font-medium text-secondary">
              {customer.customer_code} / {customer.customer_type?.name ?? "ไม่ระบุประเภทลูกค้า"}
            </p>
          </div>
          <button
            className="grid h-9 w-9 place-items-center rounded-[6px] text-on-surface hover:bg-surface-container"
            onClick={onClose}
            type="button"
          >
            <X size={24} />
          </button>
        </header>

        <div className="max-h-[calc(92vh-93px)] overflow-y-auto p-7">
          <div className="grid gap-5 lg:grid-cols-[0.38fr_0.62fr]">
            <aside className="space-y-4">
              <div className="rounded-[10px] border border-red-100 bg-surface-container-low p-5 dark:border-red-500/20">
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-secondary">
                  ข้อมูลหลัก
                </p>
                <dl className="mt-4 space-y-4">
                  <Info label="รหัสลูกค้า" strong value={customer.customer_code} />
                  <Info label="เลขผู้เสียภาษี" value={customer.tax_no} />
                  <Info label="สาขา" value={customer.branch || "-"} />
                  <Info highlight label="สถานะ" value={customer.status} />
                </dl>
              </div>

              <div className="rounded-[10px] border border-red-100 bg-surface-container-low p-5 dark:border-red-500/20">
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-secondary">
                  ข้อมูลติดต่อ
                </p>
                <dl className="mt-4 space-y-4">
                  <Info label="ชื่อผู้ติดต่อ" value={customer.contact_name || "-"} />
                  <Info label="เบอร์โทร" value={customer.phone || "-"} />
                  <Info label="อีเมล" value={customer.email || "-"} />
                </dl>
              </div>
            </aside>

            <main className="space-y-5">
              <section className="grid gap-4 md:grid-cols-3">
                <Metric label="ประเภทลูกค้า" value={customer.customer_type?.name ?? "-"} />
                <Metric label="เครดิตเทอม" value={customer.credit_term?.name ?? "-"} />
                <Metric label="ประเภทภาษี" value={customer.tax_type?.name ?? "-"} />
              </section>

              <section className="rounded-[10px] border border-red-100 bg-surface-container-low p-5 dark:border-red-500/20">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-secondary">
                    ที่อยู่ลูกค้า
                  </p>
                  <span className="text-[12px] font-bold text-primary">
                    {customer.customer_addresses.length} รายการ
                  </span>
                </div>
                <div className="mt-4 grid gap-3">
                  {customer.customer_addresses.length === 0 ? (
                    <p className="text-[14px] font-medium text-secondary">
                      ยังไม่มีข้อมูลที่อยู่
                    </p>
                  ) : (
                    customer.customer_addresses.map((address, index) => (
                      <div
                        key={address.id}
                        className="rounded-[8px] border border-outline-variant bg-surface-container-lowest p-4"
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <MapPin className="text-primary" size={16} />
                          <h3 className="text-[15px] font-bold text-on-surface">
                            {address.address_name || `ที่อยู่ ${index + 1}`}
                          </h3>
                          {address.is_default ? (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
                              ค่าเริ่มต้น
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[14px] font-medium leading-6 text-on-surface">
                          {address.address_line}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-4 text-[13px] font-medium text-secondary">
                          <span>{address.contact_name || "ไม่ระบุผู้ติดต่อ"}</span>
                          <span className="inline-flex items-center gap-1">
                            <Phone size={14} />
                            {address.phone || "ไม่ระบุเบอร์โทร"}
                          </span>
                          <span>{address.status}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-[10px] border border-red-100 bg-surface-container-low p-5 dark:border-red-500/20">
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-secondary">
                  หมายเหตุ
                </p>
                <p className="mt-3 text-[14px] font-medium leading-6 text-on-surface">
                  {customer.remark || "-"}
                </p>
              </section>
            </main>
          </div>
        </div>
      </article>
    </div>
  );
}

function Info({
  highlight = false,
  label,
  strong = false,
  value,
}: {
  highlight?: boolean;
  label: string;
  strong?: boolean;
  value: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.15em] text-secondary">
        {label}
      </dt>
      <dd
        className={`mt-1 text-[16px] ${
          strong || highlight ? "font-bold" : "font-medium"
        } ${highlight ? "text-primary" : "text-on-surface"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-red-100 bg-surface-container-low p-4 dark:border-red-500/20">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-secondary">
        {label}
      </p>
      <p className="mt-2 text-[16px] font-bold text-on-surface">{value}</p>
    </div>
  );
}
