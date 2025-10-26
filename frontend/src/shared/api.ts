
import {
  Event,
  EventCandidate,
  EventCandidateCreateDto,
  EventCandidateUpdateDto,
  EventContactTask,
  EventContactTaskCreateDto,
  EventContactTaskUpdateDto,
  EventCreateDto,
  EventListResponse,
  EventStatus,
  EventSuggestion,
  EventSummary,
  EventUpdateDto,
  Quote,
  QuoteCalcRequestDto,
  QuoteCalcResponse,
  QuoteCreateDto,
  QuoteListItem,
  Structure,
  StructureSearchParams,
  StructureSearchResponse
} from "./types";

const LOCALHOST_NAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function resolveApiBaseUrl(): string {
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

const API_URL = resolveApiBaseUrl();

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

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      },
      ...options
    });
  } catch (error) {
    const message = `Unable to reach the API at ${API_URL}. Please make sure the backend server is running.`;
    throw new ApiError(0, null, message, error);
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      body = await response.text();
    }
    throw new ApiError(response.status, body);
  }

  return (await response.json()) as T;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "" || Number.isNaN(value)) {
      return;
    }
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function getStructures(
  params: StructureSearchParams & { page?: number; page_size?: number } = {}
): Promise<StructureSearchResponse> {
  const query = buildQuery({
    q: params.q,
    province: params.province,
    type: params.type,
    max_km: params.max_km,
    season: params.season,
    unit: params.unit,
    cost_band: params.cost_band,
    page: params.page,
    page_size: params.page_size,
    sort: params.sort,
    order: params.order
  });
  return apiFetch<StructureSearchResponse>(`/api/v1/structures/search${query}`);
}

export async function getStructureBySlug(
  slug: string,
  options: { include?: string } = {}
): Promise<Structure> {
  const query = options.include ? `?include=${encodeURIComponent(options.include)}` : "";
  return apiFetch<Structure>(`/api/v1/structures/by-slug/${slug}${query}`);
}


export interface EventListParams {
  q?: string;
  status?: EventStatus;
  page?: number;
  page_size?: number;
}

export async function getEvents(params: EventListParams = {}): Promise<EventListResponse> {
  const query = buildQuery({
    q: params.q,
    status: params.status,
    page: params.page,
    page_size: params.page_size
  });
  return apiFetch<EventListResponse>(`/api/v1/events${query}`);
}

export async function createEvent(dto: EventCreateDto): Promise<Event> {
  return apiFetch<Event>("/api/v1/events", {
    method: "POST",
    body: JSON.stringify(dto)
  });
}

export async function getEvent(
  id: number,
  options: { include?: Array<"candidates" | "tasks"> } = {}
): Promise<Event> {
  const include = options.include?.length ? `?include=${options.include.join(",")}` : "";
  return apiFetch<Event>(`/api/v1/events/${id}${include}`);
}

export async function patchEvent(id: number, dto: EventUpdateDto): Promise<Event> {
  return apiFetch<Event>(`/api/v1/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(dto)
  });
}

export async function addCandidate(
  eventId: number,
  dto: EventCandidateCreateDto
): Promise<EventCandidate> {
  return apiFetch<EventCandidate>(`/api/v1/events/${eventId}/candidates`, {
    method: "POST",
    body: JSON.stringify(dto)
  });
}

export async function patchCandidate(
  eventId: number,
  candidateId: number,
  dto: EventCandidateUpdateDto
): Promise<EventCandidate> {
  return apiFetch<EventCandidate>(`/api/v1/events/${eventId}/candidates/${candidateId}`, {
    method: "PATCH",
    body: JSON.stringify(dto)
  });
}

export async function getEventSummary(eventId: number): Promise<EventSummary> {
  return apiFetch<EventSummary>(`/api/v1/events/${eventId}/summary`);
}

export async function getSuggestions(eventId: number): Promise<EventSuggestion[]> {
  return apiFetch<EventSuggestion[]>(`/api/v1/events/${eventId}/suggest`);
}

export async function addTask(
  eventId: number,
  dto: EventContactTaskCreateDto
): Promise<EventContactTask> {
  return apiFetch<EventContactTask>(`/api/v1/events/${eventId}/tasks`, {
    method: "POST",
    body: JSON.stringify(dto)
  });
}

export async function patchTask(
  eventId: number,
  taskId: number,
  dto: EventContactTaskUpdateDto
): Promise<EventContactTask> {
  return apiFetch<EventContactTask>(`/api/v1/events/${eventId}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(dto)
  });
}

export async function calcQuote(dto: QuoteCalcRequestDto): Promise<QuoteCalcResponse> {
  return apiFetch<QuoteCalcResponse>("/api/v1/quotes/calc", {
    method: "POST",
    body: JSON.stringify(dto)
  });
}

export async function createQuote(eventId: number, dto: QuoteCreateDto): Promise<Quote> {
  return apiFetch<Quote>(`/api/v1/events/${eventId}/quotes`, {
    method: "POST",
    body: JSON.stringify(dto)
  });
}

export async function getQuotes(eventId: number): Promise<QuoteListItem[]> {
  return apiFetch<QuoteListItem[]>(`/api/v1/events/${eventId}/quotes`);
}

export async function getQuote(id: number): Promise<Quote> {
  return apiFetch<Quote>(`/api/v1/quotes/${id}`);
}

export async function exportQuote(
  id: number,
  format: "xlsx" | "html"
): Promise<Blob | string> {
  const response = await fetch(`${API_URL}/api/v1/quotes/${id}/export?format=${format}`, {
    headers: {
      Accept:
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/html"
    }
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      body = await response.text();
    }
    throw new ApiError(response.status, body);
  }

  if (format === "xlsx") {
    return response.blob();
  }
  return response.text();
}
