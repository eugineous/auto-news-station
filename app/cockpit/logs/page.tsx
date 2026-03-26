import { CockpitNav } from "@/components/cockpit/CockpitNav";
import { CockpitTopBar } from "@/components/cockpit/CockpitTopBar";

const logs = [
  { ts: "21:30:12", level: "info", msg: "Posted to IG + FB", ctx: "p2" },
  { ts: "21:28:03", level: "warn", msg: "IG image fetch failed, retry", ctx: "p3" },
  { ts: "21:20:44", level: "info", msg: "Cron run complete (1 posted, 2 skipped)", ctx: "cron" },
];

export default function LogsPage() {
  return (
    <div className="min-h-screen bg-[#08080b] text-white">
      <CockpitTopBar />
      <div className="flex">
        <CockpitNav />
        <div className="flex-1 px-4 lg:px-8 py-6 space-y-4">
          <div className="text-xl font-semibold">Logs & Audit</div>
          <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-gray-300">
                <tr>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Level</th>
                  <th className="px-3 py-2 text-left">Message</th>
                  <th className="px-3 py-2 text-left">Context</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, idx) => (
                  <tr key={idx} className="border-t border-white/5">
                    <td className="px-3 py-2 text-gray-300">{l.ts}</td>
                    <td className="px-3 py-2 text-emerald-300">{l.level}</td>
                    <td className="px-3 py-2 text-white">{l.msg}</td>
                    <td className="px-3 py-2 text-gray-400">{l.ctx}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
