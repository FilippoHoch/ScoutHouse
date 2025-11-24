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
  createStructureAttachment,
  createStructurePhoto,
  getStructureBySlug,
  searchGeocoding,
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
    createStructureAttachment: vi.fn(),
    createStructurePhoto: vi.fn(),
    getStructureBySlug: vi.fn(),
    searchGeocoding: vi.fn(),
    signAttachmentUpload: vi.fn(),
    confirmAttachmentUpload: vi.fn(),
    updateStructure: vi.fn(),
    upsertStructureCostOptions: vi.fn()
  };
});

const createdStructure = {
  id: 1,
  name: "Base Bosco",
  slug: "base-bosco",
  country: "IT",
  province: "BS",
  municipality: null,
  municipality_code: null,
  locality: null,
  postal_code: null,
  address: "Via Bosco 1",
  latitude: 45.12,
  longitude: 9.12,
  altitude: 450,
  plus_code: null,
  what3words: null,
  emergency_coordinates: null,
  winter_access_notes: null,
  road_weight_limit_tonnes: null,
  bridge_weight_limit_tonnes: null,
  max_vehicle_height_m: null,
  road_access_notes: null,
  type: "house",
  indoor_beds: 30,
  indoor_bathrooms: 4,
  indoor_showers: 4,
  indoor_activity_rooms: 2,
  indoor_rooms: null,
  has_kitchen: true,
  hot_water: true,
  land_area_m2: null,
  field_slope: null,
  shelter_on_field: false,
  water_sources: null,
  electricity_available: true,
  power_capacity_kw: null,
  power_outlets_count: null,
  power_outlet_types: null,
  generator_available: null,
  generator_notes: null,
  water_tank_capacity_liters: null,
  wastewater_type: null,
  wastewater_notes: null,
  fire_policy: null,
  fire_rules: null,
  access_by_car: true,
  access_by_coach: false,
  access_by_public_transport: true,
  coach_turning_area: false,
  transport_access_points: [
    { type: "car", note: "Parcheggio sterrato a 200 m", coordinates: { lat: 45.111, lon: 9.222 } }
  ],
  bus_type_access: null,
  weekend_only: false,
  has_field_poles: false,
  pit_latrine_allowed: false,
  dry_toilet: null,
  outdoor_bathrooms: null,
  outdoor_showers: null,
  contact_emails: ["info@example.org", "booking@example.org"],
  website_urls: ["https://example.org/base-bosco"],
  booking_url: null,
  whatsapp: null,
  booking_required: null,
  booking_notes: null,
  documents_required: [],
  documents_required_attachments: [],
  map_resources_urls: [],
  map_resources_attachments: [],
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
  payment_methods: ["bank_transfer"],
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
  data_quality_status: "verified",
  created_at: "2024-05-01T10:00:00Z",
  estimated_cost: null,
  cost_band: null,
  availabilities: null,
  cost_options: null,
  contacts: null,
  attachments: [],
  photos: [],
  open_periods: []
} as Structure;

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
  vi.mocked(createStructureAttachment).mockReset();
  vi.mocked(getStructureBySlug).mockReset();
  vi.mocked(searchGeocoding).mockReset();
  vi.mocked(signAttachmentUpload).mockReset();
  vi.mocked(confirmAttachmentUpload).mockReset();
  vi.mocked(updateStructure).mockReset();
  vi.mocked(upsertStructureCostOptions).mockReset();
  vi.mocked(searchGeocoding).mockResolvedValue([]);
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

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true } as Response);

    render(<StructureCreatePage />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText(/Nome/i, { selector: "input" }), "Base Bosco");
    await user.selectOptions(screen.getByLabelText(/Tipologia/i), "house");
    await user.selectOptions(
      screen.getByLabelText(/Stato verifica dati/i),
      "verified"
    );
    await user.selectOptions(
      screen.getByLabelText(/informazioni facoltative/i),
      "floodRisk"
    );
    await user.type(screen.getByLabelText(/Provincia/i), "bs");
    await user.type(screen.getByLabelText(/Altitudine/i), "350");
    await user.selectOptions(
      screen.getByLabelText(/Rischio alluvionale/i),
      "medium"
    );

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

    await user.click(screen.getByRole("button", { name: /Aggiungi punto di accesso/i }));
    await user.selectOptions(
      screen.getByLabelText(/Punto 1 - mezzo/i),
      "car"
    );
    await user.type(
      screen.getByLabelText(/Note o indicazioni/i),
      "Parcheggio sterrato"
    );

    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    await waitFor(() => expect(createStructure).toHaveBeenCalled());

    const payload = vi.mocked(createStructure).mock.calls[0][0];
    expect(payload).toMatchObject({
      name: "Base Bosco",
      slug: "base-bosco",
      type: "house",
      data_quality_status: "verified",
      country: "IT",
      province: "BS",
      has_kitchen: null,
      hot_water: null,
      access_by_car: null,
      access_by_coach: null,
      access_by_public_transport: null,
      coach_turning_area: null,
      shelter_on_field: null,
      electricity_available: null,
      weekend_only: null,
      has_field_poles: null,
      pit_latrine_allowed: null,
      land_area_m2: null,
      water_sources: null,
      fire_policy: null,
      flood_risk: "medium",
      altitude: 350,
      contact_emails: ["info@example.org", "booking@example.org"],
      open_periods: []
    });
    expect(payload.transport_access_points).toEqual([
      { type: "car", note: "Parcheggio sterrato", coordinates: null }
    ]);
    expect(payload.website_urls).toEqual([
      "https://base.example.org",
      "https://info.example.org"
    ]);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/structures/base-bosco"));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["structures"] });
  }, 15000);


  it("includes optional section fields in the payload", async () => {
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

    await user.type(screen.getByLabelText(/Nome/i, { selector: "input" }), "Base Appennino");
    await user.selectOptions(screen.getByLabelText(/Tipologia/i), "mixed");
    await user.selectOptions(
      screen.getByLabelText(/Stato verifica dati/i),
      "unverified"
    );

    const countryInput = screen.getByLabelText(/Paese/i);
    await user.clear(countryInput);
    await user.type(countryInput, "fr");

    const optionalSectionPicker = screen.getByLabelText(/informazioni facoltative/i);
    await user.selectOptions(optionalSectionPicker, "mapResources");
    await user.selectOptions(optionalSectionPicker, "documentsRequired");

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /Risorse cartografiche/i })).toBeInTheDocument()
    );

    await user.click(
      screen.getByRole("button", { name: /Aggiungi attrezzatura/i })
    );
    await user.type(
      screen.getByRole("textbox", { name: /Risorse cartografiche/i }),
      "https://maps.example.com"
    );

    await user.type(
      screen.getByRole("textbox", { name: /Documenti richiesti/i }),
      "Modulo autorizzazione"
    );

    await user.click(screen.getByRole("checkbox", { name: /Bonifico bancario/i }));

    await user.selectOptions(
      screen.getByLabelText(/Qualità rete dati/i),
      "good"
    );
    await user.selectOptions(
      screen.getByLabelText(/Qualità chiamate/i),
      "excellent"
    );
    await user.selectOptions(
      screen.getByLabelText(/Wi-Fi disponibile/i),
      "yes"
    );
    await user.selectOptions(
      screen.getByLabelText(/Linea fissa disponibile/i),
      "no"
    );

    await user.type(
      screen.getByLabelText(/Note aggiuntive sulle comunicazioni/i),
      "Fibra ottica"
    );
    await user.type(
      screen.getByRole("textbox", { name: /Attrezzatura attività/i }),
      "Kit pionieristica"
    );


    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    await waitFor(() => expect(createStructure).toHaveBeenCalled());
    const payload = vi.mocked(createStructure).mock.calls[0][0];

    expect(payload.country).toBe("FR");
    expect(payload.data_quality_status).toBe("unverified");
    expect(payload.map_resources_urls).toEqual(["https://maps.example.com"]);
    expect(payload.documents_required).toEqual(["Modulo autorizzazione"]);
    expect(payload.payment_methods).toEqual(["bank_transfer"]);
    expect(payload.cell_data_quality).toBe("good");
    expect(payload.cell_voice_quality).toBe("excellent");
    expect(payload.wifi_available).toBe(true);
    expect(payload.landline_available).toBe(false);
    expect(payload.communications_infrastructure).toEqual(["Fibra ottica"]);
    expect(payload.activity_equipment).toEqual(["Kit pionieristica"]);

    expect(createStructureAttachment).not.toHaveBeenCalled();
  }, 15000);

  it("queues categorized attachments for optional sections", async () => {
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
      url: "https://uploads.example.com",
      fields: { key: "uploads/structure/map.pdf" }
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true } as Response);

    const mapAttachment = {
      id: 101,
      owner_type: "structure",
      owner_id: createdStructure.id,
      filename: "map.pdf",
      mime: "application/pdf",
      size: 2048,
      created_by: null,
      created_by_name: null,
      description: null,
      created_at: "2024-01-01T00:00:00Z"
    };

    const docAttachment = {
      ...mapAttachment,
      id: 102,
      filename: "documento.pdf",
      size: 1024
    };

    vi.mocked(confirmAttachmentUpload)
      .mockResolvedValueOnce(mapAttachment)
      .mockResolvedValueOnce(docAttachment);

    vi.mocked(createStructureAttachment)
      .mockResolvedValueOnce({
        id: 1,
        kind: "map_resource",
        attachment: mapAttachment
      })
      .mockResolvedValueOnce({
        id: 2,
        kind: "required_document",
        attachment: docAttachment
      });

    render(<StructureCreatePage />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText(/Nome/i, { selector: "input" }), "Base Bosco");
    await user.selectOptions(screen.getByLabelText(/Tipologia/i), "house");
    await user.selectOptions(
      screen.getByLabelText(/Stato verifica dati/i),
      "verified"
    );
    await user.type(screen.getByLabelText(/Provincia/i), "bs");

    await user.selectOptions(
      screen.getByLabelText(/informazioni facoltative/i),
      "mapResources"
    );

    const mapSection = screen.getByLabelText(/Risorse cartografiche/i).closest(".structure-form-field");
    const mapFileInput = mapSection?.querySelector('input[type="file"]') as HTMLInputElement;
    const mapFile = new File(["fake"], "map.pdf", { type: "application/pdf" });
    await user.upload(mapFileInput, mapFile);

    await waitFor(() =>
      expect(
        within(mapSection as HTMLElement).getByText("map.pdf")
      ).toBeInTheDocument()
    );

    await user.selectOptions(
      screen.getByLabelText(/informazioni facoltative/i),
      "documentsRequired"
    );

    const documentsSection = screen.getByLabelText(/Documenti richiesti/i).closest(".structure-form-field");
    const documentInput = documentsSection?.querySelector('input[type="file"]') as HTMLInputElement;
    const docFile = new File(["fake-doc"], "documento.pdf", { type: "application/pdf" });
    await user.upload(documentInput, docFile);

    await waitFor(() =>
      expect(
        within(documentsSection as HTMLElement).getByText("documento.pdf")
      ).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    await waitFor(() => expect(createStructure).toHaveBeenCalled());
    await waitFor(
      () => expect(signAttachmentUpload).toHaveBeenCalledTimes(2),
      { timeout: 3000 }
    );
    await waitFor(
      () => expect(createStructureAttachment).toHaveBeenCalledTimes(2),
      { timeout: 3000 }
    );

    const [firstCall, secondCall] = vi.mocked(createStructureAttachment).mock.calls;
    expect(firstCall?.[0]).toBe(createdStructure.id);
    expect(firstCall?.[1]).toEqual({ attachment_id: mapAttachment.id, kind: "map_resource" });
    expect(secondCall?.[1]).toEqual({ attachment_id: docAttachment.id, kind: "required_document" });

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
      expect(screen.getByLabelText(/Nome/i, { selector: "input" })).toHaveValue(
        createdStructure.name
      )
    );
    expect(screen.getByLabelText(/Punto 1 - mezzo/i)).toHaveValue("car");
    expect(screen.getByLabelText(/Note o indicazioni/i)).toHaveValue(
      "Parcheggio sterrato a 200 m"
    );
    expect(
      screen.getByText(/Posizione: 45\.111000, 9\.222000/i)
    ).toBeInTheDocument();
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

    const nameInput = await screen.findByLabelText(/Nome/i, { selector: "input" });
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
