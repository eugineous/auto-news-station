import Link from "next/link";
import { Project } from "@/lib/types";
import { ImageWithFallback } from "./ImageWithFallback";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={project.link}
      target="_blank"
      className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur transition hover:-translate-y-1 hover:border-amber-400/60 hover:shadow-2xl hover:shadow-amber-500/20"
    >
      <div className="relative h-44 w-full overflow-hidden">
        <ImageWithFallback
          src={project.image}
          alt={project.title}
          className="h-full w-full transition duration-500 group-hover:scale-105"
        />
        {project.sponsor ? (
          <div className="absolute left-3 top-3 rounded-full bg-amber-400/90 px-3 py-1 text-xs font-semibold text-black">
            Sponsor
          </div>
        ) : null}
      </div>
      <div className="space-y-2 p-4">
        <h3 className="text-lg font-semibold text-white">{project.title}</h3>
        <p className="text-sm text-white/70 line-clamp-2">{project.description}</p>
      </div>
    </Link>
  );
}
