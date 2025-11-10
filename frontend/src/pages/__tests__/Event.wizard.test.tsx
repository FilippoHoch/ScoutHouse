import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addCandidate,
  createEvent,
  getEvents,
  getSuggestions
} from "../../shared/api";
import type { Event, EventCreateDto, EventListResponse, EventSuggestion } from "../../shared/types";
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
    <MemoryRouter initialEntries={["/events"]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
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
  participants: { lc: 24, eg: 28, rs: 0, leaders: 6 },
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

    render(<EventsPage />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /Nuovo evento/i }));
    await user.type(screen.getByLabelText(/Titolo/i), "Campo gruppo estivo");
    await user.type(screen.getByLabelText(/Inizio/i), "2025-07-01");
    await user.type(screen.getByLabelText(/Fine/i), "2025-07-10");
    await user.click(screen.getByRole("button", { name: /Continua/i }));

    await user.click(screen.getByRole("button", { name: /Aggiungi branca/i }));

    const branchSelectsStepOne = screen.getAllByLabelText(/Branca/i);
    await user.selectOptions(branchSelectsStepOne[0], "EG");

    const startInputs = screen.getAllByLabelText(/Inizio/i);
    const endInputs = screen.getAllByLabelText(/Fine/i);
    await user.clear(startInputs[0]);
    await user.type(startInputs[0], "2025-07-01");
    await user.clear(endInputs[0]);
    await user.type(endInputs[0], "2025-07-10");

    const youthInputs = screen.getAllByLabelText(/Partecipanti/i);
    const leaderInputs = screen.getAllByLabelText(/Capi/i);
    await user.type(youthInputs[0], "28");
    await user.type(leaderInputs[0], "4");

    const accommodationSelects = screen.getAllByLabelText(/Sistemazione/i);
    await user.selectOptions(accommodationSelects[0], "tents");

    await user.click(screen.getByRole("button", { name: /Aggiungi branca/i }));

    const branchSelects = screen.getAllByLabelText(/Branca/i);
    await user.selectOptions(branchSelects[1], "LC");

    const refreshedStartInputs = screen.getAllByLabelText(/Inizio/i);
    const refreshedEndInputs = screen.getAllByLabelText(/Fine/i);
    await user.clear(refreshedStartInputs[1]);
    await user.type(refreshedStartInputs[1], "2025-07-05");
    await user.clear(refreshedEndInputs[1]);
    await user.type(refreshedEndInputs[1], "2025-07-10");

    const refreshedYouthInputs = screen.getAllByLabelText(/Partecipanti/i);
    const refreshedLeaderInputs = screen.getAllByLabelText(/Capi/i);
    await user.type(refreshedYouthInputs[1], "24");
    await user.type(refreshedLeaderInputs[1], "2");

    const refreshedAccommodationSelects = screen.getAllByLabelText(/Sistemazione/i);
    await user.selectOptions(refreshedAccommodationSelects[1], "indoor");

    expect(
      screen.getByText(/L'evento verrà contrassegnato come "Tutte le branche"/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Picco presenze simultanee: 58/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Budget totale/i), "3000");

    await user.click(screen.getByRole("button", { name: /Crea evento/i }));

    await waitFor(() => expect(createEvent).toHaveBeenCalled());

    const payload = vi.mocked(createEvent).mock.calls[0][0] as EventCreateDto;
    expect(payload.branch).toBe("ALL");
    expect(payload.participants).toEqual({ lc: 24, eg: 28, rs: 0, leaders: 6 });
    expect(payload.branch_segments).toEqual([
      {
        branch: "EG",
        start_date: "2025-07-01",
        end_date: "2025-07-10",
        youth_count: 28,
        leaders_count: 4,
        accommodation: "tents",
        notes: undefined
      },
      {
        branch: "LC",
        start_date: "2025-07-05",
        end_date: "2025-07-10",
        youth_count: 24,
        leaders_count: 2,
        accommodation: "indoor",
        notes: undefined
      }
    ]);

    await waitFor(() => expect(getSuggestions).toHaveBeenCalledWith(createdEvent.id));
    await waitFor(() =>
      expect(
        screen.getByText(/Evento Campo di gruppo creato con successo/i)
      ).toBeInTheDocument()
    );

    expect(screen.getByText(/Picco presenze simultanee: 58/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Aggiungi candidato/i }));
    expect(addCandidate).toHaveBeenCalledWith(createdEvent.id, { structure_id: 1 });

    await user.click(screen.getByRole("button", { name: /Apri evento/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/events/42");
  });
});
