import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { getStructures } from "../../shared/api";
import type { StructureSearchResponse } from "../../shared/types";
import { StructuresPage } from "../Structures";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    getStructures: vi.fn()
  };
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={["/structures"]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const sampleResponse: StructureSearchResponse = {
  items: [
    {
      id: 1,
      slug: "casa-alpina",
      name: "Casa Alpina",
      province: "BS",
      address: "Via Roma 1",
      latitude: 45.6,
      longitude: 10.16,
      altitude: 1250,
      type: "house",
      distance_km: 12.4,
      estimated_cost: 11.75,
      cost_band: "medium",
      seasons: ["summer"],
      units: ["LC", "EG"],
      fire_policy: "with_permit",
      access_by_car: true,
      access_by_coach: false,
      access_by_public_transport: true,
      has_kitchen: true,
      hot_water: true,
      pit_latrine_allowed: false
    },
    {
      id: 2,
      slug: "campo-verde",
      name: "Campo Verde",
      province: "VR",
      address: null,
      latitude: null,
      longitude: null,
      altitude: null,
      type: "land",
      distance_km: null,
      estimated_cost: null,
      cost_band: null,
      seasons: [],
      units: [],
      fire_policy: "allowed",
      access_by_car: true,
      access_by_coach: false,
      access_by_public_transport: false,
      has_kitchen: false,
      hot_water: false,
      pit_latrine_allowed: true
    }
  ],
  page: 1,
  page_size: 6,
  total: 2,
  sort: "distance",
  order: "asc",
  base_coords: { lat: 45.5966, lon: 10.1655 }
};

describe("StructuresPage", () => {
  beforeEach(() => {
    vi.mocked(getStructures).mockResolvedValue(sampleResponse);
  });

  it("renders filters and structure results", async () => {
    const Wrapper = createWrapper();
    render(<StructuresPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Casa Alpina")).toBeInTheDocument());
    expect(screen.getByLabelText(/Cerca/i)).toBeInTheDocument();
    expect(screen.getByText(/Distanza: 12.4 km/)).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.startsWith("Costo stimato:") && content.includes("€"))
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Casa Alpina/i })).toHaveAttribute(
      "href",
      "/structures/casa-alpina"
    );
  });

  it("applies filters when submitting the form", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();
    render(<StructuresPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Casa Alpina")).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /^Stagione$/i })).toBeInTheDocument()
    );

    await user.type(screen.getByLabelText(/Cerca/i), "alpina");
    await user.selectOptions(screen.getByLabelText(/Provincia/i), "BS");
    await user.selectOptions(screen.getByLabelText(/Tipologia/i), "house");
    await user.selectOptions(screen.getByRole("combobox", { name: /^Stagione$/i }), "summer");
    await user.selectOptions(screen.getByRole("combobox", { name: /^Unità$/i }), "LC");
    await user.selectOptions(screen.getByRole("combobox", { name: /Fascia di costo/i }), "medium");
    await user.type(screen.getByLabelText(/Distanza massima/i), "25");
    await user.click(screen.getByRole("button", { name: /Applica/i }));

    await waitFor(() =>
      expect(vi.mocked(getStructures)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          q: "alpina",
          province: "BS",
          type: "house",
          season: "summer",
          unit: "LC",
          cost_band: "medium",
          max_km: 25,
          sort: "distance",
          order: "asc",
          page: 1,
          page_size: 6
        })
      )
    );
  });

  it("applies open period filters", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();
    render(<StructuresPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Casa Alpina")).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/Aperta in/i), "summer");
    const dateInput = screen.getByLabelText(/Aperta il/i) as HTMLInputElement;
    await user.clear(dateInput);
    await user.type(dateInput, "2025-08-05");

    await user.click(screen.getByRole("button", { name: /Applica/i }));

    await waitFor(() =>
      expect(vi.mocked(getStructures)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          open_in_season: "summer",
          open_on_date: "2025-08-05",
        })
      )
    );
  });

  it("shows an error message when the API fails", async () => {
    const Wrapper = createWrapper();
    vi.mocked(getStructures).mockRejectedValueOnce(new Error("boom"));

    render(<StructuresPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText(/Impossibile caricare le strutture/i)).toBeInTheDocument());
  });
});
