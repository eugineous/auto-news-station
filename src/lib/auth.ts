// Simple cookie-based auth for admin
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ppptv2024";
export const SESSION_COOKIE = "ppptv_admin_session";
export const SESSION_VALUE = "authenticated";

export function isAuthenticated(request: Request): boolean {
  const cookie = request.headers.get("cookie") || "";
  return cookie.includes(`${SESSION_COOKIE}=${SESSION_VALUE}`);
}
