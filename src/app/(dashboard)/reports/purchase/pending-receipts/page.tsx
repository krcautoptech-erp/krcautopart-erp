import type { Metadata } from "next";
import { getCompanyDocumentContext } from "@/lib/company-settings.server";
import { createClient } from "@/utils/supabase/server";
import { PendingReceiptsReport, type PendingReceiptRow } from "./pending-receipts-report";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "สินค้าค้างรับและติดตามกำหนดส่ง | KRC ERP" };

type DbRow = Record<string, unknown>;
type Relation = DbRow | DbRow[] | null;

function relation(value: Relation) { return Array.isArray(value) ? value[0] ?? null : value; }
function isoToday() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); }

export default async function PendingReceiptsPage() {
  const supabase = await createClient();
  const [itemsResult, receiptsResult, contactsResult, documentContext, userResult] = await Promise.all([
    supabase.from("purchase_order_items").select(`
      id, line_no, item_code, item_name, quantity, received_qty, unit_name,
      unit_price, discount_amount, delivery_date,
      purchase_orders!inner(id, po_number, document_date, vendor_id, vendor_code, vendor_name, buyer_name, status, sent_at, delivery_date)
    `).in("purchase_orders.status", ["approved", "sent", "partially_received"]).order("delivery_date", { ascending: true }).limit(2000),
    supabase.from("goods_receipt_items").select("purchase_order_item_id, goods_receipts!inner(document_date, status)").eq("goods_receipts.status", "posted").limit(5000),
    supabase.from("vendor_addresses").select("vendor_id, contact_name, phone").eq("is_default", true).eq("status", "active").limit(1000),
    getCompanyDocumentContext(),
    supabase.auth.getUser(),
  ]);

  for (const [name, error] of [["PO items", itemsResult.error], ["GR items", receiptsResult.error], ["vendor contacts", contactsResult.error]] as const) {
    if (error) console.error(`Unable to load pending receipt ${name}:`, { code: error.code, message: error.message });
  }

  const lastReceiptByItem = new Map<number, string>();
  for (const row of (receiptsResult.data ?? []) as DbRow[]) {
    const receipt = relation(row.goods_receipts as Relation);
    const date = String(receipt?.document_date ?? "");
    const itemId = Number(row.purchase_order_item_id);
    if (date && date > (lastReceiptByItem.get(itemId) ?? "")) lastReceiptByItem.set(itemId, date);
  }
  const contactByVendor = new Map<number, { name: string; phone: string }>();
  for (const row of (contactsResult.data ?? []) as DbRow[]) contactByVendor.set(Number(row.vendor_id), { name: String(row.contact_name ?? "-"), phone: String(row.phone ?? "-") });

  const rows = ((itemsResult.data ?? []) as DbRow[]).flatMap<PendingReceiptRow>((item) => {
    const order = relation(item.purchase_orders as Relation);
    if (!order) return [];
    const ordered = Number(item.quantity);
    const received = Number(item.received_qty ?? 0);
    const pending = Math.max(ordered - received, 0);
    if (pending <= 0) return [];
    const netUnitPrice = ordered > 0 ? Math.max((ordered * Number(item.unit_price) - Number(item.discount_amount ?? 0)) / ordered, 0) : 0;
    const contact = contactByVendor.get(Number(order.vendor_id));
    return [{
      buyerName: String(order.buyer_name), contactName: contact?.name ?? "-", contactPhone: contact?.phone ?? "-",
      deliveryDate: String(item.delivery_date ?? order.delivery_date), documentDate: String(order.document_date), id: Number(item.id), itemCode: String(item.item_code ?? "-"),
      itemName: String(item.item_name), lastReceiptDate: lastReceiptByItem.get(Number(item.id)) ?? null,
      orderedQty: ordered, pendingAmount: pending * netUnitPrice, pendingQty: pending, poNumber: String(order.po_number),
      receivedQty: received, sentAt: order.sent_at ? String(order.sent_at) : null, unitName: String(item.unit_name),
      vendorCode: String(order.vendor_code), vendorName: String(order.vendor_name),
    }];
  });

  const printedBy = userResult.data.user?.email?.split("@")[0]?.toUpperCase() || "KRC ERP";
  return (
    <PendingReceiptsReport
      documentContext={documentContext}
      printedBy={printedBy}
      rows={rows}
      todayIso={isoToday()}
    />
  );
}
