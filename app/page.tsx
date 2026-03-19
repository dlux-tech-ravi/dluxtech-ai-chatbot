import Chatbot from "./components/Chatbot";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070A12] text-white">
      {/* Background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        aria-hidden="true"
      >
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,122,0,0.45),transparent_55%)] blur-2xl" />
        <div className="absolute top-10 -right-52 h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.35),transparent_60%)] blur-2xl" />
        <div className="absolute bottom-[-240px] left-1/3 h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.18),transparent_60%)] blur-2xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.08),transparent_40%),radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.06),transparent_45%)]" />
      </div>

      {/* Header */}
      <header className="relative z-10 mx-auto w-full max-w-6xl px-4 py-4 md:px-10 md:py-6">

  <div className="grid grid-cols-2 items-center w-full">

    {/* LEFT COLUMN (Logo) */}
    <div className="flex items-center justify-start">
      <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-[25%] md:h-[25%]">
        <img
          src="/chatbot-logo-01.gif"
          alt="DL Logo"
          className="h-full w-full object-contain"
        />
      </div>
    </div>

    {/* RIGHT COLUMN (Button) */}
    <div className="flex items-center justify-end">
      <a
        href="#chat"
        className="group inline-flex items-center gap-2 rounded-xl md:rounded-2xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs sm:text-sm md:px-4 md:py-2 font-medium backdrop-blur-md transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
      >
        <span>Book a demo</span>
        <span className="transition group-hover:translate-x-0.5">→</span>
      </a>
    </div>

  </div>

</header>

      {/* Hero */}
      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20 pt-8 md:px-10 md:pt-14">
        <section className="grid gap-10 md:grid-cols-2 md:gap-12">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/80 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_18px_rgba(255,122,0,0.9)]" />
              <span>AI support for DLUX TECH</span>
            </div>

            <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              A sleek, glassy AI chatbot that feels fast, modern, and on-brand.
            </h1>

            <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-white/70">
              Help users discover DLUX TECH services, solutions, and capabilities
              in seconds — with a floating assistant that stays out of the way
              until they need it.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "MarTech consulting",
                "Digital transformation",
                "Platform integrations",
                "Managed services",
              ].map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/75 backdrop-blur-sm"
                >
                  {chip}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="#chat"
                className="inline-flex items-center justify-center rounded-2xl bg-[#FF3901] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(255,122,0,0.35)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
              >
                Try the assistant
              </a>
              <a
                href="#"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-medium text-white/90 backdrop-blur-md transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                See what it can do
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-3xl bg-[radial-gradient(circle_at_20%_20%,rgba(255,122,0,0.22),transparent_60%),radial-gradient(circle_at_70%_40%,rgba(99,102,241,0.22),transparent_60%)] blur-xl" />
            <div className="rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-xl shadow-[0_20px_70px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white/90">
                  Live preview
                </div>
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <span className="h-2 w-2 rounded-full bg-emerald-400/90" />
                  Online
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="w-fit max-w-[90%] rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/85">
                  Ask me about DLUX TECH services, platforms, and capabilities.
                </div>
                <div className="ml-auto w-fit max-w-[90%] rounded-2xl bg-white/90 px-4 py-3 text-sm text-black">
                  What does DLUX TECH specialize in?
                </div>
                <div className="w-fit max-w-[90%] rounded-2xl border border-orange-400/25 bg-gradient-to-b from-orange-500/15 to-white/10 px-4 py-3 text-sm text-white/90">
                  DLUX TECH helps businesses with digital transformation and
                  MarTech consulting, platform implementations, and managed
                  services.
                </div>
              </div>

              <div
                id="features"
                className="mt-6 grid grid-cols-2 gap-3 text-xs text-white/70"
              >
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                Adobe Workfront
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                Adobe Workfront Fusion
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                Aprimo DAM 
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                Salesforce
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Floating chatbot */}
      <Chatbot />
    </div>
  );
}
