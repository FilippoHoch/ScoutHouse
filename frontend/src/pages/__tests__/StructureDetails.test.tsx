import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ApiError, getStructureBySlug, getStructurePhotos } from "../../shared/api";
import type { Structure } from "../../shared/types";
import { StructureDetailsPage } from "../StructureDetails";
import i18n from "../../i18n";
import {
  createGoogleMapsEmbedUrl,
  createGoogleMapsViewUrl
} from "../../shared/utils/googleMaps";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    getStructureBySlug: vi.fn(),
    getStructurePhotos: vi.fn()
  };
});

const createWrapper = (initialPath: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const sampleStructure: Structure = {
  id: 1,
  name: "Casa Alpina",
  slug: "casa-alpina",
  country: "IT",
  province: "BS",
  municipality: null,
  municipality_code: null,
  locality: null,
  address: "Via Roma 1",
  latitude: 45.6,
  longitude: 10.16,
  altitude: 1250,
  plus_code: null,
  what3words: null,
  emergency_coordinates: null,
  winter_access_notes: null,
  road_weight_limit_tonnes: null,
  bridge_weight_limit_tonnes: null,
  max_vehicle_height_m: null,
  road_access_notes: null,
  type: "house",
  indoor_beds: 48,
  indoor_bathrooms: 6,
  indoor_showers: 8,
  indoor_activity_rooms: 4,
  indoor_rooms: null,
  has_kitchen: true,
  hot_water: true,
  land_area_m2: 1200,
  field_slope: null,
  shelter_on_field: true,
  water_sources: ["tap"],
  electricity_available: true,
  power_capacity_kw: null,
  power_outlets_count: null,
  power_outlet_types: null,
  generator_available: null,
  generator_notes: null,
  water_tank_capacity_liters: null,
  wastewater_type: null,
  wastewater_notes: null,
  fire_policy: "with_permit",
  fire_rules: null,
  access_by_car: true,
  access_by_coach: true,
  access_by_public_transport: true,
  coach_turning_area: true,
  nearest_bus_stop: "Fermata centro",
  bus_type_access: null,
  weekend_only: false,
  has_field_poles: true,
  pit_latrine_allowed: false,
  dry_toilet: null,
  outdoor_bathrooms: null,
  outdoor_showers: null,
  contact_emails: ["info@casa-alpina.it"],
  website_urls: ["https://example.org/casa-alpina"],
  booking_url: null,
  whatsapp: null,
  booking_required: null,
  booking_notes: null,
  documents_required: [],
  map_resources_urls: [],
  event_rules_url: null,
  event_rules_notes: null,
  cell_coverage: null,
  cell_coverage_notes: null,
  communications_infrastructure: [],
  aed_on_site: null,
  emergency_phone_available: null,
  emergency_response_time_minutes: null,
  emergency_plan_notes: null,
  evacuation_plan_url: null,
  risk_assessment_template_url: null,
  wildlife_notes: null,
  river_swimming: null,
  flood_risk: null,
  weather_risk_notes: null,
  activity_spaces: [],
  activity_equipment: [],
  inclusion_services: [],
  inclusion_notes: null,
  pec_email: null,
  sdi_recipient_code: null,
  invoice_available: null,
  iban: null,
  payment_methods: [],
  fiscal_notes: null,
  notes_logistics: "Contattare il custode",
  logistics_arrival_notes: null,
  logistics_departure_notes: null,
  notes: "Note generiche",
  data_source: null,
  data_source_url: null,
  data_last_verified: null,
  governance_notes: null,
  data_quality_score: null,
  data_quality_notes: null,
  data_quality_flags: [],
  created_at: new Date("2024-01-01T00:00:00Z").toISOString(),
  estimated_cost: 18.5,
  cost_band: "medium",
  availabilities: [
    { id: 1, season: "spring", units: ["LC", "EG"], capacity_min: 15, capacity_max: 80 }
  ],
  cost_options: [
    {
      id: 1,
      model: "per_person_day",
      amount: 18.5,
      currency: "EUR",
      deposit: null,
      city_tax_per_night: null,
      utilities_flat: null,
      min_total: null,
      max_total: null,
      age_rules: null
    }
  ],
  contacts: [],
  open_periods: [
    {
      id: 1,
      kind: "season",
      season: "summer",
      date_start: null,
      date_end: null,
      notes: "Aperto",
      units: ["ALL"]
    },
    {
      id: 2,
      kind: "range",
      season: null,
      date_start: "2025-08-01",
      date_end: "2025-08-15",
      notes: "Campo EG",
      units: ["EG"]
    }
  ]
};

describe("StructureDetailsPage", () => {
  beforeEach(() => {
    vi.mocked(getStructureBySlug).mockResolvedValue(sampleStructure);
    vi.mocked(getStructurePhotos).mockResolvedValue([]);
  });

  it("renders structure details when found", async () => {
    const Wrapper = createWrapper("/structures/casa-alpina");

    render(
      <Routes>
        <Route path="/structures/:slug" element={<StructureDetailsPage />} />
      </Routes>,
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(screen.getByText("Casa Alpina")).toBeInTheDocument());
    const mapLink = screen.getByRole("link", { name: /Google Maps/i });
    const expectedViewUrl = createGoogleMapsViewUrl({
      lat: sampleStructure.latitude!,
      lng: sampleStructure.longitude!
    });
    expect(mapLink).toHaveAttribute("href", expectedViewUrl);
    const mapTitle = i18n.t("structures.details.location.mapTitle", {
      name: sampleStructure.name
    });
    const mapEmbed = screen.getByTitle(mapTitle);
    const expectedEmbedUrl = createGoogleMapsEmbedUrl({
      lat: sampleStructure.latitude!,
      lng: sampleStructure.longitude!
    });
    expect(mapEmbed).toHaveAttribute("src", expectedEmbedUrl);
    const coordinatesLabel = i18n.t("structures.details.location.coordinates", {
      lat: sampleStructure.latitude?.toFixed(4),
      lon: sampleStructure.longitude?.toFixed(4)
    });
    expect(screen.getByText(coordinatesLabel)).toBeInTheDocument();
    const altitudeLabel = i18n.t("structures.details.location.altitude", {
      alt: sampleStructure.altitude?.toFixed(0)
    });
    expect(screen.getByText(altitudeLabel)).toBeInTheDocument();
    const landAreaLabel = i18n.t("structures.details.overview.landAreaValue", {
      value: new Intl.NumberFormat("it-IT").format(sampleStructure.land_area_m2!)
    });
    expect(screen.getByText(landAreaLabel)).toBeInTheDocument();
    expect(screen.getByText(/Cucina attrezzata disponibile/i)).toBeInTheDocument();
    expect(screen.getByText(/Solo con autorizzazione/i)).toBeInTheDocument();
    expect(screen.getByText(/Rubinetto/i)).toBeInTheDocument();
    expect(screen.getByText(/Fermata centro/i)).toBeInTheDocument();
    expect(screen.getByText(/Contattare il custode/i)).toBeInTheDocument();
    expect(screen.getByText(/Note generiche/i)).toBeInTheDocument();
    expect(screen.getByText(i18n.t("structures.details.meta.estimatedDailyCost"))).toBeInTheDocument();
  });

  it("shows not found state for missing structure", async () => {
    const Wrapper = createWrapper("/structures/unknown");
    vi.mocked(getStructureBySlug).mockRejectedValueOnce(new ApiError(404, {}));

    render(
      <Routes>
        <Route path="/structures/:slug" element={<StructureDetailsPage />} />
      </Routes>,
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(screen.getByText(/could not be located/i)).toBeInTheDocument());
  });
});
