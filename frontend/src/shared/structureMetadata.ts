import type { Structure } from "./types";

const managedKeys = new Set<keyof Structure | string>([
  "name",
  "slug",
  "province",
  "address",
  "latitude",
  "longitude",
  "altitude",
  "type",
  "contact_status",
  "operational_status",
  "indoor_beds",
  "indoor_bathrooms",
  "indoor_showers",
  "indoor_activity_rooms",
  "has_kitchen",
  "hot_water",
  "land_area_m2",
  "field_slope",
  "pitches_tende",
  "water_at_field",
  "shelter_on_field",
  "water_sources",
  "electricity_available",
  "fire_policy",
  "access_by_car",
  "access_by_coach",
  "access_by_public_transport",
  "coach_turning_area",
  "nearest_bus_stop",
  "weekend_only",
  "has_field_poles",
  "pit_latrine_allowed",
  "wheelchair_accessible",
  "step_free_access",
  "parking_car_slots",
  "parking_bus_slots",
  "parking_notes",
  "accessibility_notes",
  "contact_emails",
  "website_urls",
  "allowed_audiences",
  "usage_rules",
  "animal_policy",
  "animal_policy_notes",
  "in_area_protetta",
  "ente_area_protetta",
  "environmental_notes",
  "seasonal_amenities",
  "notes_logistics",
  "notes",
  "open_periods",
  "cost_options",
]);

const blockedAdvancedKeys = new Set<string>([
  "id",
  "created_at",
  "updated_at",
  "estimated_cost",
  "cost_band",
  "availabilities",
  "contacts",
  "open_periods",
  "cost_options",
  "warnings",
  "photos",
]);

export const STRUCTURE_FORM_MANAGED_KEYS = managedKeys;

export const STRUCTURE_ADVANCED_BLOCKED_KEYS = blockedAdvancedKeys;

export const extractAdvancedStructureData = (
  structure: Partial<Structure>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(structure)) {
    if (managedKeys.has(key) || blockedAdvancedKeys.has(key)) {
      continue;
    }
    if (value === null || value === undefined) {
      continue;
    }
    result[key] = value;
  }
  return result;
};

export const mergeAdvancedStructurePayload = <T extends Record<string, unknown>>(
  base: T,
  advanced: Record<string, unknown>
): T => {
  for (const [key, value] of Object.entries(advanced)) {
    if (blockedAdvancedKeys.has(key)) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(base, key) && base[key as keyof T] !== undefined) {
      continue;
    }
    (base as Record<string, unknown>)[key] = value;
  }
  return base;
};

