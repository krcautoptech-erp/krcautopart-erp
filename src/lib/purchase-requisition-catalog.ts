type DatabaseErrorLike = { code?: string | null; message?: string | null };

export function isMissingPurchaseCatalogRpc(error: DatabaseErrorLike | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST202" || Boolean(error.message?.includes("get_purchase_requisition_catalog"));
}

export function formatDatabaseError(error: DatabaseErrorLike | null | undefined) {
  return error ? { code: error.code ?? "unknown", message: error.message ?? "Unknown database error" } : null;
}
