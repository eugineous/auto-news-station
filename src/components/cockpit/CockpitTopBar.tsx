import Link from "next/link";
import { heartbeat } from "@/lib/cockpit/data";

export function CockpitTopBar() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-[#0c0c0f]/80 border-b border-white/5 px-4 lg:px-8 py-3 flex items-center gap-3 justify-between">
      <div>
        <div className="text-xs text-gray-400">Autoposter</div>
        <div className="text-lg font-semibold text-white flex items-center gap-2">
          {heartbeat.paused ? (
            <span className="text-amber-400">Paused</span>
          ) : (
            <span className="text-emerald-400">Live · every 10m</span>
          )}
          <span className="text-xs text-gray-500">Next: {heartbeat.nextRun}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <button className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-md border border-white/10">Run now</button>
        <button className="bg-pink-500 hover:bg-pink-600 text-white px-3 py-2 rounded-md shadow">Pause</button>
        <Link href="/cockpit/deploy" className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-md border border-white/10">Deploy</Link>
      </div>
    </header>
  );
}
