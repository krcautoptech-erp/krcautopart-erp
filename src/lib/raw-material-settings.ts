export type RawMaterialSettingKind = "group" | "grade" | "unit";
export type RawMaterialSettingStatus = "active" | "inactive";

export type RawMaterialSettingInput = {
  allows_decimal?: boolean;
  code: string;
  name: string;
  sort_order: number;
  status: RawMaterialSettingStatus;
  symbol?: string;
};

export type NormalizedRawMaterialSettingInput = {
  allows_decimal: boolean;
  code: string;
  name: string;
  sort_order: number;
  status: RawMaterialSettingStatus;
  symbol: string;
};

export function normalizeRawMaterialSettingInput(
  kind: RawMaterialSettingKind,
  input: RawMaterialSettingInput,
): NormalizedRawMaterialSettingInput {
  return {
    allows_decimal: kind === "unit" ? Boolean(input.allows_decimal) : false,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    sort_order: Number(input.sort_order),
    status: input.status === "inactive" ? "inactive" : "active",
    symbol: kind === "unit" ? (input.symbol ?? "").trim() : "",
  };
}

export function validateRawMaterialSettingInput(
  kind: RawMaterialSettingKind,
  input: RawMaterialSettingInput,
) {
  const normalized = normalizeRawMaterialSettingInput(kind, input);

  if (!normalized.code) return "กรุณากรอกรหัส";
  if (!normalized.name) return "กรุณากรอกชื่อ";
  if (kind === "unit" && !normalized.symbol) {
    return "กรุณากรอกสัญลักษณ์หน่วยนับ";
  }
  if (
    kind === "unit" &&
    (["MM", "MILLIMETER"].includes(normalized.code) ||
      ["MM", "มม."].includes(normalized.symbol.toUpperCase()))
  ) {
    return "มิลลิเมตรเป็นหน่วยมิติ ไม่สามารถใช้เป็นหน่วยนับสต็อกได้";
  }
  if (!Number.isInteger(normalized.sort_order) || normalized.sort_order < 0) {
    return "ลำดับการแสดงต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป";
  }

  return null;
}
