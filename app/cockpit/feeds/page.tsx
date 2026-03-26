import { CockpitNav } from "@/components/cockpit/CockpitNav";
import { CockpitTopBar } from "@/components/cockpit/CockpitTopBar";
import { FeedTable } from "@/components/cockpit/FeedTable";
import { mockFeed } from "@/lib/cockpit/data";

export default function FeedsPage() {
  return (
    <div className="min-h-screen bg-[#08080b] text-white">
      <CockpitTopBar />
      <div className="flex">
        <CockpitNav />
        <div className="flex-1 px-4 lg:px-8 py-6 space-y-4">
          <div className="text-xl font-semibold">Feeds</div>
          <div className="text-sm text-gray-300">Primary PPP TV worker feed plus fallback sources. Add items to queue, block noisy sources.</div>
          <FeedTable items={mockFeed} />
        </div>
      </div>
    </div>
  );
}
