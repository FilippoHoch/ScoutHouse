import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getEvent,
  getEventMembers,
  getEventSummary
} from "../../shared/api";
import type { Event, EventMember, EventSummary } from "../../shared/types";
import { EventDetailsPage } from "../EventDetails";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    getEvent: vi.fn(),
    getEventSummary: vi.fn(),
    getEventMembers: vi.fn()
  };
});

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={["/events/42"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/events/:eventId" element={children} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
};

const eventData: Event = {
  id: 42,
  slug: "campo-estivo-2026",
  title: "Campo di gruppo",
  branch: "ALL",
  start_date: "2026-07-27",
  end_date: "2026-08-09",
  participants: { lc: 30, eg: 30, rs: 15, leaders: 11 },
  budget_total: null,
  status: "planning",
  notes: null,
  created_at: "2025-02-01T00:00:00Z",
  updated_at: "2025-02-01T00:00:00Z",
  branch_segments: [
    {
      id: 1,
      event_id: 42,
      branch: "LC",
      start_date: "2026-08-03",
      end_date: "2026-08-09",
      youth_count: 30,
      leaders_count: 5,
      accommodation: "indoor",
      notes: "Casa / letti"
    },
    {
      id: 2,
      event_id: 42,
      branch: "EG",
      start_date: "2026-07-27",
      end_date: "2026-08-09",
      youth_count: 30,
      leaders_count: 3,
      accommodation: "tents",
      notes: null
    },
    {
      id: 3,
      event_id: 42,
      branch: "RS",
      start_date: "2026-08-06",
      end_date: "2026-08-09",
      youth_count: 15,
      leaders_count: 3,
      accommodation: "tents",
      notes: "Campo / tende"
    }
  ],
  candidates: [],
  tasks: []
};

const summaryData: EventSummary = {
  status_counts: {
    to_contact: 4,
    contacting: 1,
    available: 2,
    unavailable: 0,
    followup: 1,
    confirmed: 3,
    option: 0
  },
  has_conflicts: true
};

const members: EventMember[] = [];

describe("EventDetailsPage layout", () => {
  beforeEach(() => {
    vi.mocked(getEvent).mockResolvedValue(eventData);
    vi.mocked(getEventSummary).mockResolvedValue(summaryData);
    vi.mocked(getEventMembers).mockResolvedValue(members);
  });

  it("renders the overview, metrics and empty team state", async () => {
    const Wrapper = createWrapper();
    render(<EventDetailsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByRole("heading", { name: /Campo di gruppo/ })).toBeInTheDocument());

    const overviewHeading = screen.getByRole("heading", { name: /Campo di gruppo/ });
    const overviewContainer = overviewHeading.parentElement as HTMLElement | null;
    expect(overviewContainer).not.toBeNull();
    expect(
      within(overviewContainer as HTMLElement).getByText("Branca evento: Tutte le branche")
    ).toBeInTheDocument();
    expect(
      within(overviewContainer as HTMLElement).getByText("27/07/2026 → 09/08/2026")
    ).toBeInTheDocument();

    const metrics = screen.getByLabelText("Riepilogo evento");
    expect(within(metrics).getByText("Totale partecipanti")).toBeInTheDocument();
    const totalsMetric = within(metrics).getByText("Totale partecipanti").closest(".metric");
    expect(totalsMetric).not.toBeNull();
    expect(within(totalsMetric as HTMLElement).getByText("86")).toBeInTheDocument();

    expect(within(metrics).getByText("Picco presenze")).toBeInTheDocument();
    const peakMetric = within(metrics).getByText("Picco presenze").closest(".metric");
    expect(peakMetric).not.toBeNull();
    expect(within(peakMetric as HTMLElement).getByText("86")).toBeInTheDocument();

    expect(screen.getByText("Esigenze logistiche")).toBeInTheDocument();
    expect(screen.getByText("Totale persone pianificate: 86")).toBeInTheDocument();

    const tablist = screen.getByRole("tablist", { name: "Sezioni evento" });
    expect(tablist).toBeInTheDocument();

    const teamEmpty = screen.getByText("Invita colleghi per collaborare all'evento.");
    expect(teamEmpty).toBeInTheDocument();

    const statuses = screen.getByLabelText("Stato candidature");
    expect(within(statuses).getByText("Da contattare")).toBeInTheDocument();
    expect(within(statuses).getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Attenzione: conflitti di disponibilità presenti.")).toBeInTheDocument();
  });

  it("exposes tab navigation with attachments fallback", async () => {
    const Wrapper = createWrapper();
    render(<EventDetailsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByRole("tab", { name: "Allegati" })).toBeInTheDocument());

    const attachmentsTab = screen.getByRole("tab", { name: "Allegati" });
    attachmentsTab.click();

    await waitFor(() =>
      expect(
        screen.getByText("Non hai i permessi per visualizzare questi allegati.")
      ).toBeInTheDocument()
    );
  });
});
