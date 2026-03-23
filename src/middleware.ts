import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_VALUE } from "@/lib/auth";

// Public paths that don't require auth
const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.json",
  "/favicon.ico",
  "/sw.js",
  "/ppp-logo.png",
  "/icon-192.png",
  "/icon-512.png",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // Check session cookie
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (session !== SESSION_VALUE) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
