import { ReactNode } from "react";

export function StatCard({ label, value, chip, tone = "neutral", children }: { label: string; value: string | number; chip?: string; tone?: "neutral" | "success" | "danger"; children?: ReactNode; }) {
  const color = tone === "success" ? "text-emerald-300" : tone === "danger" ? "text-rose-300" : "text-white";
  return (
    <div className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col gap-2">
      <div className="text-xs uppercase tracking-[0.2em] text-gray-400">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {chip ? <div className="text-[11px] text-gray-500">{chip}</div> : null}
      {children}
    </div>
  );
}
