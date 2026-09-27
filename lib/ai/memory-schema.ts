import { z } from "zod";

export const memoryTypeSchema = z.enum([
  "fact",
  "preference",
  "goal",
  "experience",
  "relationship",
  "belief",
]);

export const memoryCandidateSchema = z.object({
  type: memoryTypeSchema,
  content: z.string().trim().min(1).max(500),
  importance: z.number().int().min(1).max(5).default(3),
  confidence: z.number().min(0).max(1).default(0.8),
});

const memoryExtractionObjectSchema = z.object({
  memories: z.array(memoryCandidateSchema).max(10),
});

export const memoryExtractionSchema = z.preprocess(
  (value) => {
    if (Array.isArray(value)) {
      return { memories: value };
    }

    return value;
  },
  memoryExtractionObjectSchema,
);

export type MemoryCandidate = z.infer<typeof memoryCandidateSchema>;
export type MemoryExtraction = z.infer<
  typeof memoryExtractionObjectSchema
>;