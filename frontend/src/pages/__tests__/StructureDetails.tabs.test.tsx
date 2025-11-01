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

const structureWithDetails: Structure = {
  id: 99,
  name: "Test Base",
  slug: "test-base",
  province: "BS",
  address: null,
  latitude: null,
  longitude: null,
  altitude: null,
  type: "mixed",
  indoor_beds: null,
  indoor_bathrooms: null,
  indoor_showers: null,
  indoor_activity_rooms: null,
  has_kitchen: false,
  hot_water: false,
  land_area_m2: 5000,
  shelter_on_field: true,
  water_sources: ["tap"],
  electricity_available: false,
  fire_policy: "allowed",
  access_by_car: true,
  access_by_coach: false,
  access_by_public_transport: false,
  coach_turning_area: false,
  nearest_bus_stop: null,
  weekend_only: false,
  has_field_poles: true,
  pit_latrine_allowed: true,
  contact_emails: [],
  website_urls: [],
  notes_logistics: null,
  notes: null,
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
      deposit: 50,
      city_tax_per_night: 1.2,
      utilities_flat: null,
      age_rules: null
    }
  ],
  contacts: [],
  open_periods: []
};

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
    expect(screen.getByText(/per_person_day/i)).toBeInTheDocument();
    expect(screen.getByText(/Deposit:/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Allegati/i }));
    expect(screen.getByText(/Accedi per visualizzare gli allegati/)).toBeInTheDocument();
  });
});
