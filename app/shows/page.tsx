import shows from "@/content/shows.json";
import { SectionHeading } from "@/components/SectionHeading";
import { ShowCard } from "@/components/ShowCard";
import Link from "next/link";

export default function ShowsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Shows"
        title="Programs & segments"
        description="Schedules, formats, and featured clips."
        cta={
          <Link href="/#live" className="text-sm text-cyan-300 hover:text-white">
            Watch live →
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        {shows.map((show) => (
          <ShowCard key={show.slug} show={show} />
        ))}
      </div>
    </div>
  );
}
