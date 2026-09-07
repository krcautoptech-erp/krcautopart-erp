"use server";

import { revalidatePath } from "next/cache";
import {
  normalizeDocumentTermTemplate,
  validateDocumentTermTemplate,
  type DocumentTermTemplateInput,
  type DocumentTermTemplateRecord,
} from "@/lib/document-terms";
import { createClient } from "@/utils/supabase/server";

const PATH = "/settings/document-terms";
type Client = Awaited<ReturnType<typeof createClient>>;
type AuthResult = { supabase: Client } | { error: string };

async function requireUser(): Promise<AuthResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase } : { error: "กรุณาเข้าสู่ระบบใหม่" };
}

async function canManage(supabase: Client) {
  const { data } = await supabase.rpc("authorize", {
    requested_permission: "document_terms.manage",
  });
  return Boolean(data);
}

async function loadTemplates(supabase: Client) {
  const [templatesResult, itemsResult, canManageResult] = await Promise.all([
    supabase.from("document_term_templates").select("id, template_code, template_name, document_type, version, is_default, status").order("document_type").order("template_code"),
    supabase.from("document_term_items").select("id, template_id, sort_order, term_text, is_active").order("sort_order"),
    canManage(supabase),
  ]);
  const error = templatesResult.error ?? itemsResult.error;
  if (error) return { error: "ไม่สามารถโหลดแม่แบบเงื่อนไขเอกสารได้" };
  const items = itemsResult.data ?? [];
  const templates: DocumentTermTemplateRecord[] = (templatesResult.data ?? []).map((row) => ({
    code: String(row.template_code), documentType: row.document_type as DocumentTermTemplateRecord["documentType"], id: Number(row.id),
    isDefault: Boolean(row.is_default), name: String(row.template_name), status: row.status === "inactive" ? "inactive" : "active",
    terms: items.filter((item) => Number(item.template_id) === Number(row.id)).map((item) => ({ isActive: Boolean(item.is_active), text: String(item.term_text) })),
    version: Number(row.version),
  }));
  return { data: { canManage: canManageResult, templates } };
}

export async function getDocumentTermSettingsAction() {
  const auth = await requireUser();
  if ("error" in auth) return { error: auth.error };
  return loadTemplates(auth.supabase);
}

export async function saveDocumentTermTemplateAction(id: number | null, input: DocumentTermTemplateInput) {
  const value = normalizeDocumentTermTemplate(input);
  const validationError = validateDocumentTermTemplate(value);
  if (validationError) return { error: validationError };
  const auth = await requireUser();
  if ("error" in auth) return { error: auth.error };
  if (!(await canManage(auth.supabase))) return { error: "คุณไม่มีสิทธิ์จัดการแม่แบบเงื่อนไขเอกสาร" };

  const payload = { document_type: value.documentType, is_default: value.isDefault && value.status === "active", status: value.status, template_code: value.code, template_name: value.name, updated_by: (await auth.supabase.auth.getUser()).data.user?.id, version: value.version };
  if (payload.is_default) {
    const { error } = await auth.supabase.from("document_term_templates").update({ is_default: false }).eq("document_type", value.documentType).eq("is_default", true);
    if (error) return { error: "ไม่สามารถเปลี่ยนแม่แบบเริ่มต้นได้" };
  }
  const result = id
    ? await auth.supabase.from("document_term_templates").update(payload).eq("id", id).select("id").single()
    : await auth.supabase.from("document_term_templates").insert(payload).select("id").single();
  if (result.error) return { error: result.error.message.includes("unique") ? "รหัสแม่แบบนี้ถูกใช้งานแล้ว" : "ไม่สามารถบันทึกแม่แบบได้" };
  const templateId = Number(result.data.id);
  const deleteResult = await auth.supabase.from("document_term_items").delete().eq("template_id", templateId);
  if (deleteResult.error) return { error: "ไม่สามารถปรับปรุงรายการเงื่อนไขได้" };
  const insertResult = await auth.supabase.from("document_term_items").insert(value.terms.map((term, index) => ({ is_active: term.isActive, sort_order: index + 1, template_id: templateId, term_text: term.text })));
  if (insertResult.error) return { error: "ไม่สามารถบันทึกรายการเงื่อนไขได้" };
  revalidatePath(PATH);
  revalidatePath("/purchase/po");
  return { success: true as const };
}

export async function deleteDocumentTermTemplateAction(id: number) {
  const auth = await requireUser();
  if ("error" in auth) return { error: auth.error };
  if (!(await canManage(auth.supabase))) return { error: "คุณไม่มีสิทธิ์ลบแม่แบบเงื่อนไขเอกสาร" };
  const { data: template } = await auth.supabase.from("document_term_templates").select("is_default").eq("id", id).single();
  if (template?.is_default) return { error: "ไม่สามารถลบแม่แบบเริ่มต้นได้ กรุณากำหนดแม่แบบอื่นก่อน" };
  const { error } = await auth.supabase.from("document_term_templates").delete().eq("id", id);
  if (error) return { error: "ไม่สามารถลบแม่แบบได้" };
  revalidatePath(PATH);
  return { success: true as const };
}

export async function getDefaultPurchaseOrderTermsAction() {
  const auth = await requireUser();
  if ("error" in auth) return { terms: "" };
  const { data: template } = await auth.supabase.from("document_term_templates").select("id").eq("document_type", "po").eq("status", "active").eq("is_default", true).maybeSingle();
  if (!template) return { terms: "" };
  const { data } = await auth.supabase.from("document_term_items").select("term_text").eq("template_id", template.id).eq("is_active", true).order("sort_order");
  return { terms: (data ?? []).map((item, index) => `${index + 1}. ${item.term_text}`).join("\n") };
}
