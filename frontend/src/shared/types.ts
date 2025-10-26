export type StructureType = "house" | "land" | "mixed";
export type Season = "winter" | "spring" | "summer" | "autumn";
export type Unit = "LC" | "EG" | "RS" | "ALL";
export type CostModel = "per_person_day" | "per_person_night" | "forfait";
export type CostBand = "cheap" | "medium" | "expensive";

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
