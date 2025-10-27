export type StructureType = "house" | "land" | "mixed";
export type Season = "winter" | "spring" | "summer" | "autumn";
export type Unit = "LC" | "EG" | "RS" | "ALL";
export type CostModel = "per_person_day" | "per_person_night" | "forfait";
export type CostBand = "cheap" | "medium" | "expensive";

export interface User {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  created_at: string;
}

export interface Availability {
  id: number;
  season: Season;
  units: Unit[];
  capacity_min: number | null;
  capacity_max: number | null;
}

export interface CostOption {
  id: number;
  model: CostModel;
  amount: number;
  currency: string;
  deposit: number | null;
  city_tax_per_night: number | null;
  utilities_flat: number | null;
  age_rules?: Record<string, unknown> | null;
}

export interface Structure {
  id: number;
  name: string;
  slug: string;
  province: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  type: StructureType;
  created_at: string;
  estimated_cost?: number | null;
  cost_band?: CostBand | null;
  availabilities?: Availability[] | null;
  cost_options?: CostOption[] | null;
}

export interface StructureSearchItem {
  id: number;
  slug: string;
  name: string;
  province: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  type: StructureType;
  distance_km: number | null;
  estimated_cost: number | null;
  cost_band: CostBand | null;
  seasons: Season[];
  units: Unit[];
}

export interface StructureSearchResponse {
  items: StructureSearchItem[];
  page: number;
  page_size: number;
  total: number;
  sort: string;
  order: string;
  base_coords: {
    lat: number;
    lon: number;
  };
}

export interface StructureSearchParams {
  q?: string;
  province?: string;
  type?: StructureType;
  max_km?: number;
  season?: Season;
  unit?: Unit;
  cost_band?: CostBand;
  sort?: "name" | "created_at" | "distance";
  order?: "asc" | "desc";
}


export type EventBranch = "LC" | "EG" | "RS" | "ALL";
export type EventStatus = "draft" | "planning" | "booked" | "archived";
export type EventCandidateStatus =
  | "to_contact"
  | "contacting"
  | "available"
  | "unavailable"
  | "followup"
  | "confirmed"
  | "option";
export type EventContactTaskStatus = "todo" | "in_progress" | "done" | "n_a";
export type EventContactTaskOutcome = "pending" | "positive" | "negative";

export interface EventParticipants {
  lc: number;
  eg: number;
  rs: number;
  leaders: number;
}

export interface EventCandidateStructure {
  id: number;
  name: string;
  slug: string;
  province: string | null;
}

export interface EventCandidate {
  id: number;
  event_id: number;
  structure_id: number;
  status: EventCandidateStatus;
  assigned_user: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  last_update: string;
  structure?: EventCandidateStructure | null;
}

export interface EventContactTask {
  id: number;
  event_id: number;
  structure_id: number | null;
  assigned_user: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  status: EventContactTaskStatus;
  outcome: EventContactTaskOutcome;
  notes: string | null;
  updated_at: string;
}

export interface Event {
  id: number;
  slug: string;
  title: string;
  branch: EventBranch;
  start_date: string;
  end_date: string;
  participants: EventParticipants;
  budget_total: number | null;
  status: EventStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  candidates?: EventCandidate[] | null;
  tasks?: EventContactTask[] | null;
}

export interface EventListResponse {
  items: Event[];
  total: number;
  page: number;
  page_size: number;
}

export interface EventSummary {
  status_counts: Record<EventCandidateStatus, number>;
  has_conflicts: boolean;
}

export interface EventSuggestion {
  structure_id: number;
  structure_name: string;
  structure_slug: string;
  distance_km: number | null;
  estimated_cost: number | null;
  cost_band: string | null;
}

export interface EventCreateDto {
  title: string;
  branch: EventBranch;
  start_date: string;
  end_date: string;
  participants?: Partial<EventParticipants>;
  budget_total?: number | null;
  status?: EventStatus;
  notes?: string | null;
}

export type EventUpdateDto = Partial<EventCreateDto>;

export interface EventCandidateCreateDto {
  structure_id?: number;
  structure_slug?: string;
  assigned_user?: string | null;
  assigned_user_id?: string | null;
}

export interface EventCandidateUpdateDto {
  status?: EventCandidateStatus;
  assigned_user?: string | null;
  assigned_user_id?: string | null;
}

export interface EventContactTaskCreateDto {
  structure_id?: number | null;
  assigned_user?: string | null;
  assigned_user_id?: string | null;
  status?: EventContactTaskStatus;
  outcome?: EventContactTaskOutcome;
  notes?: string | null;
}

export type EventContactTaskUpdateDto = Partial<EventContactTaskCreateDto>;

export type EventMemberRole = "owner" | "collab" | "viewer";

export interface EventMemberUser {
  id: string;
  email: string;
  name: string;
}

export interface EventMember {
  id: number;
  event_id: number;
  role: EventMemberRole;
  user: EventMemberUser;
}

export interface EventMemberCreateDto {
  email: string;
  role: EventMemberRole;
}

export interface EventMemberUpdateDto {
  role: EventMemberRole;
}

export type QuoteScenario = "best" | "realistic" | "worst";

export interface QuoteTotals {
  subtotal: number;
  utilities: number;
  city_tax: number;
  deposit: number;
  total: number;
}

export interface QuoteBreakdownEntry {
  option_id: number | null;
  type: string;
  description: string;
  currency: string;
  unit_amount?: number | null;
  quantity?: number | null;
  metadata?: Record<string, unknown> | null;
  total: number;
}

export interface QuoteScenarios {
  best: number;
  realistic: number;
  worst: number;
}

export interface QuoteCalcResponse {
  currency: string;
  totals: QuoteTotals;
  breakdown: QuoteBreakdownEntry[];
  scenarios: QuoteScenarios;
  inputs: Record<string, unknown>;
}

export interface QuoteOverrides {
  participants?: Partial<EventParticipants>;
  days?: number;
  nights?: number;
}

export interface QuoteCalcRequestDto {
  event_id: number;
  structure_id: number;
  overrides?: QuoteOverrides;
}

export interface QuoteCreateDto {
  structure_id: number;
  scenario?: QuoteScenario;
  overrides?: QuoteOverrides;
}

export interface QuoteListItem {
  id: number;
  event_id: number;
  structure_id: number;
  structure_name: string | null;
  scenario: QuoteScenario;
  currency: string;
  total: number;
  created_at: string;
}

export interface Quote {
  id: number;
  event_id: number;
  structure_id: number;
  scenario: QuoteScenario;
  currency: string;
  totals: QuoteTotals;
  breakdown: QuoteBreakdownEntry[];
  inputs: Record<string, unknown>;
  scenarios: QuoteScenarios;
  created_at: string;
}
