import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-black/40 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 text-sm text-white/70 md:flex-row md:items-start md:justify-between md:px-6 lg:px-8">
        <div>
          <h4 className="text-white font-semibold">PPP TV Kenya</h4>
          <p className="mt-2 max-w-sm leading-relaxed">
            Kenya&apos;s first 24/7 music & entertainment channel. StarTimes CH.430.
            Powerful • Precise • Pristine.
          </p>
        </div>
        <div>
          <h4 className="text-white font-semibold">Contact</h4>
          <p className="mt-2 leading-relaxed">
            +254 101 121 205<br />
            euginemicah@ppptv.co.ke<br />
            SMS: 29055 / 20455
          </p>
        </div>
        <div>
          <h4 className="text-white font-semibold">Follow</h4>
          <div className="mt-2 flex flex-wrap gap-3">
            {[
              ["YouTube", "https://youtube.com/@ppptvkenya"],
              ["Instagram", "https://instagram.com/ppptvke"],
              ["TikTok", "https://www.tiktok.com/@ppptv_"],
              ["X", "https://twitter.com/PPPTV_ke"],
            ].map(([label, href]) => (
              <Link
                key={href}
                className="rounded-full bg-white/10 px-3 py-1 text-white hover:bg-white/20"
                href={href}
                target="_blank"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-8 text-center text-xs text-white/50">
        © 2026 PPP TV Kenya. Licensed by the Communications Authority of Kenya.
      </div>
    </footer>
  );
}
