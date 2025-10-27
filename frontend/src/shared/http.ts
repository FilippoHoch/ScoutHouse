const LOCALHOST_NAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function resolveApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;

  if (envUrl) {
    try {
      const parsed = new URL(envUrl);

      if (
        typeof window !== "undefined" &&
        LOCALHOST_NAMES.has(window.location.hostname) &&
        parsed.hostname === "api"
      ) {
        parsed.hostname = window.location.hostname;
        return stripTrailingSlash(parsed.toString());
      }

      return stripTrailingSlash(parsed.toString());
    } catch (error) {
      console.warn("Invalid VITE_API_URL provided, falling back to defaults", error);
    }
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    const base = `${protocol}//${hostname}${port ? `:${port}` : ""}`;
    return stripTrailingSlash(base);
  }

  return "http://localhost:8000";
}

export const API_URL = resolveApiBaseUrl();

export class ApiError extends Error {
  status: number;
  body: unknown;
  cause?: unknown;

  constructor(status: number, body: unknown, message?: string, cause?: unknown) {
    super(message ?? `API request failed with status ${status}`);
    this.status = status;
    this.body = body;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
