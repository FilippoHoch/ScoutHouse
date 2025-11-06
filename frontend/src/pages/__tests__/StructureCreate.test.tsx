import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  confirmAttachmentUpload,
  createStructure,
  createStructurePhoto,
  getStructureBySlug,
  signAttachmentUpload,
  updateStructure,
  upsertStructureCostOptions
} from "../../shared/api";
import type { Structure } from "../../shared/types";
import { StructureCreatePage, StructureEditPage } from "../StructureCreate";

const mockNavigate = vi.fn();

let alertMock: ReturnType<typeof vi.spyOn>;

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
    createStructure: vi.fn(),
    createStructurePhoto: vi.fn(),
    getStructureBySlug: vi.fn(),
    signAttachmentUpload: vi.fn(),
    confirmAttachmentUpload: vi.fn(),
    updateStructure: vi.fn(),
    upsertStructureCostOptions: vi.fn()
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
  contact_emails: ["info@example.org", "booking@example.org"],
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

const createEditWrapper = (queryClient: QueryClient, slug = "base-bosco") =>
  ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[`/structures/${slug}/edit`]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/structures/:slug/edit" element={children} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  mockNavigate.mockReset();
  vi.mocked(createStructure).mockReset();
  vi.mocked(createStructurePhoto).mockReset();
  vi.mocked(getStructureBySlug).mockReset();
  vi.mocked(signAttachmentUpload).mockReset();
  vi.mocked(confirmAttachmentUpload).mockReset();
  vi.mocked(updateStructure).mockReset();
  vi.mocked(upsertStructureCostOptions).mockReset();
  alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => {
  alertMock.mockRestore();
});

describe("StructureCreatePage", () => {

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

    await user.type(screen.getByLabelText(/Email di riferimento/i), "info@example.org");
    await user.click(screen.getByRole("button", { name: /Aggiungi un'altra email/i }));
    await user.type(screen.getByLabelText(/Email 2/i), "booking@example.org");

    await user.type(screen.getByLabelText(/Siti o link di riferimento/i), "https://base.example.org");
    await user.click(screen.getByRole("button", { name: /Aggiungi un altro link/i }));
    await user.type(screen.getByLabelText(/Link 2/i), "https://info.example.org");

    expect(screen.queryByRole("textbox", { name: /Slug/i })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText(/L'URL pubblico sarà \/structures\/base-bosco/i)
      ).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    await waitFor(() => expect(createStructure).toHaveBeenCalled());

    const payload = vi.mocked(createStructure).mock.calls[0][0];
    expect(payload).toMatchObject({
      name: "Base Bosco",
      slug: "base-bosco",
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
      contact_emails: ["info@example.org", "booking@example.org"],
      open_periods: []
    });
    expect(payload.website_urls).toEqual([
      "https://base.example.org",
      "https://info.example.org"
    ]);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/structures/base-bosco"));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["structures"] });
  });

  it("alerts when the API reports unreachable websites", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    const Wrapper = createWrapper(queryClient);
    const user = userEvent.setup();
    vi.mocked(createStructure).mockResolvedValue({
      ...createdStructure,
      warnings: ["https://non-risponde.example"]
    });

    render(<StructureCreatePage />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText(/Nome/i), "Base Bosco");
    await user.selectOptions(screen.getByLabelText(/Tipologia/i), "house");
    await user.type(
      screen.getByLabelText(/Siti o link di riferimento/i),
      "https://base.example.org"
    );

    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    await waitFor(() => expect(createStructure).toHaveBeenCalled());
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(alertMock).toHaveBeenCalledWith(
      expect.stringContaining("https://non-risponde.example")
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });

  it("provides immediate feedback about website URL validity", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    const Wrapper = createWrapper(queryClient);
    const user = userEvent.setup();

    render(<StructureCreatePage />, { wrapper: Wrapper });

    const websiteField = screen.getByLabelText(/Siti o link di riferimento/i);
    await user.type(websiteField, "www.scouthouse");
    await user.tab();

    expect(
      screen.getByText(/questo link non sembra valido\. puoi comunque procedere/i)
    ).toBeInTheDocument();

    await user.click(websiteField);
    await user.clear(websiteField);
    await user.type(websiteField, "https://scouthouse.example");
    await user.tab();

    expect(screen.getByText(/Link valido/i)).toBeInTheDocument();
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

  it("saves cost options after creating the structure", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    const Wrapper = createWrapper(queryClient);
    const user = userEvent.setup();
    vi.mocked(createStructure).mockResolvedValue(createdStructure);
    vi.mocked(upsertStructureCostOptions).mockResolvedValue([]);

    render(<StructureCreatePage />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText(/Nome/i), "Base Bosco");
    await user.selectOptions(screen.getByLabelText(/Tipologia/i), "house");

    await user.click(screen.getByRole("button", { name: /Aggiungi opzione di costo/i }));

    await user.selectOptions(screen.getByLabelText(/Modello di costo/i), "per_person_day");
    await user.type(screen.getByLabelText(/Importo principale/i), "12,50");

    const currencyField = screen.getByLabelText(/Valuta/i);
    await user.clear(currencyField);
    await user.type(currencyField, "usd");

    await user.type(screen.getByLabelText(/Caparra/i), "50");
    await user.type(
      screen.getByLabelText(/Tassa di soggiorno per notte/i),
      "1,5"
    );
    await user.type(screen.getByLabelText(/Forfait utenze/i), "10");

    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    await waitFor(() => expect(createStructure).toHaveBeenCalled());

    await waitFor(() => expect(upsertStructureCostOptions).toHaveBeenCalled());
    expect(vi.mocked(upsertStructureCostOptions).mock.calls[0][1]).toEqual([
      {
        model: "per_person_day",
        amount: 12.5,
        currency: "USD",
        deposit: 50,
        city_tax_per_night: 1.5,
        utilities_flat: 10
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

  it("uploads queued photos after creating the structure", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    const Wrapper = createWrapper(queryClient);
    const user = userEvent.setup();
    vi.mocked(createStructure).mockResolvedValue(createdStructure);
    vi.mocked(signAttachmentUpload).mockResolvedValue({
      url: "https://s3.example.com/upload",
      fields: { key: "attachments/structure/1/abc/facciata.jpg" }
    });
    vi.mocked(confirmAttachmentUpload).mockResolvedValue({
      id: 10,
      owner_type: "structure",
      owner_id: 1,
      filename: "facciata.jpg",
      mime: "image/jpeg",
      size: 1024,
      created_by: "user",
      created_by_name: "User",
      created_at: new Date().toISOString()
    });
    vi.mocked(createStructurePhoto).mockResolvedValue({
      id: 5,
      structure_id: 1,
      attachment_id: 10,
      filename: "facciata.jpg",
      mime: "image/jpeg",
      size: 1024,
      position: 0,
      url: "https://example.com/facciata.jpg",
      created_at: new Date().toISOString()
    });

    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }) as Response);

    render(<StructureCreatePage />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText(/Nome/i), "Base Bosco");
    await user.selectOptions(screen.getByLabelText(/Tipologia/i), "house");
    await user.type(screen.getByLabelText(/Provincia/i), "BS");

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File(["content"], "facciata.jpg", { type: "image/jpeg" });
    await user.upload(input, file);

    expect(await screen.findByText("facciata.jpg")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    await waitFor(() => expect(signAttachmentUpload).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "https://s3.example.com/upload",
      expect.objectContaining({ method: "POST" })
    );
    await waitFor(() => expect(confirmAttachmentUpload).toHaveBeenCalled());
    await waitFor(() => expect(createStructurePhoto).toHaveBeenCalledWith(1, { attachment_id: 10 }));

    fetchMock.mockRestore();
  });
});

describe("StructureEditPage", () => {
  it("prefills the form with existing structure data", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    vi.mocked(getStructureBySlug).mockResolvedValue(createdStructure);
    const Wrapper = createEditWrapper(queryClient);

    render(<StructureEditPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByLabelText(/Nome/i)).toHaveValue(createdStructure.name)
    );
    expect(screen.getByRole("button", { name: /Salva modifiche/i })).toBeInTheDocument();
  });

  it("updates a structure and navigates to its detail page", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    vi.mocked(getStructureBySlug).mockResolvedValue(createdStructure);
    const updatedStructure = {
      ...createdStructure,
      name: "Base Bosco Rinnovata",
      slug: "base-bosco-rinnovata"
    };
    vi.mocked(updateStructure).mockResolvedValue(updatedStructure);
    const Wrapper = createEditWrapper(queryClient);
    const user = userEvent.setup();

    render(<StructureEditPage />, { wrapper: Wrapper });

    const nameInput = await screen.findByLabelText(/Nome/i);
    expect(nameInput).toHaveValue(createdStructure.name);

    await user.clear(nameInput);
    await user.type(nameInput, "Base Bosco Rinnovata");

    await user.click(screen.getByRole("button", { name: /Salva modifiche/i }));

    await waitFor(() => expect(updateStructure).toHaveBeenCalled());

    expect(updateStructure).toHaveBeenCalledWith(
      createdStructure.id,
      expect.objectContaining({
        name: "Base Bosco Rinnovata",
        slug: "base-bosco-rinnovata"
      })
    );

    await waitFor(() =>
      expect(upsertStructureCostOptions).toHaveBeenCalledWith(createdStructure.id, [])
    );

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/structures/base-bosco-rinnovata")
    );

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["structures"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["structure", "base-bosco"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["structure", "base-bosco-rinnovata"] });
  });
});
