export type StructureType = "house" | "land" | "mixed";
export type FirePolicy = "allowed" | "with_permit" | "forbidden";
export type WaterSource =
  | "none"
  | "tap"
  | "river"
  | "lake"
  | "field_shower"
  | "unknown";
export type CellCoverageQuality = "none" | "limited" | "good" | "excellent";
export type WastewaterType = "none" | "septic" | "holding_tank" | "mains" | "unknown";
export type FloodRiskLevel = "none" | "low" | "medium" | "high";
export type RiverSwimmingOption = "si" | "no" | "unknown";
export type FieldSlope = "flat" | "gentle" | "moderate" | "steep";
export type AnimalPolicy = "allowed" | "allowed_on_request" | "forbidden";
export type StructureContactStatus =
  | "unknown"
  | "to_contact"
  | "contacted"
  | "confirmed"
  | "stale";
export type StructureOperationalStatus =
  | "operational"
  | "seasonal"
  | "temporarily_closed"
  | "permanently_closed";
export type Season = "winter" | "spring" | "summer" | "autumn";
export type Unit = "LC" | "EG" | "RS" | "ALL";
export type CostModel = "per_person_day" | "per_person_night" | "forfait";
export type CostBand = "cheap" | "medium" | "expensive";
export type ContactPreferredChannel = "email" | "phone" | "other";

export type StructureOpenPeriodKind = "season" | "range";
export type StructureOpenPeriodSeason = Season;

export interface StructureOpenPeriod {
  id: number;
  kind: StructureOpenPeriodKind;
  season: StructureOpenPeriodSeason | null;
  date_start: string | null;
  date_end: string | null;
  notes: string | null;
  units: Unit[] | null;
}

export interface StructureOpenPeriodInput {
  id?: number;
  kind: StructureOpenPeriodKind;
  season?: StructureOpenPeriodSeason | null;
  date_start?: string | null;
  date_end?: string | null;
  notes?: string | null;
  units?: Unit[] | null;
}

export type AttachmentOwnerType = "structure" | "event";

export interface Attachment {
  id: number;
  owner_type: AttachmentOwnerType;
  owner_id: number;
  filename: string;
  mime: string;
  size: number;
  created_by: string | null;
  created_by_name: string | null;
  description: string | null;
  created_at: string;
}

export interface StructurePhoto {
  id: number;
  structure_id: number;
  attachment_id: number;
  filename: string;
  mime: string;
  size: number;
  position: number;
  url: string;
  created_at: string;
  description: string | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  can_edit_structures: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Availability {
  id: number;
  season: Season;
  units: Unit[];
  capacity_min: number | null;
  capacity_max: number | null;
}

export type CostModifierKind = "season" | "date_range" | "weekend";

export interface StructureCostModifier {
  id: number;
  kind: CostModifierKind;
  amount: number;
  season: Season | null;
  date_start: string | null;
  date_end: string | null;
  price_per_resource?: Record<string, number> | null;
}

export interface StructureCostModifierInput {
  id?: number;
  kind: CostModifierKind;
  amount: number;
  season?: Season | null;
  date_start?: string | null;
  date_end?: string | null;
  price_per_resource?: Record<string, number> | null;
}

export interface CostOption {
  id: number;
  model: CostModel;
  amount: number;
  currency: string;
  booking_deposit: number | null;
  damage_deposit: number | null;
  city_tax_per_night: number | null;
  utilities_flat: number | null;
  utilities_included: boolean | null;
  utilities_notes: string | null;
  min_total: number | null;
  max_total: number | null;
  age_rules?: Record<string, unknown> | null;
  payment_methods?: string[] | null;
  payment_terms?: string | null;
  price_per_resource?: Record<string, number> | null;
  modifiers?: StructureCostModifier[] | null;
}

export interface StructureCostOptionInput {
  id?: number;
  model: CostModel;
  amount: number;
  currency: string;
  booking_deposit?: number | null;
  damage_deposit?: number | null;
  city_tax_per_night?: number | null;
  utilities_flat?: number | null;
  utilities_included?: boolean | null;
  utilities_notes?: string | null;
  min_total?: number | null;
  max_total?: number | null;
  age_rules?: Record<string, unknown> | null;
  payment_methods?: string[] | null;
  payment_terms?: string | null;
  price_per_resource?: Record<string, number> | null;
  modifiers?: StructureCostModifierInput[] | null;
}

export interface Contact {
  id: number;
  contact_id: number;
  structure_id: number;
  first_name: string | null;
  last_name: string | null;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  preferred_channel: ContactPreferredChannel;
  is_primary: boolean;
  notes: string | null;
  gdpr_consent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactCreateDto {
  contact_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  preferred_channel?: ContactPreferredChannel;
  is_primary?: boolean;
  notes?: string | null;
  gdpr_consent_at?: string | null;
}

export type ContactUpdateDto = Partial<ContactCreateDto>;

export interface Structure {
  id: number;
  name: string;
  slug: string;
  country: string;
  province: string | null;
  municipality: string | null;
  municipality_code: string | null;
  locality: string | null;
  postal_code: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  plus_code: string | null;
  what3words: string | null;
  emergency_coordinates: { lat: number; lon: number } | null;
  winter_access_notes: string | null;
  road_weight_limit_tonnes: number | null;
  bridge_weight_limit_tonnes: number | null;
  max_vehicle_height_m: number | null;
  road_access_notes: string | null;
  type: StructureType;
  indoor_beds: number | null;
  indoor_bathrooms: number | null;
  indoor_showers: number | null;
  indoor_activity_rooms: number | null;
  indoor_rooms?: Record<string, unknown>[] | null;
  has_kitchen: boolean | null;
  hot_water: boolean | null;
  land_area_m2: number | null;
  field_slope?: FieldSlope | null;
  pitches_tende: number | null;
  water_at_field: boolean | null;
  shelter_on_field: boolean | null;
  water_sources: WaterSource[] | null;
  electricity_available: boolean | null;
  power_capacity_kw: number | null;
  power_outlets_count: number | null;
  power_outlet_types: string[] | null;
  generator_available: boolean | null;
  generator_notes: string | null;
  water_tank_capacity_liters: number | null;
  wastewater_type: WastewaterType | null;
  wastewater_notes: string | null;
  fire_policy: FirePolicy | null;
  fire_rules?: string | null;
  access_by_car: boolean | null;
  access_by_coach: boolean | null;
  access_by_public_transport: boolean | null;
  coach_turning_area: boolean | null;
  nearest_bus_stop: string | null;
  bus_type_access?: string[] | null;
  weekend_only: boolean | null;
  has_field_poles: boolean | null;
  pit_latrine_allowed: boolean | null;
  dry_toilet: boolean | null;
  outdoor_bathrooms: number | null;
  outdoor_showers: number | null;
  wheelchair_accessible: boolean | null;
  step_free_access: boolean | null;
  parking_car_slots: number | null;
  parking_bus_slots: number | null;
  parking_notes: string | null;
  accessibility_notes: string | null;
  contact_emails: string[];
  website_urls: string[];
  booking_url?: string | null;
  whatsapp?: string | null;
  booking_required: boolean | null;
  booking_notes: string | null;
  documents_required: string[];
  map_resources_urls: string[];
  event_rules_url: string | null;
  event_rules_notes: string | null;
  allowed_audiences: string[];
  usage_rules: string | null;
  animal_policy: AnimalPolicy | null;
  animal_policy_notes: string | null;
  in_area_protetta: boolean | null;
  ente_area_protetta: string | null;
  environmental_notes: string | null;
  seasonal_amenities?: Record<string, unknown> | null;
  contact_status: StructureContactStatus;
  operational_status: StructureOperationalStatus | null;
  cell_coverage: CellCoverageQuality | null;
  cell_coverage_notes: string | null;
  communications_infrastructure: string[];
  aed_on_site: boolean | null;
  emergency_phone_available: boolean | null;
  emergency_response_time_minutes: number | null;
  emergency_plan_notes: string | null;
  evacuation_plan_url: string | null;
  risk_assessment_template_url: string | null;
  wildlife_notes: string | null;
  river_swimming: RiverSwimmingOption | null;
  flood_risk: FloodRiskLevel | null;
  weather_risk_notes: string | null;
  activity_spaces: string[];
  activity_equipment: string[];
  inclusion_services: string[];
  inclusion_notes: string | null;
  pec_email: string | null;
  sdi_recipient_code: string | null;
  invoice_available: boolean | null;
  iban: string | null;
  payment_methods: string[];
  fiscal_notes: string | null;
  notes_logistics: string | null;
  logistics_arrival_notes: string | null;
  logistics_departure_notes: string | null;
  notes: string | null;
  data_source?: string | null;
  data_source_url?: string | null;
  data_last_verified?: string | null;
  governance_notes?: string | null;
  data_quality_score: number | null;
  data_quality_notes: string | null;
  data_quality_flags: string[];
  created_at: string;
  estimated_cost?: number | null;
  cost_band?: CostBand | null;
  availabilities?: Availability[] | null;
  cost_options?: CostOption[] | null;
  contacts?: Contact[] | null;
  open_periods?: StructureOpenPeriod[] | null;
  warnings?: string[] | null;
}

export interface StructureCreateDto {
  name: string;
  slug: string;
  country?: string;
  province?: string;
  municipality?: string | null;
  municipality_code?: string | null;
  locality?: string | null;
  postal_code?: string | null;
  address?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  plus_code?: string | null;
  what3words?: string | null;
  emergency_coordinates?: { lat: number; lon: number } | null;
  winter_access_notes?: string | null;
  road_weight_limit_tonnes?: number | null;
  bridge_weight_limit_tonnes?: number | null;
  max_vehicle_height_m?: number | null;
  road_access_notes?: string | null;
  type: StructureType;
  indoor_beds?: number | null;
  indoor_bathrooms?: number | null;
  indoor_showers?: number | null;
  indoor_activity_rooms?: number | null;
  indoor_rooms?: Record<string, unknown>[] | null;
  has_kitchen?: boolean | null;
  hot_water?: boolean | null;
  land_area_m2?: number | null;
  field_slope?: FieldSlope | null;
  pitches_tende?: number | null;
  water_at_field?: boolean | null;
  shelter_on_field?: boolean | null;
  water_sources?: WaterSource[] | null;
  electricity_available?: boolean | null;
  power_capacity_kw?: number | null;
  power_outlets_count?: number | null;
  power_outlet_types?: string[] | null;
  generator_available?: boolean | null;
  generator_notes?: string | null;
  water_tank_capacity_liters?: number | null;
  wastewater_type?: WastewaterType | null;
  wastewater_notes?: string | null;
  fire_policy?: FirePolicy | null;
  fire_rules?: string | null;
  access_by_car?: boolean | null;
  access_by_coach?: boolean | null;
  access_by_public_transport?: boolean | null;
  coach_turning_area?: boolean | null;
  nearest_bus_stop?: string | null;
  bus_type_access?: string[] | null;
  weekend_only?: boolean | null;
  has_field_poles?: boolean | null;
  pit_latrine_allowed?: boolean | null;
  dry_toilet?: boolean | null;
  outdoor_bathrooms?: number | null;
  outdoor_showers?: number | null;
  wheelchair_accessible?: boolean | null;
  step_free_access?: boolean | null;
  parking_car_slots?: number | null;
  parking_bus_slots?: number | null;
  parking_notes?: string | null;
  accessibility_notes?: string | null;
  contact_emails?: string[];
  website_urls?: string[];
  booking_url?: string | null;
  whatsapp?: string | null;
  booking_required?: boolean | null;
  booking_notes?: string | null;
  documents_required?: string[];
  map_resources_urls?: string[];
  event_rules_url?: string | null;
  event_rules_notes?: string | null;
  allowed_audiences?: string[];
  usage_rules?: string | null;
  animal_policy?: AnimalPolicy | null;
  animal_policy_notes?: string | null;
  in_area_protetta?: boolean | null;
  ente_area_protetta?: string | null;
  environmental_notes?: string | null;
  seasonal_amenities?: Record<string, unknown> | null;
  contact_status?: StructureContactStatus;
  operational_status?: StructureOperationalStatus | null;
  cell_coverage?: CellCoverageQuality | null;
  cell_coverage_notes?: string | null;
  communications_infrastructure?: string[];
  aed_on_site?: boolean | null;
  emergency_phone_available?: boolean | null;
  emergency_response_time_minutes?: number | null;
  emergency_plan_notes?: string | null;
  evacuation_plan_url?: string | null;
  risk_assessment_template_url?: string | null;
  wildlife_notes?: string | null;
  river_swimming?: RiverSwimmingOption | null;
  flood_risk?: FloodRiskLevel | null;
  weather_risk_notes?: string | null;
  activity_spaces?: string[];
  activity_equipment?: string[];
  inclusion_services?: string[];
  inclusion_notes?: string | null;
  pec_email?: string | null;
  sdi_recipient_code?: string | null;
  invoice_available?: boolean | null;
  iban?: string | null;
  payment_methods?: string[];
  fiscal_notes?: string | null;
  notes_logistics?: string | null;
  logistics_arrival_notes?: string | null;
  logistics_departure_notes?: string | null;
  notes?: string | null;
  data_source?: string | null;
  data_source_url?: string | null;
  data_last_verified?: string | null;
  governance_notes?: string | null;
  data_quality_score?: number | null;
  data_quality_notes?: string | null;
  data_quality_flags?: string[];
  open_periods?: StructureOpenPeriodInput[];
}

export interface StructureSearchItem {
  id: number;
  slug: string;
  name: string;
  province: string | null;
  postal_code: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  type: StructureType;
  distance_km: number | null;
  estimated_cost: number | null;
  cost_band: CostBand | null;
  seasons: Season[];
  units: Unit[];
  fire_policy: FirePolicy | null;
  access_by_car: boolean | null;
  access_by_coach: boolean | null;
  access_by_public_transport: boolean | null;
  has_kitchen: boolean | null;
  hot_water: boolean | null;
  pit_latrine_allowed: boolean | null;
  cell_coverage: CellCoverageQuality | null;
  aed_on_site: boolean | null;
  river_swimming: RiverSwimmingOption | null;
  wastewater_type: WastewaterType | null;
  flood_risk: FloodRiskLevel | null;
  power_capacity_kw: number | null;
  parking_car_slots: number | null;
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

export interface GeocodingAddress {
  street: string | null;
  house_number: string | null;
  locality: string | null;
  municipality: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  label: string;
  address: GeocodingAddress | null;
}

export type StructureImportSourceFormat = "csv" | "xlsx";

export interface StructureImportError {
  row: number;
  field: string;
  msg: string;
  source_format: StructureImportSourceFormat;
}

export interface StructureImportPreviewItem {
  slug: string;
  action: "create" | "update";
}

export interface StructureImportDryRunResponse {
  valid_rows: number;
  invalid_rows: number;
  errors: StructureImportError[];
  preview: StructureImportPreviewItem[];
  source_format: StructureImportSourceFormat;
}

export interface StructureImportResult {
  created: number;
  updated: number;
  skipped: number;
}

export interface StructureOpenPeriodsImportPreviewItem {
  slug: string;
  action: "create" | "skip" | "missing_structure";
}

export interface StructureOpenPeriodsImportDryRunResponse {
  valid_rows: number;
  invalid_rows: number;
  errors: StructureImportError[];
  preview: StructureOpenPeriodsImportPreviewItem[];
  source_format: StructureImportSourceFormat;
}

export interface StructureOpenPeriodsImportResult {
  created: number;
  skipped: number;
  errors: StructureImportError[];
  source_format: StructureImportSourceFormat;
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
  access?: string;
  fire?: FirePolicy;
  min_land_area?: number;
  hot_water?: boolean;
  cell_coverage?: CellCoverageQuality;
  aed_on_site?: boolean;
  river_swimming?: RiverSwimmingOption;
  wastewater_type?: WastewaterType;
  min_power_capacity_kw?: number;
  min_parking_car_slots?: number;
  flood_risk?: FloodRiskLevel;
  open_in_season?: StructureOpenPeriodSeason;
  open_on_date?: string;
}


export type EventBranch = "LC" | "EG" | "RS" | "ALL";
export type EventStatus = "draft" | "planning" | "booked" | "archived";
export type EventAccommodation = "indoor" | "tents";
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

export interface EventBranchSegment {
  id: number;
  branch: EventBranch;
  start_date: string;
  end_date: string;
  youth_count: number;
  leaders_count: number;
  accommodation: EventAccommodation;
  notes: string | null;
}

export interface EventBranchSegmentCreate {
  branch: EventBranch;
  start_date: string;
  end_date: string;
  youth_count: number;
  leaders_count: number;
  accommodation: EventAccommodation;
  notes?: string | null;
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
  contact_id: number | null;
  contact?: Contact | null;
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
  branch_segments: EventBranchSegment[];
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
  branch_segments?: EventBranchSegmentCreate[];
}

export type EventUpdateDto = Partial<EventCreateDto>;

export interface EventCandidateCreateDto {
  structure_id?: number;
  structure_slug?: string;
  assigned_user?: string | null;
  assigned_user_id?: string | null;
  contact_id?: number | null;
}

export interface EventCandidateUpdateDto {
  status?: EventCandidateStatus;
  assigned_user?: string | null;
  assigned_user_id?: string | null;
  contact_id?: number | null;
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

export type MailTemplate =
  | "reset_password"
  | "task_assigned"
  | "candidate_status_changed";

export interface MailPreview {
  template: MailTemplate;
  subject: string;
  html: string;
  text: string;
}
