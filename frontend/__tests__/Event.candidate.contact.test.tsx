import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

import { EventDetailsPage } from "../src/pages/EventDetails";
import {
  getEvent,
  getEventSummary,
  getEventMembers,
  getStructureContacts,
  patchCandidate,
  getSuggestions,
  addCandidate,
  addEventMember,
  updateEventMember,
  removeEventMember,
  addTask,
  patchTask
} from "../src/shared/api";
import type {
  Contact,
  Event,
  EventMember,
  EventSummary
} from "../src/shared/types";

vi.mock("../src/shared/api", async () => {
  const actual = await vi.importActual<typeof import("../src/shared/api")>("../src/shared/api");
  return {
    ...actual,
    getEvent: vi.fn(),
    getEventSummary: vi.fn(),
    getEventMembers: vi.fn(),
    getStructureContacts: vi.fn(),
    patchCandidate: vi.fn(),
    getSuggestions: vi.fn(),
    addCandidate: vi.fn(),
    addEventMember: vi.fn(),
    updateEventMember: vi.fn(),
    removeEventMember: vi.fn(),
    addTask: vi.fn(),
    patchTask: vi.fn()
  };
});

vi.mock("../src/shared/auth", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      name: "Tester",
      email: "tester@example.com",
      is_admin: true,
      can_edit_structures: true,
      created_at: "2024-01-01T00:00:00Z"
    },
    accessToken: "token",
    status: "authenticated"
  })
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={["/events/5"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/events/:eventId" element={children} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
};

describe("Event candidate contacts", () => {
  const contactList: Contact[] = [
    {
      id: 7,
      structure_id: 12,
      name: "Referente Contatti",
      role: "Referente",
      email: "referente@example.com",
      phone: "+39 321654987",
      preferred_channel: "email",
      is_primary: true,
      notes: null,
      gdpr_consent_at: null,
      created_at: new Date("2024-03-05T09:00:00Z").toISOString(),
      updated_at: new Date("2024-03-05T09:00:00Z").toISOString()
    }
  ];

  const baseEvent: Event = {
    id: 5,
    slug: "campo-primavera",
    title: "Campo Primavera",
    branch: "LC",
    start_date: "2025-04-10",
    end_date: "2025-04-14",
    participants: { lc: 20, eg: 10, rs: 0, leaders: 5 },
    budget_total: null,
    status: "planning",
    notes: null,
    created_at: "2024-10-01T00:00:00Z",
    updated_at: "2024-10-05T00:00:00Z",
    candidates: [
      {
        id: 21,
        event_id: 5,
        structure_id: 12,
        status: "to_contact",
        assigned_user: null,
        assigned_user_id: null,
        assigned_user_name: null,
        contact_id: null,
        contact: null,
        last_update: "2024-10-05T08:00:00Z",
        structure: {
          id: 12,
          name: "Base Test",
          slug: "base-test",
          province: "MI"
        }
      }
    ],
    tasks: []
  };

  const baseSummary: EventSummary = {
    status_counts: {
      to_contact: 1,
      contacting: 0,
      available: 0,
      unavailable: 0,
      followup: 0,
      confirmed: 0,
      option: 0
    },
    has_conflicts: false
  };

  const members: EventMember[] = [
    {
      id: 1,
      event_id: 5,
      role: "owner",
      user: { id: "user-1", email: "tester@example.com", name: "Tester" }
    }
  ];

  beforeEach(() => {
    vi.mocked(getEvent).mockResolvedValue(baseEvent);
    vi.mocked(getEventSummary).mockResolvedValue(baseSummary);
    vi.mocked(getEventMembers).mockResolvedValue(members);
    vi.mocked(getStructureContacts).mockResolvedValue(contactList);
    vi.mocked(patchCandidate).mockResolvedValue({ ...baseEvent.candidates![0], contact_id: 7 });
    vi.mocked(getSuggestions).mockResolvedValue([]);
    vi.mocked(addCandidate).mockResolvedValue(baseEvent.candidates![0]);
    vi.mocked(addEventMember).mockResolvedValue(members[0]);
    vi.mocked(updateEventMember).mockResolvedValue(members[0]);
    vi.mocked(removeEventMember).mockResolvedValue(undefined);
    vi.mocked(addTask).mockResolvedValue({
      id: 1,
      event_id: 5,
      structure_id: null,
      assigned_user: null,
      assigned_user_id: null,
      assigned_user_name: null,
      status: "todo",
      outcome: "pending",
      notes: null,
      updated_at: new Date().toISOString()
    });
    vi.mocked(patchTask).mockResolvedValue({
      id: 1,
      event_id: 5,
      structure_id: null,
      assigned_user: null,
      assigned_user_id: null,
      assigned_user_name: null,
      status: "done",
      outcome: "positive",
      notes: null,
      updated_at: new Date().toISOString()
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves selected contact and builds quick action links", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();

    const originalLocation = window.location;
    const locationMock = { ...originalLocation, href: "" } as Location;
    Object.defineProperty(window, "location", { value: locationMock, writable: true });

    render(<EventDetailsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText(/Campo Primavera/)).toBeInTheDocument());

    const contactSelect = await screen.findByRole("combobox", { name: "Contatto struttura" });
    await user.selectOptions(contactSelect, "7");

    await user.click(screen.getAllByRole("button", { name: "Salva" })[0]);

    await waitFor(() =>
      expect(patchCandidate).toHaveBeenCalledWith(5, 21, {
        status: "to_contact",
        assigned_user_id: null,
        contact_id: 7
      })
    );

    const eventStartLabel = new Date(baseEvent.start_date).toLocaleDateString("it-IT");
    const eventEndLabel = new Date(baseEvent.end_date).toLocaleDateString("it-IT");
    const expectedSubject = encodeURIComponent(
      `Richiesta disponibilità – ${baseEvent.title} (${eventStartLabel}–${eventEndLabel})`
    );
    const expectedBody = encodeURIComponent(
      `Ciao,\n\nsiamo interessati alla struttura per l'evento ${baseEvent.title} dal ${eventStartLabel} al ${eventEndLabel}. Fateci sapere disponibilità e condizioni.\n\nGrazie,\nSquadra eventi`
    );

    await user.click(screen.getByRole("button", { name: "Scrivi email" }));
    expect(window.location.href).toBe(
      `mailto:referente@example.com?subject=${expectedSubject}&body=${expectedBody}`
    );

    await user.click(screen.getByRole("button", { name: "Chiama" }));
    expect(window.location.href).toBe("tel:+39321654987");

    Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  });
});
