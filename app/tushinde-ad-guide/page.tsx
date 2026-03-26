import { SectionHeading } from "@/components/SectionHeading";

const advertiseSteps = [
  "Reach out via contact/support and ask for ad inventory; many gaming sites sell directly.",
  "If no direct offer, use gaming-friendly networks (Adsterra, PropellerAds, AADS) to place creative safely.",
  "Use formats that respect play flow: banners, native tiles, short video prerolls, pop-under only if allowed.",
  "Place creatives at natural breaks (pre-game, round breaks, loading states) to improve CTR without annoying players.",
];

const promoteSteps = [
  "Check for an affiliate/partner program; if missing, ask support to issue a tracked link.",
  "Fallback: join iGaming affiliate networks (Affilka, Alpha Affiliates, Betting.Partners) and run hybrid deals (revshare + CPA).",
  "Add mandatory compliance: 18+ label, responsible-gambling line, and geo-specific rules for each campaign.",
  "Design light, mobile-first banners (≤150KB) with clear CTA and legal footers.",
];

const checklist = [
  "Confirm the site allows third-party ads or affiliate links.",
  "Tag links with UTM parameters; verify dashboards are reporting.",
  "Test 2–3 creative variants for 7–14 days before scaling.",
  "Keep spacing between ads; avoid crowding primary content.",
];

export default function TushindeGuidePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Tushinde"
        title="Ad placement guide for gaming/betting verticals"
        description="Actionable steps to place or promote Tushinde-style campaigns with compliance and good UX."
      />

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-white text-lg font-semibold">Advertise on gaming sites</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/80 list-disc list-inside">
            {advertiseSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-white text-lg font-semibold">Promote Tushinde elsewhere</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/80 list-disc list-inside">
            {promoteSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-black/40 p-6">
        <h3 className="text-white text-lg font-semibold">Compliance essentials</h3>
        <p className="mt-2 text-sm text-white/75">
          Always display age gating (18+), responsible gambling text, and follow geo-specific advertising laws. For Google/Meta, ensure the account is certified for gambling ads where permitted.
        </p>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-white text-lg font-semibold">Quick checklist</h3>
        <ul className="mt-3 space-y-2 text-sm text-white/80 list-disc list-inside">
          {checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
