import { NextResponse, type NextRequest } from "next/server";

/**
 * Single-user access gate. When `APP_ACCESS_SECRET` is set, any request that
 * doesn't carry a matching `app_access` cookie is bounced to /login. This is
 * the POC-grade gate; swap for Auth.js / magic-link before any real sharing.
 */
const PUBLIC_PATHS = ["/login", "/api/login", "/manifest.webmanifest", "/favicon.ico"];

export function proxy(req: NextRequest) {
  const secret = process.env.APP_ACCESS_SECRET;
  if (!secret) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/_next")) return NextResponse.next();

  const cookie = req.cookies.get("app_access")?.value;
  if (cookie === secret) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
