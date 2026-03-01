import { describe, expect, it } from "vitest";
import { guardApiRequest } from "@/lib/requestGuards";

describe("guardApiRequest", () => {
  it("rejects when API key is required and missing", () => {
    process.env.LATTICE_API_KEY = "top-secret";

    const request = new Request("http://localhost/api/query", {
      method: "POST",
      headers: {
        "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 200) + 1}`,
      },
    });

    const response = guardApiRequest(request, {
      routeKey: "query",
      maxRequestsPerWindow: 10,
    });

    expect(response?.status).toBe(401);
    delete process.env.LATTICE_API_KEY;
  });

  it("enforces per-route rate limit", () => {
    const request = new Request("http://localhost/api/query", {
      method: "POST",
      headers: {
        "x-forwarded-for": `10.0.1.${Math.floor(Math.random() * 200) + 1}`,
      },
    });

    const first = guardApiRequest(request, {
      routeKey: "query",
      maxRequestsPerWindow: 1,
      windowMs: 60_000,
    });

    const second = guardApiRequest(request, {
      routeKey: "query",
      maxRequestsPerWindow: 1,
      windowMs: 60_000,
    });

    expect(first).toBeNull();
    expect(second?.status).toBe(429);
  });
});
