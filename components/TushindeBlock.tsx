'use client';
import { motion } from "framer-motion";
import Link from "next/link";

const balls = [
  { id: 1, color: "from-amber-400 to-orange-500", delay: 0 },
  { id: 2, color: "from-cyan-400 to-blue-500", delay: 0.2 },
  { id: 3, color: "from-fuchsia-400 to-purple-600", delay: 0.4 },
];

export function TushindeBlock() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-cyan-400/30 bg-gradient-to-r from-[#0f172a] via-[#111827] to-[#0f172a] p-6 shadow-2xl shadow-cyan-500/10 md:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(236,72,153,0.12),transparent_25%)]" />
      <div className="relative grid gap-6 md:grid-cols-[2fr,1fr] md:items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Tushinde.com</p>
          <h3 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
            Fast payouts, live odds, daily boosts — showcased with responsible, high-impact placements.
          </h3>
          <p className="mt-3 text-sm text-white/70">
            We ship original artwork (PNG icons, no emojis), reserve responsive slots, and align with 18+ / responsible gaming requirements.
          </p>
          <div className="mt-4 grid gap-2 text-sm text-white/75">
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
              <span>Hero banner + native cards on PPP TV pages (home, news, shows).</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-cyan-400" />
              <span>Ad-safe spacing with on-error image fallbacks to keep creatives visible.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-fuchsia-400" />
              <span>See the full ad placement guide for gaming/betting verticals.</span>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="https://tushinde.com"
              className="rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-2 text-sm font-semibold text-black shadow-lg shadow-emerald-400/40"
              target="_blank"
            >
              Visit Tushinde.com
            </Link>
            <Link
              href="/tushinde-ad-guide"
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:border-cyan-400/60"
            >
              Ad placement guide
            </Link>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3">
          {balls.map((ball) => (
            <motion.div
              key={ball.id}
              animate={{ y: [0, -12, 0], scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2.4, delay: ball.delay, ease: "easeInOut" }}
              className={`h-16 w-16 rounded-full bg-gradient-to-br ${ball.color} shadow-xl shadow-black/40 md:h-20 md:w-20`}
            >
              <div className="h-full w-full rounded-full border border-white/30" />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
