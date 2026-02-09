import Link from "next/link";

export default function HomePage() {
  return (
    <main className="bb-shell mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-16">
      <section className="space-y-4">
        <p className="inline-flex rounded-full border border-amber-300/50 bg-amber-100/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100">
          Blood Bowl 3 Replay Coach
        </p>
        <h1 className="text-4xl font-black tracking-tight text-amber-100 md:text-5xl">BB Trainer</h1>
        <p className="max-w-3xl text-lg text-amber-50/90">
          Upload your replay, pick your team, and get clear turn-by-turn advice in plain language.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-amber-300/20 bg-black/30 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-100">How it works</h2>
          <p className="mt-2 text-sm text-amber-50/90">Upload once, review your advice, then move on to the next replay.</p>
        </div>
        <div className="rounded-xl border border-amber-300/20 bg-black/30 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-100">What you get</h2>
          <p className="mt-2 text-sm text-amber-50/90">Simple tips on safer move order, reroll use, and ball protection.</p>
        </div>
      </section>

      <div>
        <Link href="/upload" className="inline-flex rounded-lg bg-red-700 px-5 py-3 font-semibold text-white transition hover:bg-red-600">
          Start Replay Coaching
        </Link>
      </div>
    </main>
  );
}
