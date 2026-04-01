import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_VALUE } from "@/lib/auth";

const PROTECTED = ["/dashboard", "/composer", "/queue", "/analytics", "/settings", "/accounts", "/content", "/trends", "/calendar", "/intelligence", "/factory", "/competitors"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some(p => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE);
  if (cookie?.value === SESSION_VALUE) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|login|privacy|terms|about|contact|status).*)"],
};
