import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalWindow = window;

function stubWindowLocation(url: string) {
  const parsed = new URL(url);
  const stubbedWindow = Object.create(originalWindow);

  Object.defineProperty(stubbedWindow, "location", {
    value: {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
    },
  });

  vi.stubGlobal("window", stubbedWindow);
}

describe("resolveApiBaseUrl", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns the absolute API url defined via environment variables", async () => {
    vi.stubEnv("VITE_API_URL", "https://example.com/api/");
    stubWindowLocation("http://localhost:3000");

    const { resolveApiBaseUrl } = await import("../http");

    expect(resolveApiBaseUrl()).toBe("https://example.com/api");
  });

  it("replaces the api hostname with the local hostname when running on localhost", async () => {
    vi.stubEnv("VITE_API_URL", "http://api:8000/");
    stubWindowLocation("http://localhost:3000");

    const { resolveApiBaseUrl } = await import("../http");

    expect(resolveApiBaseUrl()).toBe("http://localhost:8000");
  });

  it("falls back to the browser origin when an invalid relative url is provided", async () => {
    vi.stubEnv("VITE_API_URL", "/api");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubWindowLocation("https://localhost:5173");

    const { resolveApiBaseUrl } = await import("../http");

    expect(resolveApiBaseUrl()).toBe("https://localhost:5173");
    expect(warnSpy).toHaveBeenCalledWith(
      "Invalid VITE_API_URL provided, falling back to defaults",
      expect.any(Error)
    );
  });
});
