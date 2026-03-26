import Script from "next/script";

type Props = {
  slotId?: string;
  format?: string;
};

const client = process.env.ADSENSE_CLIENT || "ca-pub-0000000000000000";

export function AdSlot({ slotId = "1234567890", format = "auto" }: Props) {
  return (
    <div className="w-full rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
      <p className="mb-2 font-semibold text-white">Sponsored</p>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
      <Script id="adsense-init" strategy="afterInteractive">
        {(`
          (adsbygoogle = window.adsbygoogle || []).push({});
        `)}
      </Script>
    </div>
  );
}
