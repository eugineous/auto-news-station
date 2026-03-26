import newsData from "@/content/news.json";
import shows from "@/content/shows.json";
import hosts from "@/content/hosts.json";
import artists from "@/content/artists.json";
import projects from "@/content/projects.json";
import { NewsCard } from "@/components/NewsCard";
import { SectionHeading } from "@/components/SectionHeading";
import { LiveBadge } from "@/components/LiveBadge";
import { TushindeBlock } from "@/components/TushindeBlock";
import { AdSlot } from "@/components/AdSlot";
import { ShowCard } from "@/components/ShowCard";
import { HostCard } from "@/components/HostCard";
import { ArtistCard } from "@/components/ArtistCard";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

const heroNews = newsData.filter((n) => n.featured).slice(0, 2);
const latestNews = newsData.slice(0, 4);

export default function Home() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pt-6 md:px-6 lg:px-8">
      <section className="grid gap-6 md:grid-cols-[2fr,1.1fr] md:items-start">
        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow">
          <LiveBadge />
          <h1 className="text-3xl font-semibold text-white md:text-4xl">
            PPP TV: Kenya&apos;s youth entertainment powerhouse
          </h1>
          <p className="text-sm text-white/70">
            Music, culture, live shows, and creator energy. Broadcasting 24/7 on StarTimes CH.430 and everywhere online.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {heroNews.map((item) => (
              <NewsCard key={item.slug} item={item} variant="hero" />
            ))}
          </div>
        </div>
        <div className="space-y-4 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-6 shadow-glow">
          <SectionHeading
            eyebrow="Live Stream"
            title="Watch PPP TV Live"
            description="Catch Urban News, Campus Xposure, and nonstop music."
          />
          <div
            className="aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/60"
            id="live"
          >
            <iframe
              src={process.env.LIVE_STREAM_URL || "https://www.youtube.com/embed/aqz-KE-bpKQ"}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="PPP TV Live"
            />
          </div>
          <AdSlot />
        </div>
      </section>

      <section>
        <SectionHeading
          eyebrow="Latest"
          title="Fresh on PPP TV"
          description="Headlines, premieres, and drops from the desk."
          cta={<Link href="/news" className="text-sm text-cyan-300 hover:text-white">See all news →</Link>}
        />
        <div className="grid gap-4 md:grid-cols-2">
          {latestNews.map((item) => (
            <NewsCard key={item.slug} item={item} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          eyebrow="Shows"
          title="Shows & Schedule"
          description="Anchor programs with live polls, DJs, and campus takeovers."
          cta={<Link href="/shows" className="text-sm text-cyan-300 hover:text-white">Full lineup →</Link>}
        />
        <div className="grid gap-4 md:grid-cols-3">
          {shows.map((show) => (
            <ShowCard key={show.slug} show={show} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          eyebrow="Talent"
          title="Faces of PPP TV"
          description="Hosts, editors, and resident DJs driving the vibe."
          cta={<Link href="/hosts" className="text-sm text-cyan-300 hover:text-white">Meet the squad →</Link>}
        />
        <div className="grid gap-4 md:grid-cols-2">
          {hosts.map((host) => (
            <HostCard key={host.slug} host={host} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          eyebrow="Artists"
          title="On Rotation"
          description="Kenyan artists & DJs featured on PPP TV."
          cta={<Link href="/artists" className="text-sm text-cyan-300 hover:text-white">All artists →</Link>}
        />
        <div className="grid gap-4 md:grid-cols-2">
          {artists.map((artist) => (
            <ArtistCard key={artist.slug} artist={artist} />
          ))}
        </div>
      </section>

      <TushindeBlock />

      <section>
        <SectionHeading
          eyebrow="Projects"
          title="Projects & Partners"
          description="Sponsored moments and PPP TV initiatives."
          cta={<Link href="/projects" className="text-sm text-cyan-300 hover:text-white">All projects →</Link>}
        />
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <div key={project.slug} className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                {project.sponsor ? "Sponsor" : "Project"}
              </p>
              <p className="text-white font-semibold">{project.title}</p>
              <p className="text-sm text-white/70">{project.description}</p>
              <Link href={project.link} target="_blank" className="text-sm text-cyan-300 hover:text-white">
                View →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <SectionHeading
          eyebrow="Coverage"
          title="2.5M daily reach across Kenya"
          description="StarTimes CH.430 • YouTube 778K subs • TikTok & IG stories daily. Newsletter drops weekly."
        />
        <div className="flex flex-wrap gap-3 text-sm text-white/70">
          <div className="rounded-full bg-white/10 px-3 py-1">StarTimes CH.430</div>
          <div className="rounded-full bg-white/10 px-3 py-1">SMS 29055 / 20455</div>
          <div className="rounded-full bg-white/10 px-3 py-1">Live polls & UGC</div>
          <div className="rounded-full bg-white/10 px-3 py-1">Campus tours</div>
          <div className="rounded-full bg-white/10 px-3 py-1">Bilingual (EN/SWA/Sheng)</div>
          <div className="rounded-full bg-white/10 px-3 py-1">Ad-ready slots</div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <SectionHeading
          eyebrow="Latest"
          title="Press & Release Notes"
          description="Instant refresh available via /api/news?limit=200&force=1"
        />
        <div className="grid gap-3 md:grid-cols-2">
          {newsData.slice(0, 3).map((item) => (
            <div
              key={item.slug}
              className="rounded-2xl border border-white/10 bg-black/30 p-4 shadow-inner shadow-black/30"
            >
              <div className="text-xs text-white/60">{formatDate(item.publishedAt)}</div>
              <div className="text-white font-semibold">{item.title}</div>
              <div className="text-sm text-white/70">{item.excerpt}</div>
              <Link href={`/news/${item.slug}`} className="text-sm text-cyan-300 hover:text-white">
                Read →
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
