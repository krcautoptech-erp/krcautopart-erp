export function normalizeCancellationReason(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function validateCancellationReason(
  value: string,
):
  | { error: string; success: false }
  | { reason: string; success: true } {
  const reason = normalizeCancellationReason(value);

  if (reason.length < 10) {
    return {
      error: "กรุณาระบุเหตุผลการยกเลิกอย่างน้อย 10 ตัวอักษร",
      success: false,
    };
  }
  if (reason.length > 500) {
    return {
      error: "เหตุผลการยกเลิกต้องไม่เกิน 500 ตัวอักษร",
      success: false,
    };
  }

  return { reason, success: true };
}
