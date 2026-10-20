# AnotherU — Living Project Log

**Document version:** 0.1  
**Last reviewed:** 2026-10-20  
**Status:** Baseline reconstructed from our development conversation; verify against current repository before treating implementation details as final.

> **Documentation rule:** Update this document alongside every meaningful implementation change, architectural decision, bug fix, migration, or newly discovered limitation. Do not mark changes as completed until code/tests/logs support them. Include dates, affected files, rationale, trade-offs, verification, and next action. Keep historical decisions; mark superseded decisions rather than erasing them.

## 1. Product vision

AnotherU explores identity across time. Current priority is **Present You**: a conversational representation grounded in the user's actual profile, prior statements, durable memories, and evolving life events. It should adapt to the user's conversational style without inventing experiences, motivations, relationships, or events. **Alternate You/multiverse timelines** are a later phase; unlike Present You they may contain internally consistent counterfactual narratives explicitly separated from reality.

Core requirements:
- Credible, natural, personalized conversation rather than generic coaching.
- Persistent, cross-conversation recall with evidence and temporal updates.
- Strict timeline separation, user authorization, provenance, and ability to correct/delete knowledge.
- No model fine-tuning required for the present integration milestone; reassess after data quality, evals, and baseline architecture are stable.
- Treat safety, correctness, and long-term maintainability as higher priority than stacking ad-hoc implementations.

## 2. Current stack and component responsibilities

| Component | Responsibility | Status / caveat |
| --- | --- | --- |
| Next.js / TypeScript | UI, authenticated request handling, streamed conversations | Working in observed tests |
| Supabase Auth/Postgres | Auth, profiles, messages, conversations, authoritative timeline event/evidence data | Working for chat; event-write RLS issue last observed |
| Ollama (`qwen3.5:4b`) | Present You conversation and local extraction | Working; CPU prompt evaluation latency significant |
| Ollama (`nomic-embed-text`) | Embeddings | Working in observed tests |
| Graphiti Python service | Episode ingestion, entity/relation extraction, time-aware retrieval | End-to-end ingestion and retrieval proven |
| Neo4j Community 5.26.x | Graphiti graph storage | Running in observed tests |
| Supabase `memory_jobs` / persistent memories | Existing durable memory pipeline | Retained; revisit overlap only after evaluating evidence |
| `timeline_events` + `timeline_event_evidence` | Structured, authoritative life event state and provenance | Extractor works; insert last failed RLS check |

### Architectural flow

```text
Authenticated user message
   -> Supabase messages (authoritative record)
   -> Context construction:
         user profile + recent conversation
         Supabase memories + Graphiti temporal facts (timeline-scoped)
   -> Present You (Ollama) -> streamed response -> persisted assistant message
   -> post-response ingestion (currently best-effort):
         Graphiti episode -> Neo4j entities and temporal facts
         Event extraction/validation/resolution -> Supabase timeline_events + evidence
```

**Important distinctions:**
- Supabase is the source of truth for messages, profiles, and structured timeline state.
- Graphiti/Neo4j is a derived temporal knowledge/retrieval layer, not unquestionable user truth; mistaken inference must not silently become a confirmed life event.
- Present You and alternate narrative timelines must not share facts inadvertently.
- Existing event tables are not obsolete merely because custom *event search* was retired.

## 3. Decisions and rationale

| Date | Decision | Rationale | Status |
| --- | --- | --- | --- |
| 2026-09 (conversation) | Focus development on Present You first; postpone alternate timelines | Ground real identity/memory before simulated variants | Active |
| 2026-09 (conversation) | Keep Supabase authoritative; use Graphiti + Neo4j for temporal graph retrieval | Avoid building a bespoke knowledge-graph/retrieval system | Active |
| 2026-09 (conversation) | Retire custom semantic timeline-event retrieval, retain structured event storage | Eliminate redundant retrieval while preserving authoritative events | In progress; verify unused code before deleting |
| 2026-09 (conversation) | Namespace graph data per timeline | Prevent cross-timeline leakage | Implemented in observed Graphiti integration |
| 2026-09 (conversation) | Use Graphiti-compatible group IDs `anotheru-timeline-<UUID>` (no colons) | Graphiti rejects colon-containing group IDs | Implemented after 500 errors |
| 2026-09 (conversation) | Use speaker-attributed user episodes for Graphiti | Enabled reliable `Sanjay -> uses -> Arch Linux` relationship extraction | Proven in test |
| 2026-09 (conversation) | Preserve Graphiti's schema handling while disabling thinking via a thin Ollama OpenAI-compatible wrapper | Prevent empty responses/long reasoning while retaining structured output | Observed working with local model; upgrade compatibility requires regression tests |
| 2026-09 (conversation) | Separate post-response ingestion from immediate chat generation | Avoid putting expensive extraction on critical response path | Best-effort via Next.js `after()`; not durable yet |
| 2026-09 (conversation) | Keep extraction schema strict; validate business invariants before Supabase writes | Do not silently turn malformed extraction into false facts | Implemented/prescribed; verify repo |
| 2026-10-20 | Maintain this living architectural/project log | Continuity across chats, change audit, context sharing | Established |

## 4. Verified milestones (based on provided logs)

- Ollama local model chat and embeddings respond.
- Graphiti smoke ingestion extracted **7 entities, 5 edges**, and retrieved fact results from Neo4j.
- Temporal smoke test showed earlier Mumbai residence invalidated and Pune residence retained as open-ended (do not assume all future updates will work correctly).
- Graphiti service `/search` and `/episodes` each returned HTTP 200 for the actual application.
- A stored event/fact linked **Sanjay → USES_AS_MAIN_DEVELOPMENT_ENVIRONMENT → Arch Linux** under a timeline-scoped group.
- A **new conversation** asked which OS was used for development; `retrievedGraphFacts: 1`, `retrievedMemories: 0`, and Present You correctly answered **Arch Linux**. This establishes real cross-conversation Graphiti retrieval.
- The event extractor returned a valid structured event for **“I'm planning a trip to Goa next month”**: create / travel / planned / asserted, title **Trip to Goa**.
- **Not verified complete:** Supabase `timeline_events` insertion. The latest provided event persistence attempt failed due to row-level security (RLS).

## 5. Open issues and risks

### P0 — Structured event writes blocked by RLS

Last observed error: `new row violates row-level security policy for table "timeline_events"`.

**Next action:** Inspect existing policies and ownership relationships; add least-privilege insert/update/select permissions for event and evidence writes, with timeline ownership checks, without disabling RLS or exposing service-role keys. Re-run one event creation and evidence-recording transaction. Verify both records exist and refer to the same authenticated user/timeline.

### P0 — Event persistence correctness

- Existing processor proposal writes event then evidence separately; evidence write failure can leave an event without audit evidence.
- Candidate matching limited to recent events may miss long-lived/referenced events.
- `null` in an update currently often means "retain old value", so explicit clearing/rescheduling may need a separate field-change protocol.
- Tentative plans and relative times need careful semantics; preserve literal `raw_time_text` and avoid fabricating dates.
- Need idempotent, transactional processing keyed by `source_message_id` to prevent duplicate events if retried.

**Next action:** Verify current processor and DB constraints. Design atomic event + evidence update (database function/transaction) and idempotent job processing before scaling ingestion.

### P1 — Background processing durability

`after()` is best-effort, not a durable queue. Process restarts, deployment timeouts, and retried requests can lose or duplicate Graphiti/event ingestion.

**Next action:** Reuse or extend the durable job model rather than inventing disconnected queues; track attempts, completion, errors, retry/backoff, and idempotency. Confirm worker architecture from current repository.

### P1 — Local model latency

Observed conversation response ~20–43 seconds and event extraction up to ~95 seconds, especially due to CPU-bound prompt evaluation and long prompts. Reduce prompt cost only after correctness tests; benchmark before changing model or infrastructure.

### P1 — Retrieval and grounding

- An `invalid_at = null` fact means it has not been invalidated in graph; it does **not** prove a currently ongoing activity.
- Graph facts can be incorrectly inferred from hypothetical text; speaker attribution alone doesn't guarantee truth.
- Queries should filter/interpret current vs historical facts and maintain evidence/provenance.
- Deduplication warning (`invalid duplicate_facts idx`) occurred in Graphiti smoke tests; log and regression-test repeated updates.

### P1 — Multi-tenant safety

- Validate timeline ownership at Next.js boundary and authenticate server-to-server Graphiti API.
- Derive graph group ID from authorized timeline UUID; never accept arbitrary raw group IDs from browser.
- Group-based segregation must be tested for cross-timeline leakage, including similar names and repeated messages.
- Keep service token server-side and rotate when necessary.

## 6. Likely files involved (confirm current layout)

```text
app/api/messages/route.ts
lib/ai/context.ts
lib/ai/gateway.ts
lib/ai/event-extractor.ts
lib/ai/event-schema.ts
lib/ai/providers/ollama.ts
lib/graphiti/client.ts
lib/memory/memory-retrieval.ts
lib/timeline-events/processor.ts
lib/timeline-events/event-validator.ts  (location must be verified)
services/graphiti/src/anotheru_graphiti/main.py
services/graphiti/src/anotheru_graphiti/smoke.py
services/graphiti/src/anotheru_graphiti/ollama_openai.py
```

## 7. Next checkpoint and acceptance criteria

**Current work item:** Fix RLS and prove the **event persistence + evidence** loop.

Acceptance criteria:
1. Under a signed-in user and owned timeline, a genuine planned-event message results in one `timeline_events` row.
2. Its evidence row references the correct event, user, timeline, and source message.
3. Another user's timeline cannot be written or read.
4. A cancellation/postponement updates the *same event* with a new evidence record.
5. A hypothetical or conditional statement is not saved as a confirmed event.
6. TypeScript typecheck and relevant tests pass; preserve reproducible terminal/SQL results.

**After this:** durable ingestion/job processing, audit/replay and data correction, evaluation suite, performance tuning, then richer persona/style adaptation. Alternate timelines stay later.

## 8. Change log

| Date | Change | Verification | Follow-up |
| --- | --- | --- | --- |
| 2026-10-20 | Created initial project log from observed conversation and implementation checkpoints | Content reconciled against messages/logs supplied in chat, not current repository checkout | Place under `docs/` in repo and start updating on each accepted change |

## 9. Change entry template

```md
### YYYY-MM-DD — <short name>
- **Status:** Planned / Implemented / Verified / Reverted
- **What changed:**
- **Files/schema impacted:**
- **Why:**
- **Decision and alternatives:**
- **Security / data implications:**
- **Evidence:** commands, tests, logs, or links
- **Risks / follow-up:**
```

## 10. Handoff instructions

At the start of a new development session, read this log plus the relevant current repository files. Distinguish *verified code* from *prior proposals*. After every significant change, update the decision table or issue tracker, write a dated change-log entry, and update acceptance status. Preserve older decisions for auditability. Do not claim repository changes were made unless this Markdown file was actually committed or uploaded to the repository.
