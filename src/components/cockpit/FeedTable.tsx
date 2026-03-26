import { FeedItem, categoryColors } from "@/lib/cockpit/data";

export function FeedTable({ items }: { items: FeedItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/5 bg-white/5">
      <table className="min-w-full text-sm">
        <thead className="bg-white/5 text-gray-300">
          <tr>
            <th className="text-left px-3 py-2">Title</th>
            <th className="text-left px-3 py-2">Category</th>
            <th className="text-left px-3 py-2">Source</th>
            <th className="text-left px-3 py-2">Age</th>
            <th className="text-left px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-white/5">
              <td className="px-3 py-2 text-white">{item.title}</td>
              <td className="px-3 py-2">
                <span
                  className="text-[11px] font-black px-2 py-1 rounded"
                  style={{ background: categoryColors[item.category.toUpperCase()] || "#E50914", color: "#000" }}
                >
                  {item.category}
                </span>
              </td>
              <td className="px-3 py-2 text-gray-300">{item.source}</td>
              <td className="px-3 py-2 text-gray-400">{item.age}</td>
              <td className="px-3 py-2 text-sm flex gap-2">
                <button className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-white">Add to queue</button>
                <button className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded text-gray-300">Block</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
