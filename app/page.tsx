import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          AnotherU
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="rounded-full px-4 py-2 text-sm font-medium transition hover:bg-muted"
          >
            Log in
          </Link>

          <Link
            href="/auth/sign-up"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
          >
            Enter Timeline
          </Link>
        </div>
      </nav>

      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center px-6 pb-20">
        <div className="max-w-4xl">
          <p className="mb-6 text-sm font-medium uppercase tracking-[0.25em] text-muted-foreground">
            AnotherU · Timeline
          </p>

          <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
            Meet the versions
            <br />
            of yourself.
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
            Explore who you were, who you are, who you could become, and the
            versions of you created by the choices you never made.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/auth/sign-up"
              className="rounded-full bg-foreground px-7 py-3.5 text-sm font-medium text-background transition hover:opacity-90"
            >
              Create your timeline
            </Link>

            <Link
              href="/auth/login"
              className="rounded-full border border-border px-7 py-3.5 text-sm font-medium transition hover:bg-muted"
            >
              I already have one
            </Link>
          </div>

          <div className="mt-20 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            {["Past You", "Present You", "Future You", "Another You"].map(
              (label) => (
                <div
                  key={label}
                  className="rounded-2xl border border-border bg-card p-5"
                >
                  <p className="text-sm font-medium">{label}</p>
                </div>
              ),
            )}
          </div>
        </div>
      </section>
    </main>
  );
}