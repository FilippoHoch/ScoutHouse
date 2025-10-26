export type StructureType = "house" | "land" | "mixed";

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
  sort?: "name" | "created_at" | "distance";
  order?: "asc" | "desc";
}
