import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  addCandidate,
  getEvent,
  getEventSummary,
  patchCandidate
} from "../../shared/api";
import type { Event, EventSummary } from "../../shared/types";
import { EventDetailsPage } from "../EventDetails";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    getEvent: vi.fn(),
    getEventSummary: vi.fn(),
    patchCandidate: vi.fn(),
    addCandidate: vi.fn()
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
  slug: "camp-invernale",
  title: "Camp Invernale",
  branch: "LC",
  start_date: "2025-02-10",
  end_date: "2025-02-13",
  participants: {
    lc: 20,
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
  budget_total: 4500,
  status: "planning",
  notes: null,
  created_at: "2024-11-01T00:00:00Z",
  updated_at: "2024-11-01T00:00:00Z",
  branch_segments: [],
  candidates: [
    {
      id: 10,
      event_id: 1,
      structure_id: 5,
      status: "to_contact",
      assigned_user: null,
      assigned_user_id: null,
      assigned_user_name: null,
      contact_id: null,
      last_update: "2024-11-05T12:00:00Z",
      structure: {
        id: 5,
        name: "Casa Alpina",
        slug: "casa-alpina",
        province: "BG"
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

beforeEach(() => {
  vi.mocked(getEvent).mockResolvedValue(baseEvent);
  vi.mocked(getEventSummary).mockResolvedValue(baseSummary);
  vi.mocked(patchCandidate).mockResolvedValue({
    ...baseEvent.candidates![0],
    status: "available"
  });
  vi.mocked(addCandidate).mockResolvedValue(baseEvent.candidates![0]);
});

describe("EventDetailsPage candidates", () => {
  it("updates candidate status", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();
    render(<EventDetailsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText(/Camp Invernale/)).toBeInTheDocument());

    await user.selectOptions(screen.getAllByRole("combobox", { name: /Stato/i })[0], "available");
    await user.click(screen.getByRole("button", { name: /Salva/i }));

    await waitFor(() =>
      expect(patchCandidate).toHaveBeenCalledWith(1, 10, {
        status: "available",
        assigned_user_id: null,
        contact_id: null
      })
    );
  });

  it("shows conflict message on 409", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();
    vi.mocked(patchCandidate).mockRejectedValueOnce({ status: 409 } as ApiError);

    render(<EventDetailsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText(/Camp Invernale/)).toBeInTheDocument());

    await user.selectOptions(screen.getAllByRole("combobox", { name: /Stato/i })[0], "confirmed");
    await user.click(screen.getByRole("button", { name: /Salva/i }));

    await waitFor(() => expect(screen.getByText(/Conflitto di disponibilità/)).toBeInTheDocument());
  });
});
