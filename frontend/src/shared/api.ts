
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
  Structure,
  StructureSearchParams,
  StructureSearchResponse
} from "./types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    ...options
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
