import { CockpitNav } from "@/components/cockpit/CockpitNav";
import { CockpitTopBar } from "@/components/cockpit/CockpitTopBar";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#08080b] text-white">
      <CockpitTopBar />
      <div className="flex">
        <CockpitNav />
        <div className="flex-1 px-4 lg:px-8 py-6 space-y-4">
          <div className="text-xl font-semibold">Settings</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-2">
              <div className="text-sm text-gray-300">AI Models</div>
              <select className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white">
                <option>Gemini headline + NVIDIA caption</option>
                <option>Gemini only</option>
                <option>NVIDIA only</option>
              </select>
              <div className="text-xs text-gray-400">Timeout 8s; fallback to excerpt if both fail.</div>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-2">
              <div className="text-sm text-gray-300">Caches</div>
              <div className="flex gap-2 text-sm">
                <button className="px-3 py-2 bg-white/10 rounded">Clear seen</button>
                <button className="px-3 py-2 bg-white/10 rounded">Clear failed</button>
                <button className="px-3 py-2 bg-white/10 rounded">Clear AI</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
