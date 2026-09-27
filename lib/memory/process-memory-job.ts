import { createClient } from "@supabase/supabase-js";
import { extractMemories } from "@/lib/ai/memory-extractor";
import { saveMemories } from "@/lib/memory/memory-service";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_ATTEMPTS = 3;

export async function processMemoryJob(jobId: string) {
  const { data: job, error: jobError } = await supabase
    .from("memory_jobs")
    .select(`
      id,
      user_id,
      timeline_id,
      source_message_id,
      attempts,
      status
    `)
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    throw new Error(`Memory job not found: ${jobId}`);
  }

  if (job.status !== "running") {
    return;
  }

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select("id, user_id, content")
    .eq("id", job.source_message_id)
    .single();

  if (messageError || !message) {
    throw new Error(
      `Source message not found: ${job.source_message_id}`,
    );
  }

  try {
    const extraction = await extractMemories(message.content);

    const savedCount = await saveMemories({
      userId: job.user_id,
      timelineId: job.timeline_id,
      sourceMessageId: message.id,
      candidates: extraction.memories,
    });

    await supabase
      .from("memory_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        locked_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.info("[MEMORY JOB] completed", {
      jobId: job.id,
      extracted: extraction.memories.length,
      saved: savedCount,
    });
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : String(error);

    const failed = job.attempts >= MAX_ATTEMPTS;

    await supabase
      .from("memory_jobs")
      .update({
        status: failed ? "failed" : "queued",
        available_at: failed
          ? new Date().toISOString()
          : new Date(Date.now() + 10_000).toISOString(),
        locked_at: null,
        last_error: messageText.slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    throw error;
  }
}