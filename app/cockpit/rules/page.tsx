import { CockpitNav } from "@/components/cockpit/CockpitNav";
import { CockpitTopBar } from "@/components/cockpit/CockpitTopBar";

const toggles = [
  { label: "Pause autoposter", desc: "Stop cron publishes", defaultOn: false },
  { label: "Quiet hours 00:00-06:00", desc: "Skip posting overnight", defaultOn: true },
  { label: "IG only for MUSIC", desc: "Route MUSIC to Instagram only", defaultOn: false },
  { label: "Per-hour cap: 6", desc: "Limit total posts per hour", defaultOn: false },
];

export default function RulesPage() {
  return (
    <div className="min-h-screen bg-[#08080b] text-white">
      <CockpitTopBar />
      <div className="flex">
        <CockpitNav />
        <div className="flex-1 px-4 lg:px-8 py-6 space-y-4">
          <div className="text-xl font-semibold">Rules & Throttles</div>
          <div className="grid gap-3 md:grid-cols-2">
            {toggles.map((t) => (
              <div key={t.label} className="bg-white/5 border border-white/5 rounded-xl p-4 flex items-start gap-3">
                <input type="checkbox" defaultChecked={t.defaultOn} className="mt-1 accent-pink-500" />
                <div>
                  <div className="text-white font-semibold">{t.label}</div>
                  <div className="text-sm text-gray-300">{t.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
