import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  calcQuote,
  getEvent,
  getEventSummary,
  getQuotes
} from "../../shared/api";
import type { Event, EventSummary, QuoteCalcResponse } from "../../shared/types";
import { EventDetailsPage } from "../EventDetails";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    getEvent: vi.fn(),
    getEventSummary: vi.fn(),
    getQuotes: vi.fn(),
    calcQuote: vi.fn()
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

const baseEvent: Event = {
  id: 1,
  slug: "campo-estivo",
  title: "Campo Estivo",
  branch: "ALL",
  start_date: "2025-07-10",
  end_date: "2025-07-12",
  participants: { lc: 10, eg: 5, rs: 0, leaders: 2 },
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

const baseSummary: EventSummary = {
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

const calcResponse: QuoteCalcResponse = {
  currency: "EUR",
  totals: { subtotal: 510, utilities: 20, city_tax: 45, deposit: 100, total: 575 },
  breakdown: [
    {
      option_id: 1,
      type: "per_person_day",
      description: "Costo per persona/giorno",
      currency: "EUR",
      unit_amount: 10,
      quantity: 51,
      metadata: null,
      total: 510
    },
    {
      option_id: 1,
      type: "deposit",
      description: "Caparra",
      currency: "EUR",
      unit_amount: 100,
      quantity: 1,
      metadata: null,
      total: 100
    }
  ],
  scenarios: { best: 546.25, realistic: 575, worst: 632.5 },
  inputs: {}
};

beforeEach(() => {
  vi.mocked(getEvent).mockResolvedValue(baseEvent);
  vi.mocked(getEventSummary).mockResolvedValue(baseSummary);
  vi.mocked(getQuotes).mockResolvedValue([]);
  vi.mocked(calcQuote).mockResolvedValue(calcResponse);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Event quotes tab", () => {
  it("calculates and displays breakdown", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();
    await act(async () => {
      render(<EventDetailsPage />, { wrapper: Wrapper });
    });

    await waitFor(() => expect(screen.getByText(/Campo Estivo/)).toBeInTheDocument());

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Preventivi/i }));
    });

    await screen.findByText(/Nessun preventivo salvato/);

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Calcola/i }));
    });

    await waitFor(() => expect(calcQuote).toHaveBeenCalled());

    const lastCall = vi.mocked(calcQuote).mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual({ event_id: 1, structure_id: 5, overrides: undefined });

    expect(screen.getByText(/Costo per persona\/giorno/)).toBeInTheDocument();
    expect(screen.getByText(/Caparra/)).toBeInTheDocument();
    expect(screen.getByText("575.00")).toBeInTheDocument();
    expect(screen.getByText(/€632\.50/)).toBeInTheDocument();
  });
});
