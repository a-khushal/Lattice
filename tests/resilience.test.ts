import { describe, expect, it } from "vitest";
import { withRetry } from "@/lib/resilience";

describe("withRetry", () => {
  it("retries transient failures and succeeds", async () => {
    let attempts = 0;

    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          const error = new Error("temporary failure") as Error & { status?: number };
          error.status = 503;
          throw error;
        }

        return "ok";
      },
      { retries: 3, baseDelayMs: 1, maxDelayMs: 4 },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry non-retryable failures", async () => {
    let attempts = 0;

    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error("validation failed");
        },
        { retries: 3, baseDelayMs: 1, maxDelayMs: 4 },
      ),
    ).rejects.toThrow("validation failed");

    expect(attempts).toBe(1);
  });
});
