import { getPublicCompanyBranding } from "@/lib/company-settings.server";
import { LoginPageClient } from "./login-page-client";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const branding = await getPublicCompanyBranding();
  return <LoginPageClient branding={branding} />;
}
