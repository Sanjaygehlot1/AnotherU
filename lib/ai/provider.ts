import type { ZodType } from "zod";

export interface AIProvider {
  generateText(input: {
    model: string;
    system: string;
    user: string;
  }): Promise<string>;

  streamText(input: {
    model: string;
    system: string;
    user: string;
  }): AsyncIterable<string>;

  generateStructured<T>(
    input: {
      model: string;
      system: string;
      user: string;
    },
    schema: ZodType<T>,
  ): Promise<T>;
}

