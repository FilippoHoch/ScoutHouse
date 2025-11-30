
import {
  Attachment,
  AttachmentOwnerType,
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
  MailPreview,
  MailTemplate,
  Quote,
  QuoteCalcRequestDto,
  QuoteCalcResponse,
  QuoteCreateDto,
  QuoteListItem,
  Contact,
  ContactCreateDto,
  ContactUpdateDto,
  CostOption,
  Structure,
  StructureAttachment,
  StructureAttachmentKind,
  StructurePhoto,
  StructureCreateDto,
  StructureCostOptionInput,
  StructureSearchParams,
  StructureSearchResponse,
  StructureImportDryRunResponse,
  StructureImportResult,
  StructureOpenPeriodsImportDryRunResponse,
  StructureOpenPeriodsImportResult,
  User,
  UserType,
  GeocodingResult,
  LandingSnapshot,
} from "./types";
import { clearSession, getAccessToken, refreshAccessToken } from "./auth";
import { API_URL, ApiError } from "./http";

export { ApiError } from "./http";

export type ExportFormat = "csv" | "xlsx" | "json";

export interface GeocodingSearchParams {
  address?: string;
  locality?: string;
  municipality?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  limit?: number;
}

export interface AttachmentUploadSignature {
  url: string;
  fields: Record<string, string>;
}

export interface AttachmentUploadRequest {
  owner_type: AttachmentOwnerType;
  owner_id: number;
  filename: string;
  mime: string;
}

export interface AttachmentConfirmRequest extends AttachmentUploadRequest {
  size: number;
  key: string;
}

export interface AttachmentDownloadSignature {
  url: string;
}

function acceptHeaderForFormat(format: ExportFormat): string {
  if (format === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (format === "csv") {
    return "text/csv";
  }
  return "application/json";
}

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

export interface UserAdminCreateRequest {
  name: string;
  email: string;
  password: string;
  is_admin: boolean;
  is_active: boolean;
  user_type?: UserType | null;
}

export interface UserAdminUpdateRequest {
  name?: string;
  email?: string;
  password?: string;
  is_admin?: boolean;
  is_active?: boolean;
  user_type?: UserType | null;
}

export interface UserProfileUpdateRequest {
  user_type?: UserType | null;
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
      console.error(error);
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
      } catch {
        body = await response.text();
      }
    throw new ApiError(response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function listUsers(): Promise<User[]> {
  return apiFetch<User[]>("/api/v1/users", { auth: true });
}

export async function createUser(payload: UserAdminCreateRequest): Promise<User> {
  return apiFetch<User>("/api/v1/users", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload)
  });
}

export async function updateUser(
  userId: string,
  payload: UserAdminUpdateRequest
): Promise<User> {
  return apiFetch<User>(`/api/v1/users/${userId}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(payload)
  });
}

export async function updateProfile(payload: UserProfileUpdateRequest): Promise<User> {
  return apiFetch<User>("/api/v1/auth/me", {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(payload)
  });
}

export async function getAttachments(
  ownerType: AttachmentOwnerType,
  ownerId: number
): Promise<Attachment[]> {
  return apiFetch<Attachment[]>(
    `/api/v1/attachments?owner_type=${ownerType}&owner_id=${ownerId}`,
    { auth: true }
  );
}

export async function signAttachmentUpload(
  payload: AttachmentUploadRequest
): Promise<AttachmentUploadSignature> {
  return apiFetch<AttachmentUploadSignature>("/api/v1/attachments/sign-put", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload)
  });
}

export async function confirmAttachmentUpload(
  payload: AttachmentConfirmRequest
): Promise<Attachment> {
  return apiFetch<Attachment>("/api/v1/attachments/confirm", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload)
  });
}

export async function signAttachmentDownload(
  attachmentId: number
): Promise<AttachmentDownloadSignature> {
  return apiFetch<AttachmentDownloadSignature>(
    `/api/v1/attachments/${attachmentId}/sign-get`,
    { auth: true }
  );
}

export async function deleteAttachment(attachmentId: number): Promise<void> {
  await apiFetch<void>(`/api/v1/attachments/${attachmentId}`, {
    method: "DELETE",
    auth: true,
  });
}

export interface AttachmentUpdateRequest {
  filename?: string | null;
  description?: string | null;
}

export async function updateAttachment(
  attachmentId: number,
  payload: AttachmentUpdateRequest
): Promise<Attachment> {
  return apiFetch<Attachment>(`/api/v1/attachments/${attachmentId}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(payload)
  });
}

export async function listStructureAttachments(
  structureId: number,
  kind?: StructureAttachmentKind
): Promise<StructureAttachment[]> {
  const query = kind ? `?kind=${kind}` : "";
  return apiFetch<StructureAttachment[]>(
    `/api/v1/structures/${structureId}/categorized-attachments${query}`,
    { auth: true }
  );
}

export async function createStructureAttachment(
  structureId: number,
  payload: { attachment_id: number; kind: StructureAttachmentKind }
): Promise<StructureAttachment> {
  return apiFetch<StructureAttachment>(`/api/v1/structures/${structureId}/categorized-attachments`, {
    auth: true,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function deleteStructureAttachment(
  structureId: number,
  structureAttachmentId: number
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/structures/${structureId}/categorized-attachments/${structureAttachmentId}`,
    {
      auth: true,
      method: "DELETE"
    }
  );
}

export interface StructurePhotoCreateRequest {
  attachment_id: number;
}

export async function getStructurePhotos(structureId: number): Promise<StructurePhoto[]> {
  return apiFetch<StructurePhoto[]>(`/api/v1/structures/${structureId}/photos`);
}

export async function createStructurePhoto(
  structureId: number,
  payload: StructurePhotoCreateRequest
): Promise<StructurePhoto> {
  return apiFetch<StructurePhoto>(`/api/v1/structures/${structureId}/photos`, {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload)
  });
}

export async function deleteStructurePhoto(structureId: number, photoId: number): Promise<void> {
  await apiFetch<void>(`/api/v1/structures/${structureId}/photos/${photoId}`, {
    method: "DELETE",
    auth: true
  });
}

async function authenticatedDownload(path: string, accept: string): Promise<Response> {
  const performRequest = async () => {
    const headers: Record<string, string> = { Accept: accept };
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    try {
      return await fetch(`${API_URL}${path}`, {
        headers,
        credentials: "include"
      });
    } catch (error) {
      console.error(error);
      const message = `Unable to reach the API at ${API_URL}. Please make sure the backend server is running.`;
      throw new ApiError(0, null, message, error);
    }
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
      } catch {
        body = await response.text();
      }
    throw new ApiError(response.status, body);
  }

  return response;
}

function buildQuery(
  params: Record<string, string | number | boolean | undefined>
): string {
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
    access: params.access,
    fire: params.fire,
    min_land_area: params.min_land_area,
    hot_water: params.hot_water,
    cell_coverage: params.cell_coverage,
    cell_data_quality: params.cell_data_quality,
    cell_voice_quality: params.cell_voice_quality,
    wifi_available: params.wifi_available,
    landline_available: params.landline_available,
    aed_on_site: params.aed_on_site,
    river_swimming: params.river_swimming,
    wastewater_type: params.wastewater_type,
    min_power_capacity_kw: params.min_power_capacity_kw,
    min_parking_car_slots: params.min_parking_car_slots,
    flood_risk: params.flood_risk,
    open_in_season: params.open_in_season,
    open_on_date: params.open_on_date,
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

export async function getLandingSnapshot(): Promise<LandingSnapshot> {
  return apiFetch<LandingSnapshot>("/api/v1/public/landing");
}

export async function searchGeocoding(
  params: GeocodingSearchParams,
  options: { signal?: AbortSignal } = {}
): Promise<GeocodingResult[]> {
  const searchParams = new URLSearchParams();
  const append = (key: string, value: string | undefined) => {
    if (!value) {
      return;
    }
    const trimmed = value.trim();
    if (trimmed) {
      searchParams.set(key, trimmed);
    }
  };

  append("address", params.address);
  append("locality", params.locality);
  append("municipality", params.municipality);
  append("province", params.province);
  append("postal_code", params.postal_code);
  append("country", params.country);
  if (typeof params.limit === "number") {
    searchParams.set("limit", String(params.limit));
  }

  const query = searchParams.toString();
  const response = await apiFetch<{ results: GeocodingResult[] }>(
    `/api/v1/geocoding/search${query ? `?${query}` : ""}`,
    {
      auth: true,
      signal: options.signal,
    }
  );
  return response.results;
}

export async function createStructure(dto: StructureCreateDto): Promise<Structure> {
  return apiFetch<Structure>("/api/v1/structures", {
    method: "POST",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function updateStructure(
  structureId: number,
  dto: StructureCreateDto
): Promise<Structure> {
  return apiFetch<Structure>(`/api/v1/structures/${structureId}`, {
    method: "PUT",
    body: JSON.stringify(dto),
    auth: true
  });
}

export async function getStructureContacts(structureId: number): Promise<Contact[]> {
  return apiFetch<Contact[]>(`/api/v1/structures/${structureId}/contacts`, { auth: true });
}

export async function searchContacts(params: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  limit?: number;
}): Promise<Contact[]> {
  const query = new URLSearchParams();
  if (params.first_name) {
    query.set("first_name", params.first_name);
  }
  if (params.last_name) {
    query.set("last_name", params.last_name);
  }
  if (params.email) {
    query.set("email", params.email);
  }
  if (params.phone) {
    query.set("phone", params.phone);
  }
  if (params.limit) {
    query.set("limit", String(params.limit));
  }

  const queryString = query.toString();
  const url = `/api/v1/structures/contacts/search${queryString ? `?${queryString}` : ""}`;
  return apiFetch<Contact[]>(url, { auth: true });
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

export async function upsertStructureCostOptions(
  structureId: number,
  costOptions: StructureCostOptionInput[]
): Promise<CostOption[]> {
  return apiFetch<CostOption[]>(`/api/v1/structures/${structureId}/cost-options`, {
    method: "PUT",
    body: JSON.stringify(costOptions),
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

export async function importStructureOpenPeriods(
  file: File,
  options: { dryRun?: true }
): Promise<StructureOpenPeriodsImportDryRunResponse>;
export async function importStructureOpenPeriods(
  file: File,
  options: { dryRun: false }
): Promise<StructureOpenPeriodsImportResult>;
export async function importStructureOpenPeriods(
  file: File,
  options: { dryRun?: boolean } = {}
): Promise<StructureOpenPeriodsImportDryRunResponse | StructureOpenPeriodsImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const query = options.dryRun === undefined ? "" : `?dry_run=${options.dryRun}`;
  return apiFetch(`/api/v1/import/structure-open-periods${query}`, {
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

export async function deleteEvent(id: number): Promise<void> {
  await apiFetch<void>(`/api/v1/events/${id}`, {
    method: "DELETE",
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
      } catch {
        body = await response.text();
      }
    throw new ApiError(response.status, body);
  }

  if (format === "xlsx") {
    return response.blob();
  }
  return response.text();
}

export async function exportStructures(
  format: ExportFormat,
  filters: Record<string, unknown> = {}
): Promise<Blob> {
  const params = new URLSearchParams({ format });
  if (Object.keys(filters).length > 0) {
    params.set("filters", JSON.stringify(filters));
  }
  const response = await authenticatedDownload(
    `/api/v1/export/structures?${params.toString()}`,
    acceptHeaderForFormat(format)
  );
  return response.blob();
}

export async function exportEvents(
  format: ExportFormat,
  filters: Record<string, string | undefined> = {}
): Promise<Blob> {
  const params = new URLSearchParams({ format });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  const response = await authenticatedDownload(
    `/api/v1/export/events?${params.toString()}`,
    acceptHeaderForFormat(format)
  );
  return response.blob();
}

export async function downloadEventIcal(eventId: number): Promise<Blob> {
  const response = await authenticatedDownload(
    `/api/v1/events/${eventId}/ical`,
    "text/calendar"
  );
  return response.blob();
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

export interface MailTestResponse {
  provider: string;
  blocked: boolean;
  subject: string;
  html: string;
  text: string;
  job_id: string;
}

export async function previewMailTemplate(template: MailTemplate): Promise<MailPreview> {
  const params = new URLSearchParams({ template, sample: "true" });
  return apiFetch<MailPreview>(`/api/v1/mail/preview?${params.toString()}`, {
    auth: true
  });
}

export async function sendTestMail(
  to: string,
  template: MailTemplate,
  sampleData?: Record<string, unknown>
): Promise<MailTestResponse> {
  const payload: Record<string, unknown> = { to, template };
  if (sampleData && Object.keys(sampleData).length > 0) {
    payload.sample_data = sampleData;
  }
  return apiFetch<MailTestResponse>("/api/v1/mail/test", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload)
  });
}
