export type StructureType = "community" | "event" | "training";

export interface Structure {
  id: number;
  name: string;
  slug: string;
  province: string | null;
  type: StructureType;
  created_at: string;
}
