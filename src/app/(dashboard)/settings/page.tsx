import { redirect } from "next/navigation";
import { SYSTEM_SETTING_GROUPS } from "@/lib/system-settings";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: permissions } = await supabase.rpc("get_current_user_permission_codes");
  const permissionCodes = new Set(permissions ?? []);
  let firstAccessibleHref: string | null = null;
  for (const group of SYSTEM_SETTING_GROUPS) {
    const item = group.items.find((candidate) => permissionCodes.has(candidate.permission));
    if (item) {
      firstAccessibleHref = item.href;
      break;
    }
  }

  redirect(firstAccessibleHref ?? "/workspace");
}
