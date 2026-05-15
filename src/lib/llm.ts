import "server-only";
import { generateText, generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { z } from "zod";

/**
 * Provider preference: Anthropic → OpenAI → local fallback.
 * The local fallback lets the app run without keys; AI features degrade
 * gracefully into deterministic templates (see scribe.ts / triage.ts).
 */
export function llmAvailable(): "anthropic" | "openai" | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

function pickModel() {
  const which = llmAvailable();
  if (which === "anthropic") return anthropic("claude-sonnet-4-5-20250929");
  if (which === "openai") return openai("gpt-4o-mini");
  return null;
}

export async function generateLLMText(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string | null> {
  const model = pickModel();
  if (!model) return null;
  try {
    const { text } = await generateText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      maxTokens: opts.maxTokens ?? 512,
    });
    return text;
  } catch (err) {
    console.error("[llm] generateText failed, falling back to local:", err);
    return null;
  }
}

export async function generateLLMObject<T>(opts: {
  system: string;
  prompt: string;
  schema: z.ZodSchema<T>;
}): Promise<T | null> {
  const model = pickModel();
  if (!model) return null;
  try {
    const { object } = await generateObject({
      model,
      system: opts.system,
      prompt: opts.prompt,
      schema: opts.schema,
    });
    return object as T;
  } catch (err) {
    console.error("[llm] generateObject failed, falling back to local:", err);
    return null;
  }
}
