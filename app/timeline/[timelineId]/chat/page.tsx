import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ChatClient } from "./chat-client";

export const instant = false;

export default async function ChatPage({
  params,
}: {
  params: Promise<{ timelineId: string }>;
}) {
  const { timelineId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: timeline } = await supabase
    .from("timelines")
    .select("id, name, type, description")
    .eq("id", timelineId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!timeline) {
    notFound();
  }

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center px-6">
          <div>
            <p className="text-sm font-semibold">
              {timeline.name}
            </p>

            <p className="text-xs text-muted-foreground">
              {timeline.type === "primary"
                ? "Present You"
                : timeline.type}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 px-6 py-10">
        <div className="flex w-full flex-col">
          <div className="mb-10 text-center">
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
              Present You
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight">
              What do you want to ask yourself?
            </h1>

            <p className="mx-auto mt-5 max-w-xl leading-7 text-muted-foreground">
              This conversation belongs to your present timeline.
            </p>
          </div>

          <ChatClient timelineId={timeline.id} />
        </div>
      </div>
    </main>
  );
}