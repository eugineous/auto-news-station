import { SectionHeading } from "@/components/SectionHeading";
import { AdSlot } from "@/components/AdSlot";
import Link from "next/link";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Contact"
        title="Advertise or reach the desk"
        description="Reach 2.5M daily viewers across TV + digital. StarTimes CH.430."
        cta={
          <Link href="/tushinde-ad-guide" className="text-sm text-cyan-300 hover:text-white">
            Ad placement guide →
          </Link>
        }
      />
      <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-white/80">
          Sales & partnerships: sales@ppptv.co.ke<br />
          News desk: news@ppptv.co.ke<br />
          Phone: +254 101 121 205<br />
          SMS: 29055 / 20455
        </p>
        <div className="flex flex-wrap gap-3 text-sm text-white/70">
          <span className="rounded-full bg-white/10 px-3 py-1">StarTimes CH.430</span>
          <span className="rounded-full bg-white/10 px-3 py-1">Ad slots ready</span>
          <span className="rounded-full bg-white/10 px-3 py-1">Campus tours</span>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <h3 className="text-white font-semibold">Pitch your story</h3>
          <p className="text-sm text-white/70">
            Share a link and 2–3 bullets; the desk will review for Urban News or Campus Xposure.
          </p>
        </div>
        <AdSlot />
      </div>
    </div>
  );
}
