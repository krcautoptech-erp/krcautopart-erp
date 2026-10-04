export type StockMovement = {
  id: string; itemId: number; itemCode: string; itemName: string; warehouseId: number;
  warehouseName: string; unit: string; groupId: number; groupName: string;
  date: string; type: string; referenceType: string; document: string; lot: string;
  quantity: number; actor: string;
};
export type StockSummary = Pick<StockMovement, "itemId" | "itemCode" | "itemName" | "warehouseId" | "warehouseName" | "unit" | "groupId" | "groupName"> & {
  opening: number; received: number; issued: number; adjustment: number; closing: number;
};

export function movementKind(row: Pick<StockMovement, "type" | "referenceType" | "quantity">) {
  if (row.referenceType === "stock_issue_reversal") return "reversal";
  if (row.type === "adjustment") return "adjustment";
  return row.quantity < 0 ? "issue" : "receipt";
}

export function stockPeriod(movements: StockMovement[], start: string, end: string) {
  const from = new Date(`${start}T00:00:00+07:00`).getTime();
  const until = new Date(`${end}T23:59:59.999+07:00`).getTime();
  const summaries = new Map<string, StockSummary>();
  const journal: Array<StockMovement & { balance: number }> = [];
  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id, "en", { numeric: true }));
  for (const row of sorted) {
    const time = new Date(row.date).getTime();
    if (time > until) continue;
    const key = `${row.itemId}:${row.warehouseId}`;
    let summary = summaries.get(key);
    if (!summary) {
      summary = { itemId: row.itemId, itemCode: row.itemCode, itemName: row.itemName, warehouseId: row.warehouseId, warehouseName: row.warehouseName, unit: row.unit, groupId: row.groupId, groupName: row.groupName, opening: 0, received: 0, issued: 0, adjustment: 0, closing: 0 };
      summaries.set(key, summary);
    }
    // Quantities use the database's four-decimal precision, including running balances.
    summary.closing = Math.round((summary.closing + row.quantity) * 10000) / 10000;
    if (time < from) summary.opening = summary.closing;
    else {
      const kind = movementKind(row);
      if (kind === "adjustment" || kind === "reversal") summary.adjustment += row.quantity;
      else if (row.quantity > 0) summary.received += row.quantity;
      else summary.issued -= row.quantity;
      journal.push({ ...row, balance: summary.closing });
    }
  }
  return { summaries: [...summaries.values()].sort((a, b) => a.itemCode.localeCompare(b.itemCode) || a.warehouseName.localeCompare(b.warehouseName)), journal };
}
