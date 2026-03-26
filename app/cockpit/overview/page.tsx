import { CockpitNav } from "@/components/cockpit/CockpitNav";
import { CockpitTopBar } from "@/components/cockpit/CockpitTopBar";
import { FailuresPanel } from "@/components/cockpit/FailuresPanel";
import { QueueList } from "@/components/cockpit/QueueList";
import { StatCard } from "@/components/cockpit/StatCard";
import { heartbeat as hbFallback, mockPosts, stats as statsFallback } from "@/lib/cockpit/data";
import { useCockpitFetch } from "@/lib/cockpit/hooks";

export default function OverviewPage() {
  const fetchedStats = useCockpitFetch("/api/cockpit/stats", { stats: statsFallback }) as { stats: typeof statsFallback };
  const fetchedHB = useCockpitFetch("/api/cockpit/heartbeat", { heartbeat: hbFallback, stats: statsFallback }) as {
    heartbeat: typeof hbFallback;
    stats: typeof statsFallback;
  };
  const recent = mockPosts.slice(0, 3);
  return (
    <div className="min-h-screen bg-[#08080b] text-white">
      <CockpitTopBar />
      <div className="flex">
        <CockpitNav />
        <div className="flex-1 px-4 lg:px-8 py-6 space-y-6">
          <div className="grid md:grid-cols-4 gap-3">
            <StatCard label="Today" value={fetchedStats.stats?.today ?? statsFallback.today} chip="posts" />
            <StatCard label="Success" value={`${fetchedStats.stats?.successes ?? statsFallback.successes}/${fetchedStats.stats?.today ?? statsFallback.today}`} tone="success" />
            <StatCard label="Failures" value={fetchedStats.stats?.failures ?? statsFallback.failures} tone="danger" />
            <StatCard label="Next run" value={fetchedHB.heartbeat?.nextRun ?? hbFallback.nextRun} chip={fetchedHB.heartbeat?.paused ? "paused" : "cron */10"} />
          </div>

          <section className="grid lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="text-sm text-gray-300">Recent posts</div>
              <QueueList items={recent} />
            </div>
            <div className="space-y-3">
              <div className="text-sm text-gray-300">Top failures</div>
              <FailuresPanel items={mockPosts} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
