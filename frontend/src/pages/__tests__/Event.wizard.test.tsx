import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addCandidate,
  createEvent,
  getEvents,
  getSuggestions
} from "../../shared/api";
import type { Event, EventCreateDto, EventListResponse, EventSuggestion } from "../../shared/types";
import { EventCreatePage } from "../EventCreate";
import { EventsPage } from "../Events";

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
    createEvent: vi.fn(),
    getSuggestions: vi.fn(),
    addCandidate: vi.fn(),
    getEvents: vi.fn()
  };
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const emptyEvents: EventListResponse = { items: [], total: 0, page: 1, page_size: 20 };

const createdEvent: Event = {
  id: 42,
  slug: "campo-di-gruppo",
  title: "Campo di gruppo",
  branch: "ALL",
  start_date: "2025-07-01",
  end_date: "2025-07-10",
  participants: {
    lc: 24,
    lc_kambusieri: 0,
    eg: 28,
    eg_kambusieri: 0,
    rs: 0,
    rs_kambusieri: 0,
    cc: 0,
    cc_kambusieri: 0,
    leaders: 6,
    detached_leaders: 0,
    detached_guests: 0,
  },
  budget_total: 3000,
  status: "draft",
  notes: null,
  created_at: "2024-11-01T00:00:00Z",
  updated_at: "2024-11-01T00:00:00Z",
  candidates: [],
  tasks: [],
  branch_segments: [
    {
      id: 1,
      branch: "EG",
      start_date: "2025-07-01",
      end_date: "2025-07-10",
      youth_count: 28,
      leaders_count: 4,
      accommodation: "tents",
      notes: null
    },
    {
      id: 2,
      branch: "LC",
      start_date: "2025-07-05",
      end_date: "2025-07-10",
      youth_count: 24,
      leaders_count: 2,
      accommodation: "indoor",
      notes: ""
    }
  ]
};

const suggestions: EventSuggestion[] = [
  {
    structure_id: 1,
    structure_name: "Casa Alpina",
    structure_slug: "casa-alpina",
    distance_km: 12.5,
    estimated_cost: 45,
    cost_band: "medium"
  }
];

beforeEach(() => {
  mockNavigate.mockReset();
  vi.mocked(getEvents).mockReset();
  vi.mocked(createEvent).mockReset();
  vi.mocked(getSuggestions).mockReset();
  vi.mocked(addCandidate).mockReset();

  vi.mocked(getEvents).mockResolvedValue(emptyEvents);
  vi.mocked(createEvent).mockResolvedValue(createdEvent);
  vi.mocked(getSuggestions).mockResolvedValue(suggestions);
  vi.mocked(addCandidate).mockResolvedValue({
    id: 1,
    event_id: createdEvent.id,
    structure_id: 1,
    status: "to_contact",
    assigned_user: null,
    assigned_user_id: null,
    assigned_user_name: null,
    contact_id: null,
    last_update: new Date().toISOString(),
    structure: {
      id: 1,
      name: "Casa Alpina",
      slug: "casa-alpina",
      province: "BG"
    }
  });
});

describe("Event wizard", () => {
  it("creates a multi-branch event and navigates to details", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/new" element={<EventCreatePage />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: Wrapper },
    );

    await user.click(screen.getByRole("link", { name: /Nuovo evento/i }));
    const titleInput = await screen.findByLabelText(/Titolo/i);
    await user.type(titleInput, "Campo gruppo estivo");
    await user.type(await screen.findByLabelText(/Inizio/i), "2025-07-01");
    await user.type(await screen.findByLabelText(/Fine/i), "2025-07-10");
    await user.click(screen.getByRole("checkbox", { name: /Esploratori e Guide/i }));
    await user.click(screen.getByRole("button", { name: /Continua/i }));

    const detailedPlanningOption = await screen.findByRole("radio", {
      name: /Pianificazione dettagliata/i,
    });
    expect(detailedPlanningOption).toBeChecked();

    const segmentHeadings = await screen.findAllByRole("heading", { name: /Branca \d+/i });
    expect(segmentHeadings).toHaveLength(2);

    const firstSegmentHeading = segmentHeadings[0];
    const firstSegment = firstSegmentHeading.closest(".branch-segment");
    if (!(firstSegment instanceof HTMLElement)) {
      throw new Error("Segment container not found");
    }
    const firstStartInput = within(firstSegment).getByLabelText(/Inizio/i);
    const firstEndInput = within(firstSegment).getByLabelText(/Fine/i);
    await user.clear(firstStartInput);
    await user.type(firstStartInput, "2025-07-05");
    await user.clear(firstEndInput);
    await user.type(firstEndInput, "2025-07-10");

    const firstYouthInput = within(firstSegment).getByLabelText(/Partecipanti/i);
    const firstLeaderInput = within(firstSegment).getByLabelText(/Capi/i);
    await user.type(firstYouthInput, "24");
    await user.type(firstLeaderInput, "2");

    const firstAccommodationSelect = within(firstSegment).getByLabelText(/Sistemazione/i);
    await user.selectOptions(firstAccommodationSelect, "indoor");

    const secondSegmentHeading = segmentHeadings[1];
    const secondSegment = secondSegmentHeading.closest(".branch-segment");
    if (!(secondSegment instanceof HTMLElement)) {
      throw new Error("Second segment container not found");
    }
    const secondBranchSelect = within(secondSegment).getByLabelText(/^Branca$/i);
    await user.selectOptions(secondBranchSelect, "EG");

    const secondStartInput = within(secondSegment).getByLabelText(/Inizio/i);
    const secondEndInput = within(secondSegment).getByLabelText(/Fine/i);
    await user.clear(secondStartInput);
    await user.type(secondStartInput, "2025-07-01");
    await user.clear(secondEndInput);
    await user.type(secondEndInput, "2025-07-10");

    const secondYouthInput = within(secondSegment).getByLabelText(/Partecipanti/i);
    const secondLeaderInput = within(secondSegment).getByLabelText(/Capi/i);
    await user.type(secondYouthInput, "28");
    await user.type(secondLeaderInput, "4");

    const secondAccommodationSelect = within(secondSegment).getByLabelText(/Sistemazione/i);
    await user.selectOptions(secondAccommodationSelect, "tents");

    const peakSummaries = screen.getAllByText(/Picco presenze simultanee: 58/i);
    expect(peakSummaries).toHaveLength(2);
    expect(
      peakSummaries.some((element) => element.classList.contains("logistics-summary__badge--highlight"))
    ).toBe(true);

    await user.type(screen.getByLabelText(/Budget totale/i), "3000");

    await user.click(screen.getByRole("button", { name: /Crea evento/i }));

    await waitFor(() => expect(createEvent).toHaveBeenCalled());

    const payload = vi.mocked(createEvent).mock.calls[0][0] as EventCreateDto;
    expect(payload.branch).toBe("ALL");
    expect(payload.participants).toEqual({
      lc: 24,
      lc_kambusieri: 0,
      eg: 28,
      eg_kambusieri: 0,
      rs: 0,
      rs_kambusieri: 0,
      cc: 0,
      cc_kambusieri: 0,
      leaders: 6,
      detached_leaders: 0,
      detached_guests: 0,
    });
    expect(payload.branch_segments).toEqual([
      {
        branch: "LC",
        start_date: "2025-07-05",
        end_date: "2025-07-10",
        youth_count: 24,
        leaders_count: 2,
        kambusieri_count: 0,
        accommodation: "indoor",
        notes: undefined
      },
      {
        branch: "EG",
        start_date: "2025-07-01",
        end_date: "2025-07-10",
        youth_count: 28,
        leaders_count: 4,
        kambusieri_count: 0,
        accommodation: "tents",
        notes: undefined
      }
    ]);

    await waitFor(() => expect(getSuggestions).toHaveBeenCalledWith(createdEvent.id));
    await waitFor(() =>
      expect(
        screen.getByText(/Evento Campo di gruppo creato con successo/i)
      ).toBeInTheDocument()
    );

    await user.selectOptions(screen.getByLabelText(/Ruolo/i), "logistics");
    await user.type(screen.getByLabelText(/Nominativo/i), "Mario Rossi");

    await user.click(screen.getByRole("button", { name: /Aggiungi candidato/i }));
    expect(addCandidate).toHaveBeenCalledWith(createdEvent.id, { structure_id: 1 });

    await user.click(screen.getByRole("button", { name: /Apri evento/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/events/42");
});

  it("creates an event with aggregated participants", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();

    const simpleEvent: Event = {
      ...createdEvent,
      title: "Uscita di branca",
      branch: "LC",
      participants: {
        lc: 30,
        lc_kambusieri: 0,
        eg: 0,
        eg_kambusieri: 0,
        rs: 0,
        rs_kambusieri: 0,
        cc: 0,
        cc_kambusieri: 0,
        leaders: 5,
        detached_leaders: 0,
        detached_guests: 0,
      },
      branch_segments: [],
    };

    vi.mocked(createEvent).mockResolvedValueOnce(simpleEvent);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/new" element={<EventCreatePage />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: Wrapper },
    );

    await user.click(screen.getByRole("link", { name: /Nuovo evento/i }));
    await user.type(await screen.findByLabelText(/Titolo/i), "Uscita di branca");
    expect(screen.getByRole("checkbox", { name: /Lupetti e Coccinelle/i })).toBeChecked();
    await user.type(await screen.findByLabelText(/Inizio/i), "2025-03-15");
    await user.type(await screen.findByLabelText(/Fine/i), "2025-03-17");
    await user.click(screen.getByRole("button", { name: /Continua/i }));

    await user.type(screen.getByLabelText(/LC \(lupetti e coccinelle\)/i), "30");
    const leaderInput = await screen.findAllByLabelText(/Capi$/i);
    await user.type(leaderInput[0], "5");

    await user.click(screen.getByRole("button", { name: /Crea evento/i }));

    await waitFor(() => expect(createEvent).toHaveBeenCalled());

    const payload = vi.mocked(createEvent).mock.calls[0][0] as EventCreateDto;
    expect(payload.branch).toBe("LC");
    expect(payload.participants).toEqual({
      lc: 30,
      lc_kambusieri: 0,
      eg: 0,
      eg_kambusieri: 0,
      rs: 0,
      rs_kambusieri: 0,
      cc: 0,
      cc_kambusieri: 0,
      leaders: 5,
      detached_leaders: 0,
      detached_guests: 0,
    });
    expect(payload.branch_segments).toBeUndefined();

    await waitFor(() => expect(getSuggestions).toHaveBeenCalledWith(simpleEvent.id));
    await waitFor(() =>
      expect(screen.getByText(/Evento Uscita di branca creato con successo/i)).toBeInTheDocument(),
    );

    expect(screen.getByText(/Totale persone: 35/i)).toBeInTheDocument();
    expect(screen.getByText(/Nessuna suddivisione per branca/i)).toBeInTheDocument();
  });
});
