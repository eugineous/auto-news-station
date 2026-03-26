"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/cockpit/overview", label: "Overview" },
  { href: "/cockpit/queue", label: "Queue" },
  { href: "/cockpit/feeds", label: "Feeds" },
  { href: "/cockpit/composer", label: "Composer" },
  { href: "/cockpit/failures", label: "Failures" },
  { href: "/cockpit/library", label: "Library" },
  { href: "/cockpit/publisher", label: "Publisher" },
  { href: "/cockpit/rules", label: "Rules" },
  { href: "/cockpit/analytics", label: "Analytics" },
  { href: "/cockpit/logs", label: "Logs" },
  { href: "/cockpit/settings", label: "Settings" },
  { href: "/cockpit/deploy", label: "Deploy" },
];

export function CockpitNav() {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:block w-60 shrink-0 bg-[#0c0c0f]/80 backdrop-blur border-r border-white/5 text-sm">
      <div className="px-4 pt-5 pb-4">
        <div className="text-xs uppercase tracking-[0.4em] text-pink-400 font-bold mb-3">PPP TV</div>
        <div className="text-lg font-black text-white">Cockpit</div>
      </div>
      <nav className="flex flex-col gap-1 px-2 pb-4">
        {links.map((l) => {
          const active = pathname?.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "px-3 py-2 rounded-md transition-colors",
                active
                  ? "bg-white/10 text-white border border-white/10"
                  : "text-gray-400 hover:text-white hover:bg-white/5",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
