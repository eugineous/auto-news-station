import { CockpitNav } from "@/components/cockpit/CockpitNav";
import { CockpitTopBar } from "@/components/cockpit/CockpitTopBar";
import { mockPosts } from "@/lib/cockpit/data";

export default function PublisherPage() {
  return (
    <div className="min-h-screen bg-[#08080b] text-white">
      <CockpitTopBar />
      <div className="flex">
        <CockpitNav />
        <div className="flex-1 px-4 lg:px-8 py-6 space-y-4">
          <div className="text-xl font-semibold">PPP TV Publisher</div>
          <div className="text-sm text-gray-300">Select items to publish to PPP TV site API.</div>
          <div className="grid gap-3">
            {mockPosts.map((p) => (
              <div key={p.id} className="bg-white/5 border border-white/5 rounded-xl p-4 flex items-center gap-3">
                <input type="checkbox" className="accent-pink-500" />
                <div className="flex-1">
                  <div className="text-xs text-gray-400">{p.category}</div>
                  <div className="text-white font-semibold">{p.title}</div>
                </div>
                <button className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded text-sm">Publish</button>
              </div>
            ))}
          </div>
          <button className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-md">Publish selected</button>
        </div>
      </div>
    </div>
  );
}
