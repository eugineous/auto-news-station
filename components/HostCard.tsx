import Link from "next/link";
import { Host } from "@/lib/types";
import { ImageWithFallback } from "./ImageWithFallback";
import { SocialLinks } from "./SocialLinks";

export function HostCard({ host }: { host: Host }) {
  return (
    <Link
      href={`/hosts/${host.slug}`}
      className="group flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur transition hover:-translate-y-1 hover:border-cyan-400/60 hover:shadow-2xl hover:shadow-cyan-500/20"
    >
      <div className="h-20 w-20 overflow-hidden rounded-xl">
        <ImageWithFallback
          src={host.image}
          alt={host.name}
          className="h-full w-full transition duration-500 group-hover:scale-105"
        />
      </div>
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-white">{host.name}</h3>
        <p className="text-sm text-cyan-200">{host.role}</p>
        <p className="mt-1 text-sm text-white/70 line-clamp-2">{host.bio}</p>
        <SocialLinks socials={host.socials} />
      </div>
    </Link>
  );
}
