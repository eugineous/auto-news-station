import { CockpitNav } from "@/components/cockpit/CockpitNav";
import { CockpitTopBar } from "@/components/cockpit/CockpitTopBar";
import { FailuresPanel } from "@/components/cockpit/FailuresPanel";
import { mockPosts } from "@/lib/cockpit/data";

export default function FailuresPage() {
  return (
    <div className="min-h-screen bg-[#08080b] text-white">
      <CockpitTopBar />
      <div className="flex">
        <CockpitNav />
        <div className="flex-1 px-4 lg:px-8 py-6 space-y-4">
          <div className="text-xl font-semibold">Failures & Retries</div>
          <FailuresPanel items={mockPosts} />
        </div>
      </div>
    </div>
  );
}
