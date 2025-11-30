import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  calcQuote,
  createQuote,
  getEvent,
  getEventSummary,
  getQuotes
} from "../../shared/api";
import type {
  Event,
  EventSummary,
  Quote,
  QuoteCalcResponse,
  QuoteListItem
} from "../../shared/types";
import { EventDetailsPage } from "../EventDetails";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    getEvent: vi.fn(),
    getEventSummary: vi.fn(),
    getQuotes: vi.fn(),
    calcQuote: vi.fn(),
    createQuote: vi.fn()
  };
});

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={["/events/1"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/events/:eventId" element={children} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
};

const eventWithCandidate: Event = {
  id: 1,
  slug: "campo-estivo",
  title: "Campo Estivo",
  branch: "ALL",
  start_date: "2025-07-10",
  end_date: "2025-07-12",
  participants: {
    lc: 10,
    lc_kambusieri: 0,
    eg: 5,
    eg_kambusieri: 0,
    rs: 0,
    rs_kambusieri: 0,
    cc: 0,
    cc_kambusieri: 0,
    leaders: 2,
    detached_leaders: 0,
    detached_guests: 0,
  },
  budget_total: null,
  status: "planning",
  notes: null,
  created_at: "2024-05-01T00:00:00Z",
  updated_at: "2024-05-01T00:00:00Z",
  branch_segments: [],
  candidates: [
    {
      id: 1,
      event_id: 1,
      structure_id: 5,
      status: "available",
      assigned_user: null,
      assigned_user_id: null,
      assigned_user_name: null,
      contact_id: null,
      last_update: "2024-05-02T00:00:00Z",
      structure: { id: 5, name: "Casa Alpina", slug: "casa-alpina", province: "BG" }
    }
  ],
  tasks: []
};

const summary: EventSummary = {
  status_counts: {
    to_contact: 0,
    contacting: 0,
    available: 1,
    unavailable: 0,
    followup: 0,
    confirmed: 0,
    option: 0
  },
  has_conflicts: false
};

const calcResult: QuoteCalcResponse = {
  currency: "EUR",
  totals: { subtotal: 510, utilities: 20, city_tax: 45, deposit: 100, total: 575 },
  breakdown: [],
  scenarios: { best: 546.25, realistic: 575, worst: 632.5 },
  inputs: {}
};

const savedQuote: Quote = {
  id: 99,
  event_id: 1,
  structure_id: 5,
  scenario: "realistic",
  currency: "EUR",
  totals: calcResult.totals,
  breakdown: [],
  inputs: {},
  scenarios: calcResult.scenarios,
  created_at: "2024-05-03T10:00:00Z"
};

const listItem: QuoteListItem = {
  id: 99,
  event_id: 1,
  structure_id: 5,
  structure_name: "Casa Alpina",
  scenario: "realistic",
  currency: "EUR",
  total: 575,
  created_at: "2024-05-03T10:00:00Z"
};

beforeEach(() => {
  vi.mocked(getEvent).mockResolvedValue(eventWithCandidate);
  vi.mocked(getEventSummary).mockResolvedValue(summary);
  vi.mocked(calcQuote).mockResolvedValue(calcResult);
  vi.mocked(createQuote).mockResolvedValue(savedQuote);
  vi.mocked(getQuotes)
    .mockImplementationOnce(() => Promise.resolve([]))
    .mockImplementation(() => Promise.resolve([listItem]));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Event quotes save", () => {
  it("saves a new quote and refreshes list", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();
    await act(async () => {
      render(<EventDetailsPage />, { wrapper: Wrapper });
    });

    await waitFor(() => expect(screen.getByText(/Campo Estivo/)).toBeInTheDocument());

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Preventivi/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Calcola/i }));
    });

    await waitFor(() => expect(calcQuote).toHaveBeenCalled());

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Salva versione/i }));
    });

    await waitFor(() =>
      expect(createQuote).toHaveBeenCalledWith(1, {
        structure_id: 5,
        scenario: "realistic",
        overrides: undefined
      })
    );

    await waitFor(() => expect(getQuotes).toHaveBeenCalledTimes(2));

    const entries = await screen.findAllByText(/Casa Alpina/);
    expect(entries.length).toBeGreaterThan(0);
  });
});
