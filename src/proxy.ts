import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/update-session";

export async function proxy(request: NextRequest) {
  // The scheduled Push worker authenticates with its own server-only Bearer
  // secret and has no browser session cookie.
  if (request.nextUrl.pathname === "/api/internal/push/dispatch") {
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.webmanifest, sw.js, and offline.html (PWA public assets)
     * - products/asico (product images folder)
     * - public images and fonts
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|offline\\.html|products/asico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|otf|eot)$).*)",
  ],
};
