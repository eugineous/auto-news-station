import Link from "next/link";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Home", href: "/" },
  { label: "News", href: "/news" },
  { label: "Shows", href: "/shows" },
  { label: "Hosts", href: "/hosts" },
  { label: "Artists", href: "/artists" },
  { label: "Projects", href: "/projects" },
  { label: "Contact", href: "/contact" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-black/40 border-b border-white/5">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-purple-700 shadow-lg shadow-fuchsia-500/40" />
          <div className="text-sm font-semibold leading-tight uppercase tracking-[0.18em]">
            <span className="block text-white">PPP TV</span>
            <span className="block text-xs text-cyan-200">Powerful • Precise • Pristine</span>
          </div>
        </Link>
        <nav className="hidden items-center gap-4 text-sm font-medium text-white/80 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-full px-3 py-2 transition-colors duration-200",
                "hover:text-white hover:bg-white/10",
              )}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="#live"
            className="rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 px-3 py-2 text-xs font-semibold text-black shadow-lg shadow-emerald-400/30"
          >
            Live Now
          </Link>
        </nav>
      </div>
    </header>
  );
}
