import { CockpitNav } from "@/components/cockpit/CockpitNav";
import { CockpitTopBar } from "@/components/cockpit/CockpitTopBar";
import { QueueList } from "@/components/cockpit/QueueList";
import { mockPosts } from "@/lib/cockpit/data";

export default function QueuePage() {
  return (
    <div className="min-h-screen bg-[#08080b] text-white">
      <CockpitTopBar />
      <div className="flex">
        <CockpitNav />
        <div className="flex-1 px-4 lg:px-8 py-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xl font-semibold">Queue</div>
            <div className="flex gap-2 text-sm">
              <button className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded">Reorder</button>
              <button className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded">Bulk actions</button>
            </div>
          </div>
          <QueueList items={mockPosts} />
        </div>
      </div>
    </div>
  );
}
