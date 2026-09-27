import { createClient } from "@supabase/supabase-js";
import { processMemoryJob } from "@/lib/memory/process-memory-job";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function runOnce() {
  const { data: jobs, error } = await supabase.rpc(
    "claim_memory_jobs",
    {
      requested_count: 1,
    },
  );

  if (error) {
    throw error;
  }

  for (const job of jobs ?? []) {
    try {
      await processMemoryJob(job.id);
    } catch (error) {
      console.error("[MEMORY JOB] failed", {
        jobId: job.id,
        error,
      });
    }
  }
}

async function main() {
  console.info("[MEMORY WORKER] started");

  while (true) {
    try {
      await runOnce();
    } catch (error) {
      console.error("[MEMORY WORKER] loop error", error);
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});