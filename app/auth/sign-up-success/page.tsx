import Link from "next/link";

export default function Page() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-muted-foreground">
          AnotherU
        </p>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight">
          One last step.
        </h1>

        <p className="mt-5 text-base leading-7 text-muted-foreground">
          We sent a confirmation link to your email. Confirm your account and
          then come back to meet your timelines.
        </p>

        <Link
          href="/auth/login"
          className="mt-8 inline-flex rounded-full bg-foreground px-7 py-3 text-sm font-medium text-background transition hover:opacity-90"
        >
          Continue to login
        </Link>
      </div>
    </main>
  );
}