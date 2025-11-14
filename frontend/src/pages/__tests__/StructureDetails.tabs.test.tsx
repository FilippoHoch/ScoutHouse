import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { getStructureBySlug, getStructurePhotos } from "../../shared/api";
import type { Structure } from "../../shared/types";
import { StructureDetailsPage } from "../StructureDetails";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    getStructureBySlug: vi.fn(),
    getStructurePhotos: vi.fn()
  };
});

const Wrapper = ({ initialPath, children }: { initialPath: string; children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const structureWithDetails = {
  id: 99,
  name: "Test Base",
  slug: "test-base",
  country: "IT",
  province: "BS",
  municipality: null,
  municipality_code: null,
  locality: null,
  address: null,
  latitude: null,
  longitude: null,
  altitude: null,
  plus_code: null,
  what3words: null,
  emergency_coordinates: null,
  winter_access_notes: null,
  road_weight_limit_tonnes: null,
  bridge_weight_limit_tonnes: null,
  max_vehicle_height_m: null,
  road_access_notes: null,
  type: "mixed",
  indoor_beds: null,
  indoor_bathrooms: null,
  indoor_showers: null,
  indoor_activity_rooms: null,
  indoor_rooms: null,
  has_kitchen: false,
  hot_water: false,
  land_area_m2: 5000,
  field_slope: null,
  shelter_on_field: true,
  water_sources: ["tap"],
  electricity_available: false,
  power_capacity_kw: null,
  power_outlets_count: null,
  power_outlet_types: null,
  generator_available: null,
  generator_notes: null,
  water_tank_capacity_liters: null,
  wastewater_type: null,
  wastewater_notes: null,
  fire_policy: "allowed",
  fire_rules: null,
  access_by_car: true,
  access_by_coach: false,
  access_by_public_transport: false,
  coach_turning_area: false,
  nearest_bus_stop: null,
  bus_type_access: null,
  weekend_only: false,
  has_field_poles: true,
  pit_latrine_allowed: true,
  dry_toilet: null,
  outdoor_bathrooms: null,
  outdoor_showers: null,
  contact_emails: [],
  website_urls: [],
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
  activity_equipment: [],
  inclusion_notes: null,
  pec_email: null,
  sdi_recipient_code: null,
  invoice_available: null,
  iban: null,
  payment_methods: [],
  fiscal_notes: null,
  notes_logistics: null,
  logistics_arrival_notes: null,
  logistics_departure_notes: null,
  notes: null,
  data_source: null,
  data_source_url: null,
  data_last_verified: null,
  governance_notes: null,
  data_quality_score: null,
  data_quality_notes: null,
  data_quality_flags: [],
  created_at: new Date("2024-05-01T00:00:00Z").toISOString(),
  estimated_cost: 9.5,
  cost_band: "cheap",
  availabilities: [
    { id: 1, season: "summer", units: ["LC"], capacity_min: 10, capacity_max: 40 }
  ],
  cost_options: [
    {
      id: 2,
      model: "per_person_day",
      amount: 9.5,
      currency: "EUR",
      booking_deposit: 50,
      damage_deposit: null,
      city_tax_per_night: 1.2,
      utilities_flat: null,
      utilities_included: true,
      utilities_notes: "Consumi inclusi",
      min_total: null,
      max_total: null,
      age_rules: null,
      payment_methods: ["Bonifico"],
      payment_terms: "Saldo in 30 giorni",
      price_per_resource: null,
      modifiers: [
        {
          id: 5,
          kind: "season",
          amount: 11,
          season: "summer",
          date_start: null,
          date_end: null,
          price_per_resource: null
        }
      ]
    }
  ],
  contacts: [],
  open_periods: []
} as Structure;

describe("StructureDetailsPage tabs", () => {
  beforeEach(() => {
    vi.mocked(getStructureBySlug).mockResolvedValue(structureWithDetails);
    vi.mocked(getStructurePhotos).mockResolvedValue([]);
  });

  it("shows availability and cost information in dedicated tabs", async () => {
    const user = userEvent.setup();
    render(
      <Routes>
        <Route path="/structures/:slug" element={<StructureDetailsPage />} />
      </Routes>,
      { wrapper: ({ children }) => <Wrapper initialPath="/structures/test-base">{children}</Wrapper> }
    );

    await waitFor(() => expect(screen.getByText(/Test Base/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Disponibilità/i }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText(/summer/i)).toBeInTheDocument();
    expect(screen.getByText(/LC/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Costi/i }));
    expect(screen.getByText(/Per persona al giorno/i)).toBeInTheDocument();
    expect(screen.getByText(/Caparra prenotazione/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Allegati/i }));
    expect(screen.getByText(/Accedi per visualizzare gli allegati/)).toBeInTheDocument();
  });
});
