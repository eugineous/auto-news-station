import { CockpitNav } from "@/components/cockpit/CockpitNav";
import { CockpitTopBar } from "@/components/cockpit/CockpitTopBar";

const items = [
  { title: "CTA: Read more on PPPTV", type: "CTA" },
  { title: "Hashtags: #PPPTVKenya #Entertainment", type: "Hashtags" },
  { title: "Template: Breaking News", type: "Template" },
];

export default function LibraryPage() {
  return (
    <div className="min-h-screen bg-[#08080b] text-white">
      <CockpitTopBar />
      <div className="flex">
        <CockpitNav />
        <div className="flex-1 px-4 lg:px-8 py-6 space-y-4">
          <div className="text-xl font-semibold">Content Library</div>
          <div className="grid gap-3 md:grid-cols-3">
            {items.map((i) => (
              <div key={i.title} className="bg-white/5 border border-white/5 rounded-xl p-4">
                <div className="text-xs text-gray-400 mb-1">{i.type}</div>
                <div className="text-white font-semibold">{i.title}</div>
                <button className="mt-3 px-3 py-2 bg-white/10 hover:bg-white/20 rounded text-sm">Use</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
