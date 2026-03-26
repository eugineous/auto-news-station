import { CockpitPost } from "@/lib/cockpit/data";

export function FailuresPanel({ items }: { items: CockpitPost[] }) {
  const failed = items.filter((i) => i.status === "failed" || i.failures?.length);
  if (!failed.length) return <div className="text-sm text-gray-400">No failures right now.</div>;
  return (
    <div className="grid gap-3">
      {failed.map((item) => (
        <div key={item.id} className="bg-rose-950/40 border border-rose-700/40 rounded-xl p-4">
          <div className="text-xs text-rose-200 mb-1">Failed · {item.category}</div>
          <div className="text-white font-semibold mb-2">{item.title}</div>
          <div className="text-sm text-gray-200 flex flex-wrap gap-2">
            {item.failures?.map((f, idx) => (
              <span key={idx} className="bg-white/10 px-2 py-1 rounded text-xs">
                {f.platform.toUpperCase()}: {f.reason}
              </span>
            ))}
          </div>
          <div className="mt-3 flex gap-2 text-sm">
            <button className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded text-white">Retry</button>
            <button className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded text-gray-200">Regen caption</button>
          </div>
        </div>
      ))}
    </div>
  );
}
