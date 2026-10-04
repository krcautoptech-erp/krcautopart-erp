"use server";

import { createClient } from "@/utils/supabase/server";

export type AuditLogFilters = {
  action?: string;
  endDate?: string;
  module?: string;
  outcome?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  startDate?: string;
};

export type AuditLogRecord = {
  actionCode: string;
  actionLabel: string;
  actorName: string;
  actorRole: string | null;
  changedFields: Record<string, unknown>;
  deviceSummary: string | null;
  entityId: string | null;
  entityNumber: string | null;
  entityType: string | null;
  id: number;
  ipAddressMasked: string | null;
  moduleCode: string;
  moduleName: string;
  occurredAt: string;
  outcome: string;
  reason: string | null;
  requestId: string | null;
  severity: string;
  source: string;
  summary: string;
};

const PAGE_SIZE = 25;

export async function getAuditLogPageAction(filters: AuditLogFilters) {
  const supabase = await createClient();
  const permission = await supabase.rpc("authorize", { requested_permission: "audit_logs.view" });
  if (permission.error || permission.data !== true) return { error: "คุณไม่มีสิทธิ์ดูประวัติการใช้งานระบบ" as const };

  const pageSize = Math.min(Math.max(filters.pageSize ?? PAGE_SIZE, 10), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const from = (page - 1) * pageSize;
  let query = supabase
    .from("system_audit_logs")
    .select("id,occurred_at,actor_name,actor_role,action_code,action_label,module_code,module_name,entity_type,entity_id,entity_number,outcome,severity,summary,reason,changed_fields,source,ip_address_masked,device_summary,request_id", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);

  const search = filters.search?.trim().slice(0, 100);
  const safeSearch = search?.replace(/[^\p{L}\p{N}\s._/-]/gu, " ").trim();
  if (safeSearch) query = query.or(`actor_name.ilike.%${safeSearch}%,summary.ilike.%${safeSearch}%,entity_number.ilike.%${safeSearch}%,request_id.ilike.%${safeSearch}%`);
  if (filters.module && filters.module !== "all") query = query.eq("module_code", filters.module);
  if (filters.action && filters.action !== "all") query = query.eq("action_code", filters.action);
  if (filters.outcome && filters.outcome !== "all") query = query.eq("outcome", filters.outcome);
  if (filters.startDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.startDate)) query = query.gte("occurred_at", `${filters.startDate}T00:00:00+07:00`);
  if (filters.endDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.endDate)) query = query.lte("occurred_at", `${filters.endDate}T23:59:59.999+07:00`);

  const [{ data, error, count }, access] = await Promise.all([
    query,
    supabase.rpc("record_audit_log_access", { p_action: "view" }),
  ]);
  if (error) return { error: "ไม่สามารถโหลดประวัติการใช้งานระบบได้" as const };
  if (access.error) console.error("Unable to record audit-log access", access.error.message);

  const records: AuditLogRecord[] = (data ?? []).map((row) => ({
    actionCode: row.action_code,
    actionLabel: row.action_label,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    changedFields: row.changed_fields && typeof row.changed_fields === "object" && !Array.isArray(row.changed_fields) ? row.changed_fields as Record<string, unknown> : {},
    deviceSummary: row.device_summary,
    entityId: row.entity_id,
    entityNumber: row.entity_number,
    entityType: row.entity_type,
    id: row.id,
    ipAddressMasked: row.ip_address_masked,
    moduleCode: row.module_code,
    moduleName: row.module_name,
    occurredAt: row.occurred_at,
    outcome: row.outcome,
    reason: row.reason,
    requestId: row.request_id,
    severity: row.severity,
    source: row.source,
    summary: row.summary,
  }));

  return { data: { page, pageSize, records, total: count ?? 0 } };
}

export async function recordAuditExportAction() {
  const supabase = await createClient();
  const result = await supabase.rpc("record_audit_log_access", { p_action: "export" });
  return result.error ? { error: "คุณไม่มีสิทธิ์ส่งออกประวัติ" as const } : { success: true as const };
}
