import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = request.nextUrl.clone();
  if (
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/favicon.ico") ||
    url.pathname.startsWith("/products/asico")
  ) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set({ name, value, ...options }),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set({ name, value, ...options }),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: isActive, error: activeError } = await supabase.rpc(
      "is_current_user_active",
    );

    if (!activeError && isActive === false) {
      await supabase.auth.signOut();
      url.pathname = "/login";
      url.searchParams.set("reason", "account_suspended");
      return NextResponse.redirect(url);
    }
  }

  if (!user && url.pathname !== "/login" && !url.pathname.startsWith("/auth")) {
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && url.pathname === "/login") {
    url.pathname = "/items";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
