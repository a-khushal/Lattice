import OpenAI from "openai";
import { buildContextWindow } from "@/lib/retrieveContext";
import { withRetry } from "@/lib/resilience";
import type { RetrievedChunk } from "@/lib/types";

const SYSTEM_PROMPT = [
  "You are a repository analysis assistant.",
  "Answer strictly using the provided context.",
  "Do not hallucinate external information.",
  "If answer is not found, say 'Not found in repository'.",
].join(" ");

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return new OpenAI({ apiKey });
}

export async function generateAnswer(
  question: string,
  chunks: RetrievedChunk[],
): Promise<string> {
  if (chunks.length === 0) {
    return "Not found in repository";
  }

  const context = buildContextWindow(chunks);
  const model = process.env.OPENAI_COMPLETION_MODEL ?? "gpt-4o-mini";
  const openai = getOpenAIClient();

  const completion = await withRetry(() => {
    return openai.chat.completions.create({
      model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            `Question:\n${question}`,
            "",
            "Repository Context:",
            context,
            "",
            "Return a concise grounded answer and mention relevant file paths.",
          ].join("\n"),
        },
      ],
    });
  });

  const answer = completion.choices[0]?.message?.content?.trim();
  if (!answer) {
    return "Not found in repository";
  }

  return answer;
}
