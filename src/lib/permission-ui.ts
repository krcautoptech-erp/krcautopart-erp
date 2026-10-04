export function canPerform(
  codes: readonly string[],
  isOwner: boolean,
  required: string | readonly string[] | null,
) {
  if (required === null || isOwner) return true;
  const permissions = typeof required === "string" ? [required] : required;
  return permissions.some((permission) => codes.includes(permission));
}
