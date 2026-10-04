export type PickerSearchItem = {
  id: string;
  code: string;
  name: string;
  searchText?: string;
  group?: string;
  active?: boolean;
  disabled?: boolean;
};

export function filterPickerItems<T extends PickerSearchItem>(items: T[], query: string, group = "", activeOnly = false) {
  const keyword = query.trim().toLocaleLowerCase("th");
  return items.filter((item) => (!activeOnly || item.active !== false) && (!group || item.group === group) && (!keyword || `${item.code} ${item.name} ${item.searchText ?? ""}`.toLocaleLowerCase("th").includes(keyword)));
}

export function togglePickerSelection(current: Set<string>, id: string, disabled = false, single = false) {
  if (disabled) return current;
  if (single) return new Set([id]);
  const next = new Set(current);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}
