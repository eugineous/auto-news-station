export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-200">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-400 shadow shadow-red-400/50" />
      Live now • StarTimes CH.430
    </span>
  );
}
