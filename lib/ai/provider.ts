import type { ZodType } from "zod";

export interface AIProvider {
  generateText(input: {
    system: string;
    user: string;
  }): Promise<string>;

  generateStructured<T>(
    input: {
      system: string;
      user: string;
    },
    schema: ZodType<T>,
  ): Promise<T>;
}