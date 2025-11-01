import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, createStructure } from "../../shared/api";
import type { Structure } from "../../shared/types";
import { StructureCreatePage } from "../StructureCreate";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    createStructure: vi.fn()
  };
});

const createdStructure: Structure = {
  id: 1,
  name: "Base Bosco",
  slug: "base-bosco",
  province: "BS",
  address: "Via Bosco 1",
  latitude: 45.12,
  longitude: 9.12,
  altitude: 450,
  type: "house",
  indoor_beds: 30,
  indoor_bathrooms: 4,
  indoor_showers: 4,
  indoor_activity_rooms: 2,
  has_kitchen: true,
  hot_water: true,
  land_area_m2: null,
  shelter_on_field: false,
  water_sources: null,
  electricity_available: true,
  fire_policy: null,
  access_by_car: true,
  access_by_coach: false,
  access_by_public_transport: true,
  coach_turning_area: false,
  nearest_bus_stop: null,
  weekend_only: false,
  has_field_poles: false,
  pit_latrine_allowed: false,
  website_urls: ["https://example.org/base-bosco"],
  notes_logistics: null,
  notes: null,
  created_at: "2024-05-01T10:00:00Z",
  estimated_cost: null,
  cost_band: null,
  availabilities: null,
  cost_options: null,
  contacts: null,
  open_periods: []
};

const createWrapper = (queryClient: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={["/structures/new"]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );

describe("StructureCreatePage", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    vi.mocked(createStructure).mockReset();
  });

  it("creates a structure and navigates to its detail page", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const Wrapper = createWrapper(queryClient);
    const user = userEvent.setup();
    vi.mocked(createStructure).mockResolvedValue(createdStructure);

    render(<StructureCreatePage />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText(/Nome/i), "Base Bosco");
    await user.selectOptions(screen.getByLabelText(/Tipologia/i), "house");
    await user.type(screen.getByLabelText(/Provincia/i), "bs");
    await user.type(screen.getByLabelText(/Altitudine/i), "350");

    await user.type(screen.getByLabelText(/Siti o link di riferimento/i), "https://base.example.org");
    await user.click(screen.getByRole("button", { name: /Aggiungi un altro link/i }));
    await user.type(screen.getByLabelText(/Link 2/i), "https://info.example.org");

    expect(
      screen.getByText("L'URL pubblico sarà /structures/base-bosco")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    await waitFor(() => expect(createStructure).toHaveBeenCalled());

    const payload = vi.mocked(createStructure).mock.calls[0][0];
    expect(payload).toMatchObject({
      name: "Base Bosco",
      type: "house",
      province: "BS",
      has_kitchen: false,
      hot_water: false,
      access_by_car: false,
      access_by_coach: false,
      access_by_public_transport: false,
      coach_turning_area: false,
      shelter_on_field: false,
      electricity_available: false,
      weekend_only: false,
      has_field_poles: false,
      pit_latrine_allowed: false,
      land_area_m2: null,
      water_sources: null,
      fire_policy: null,
      altitude: 350,
      open_periods: []
    });
    expect(payload.slug).toBeUndefined();
    expect(payload.website_urls).toEqual([
      "https://base.example.org",
      "https://info.example.org"
    ]);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/structures/base-bosco"));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["structures"] });
  });

  it("serialises open periods when provided", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    const Wrapper = createWrapper(queryClient);
    const user = userEvent.setup();
    vi.mocked(createStructure).mockResolvedValue(createdStructure);

    render(<StructureCreatePage />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText(/Nome/i), "Base Bosco");
    await user.selectOptions(screen.getByLabelText(/Tipologia/i), "mixed");
    await user.type(screen.getByLabelText(/Provincia/i), "BS");

    const openPeriodsGroup = screen
      .getByText(/Periodi di apertura/i)
      .closest('[role="group"]') as HTMLElement;
    const openPeriodsWithin = within(openPeriodsGroup);

    await user.click(openPeriodsWithin.getByRole("button", { name: /Aggiungi stagione/i }));
    await user.click(openPeriodsWithin.getByRole("button", { name: /Aggiungi intervallo/i }));

    const seasonSelect = openPeriodsWithin
      .getAllByRole("combobox")
      .find((element) =>
        Array.from((element as HTMLSelectElement).options).some((option) =>
          option.textContent?.includes("Seleziona stagione")
        )
      ) as HTMLSelectElement;
    await user.selectOptions(seasonSelect, "summer");

    const rows = openPeriodsWithin.getAllByRole("row");
    const seasonRow = rows[1];
    const rangeRow = rows[2];
    await user.click(within(seasonRow).getByRole("checkbox", { name: "Tutte le branche" }));
    await user.click(within(rangeRow).getByRole("checkbox", { name: "E/G" }));
    await user.click(within(rangeRow).getByRole("checkbox", { name: "R/S" }));

    const notesInputs = openPeriodsWithin.getAllByPlaceholderText(/Note facoltative/i);
    await user.type(notesInputs[0], "Chiuso settimana 33");
    await user.type(notesInputs[1], "Campo EG");

    const dateInputs = openPeriodsGroup.querySelectorAll('input[type="date"]');
    await user.type(dateInputs[0] as HTMLInputElement, "2025-08-01");
    await user.type(dateInputs[1] as HTMLInputElement, "2025-08-15");

    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    await waitFor(() => expect(createStructure).toHaveBeenCalled());
    const payload = vi.mocked(createStructure).mock.calls[0][0];
    expect(payload.open_periods).toEqual([
      {
        kind: "season",
        season: "summer",
        notes: "Chiuso settimana 33",
        units: ["ALL"]
      },
      {
        kind: "range",
        date_start: "2025-08-01",
        date_end: "2025-08-15",
        notes: "Campo EG",
        units: ["EG", "RS"]
      }
    ]);
  });

  it("shows an error message when the API rejects the request", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    const Wrapper = createWrapper(queryClient);
    const user = userEvent.setup();
    vi.mocked(createStructure).mockRejectedValue(new ApiError(400, { detail: "Slug already exists" }));

    render(<StructureCreatePage />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText(/Nome/i), "Base Bosco");
    await user.selectOptions(screen.getByLabelText(/Tipologia/i), "house");

    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    await waitFor(() =>
      expect(screen.getByText(/Slug already exists/i)).toBeInTheDocument()
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("validates required fields before submitting", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const Wrapper = createWrapper(queryClient);
    const user = userEvent.setup();

    render(<StructureCreatePage />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    expect(await screen.findByText(/Inserisci un nome per la struttura/i)).toBeInTheDocument();
    expect(screen.getByText(/Seleziona una tipologia/i)).toBeInTheDocument();
    expect(createStructure).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
