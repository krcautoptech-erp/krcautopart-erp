export function safeSpreadsheetText(value: unknown) {
  const text = String(value ?? "").replace(/[\t\r\n]+/g, " ");
  return /^[=+@-]/.test(text) ? `'${text}` : text;
}

export function stockReportFileName(view: string, start: string, end: string) {
  return `stock-movement-${view}-${start}_${end}.xlsx`;
}
