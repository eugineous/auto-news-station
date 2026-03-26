import { CockpitNav } from "@/components/cockpit/CockpitNav";
import { CockpitTopBar } from "@/components/cockpit/CockpitTopBar";
import { StatCard } from "@/components/cockpit/StatCard";
import { stats } from "@/lib/cockpit/data";

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen bg-[#08080b] text-white">
      <CockpitTopBar />
      <div className="flex">
        <CockpitNav />
        <div className="flex-1 px-4 lg:px-8 py-6 space-y-4">
          <div className="text-xl font-semibold">Analytics</div>
          <div className="grid md:grid-cols-4 gap-3">
            <StatCard label="Today" value={stats.today} />
            <StatCard label="Success rate" value={`${Math.round((stats.successes / stats.today) * 100)}%`} tone="success" />
            <StatCard label="IG posted" value={stats.ig} />
            <StatCard label="FB posted" value={stats.fb} />
          </div>
          <div className="bg-white/5 border border-white/5 rounded-xl p-4 text-sm text-gray-300">
            Sparkline/graph placeholder — plug in posts/hour and per-category breakdown.
          </div>
        </div>
      </div>
    </div>
  );
}
