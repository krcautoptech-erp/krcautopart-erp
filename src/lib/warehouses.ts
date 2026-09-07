export type WarehouseStatus = "active" | "inactive";

export type WarehouseInput = {
  code: string;
  locationName: string;
  name: string;
  remarks: string;
  responsibleUserId: string | null;
  status: WarehouseStatus;
  typeId: number;
};

export type WarehouseTypeInput = {
  code: string;
  name: string;
  remarks: string;
  status: WarehouseStatus;
};

const CODE_PATTERN = /^[A-Z][A-Z0-9_-]{1,19}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

export function normalizeWarehouseInput(input: WarehouseInput): WarehouseInput {
  return {
    code: input.code.trim().toUpperCase(),
    locationName: input.locationName.trim(),
    name: input.name.trim(),
    remarks: input.remarks.trim(),
    responsibleUserId: input.responsibleUserId?.trim() || null,
    status: input.status,
    typeId: Number(input.typeId),
  };
}

export function validateWarehouseInput(input: WarehouseInput) {
  const value = normalizeWarehouseInput(input);
  if (!CODE_PATTERN.test(value.code)) return "รหัสคลังต้องเป็น A-Z, 0-9, - หรือ _ จำนวน 2-20 ตัว";
  if (!value.name || value.name.length > 100) return "กรุณากรอกชื่อคลังไม่เกิน 100 ตัวอักษร";
  if (!Number.isSafeInteger(value.typeId) || value.typeId <= 0) return "กรุณาเลือกประเภทคลัง";
  if (value.locationName.length > 150) return "สาขาหรือที่ตั้งต้องไม่เกิน 150 ตัวอักษร";
  if (value.responsibleUserId && !UUID_PATTERN.test(value.responsibleUserId)) return "ข้อมูลผู้รับผิดชอบไม่ถูกต้อง";
  if (value.remarks.length > 500) return "หมายเหตุต้องไม่เกิน 500 ตัวอักษร";
  if (value.status !== "active" && value.status !== "inactive") return "สถานะคลังไม่ถูกต้อง";
  return null;
}

export function normalizeWarehouseTypeInput(input: WarehouseTypeInput): WarehouseTypeInput {
  return {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    remarks: input.remarks.trim(),
    status: input.status,
  };
}

export function validateWarehouseTypeInput(input: WarehouseTypeInput) {
  const value = normalizeWarehouseTypeInput(input);
  if (!CODE_PATTERN.test(value.code)) return "รหัสประเภทคลังต้องเป็น A-Z, 0-9, - หรือ _ จำนวน 2-20 ตัว";
  if (!value.name || value.name.length > 100) return "กรุณากรอกชื่อประเภทคลังไม่เกิน 100 ตัวอักษร";
  if (value.remarks.length > 255) return "หมายเหตุต้องไม่เกิน 255 ตัวอักษร";
  if (value.status !== "active" && value.status !== "inactive") return "สถานะประเภทคลังไม่ถูกต้อง";
  return null;
}
