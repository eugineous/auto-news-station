import { CockpitNav } from "@/components/cockpit/CockpitNav";
import { CockpitTopBar } from "@/components/cockpit/CockpitTopBar";

export default function DeployPage() {
  return (
    <div className="min-h-screen bg-[#08080b] text-white">
      <CockpitTopBar />
      <div className="flex">
        <CockpitNav />
        <div className="flex-1 px-4 lg:px-8 py-6 space-y-4">
          <div className="text-xl font-semibold">Deploy</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="bg-white/5 border border-white/5 rounded-xl p-4">
              <div className="text-sm text-gray-300 mb-2">Vercel Frontend</div>
              <button className="px-4 py-2 bg-pink-500 hover:bg-pink-600 rounded text-white">Redeploy</button>
              <div className="text-xs text-gray-400 mt-2">Shows latest deployment log output here.</div>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-xl p-4">
              <div className="text-sm text-gray-300 mb-2">Cloudflare Worker</div>
              <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded text-white">Deploy worker</button>
              <div className="text-xs text-gray-400 mt-2">Runs wrangler deploy; capture log stream.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
