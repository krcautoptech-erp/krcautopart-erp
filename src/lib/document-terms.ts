export const DOCUMENT_TERM_LIMIT = 10;

export type DocumentType = "po" | "quotation" | "invoice";
export type DocumentTermItemInput = { isActive: boolean; text: string };
export type DocumentTermTemplateInput = {
  code: string;
  documentType: DocumentType;
  isDefault: boolean;
  name: string;
  status: "active" | "inactive";
  terms: DocumentTermItemInput[];
  version: number;
};

export type DocumentTermTemplateRecord = DocumentTermTemplateInput & {
  id: number;
};

export const documentTypeLabels: Record<DocumentType, string> = {
  po: "ใบสั่งซื้อ (PO)",
  quotation: "ใบเสนอราคา",
  invoice: "ใบแจ้งหนี้",
};

export function normalizeDocumentTermTemplate(input: DocumentTermTemplateInput) {
  return {
    ...input,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    terms: input.terms.map((term) => ({ ...term, text: term.text.trim() })),
    version: Math.max(1, Math.trunc(input.version || 1)),
  };
}

export function validateDocumentTermTemplate(input: DocumentTermTemplateInput) {
  if (!/^[A-Z][A-Z0-9-]{1,19}$/.test(input.code)) return "รหัสแม่แบบต้องเป็น A-Z, 0-9 หรือ - จำนวน 2-20 ตัว";
  if (!input.name || input.name.length > 120) return "ชื่อแม่แบบต้องมี 1-120 ตัวอักษร";
  if (!Object.hasOwn(documentTypeLabels, input.documentType)) return "ประเภทเอกสารไม่ถูกต้อง";
  if (input.terms.length < 1) return "กรุณาเพิ่มเงื่อนไขอย่างน้อย 1 ข้อ";
  if (input.terms.length > DOCUMENT_TERM_LIMIT) return `เพิ่มเงื่อนไขได้สูงสุด ${DOCUMENT_TERM_LIMIT} ข้อ`;
  if (input.terms.some((term) => !term.text || term.text.length > 500)) return "แต่ละเงื่อนไขต้องมี 1-500 ตัวอักษร";
  return null;
}
