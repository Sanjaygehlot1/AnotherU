import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function TimelinePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("about, values, future")
    .eq("id", user.id)
    .maybeSingle();

  const { data: timeline } = await supabase
    .from("timelines")
    .select("id, name, type, description, created_at")
    .eq("user_id", user.id)
    .eq("type", "primary")
    .maybeSingle();

  if (!profile || !timeline) {
    redirect("/onboarding");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="font-semibold tracking-tight">AnotherU</span>

          <span className="text-sm text-muted-foreground">
            Your Timeline
          </span>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <section>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Your Timeline
          </p>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Meet yourself.
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
            This is where your different timelines will live. Your story is
            the starting point.
          </p>
        </section>

        <section className="mt-16">
          <div className="relative">
            <div className="absolute left-6 top-6 bottom-6 w-px bg-border" />

            <TimelineNode
              label="Past You"
              description="The person you were."
              position="past"
            />

            <TimelineNode
              label="Present You"
              description="The person you are now."
              position="present"
              active
            />

            <TimelineNode
              label="Future You"
              description="A possible version of who you could become."
              position="future"
            />

            <TimelineNode
              label="Another You"
              description="A version created by a choice you never made."
              position="alternate"
            />
          </div>
        </section>

        <section className="mt-20 grid gap-6 md:grid-cols-3">
          <IdentityCard
            title="About you"
            content={profile.about}
          />

          <IdentityCard
            title="What matters"
            content={profile.values}
          />

          <IdentityCard
            title="Where you're headed"
            content={profile.future}
          />
        </section>

        <section className="mt-16 rounded-3xl border border-border bg-card p-8">
          <p className="text-sm text-muted-foreground">Current timeline</p>

          <h2 className="mt-2 text-2xl font-semibold">{timeline.name}</h2>

          <p className="mt-3 max-w-xl text-muted-foreground">
            {timeline.description}
          </p>

          <button
            type="button"
            className="mt-6 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition hover:opacity-90"
          >
            Talk to Present You
          </button>
        </section>
      </div>
    </main>
  );
}

function TimelineNode({
  label,
  description,
  position,
  active = false,
}: {
  label: string;
  description: string;
  position: "past" | "present" | "future" | "alternate";
  active?: boolean;
}) {
  return (
    <div className="relative flex gap-6 pb-10 last:pb-0">
      <div
        className={`relative z-10 mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${
          active
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background"
        }`}
      >
        <span className="h-2 w-2 rounded-full bg-current" />
      </div>

      <div className="pt-1">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {position}
        </p>

        <h3 className="mt-1 text-xl font-semibold">{label}</h3>

        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function IdentityCard({
  title,
  content,
}: {
  title: string;
  content: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>

      <p className="mt-4 text-sm leading-7">
        {content || "Nothing here yet."}
      </p>
    </div>
  );
}