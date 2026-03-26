import projects from "@/content/projects.json";
import { SectionHeading } from "@/components/SectionHeading";
import { ProjectCard } from "@/components/ProjectCard";
import Link from "next/link";

export default function ProjectsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Projects"
        title="Campaigns & sponsors"
        description="Branded content, tours, and digital-first experiments."
        cta={
          <Link href="/tushinde-ad-guide" className="text-sm text-cyan-300 hover:text-white">
            Ad placement guide →
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((project) => (
          <ProjectCard key={project.slug} project={project} />
        ))}
      </div>
    </div>
  );
}
