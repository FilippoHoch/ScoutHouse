
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
  EventMember,
  EventMemberCreateDto,
  EventMemberUpdateDto,
  EventStatus,
  EventSuggestion,
  EventSummary,
  EventUpdateDto,
  Quote,
  QuoteCalcRequestDto,
  QuoteCalcResponse,
  QuoteCreateDto,
  QuoteListItem,
  Contact,
  ContactCreateDto,
  ContactUpdateDto,
  Structure,
  StructureSearchParams,
  StructureSearchResponse,
  StructureImportDryRunResponse,
  StructureImportResult
} from "./types";
import { clearSession, getAccessToken, refreshAccessToken } from "./auth";
import { API_URL, ApiError } from "./http";

export { ApiError } from "./http";

function mergeHeaders(base: Record<string, string>, extra?: HeadersInit): Record<string, string> {
  const headers = { ...base };

  if (!extra) {
    return headers;
  }

  if (extra instanceof Headers) {
    extra.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  if (Array.isArray(extra)) {
    for (const [key, value] of extra) {
      headers[key] = value;
    }
    return headers;
  }

  Object.entries(extra).forEach(([key, value]) => {
    headers[key] = value as string;
  });
  return headers;
}

export interface ApiFetchOptions extends RequestInit {
  auth?: boolean;
  skipRefresh?: boolean;
  contentType?: string | null;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = false, skipRefresh = false, contentType = "application/json", ...init } = options;

  const baseHeaders = contentType === null ? {} : { "Content-Type": contentType };

  const performRequest = async () => {
    const headers = mergeHeaders(baseHeaders, init.headers);

    if (auth) {
      const token = getAccessToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    try {
      return await fetch(`${API_URL}${path}`, {
        ...init,
        headers,
        credentials: "include",
      });
    } catch (error) {
      const message = `Unable to reach the API at ${API_URL}. Please make sure the backend server is running.`;
      throw new ApiError(0, null, message, error);
    }
  };

  let response = await performRequest();

  if (auth && response.status === 401 && !skipRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await performRequest();
    } else {
      clearSession();
    }
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

  if (response.status === 204) {
    return undefined as T;
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

export async function getStructureContacts(structureId: number): Promise<Contact[]> {
  return apiFetch<Contact[]>(`/api/v1/structures/${structureId}/contacts`, { auth: true });
}

export async function createStructureContact(
  structureId: number,
  dto: ContactCreateDto
): Promise<Contact> {
  return apiFetch<Contact>(`/api/v1/structures/${structureId}/contacts`, {
    method: "POST",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function updateStructureContact(
  structureId: number,
  contactId: number,
  dto: ContactUpdateDto
): Promise<Contact> {
  return apiFetch<Contact>(`/api/v1/structures/${structureId}/contacts/${contactId}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function deleteStructureContact(structureId: number, contactId: number): Promise<void> {
  await apiFetch<void>(`/api/v1/structures/${structureId}/contacts/${contactId}`, {
    method: "DELETE",
    auth: true
  });
}

export async function importStructures(
  file: File,
  options: { dryRun?: true }
): Promise<StructureImportDryRunResponse>;
export async function importStructures(
  file: File,
  options: { dryRun: false }
): Promise<StructureImportResult>;
export async function importStructures(
  file: File,
  options: { dryRun?: boolean } = {}
): Promise<StructureImportDryRunResponse | StructureImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const query = options.dryRun === undefined ? "" : `?dry_run=${options.dryRun}`;
  return apiFetch(`/api/v1/import/structures${query}`, {
    method: "POST",
    body: formData,
    auth: true,
    contentType: null
  });
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
  return apiFetch<EventListResponse>(`/api/v1/events${query}`, { auth: true });
}

export async function createEvent(dto: EventCreateDto): Promise<Event> {
  return apiFetch<Event>("/api/v1/events", {
    method: "POST",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function getEvent(
  id: number,
  options: { include?: Array<"candidates" | "tasks"> } = {}
): Promise<Event> {
  const include = options.include?.length ? `?include=${options.include.join(",")}` : "";
  return apiFetch<Event>(`/api/v1/events/${id}${include}`, { auth: true });
}

export async function patchEvent(id: number, dto: EventUpdateDto): Promise<Event> {
  return apiFetch<Event>(`/api/v1/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function addCandidate(
  eventId: number,
  dto: EventCandidateCreateDto
): Promise<EventCandidate> {
  return apiFetch<EventCandidate>(`/api/v1/events/${eventId}/candidates`, {
    method: "POST",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function patchCandidate(
  eventId: number,
  candidateId: number,
  dto: EventCandidateUpdateDto
): Promise<EventCandidate> {
  return apiFetch<EventCandidate>(`/api/v1/events/${eventId}/candidates/${candidateId}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function getEventSummary(eventId: number): Promise<EventSummary> {
  return apiFetch<EventSummary>(`/api/v1/events/${eventId}/summary`, { auth: true });
}

export async function getSuggestions(eventId: number): Promise<EventSuggestion[]> {
  return apiFetch<EventSuggestion[]>(`/api/v1/events/${eventId}/suggest`, { auth: true });
}

export async function addTask(
  eventId: number,
  dto: EventContactTaskCreateDto
): Promise<EventContactTask> {
  return apiFetch<EventContactTask>(`/api/v1/events/${eventId}/tasks`, {
    method: "POST",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function patchTask(
  eventId: number,
  taskId: number,
  dto: EventContactTaskUpdateDto
): Promise<EventContactTask> {
  return apiFetch<EventContactTask>(`/api/v1/events/${eventId}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function getEventMembers(eventId: number): Promise<EventMember[]> {
  return apiFetch<EventMember[]>(`/api/v1/events/${eventId}/members`, { auth: true });
}

export async function addEventMember(
  eventId: number,
  dto: EventMemberCreateDto
): Promise<EventMember> {
  return apiFetch<EventMember>(`/api/v1/events/${eventId}/members`, {
    method: "POST",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function updateEventMember(
  eventId: number,
  memberId: number,
  dto: EventMemberUpdateDto
): Promise<EventMember> {
  return apiFetch<EventMember>(`/api/v1/events/${eventId}/members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function removeEventMember(eventId: number, memberId: number): Promise<void> {
  await apiFetch<void>(`/api/v1/events/${eventId}/members/${memberId}`, {
    method: "DELETE",
    auth: true
  });
}

export async function calcQuote(dto: QuoteCalcRequestDto): Promise<QuoteCalcResponse> {
  return apiFetch<QuoteCalcResponse>("/api/v1/quotes/calc", {
    method: "POST",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function createQuote(eventId: number, dto: QuoteCreateDto): Promise<Quote> {
  return apiFetch<Quote>(`/api/v1/events/${eventId}/quotes`, {
    method: "POST",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function getQuotes(eventId: number): Promise<QuoteListItem[]> {
  return apiFetch<QuoteListItem[]>(`/api/v1/events/${eventId}/quotes`, { auth: true });
}

export async function getQuote(id: number): Promise<Quote> {
  return apiFetch<Quote>(`/api/v1/quotes/${id}`, { auth: true });
}

export async function exportQuote(
  id: number,
  format: "xlsx" | "html"
): Promise<Blob | string> {
  const acceptHeader =
    format === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/html";

  const performRequest = async () => {
    const headers: Record<string, string> = { Accept: acceptHeader };
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return fetch(`${API_URL}/api/v1/quotes/${id}/export?format=${format}`, {
      headers,
      credentials: "include"
    });
  };

  let response = await performRequest();

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await performRequest();
    } else {
      clearSession();
    }
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

  if (format === "xlsx") {
    return response.blob();
  }
  return response.text();
}

export async function forgotPassword(email: string): Promise<void> {
  await apiFetch<void>("/api/v1/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiFetch<void>("/api/v1/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password })
  });
}
