export type DepartmentStatus = "active" | "inactive";

export type DepartmentInput = {
  code: string;
  managerUserId: string | null;
  name: string;
  remarks: string;
  status: DepartmentStatus;
};

const DEPARTMENT_CODE_PATTERN = /^[A-Z][A-Z0-9]{1,11}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeDepartmentInput(
  input: DepartmentInput,
): DepartmentInput {
  return {
    code: input.code.trim().toUpperCase(),
    managerUserId: input.managerUserId?.trim() || null,
    name: input.name.trim(),
    remarks: input.remarks.trim(),
    status: input.status,
  };
}

export function validateDepartmentInput(
  input: DepartmentInput,
): string | null {
  const normalized = normalizeDepartmentInput(input);

  if (!DEPARTMENT_CODE_PATTERN.test(normalized.code)) {
    return "รหัสแผนกต้องเป็นภาษาอังกฤษตัวพิมพ์ใหญ่หรือตัวเลข 2-12 ตัว";
  }
  if (!normalized.name || normalized.name.length > 100) {
    return "กรุณากรอกชื่อแผนกไม่เกิน 100 ตัวอักษร";
  }
  if (
    normalized.managerUserId &&
    !UUID_PATTERN.test(normalized.managerUserId)
  ) {
    return "หัวหน้าแผนกไม่ถูกต้อง";
  }
  if (normalized.remarks.length > 500) {
    return "หมายเหตุต้องไม่เกิน 500 ตัวอักษร";
  }
  if (normalized.status !== "active" && normalized.status !== "inactive") {
    return "สถานะแผนกไม่ถูกต้อง";
  }

  return null;
}
