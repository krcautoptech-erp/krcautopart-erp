import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/update-session";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.webmanifest and sw.js (PWA public assets)
     * - products/asico (product images folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|products/asico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
