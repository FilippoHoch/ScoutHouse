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
import type { Event, EventListResponse, EventSuggestion } from "../../shared/types";
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
  slug: "nuovo-evento",
  title: "Nuovo Evento",
  branch: "LC",
  start_date: "2025-03-01",
  end_date: "2025-03-03",
  participants: { lc: 10, eg: 0, rs: 0, leaders: 2 },
  budget_total: 3000,
  status: "draft",
  notes: null,
  created_at: "2024-11-01T00:00:00Z",
  updated_at: "2024-11-01T00:00:00Z",
  candidates: [],
  tasks: []
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
  it("creates event and navigates to details", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();

    render(<EventsPage />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /Nuovo evento/i }));
    await user.type(screen.getByLabelText(/Titolo/i), "Campo prova");
    await user.type(screen.getByLabelText(/Inizio/i), "2025-03-01");
    await user.type(screen.getByLabelText(/Fine/i), "2025-03-03");
    await user.click(screen.getByRole("button", { name: /Continua/i }));

    await user.clear(screen.getByLabelText(/Lupetti/i));
    await user.type(screen.getByLabelText(/Lupetti/i), "12");
    await user.clear(screen.getByLabelText(/Capi/i));
    await user.type(screen.getByLabelText(/Capi/i), "3");
    await user.type(screen.getByLabelText(/Budget totale/i), "2500");

    await user.click(screen.getByRole("button", { name: /Crea evento/i }));

    await waitFor(() => expect(createEvent).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByText(/Evento Nuovo Evento creato con successo/i)
      ).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: /Aggiungi candidato/i }));
    expect(addCandidate).toHaveBeenCalledWith(createdEvent.id, { structure_id: 1 });

    await user.click(screen.getByRole("button", { name: /Apri evento/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/events/42");
  });
});
