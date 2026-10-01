import type { Metadata } from "next";
import Image from "next/image";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Temporarily closed",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#0F0A1A] text-[#F7F3EE]">
      {/* Atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 18% 12%, rgba(124, 77, 255, 0.28), transparent 55%), radial-gradient(ellipse 55% 45% at 88% 78%, rgba(201, 162, 39, 0.12), transparent 50%), linear-gradient(165deg, #0F0A1A 0%, #1A1230 48%, #120D1F 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Soft orbit ring */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[42%] h-[min(72vw,520px)] w-[min(72vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10"
        style={{ animation: "sbbsMaintOrbit 18s linear infinite" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[42%] h-[min(48vw,340px)] w-[min(48vw,340px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#C9A227]/20"
        style={{ animation: "sbbsMaintOrbit 28s linear infinite reverse" }}
      />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-6 py-10 sm:px-10 sm:py-14">
        <header className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-3">
            <Image
              src="/brand/gsg-logo.png"
              alt="GSG"
              width={931}
              height={470}
              priority
              className="h-8 w-auto sm:h-9 select-none"
            />
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="font-display text-[15px] font-bold tracking-tight">
                Sell-Safe Buy-Safe
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">
                by GSG Brands
              </span>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E8D48A]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E8D48A] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#E8D48A]" />
            </span>
            Maintenance
          </span>
        </header>

        <div className="flex flex-1 flex-col justify-center py-16 sm:py-20">
          <p
            className="font-serif text-[#E8D48A]/90 text-lg sm:text-xl italic"
            style={{ animation: "sbbsMaintRise 0.9s ease-out both" }}
          >
            A short pause for something better.
          </p>
          <h1
            className="mt-4 font-display text-[clamp(2.4rem,7vw,4.25rem)] font-bold leading-[1.05] tracking-tight text-balance"
            style={{ animation: "sbbsMaintRise 1s ease-out 0.08s both" }}
          >
            We&rsquo;re improving
            <br />
            Sell-Safe Buy-Safe.
          </h1>
          <p
            className="mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-white/65 text-pretty"
            style={{ animation: "sbbsMaintRise 1s ease-out 0.16s both" }}
          >
            The platform is temporarily closed while we finish upgrades. Protected
            checkouts, Hub access, and new payments are paused until we reopen.
          </p>

          <div
            className="mt-10 grid gap-3 sm:grid-cols-2"
            style={{ animation: "sbbsMaintRise 1s ease-out 0.24s both" }}
          >
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                If you already paid
              </p>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                Your funds remain held safely. Existing protected orders are not
                lost.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Need help now
              </p>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                Write us at{" "}
                <a
                  href="mailto:info@gsgbrands.com.gh"
                  className="font-medium text-[#E8D48A] underline decoration-[#E8D48A]/35 underline-offset-4 hover:decoration-[#E8D48A]"
                >
                  info@gsgbrands.com.gh
                </a>
              </p>
            </div>
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <span>GSG Brands · Ghana</span>
          <span>We&rsquo;ll be back shortly. Thank you for your patience.</span>
        </footer>
      </div>

      <style>{`
        @keyframes sbbsMaintRise {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes sbbsMaintOrbit {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
