import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function RolePermissionPage() {
  redirect("/settings/users?tab=roles");
}
