import { categoryColors, CockpitPost } from "@/lib/cockpit/data";
import { cn } from "@/lib/utils";

export function QueueList({ items }: { items: CockpitPost[] }) {
  return (
    <div className="grid gap-3">
      {items.map((item) => {
        const color = categoryColors[item.category?.toUpperCase()] || "#E50914";
        return (
          <div key={item.id} className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col md:flex-row gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-black px-2 py-1 rounded" style={{ background: color, color: "#000" }}>
                  {item.category}
                </span>
                <span className="text-[11px] text-gray-400">{item.status === "sent" ? item.postedAt : `ETA ${item.eta || "—"}`}</span>
              </div>
              <div className="text-lg font-semibold text-white leading-snug line-clamp-2">{item.title}</div>
              <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                <span className={cn(item.platforms.includes("instagram") ? "text-emerald-300" : "text-gray-500")}>IG</span>
                <span className={cn(item.platforms.includes("facebook") ? "text-emerald-300" : "text-gray-500")}>FB</span>
                {item.failures?.length ? (
                  <span className="text-rose-300">{item.failures.length} failed</span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2 md:flex-col md:items-end">
              <button className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-md text-sm">Edit</button>
              <button className="px-3 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-md text-sm">Send now</button>
              <button className="px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-200 rounded-md text-sm">Skip</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
