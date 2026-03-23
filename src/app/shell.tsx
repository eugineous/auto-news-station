"use client";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

const NAV = [
  { href: "/dashboard",  icon: "⚡", label: "Command Center" },
  { href: "/composer",   icon: "🎬", label: "Composer"       },
  { href: "/queue",      icon: "📅", label: "Queue"          },
  { href: "/analytics",  icon: "📊", label: "Analytics"      },
  { href: "/accounts",   icon: "🔗", label: "Accounts"       },
  { href: "/content",    icon: "🗂",  label: "Content Library"},
  { href: "/settings",   icon: "⚙️",  label: "Settings"      },
];

const MOBILE_NAV = [
  { href: "/dashboard", icon: "⚡", label: "Home"    },
  { href: "/composer",  icon: "🎬", label: "Compose" },
  { href: "/queue",     icon: "📅", label: "Queue"   },
  { href: "/analytics", icon: "📊", label: "Stats"   },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Close mobile menu on ESC
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mobileOpen]);

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  }

  return (
    <div style={{ display: "flex", minHeight: "100dvh", background: "#141414" }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scaleIn{from{transform:scale(.96);opacity:0}to{transform:scale(1);opacity:1}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-track{background:#1a1a1a}
        ::-webkit-scrollbar-thumb{background:#555;border-radius:4px}

        /* Sidebar nav item */
        .nav-item{display:flex;align-items:center;gap:12px;width:100%;padding:10px 14px;border-radius:8px;background:none;border:none;color:#aaa;font-size:13px;font-weight:500;cursor:pointer;text-align:left;transition:all .15s;white-space:nowrap;overflow:hidden;text-decoration:none}
        .nav-item:hover{background:#1f1f1f;color:#fff}
        .nav-item.active{background:#1f1f1f;color:#fff;border-left:3px solid #E50914}
        .nav-item.active .nav-icon{color:#E50914}
        .nav-item:focus-visible{outline:2px solid #E50914;outline-offset:2px}
        .nav-icon{font-size:16px;flex-shrink:0;width:20px;text-align:center}

        /* Buttons */
        .btn{border:none;border-radius:6px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit;letter-spacing:.2px}
        .btn:disabled{opacity:.4;cursor:not-allowed}
        .btn-red{background:#E50914;color:#fff}
        .btn-red:hover:not(:disabled){background:#c8000f}
        .btn-pink{background:#FF007A;color:#fff}
        .btn-pink:hover:not(:disabled){background:#d4006a}
        .btn-ghost{background:none;border:1px solid #3a3a3a;color:#aaa;padding:8px 14px;font-size:12px;cursor:pointer;border-radius:6px;font-family:inherit;transition:all .15s}
        .btn-ghost:hover{border-color:#666;color:#fff}
        .btn-icon{background:none;border:none;cursor:pointer;padding:6px;border-radius:6px;color:#aaa;font-size:16px;transition:all .15s;display:flex;align-items:center;justify-content:center}
        .btn-icon:hover{background:#1f1f1f;color:#fff}

        /* Cards */
        .card{background:#1f1f1f;border:1px solid #2a2a2a;border-radius:10px}
        .card-dark{background:#181818;border:1px solid #222;border-radius:10px}

        /* Inputs */
        .inp{background:#1a1a1a;border:1px solid #3a3a3a;border-radius:6px;padding:11px 14px;color:#e5e5e5;font-size:14px;outline:none;width:100%;transition:border-color .15s}
        .inp:focus{border-color:#777}
        .inp-sm{padding:8px 12px;font-size:13px}

        /* Tags */
        .tag{border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;display:inline-block;letter-spacing:.5px;text-transform:uppercase}
        .tag-red{background:#E50914;color:#fff}
        .tag-pink{background:#FF007A;color:#fff}
        .tag-dark{background:#2a2a2a;color:#bbb}
        .tag-green{background:rgba(74,222,128,.15);color:#4ade80;border:1px solid rgba(74,222,128,.2)}
        .tag-yellow{background:rgba(251,191,36,.1);color:#fbbf24;border:1px solid rgba(251,191,36,.2)}

        /* Mobile nav */
        .mobile-nav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 0;background:none;border:none;color:#888;cursor:pointer;transition:color .15s;font-size:9px;letter-spacing:1px;font-weight:700;text-transform:uppercase;text-decoration:none}
        .mobile-nav-item.active{color:#E50914}
        .mobile-nav-item:focus-visible{outline:2px solid #E50914;outline-offset:2px}

        /* Fade animation */
        .fade{animation:fadeIn .2s ease}

        /* Responsive */
        @media(max-width:767px){
          .sidebar-desktop{display:none!important}
          .mobile-topbar{display:flex!important}
          .mobile-bottom-nav{display:flex!important}
          .main-content{padding-top:56px!important;padding-bottom:72px!important}
        }
        @media(min-width:768px){
          .sidebar-desktop{display:flex!important}
          .mobile-topbar{display:none!important}
          .mobile-bottom-nav{display:none!important}
        }
      `}</style>

      {/* ── Desktop Sidebar ── */}
      <aside
        className="sidebar-desktop"
        aria-label="Main navigation"
        style={{
          width: collapsed ? 56 : 220,
          background: "#0a0a0a",
          borderRight: "1px solid #1f1f1f",
          display: "none",
          flexDirection: "column",
          height: "100dvh",
          position: "sticky",
          top: 0,
          flexShrink: 0,
          transition: "width .2s ease",
          overflow: "hidden",
        }}
      >
        {/* Logo */}
        <div style={{ padding: collapsed ? "18px 0" : "18px 16px", borderBottom: "1px solid #1f1f1f", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between" }}>
          {!collapsed && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E50914", animation: "pulse 1.5s infinite", flexShrink: 0 }} aria-hidden="true" />
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, lineHeight: 1 }}>
                  PPP<span style={{ color: "#E50914" }}>TV</span>
                </span>
              </div>
              <div style={{ fontSize: 10, color: "#777", letterSpacing: 3, marginTop: 3, paddingLeft: 16, textTransform: "uppercase" }}>Command Center</div>
            </div>
          )}
          {collapsed && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E50914", animation: "pulse 1.5s infinite" }} aria-hidden="true" />}
          <button
            className="btn-icon"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{ flexShrink: 0 }}
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        {/* Nav */}
        <nav aria-label="Sidebar navigation" style={{ flex: 1, padding: "10px 6px", overflowY: "auto", overflowX: "hidden" }}>
          {NAV.map(n => {
            const active = path === n.href || (n.href !== "/dashboard" && path.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`nav-item${active ? " active" : ""}`}
                aria-label={n.label}
                aria-current={active ? "page" : undefined}
                title={collapsed ? n.label : undefined}
                style={{ justifyContent: collapsed ? "center" : "flex-start", paddingLeft: collapsed ? 0 : 14 }}
              >
                <span className="nav-icon" aria-hidden="true">{n.icon}</span>
                {!collapsed && <span>{n.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        {!collapsed && (
          <div style={{ padding: "12px 10px", borderTop: "1px solid #1f1f1f" }}>
            <div style={{ fontSize: 11, color: "#777", letterSpacing: 1, textAlign: "center", marginBottom: 8, fontFamily: "monospace" }}>
              <span aria-label={`Current time: ${time} East Africa Time`}>🕐 {time} EAT</span>
            </div>
            <button className="btn-ghost" style={{ width: "100%", fontSize: 11, padding: "7px 12px", marginBottom: 8 }} onClick={logout} aria-label="Sign out of admin dashboard">
              Sign Out
            </button>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {[["About", "/about"], ["Privacy", "/privacy"], ["Terms", "/terms"], ["Contact", "/contact"]].map(([label, href]) => (
                <Link key={href} href={href} style={{ fontSize: 10, color: "#666", textDecoration: "none" }}
                  onMouseOver={e => (e.currentTarget.style.color = "#aaa")}
                  onMouseOut={e => (e.currentTarget.style.color = "#666")}
                >{label}</Link>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── Mobile Top Bar ── */}
      <div
        className="mobile-topbar"
        role="banner"
        style={{
          display: "none", position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1f1f1f",
          padding: "0 16px", height: 56, alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#E50914", animation: "pulse 1.5s infinite" }} aria-hidden="true" />
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 2 }}>
            PPP<span style={{ color: "#E50914" }}>TV</span>
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }} aria-hidden="true">{time}</span>
          <button
            className="btn-icon"
            onClick={() => setMobileOpen(o => !o)}
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-drawer"
            style={{ fontSize: 20 }}
          >
            ☰
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          id="mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}
          onClick={() => setMobileOpen(false)}
        >
          <div
            style={{ width: 240, background: "#0a0a0a", height: "100%", display: "flex", flexDirection: "column", borderRight: "1px solid #1f1f1f", animation: "slideInLeft .2s ease" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: "16px", borderBottom: "1px solid #1f1f1f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 2 }}>PPP<span style={{ color: "#E50914" }}>TV</span></span>
              <button className="btn-icon" onClick={() => setMobileOpen(false)} aria-label="Close navigation menu" style={{ fontSize: 18 }}>✕</button>
            </div>
            <nav aria-label="Mobile navigation" style={{ flex: 1, padding: "10px 8px" }}>
              {NAV.map(n => {
                const active = path === n.href || (n.href !== "/dashboard" && path.startsWith(n.href));
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`nav-item${active ? " active" : ""}`}
                    aria-label={n.label}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span className="nav-icon" aria-hidden="true">{n.icon}</span>
                    <span>{n.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div style={{ padding: "12px", borderTop: "1px solid #1f1f1f" }}>
              <button className="btn-ghost" style={{ width: "100%", fontSize: 12 }} onClick={logout} aria-label="Sign out">Sign Out</button>
            </div>
          </div>
          <div style={{ flex: 1, background: "rgba(0,0,0,.6)" }} aria-hidden="true" />
        </div>
      )}

      {/* ── Main Content ── */}
      <main id="main-content" className="main-content" style={{ flex: 1, overflowY: "auto", minWidth: 0 }} tabIndex={-1}>
        {children}
      </main>

      {/* ── Mobile Bottom Nav ── */}
      <nav
        className="mobile-bottom-nav"
        aria-label="Mobile bottom navigation"
        style={{
          display: "none", position: "fixed", bottom: 0, left: 0, right: 0,
          background: "rgba(10,10,10,0.97)", backdropFilter: "blur(12px)",
          borderTop: "1px solid #1f1f1f", zIndex: 50,
        }}
      >
        {MOBILE_NAV.map(n => {
          const active = path === n.href || (n.href !== "/dashboard" && path.startsWith(n.href));
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`mobile-nav-item${active ? " active" : ""}`}
              aria-label={n.label}
              aria-current={active ? "page" : undefined}
            >
              <span style={{ fontSize: 20 }} aria-hidden="true">{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
