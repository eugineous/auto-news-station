import { SocialLinks as Social } from "@/lib/types";

const labels: Record<keyof Social, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  facebook: "Facebook",
};

export function SocialLinks({ socials }: { socials: Social }) {
  const entries = Object.entries(socials).filter(([, url]) => Boolean(url));
  if (!entries.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {entries.map(([key, url]) => (
        <a
          key={key}
          href={url as string}
          target="_blank"
          className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20"
        >
          {labels[key as keyof Social]}
        </a>
      ))}
    </div>
  );
}
