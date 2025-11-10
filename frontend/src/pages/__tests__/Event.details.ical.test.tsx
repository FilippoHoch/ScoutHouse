import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  downloadEventIcal,
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
    getEventMembers: vi.fn(),
    downloadEventIcal: vi.fn()
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

const eventData: Event = {
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
  candidates: [],
  tasks: []
};

const summaryData: EventSummary = {
  status_counts: {
    to_contact: 0,
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
    id: 10,
    event_id: 1,
    role: "owner",
    user: {
      id: "user-1",
      email: "ada@example.com",
      name: "Ada"
    }
  }
];

describe("EventDetailsPage iCal export", () => {
  const createObjectURLMock = vi.fn(() => "blob:ical");
  const revokeObjectURLMock = vi.fn();

  beforeEach(() => {
    vi.mocked(getEvent).mockResolvedValue(eventData);
    vi.mocked(getEventSummary).mockResolvedValue(summaryData);
    vi.mocked(getEventMembers).mockResolvedValue(members);
    vi.mocked(downloadEventIcal).mockResolvedValue(
      new Blob(["ical"], { type: "text/calendar" })
    );
    if (!("createObjectURL" in URL)) {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        writable: true,
        value: vi.fn()
      });
    }
    if (!("revokeObjectURL" in URL)) {
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        writable: true,
        value: vi.fn()
      });
    }
    vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURLMock);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeObjectURLMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    createObjectURLMock.mockReset();
    revokeObjectURLMock.mockReset();
  });

  it("downloads the iCal file", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();

    await act(async () => {
      render(<EventDetailsPage />, { wrapper: Wrapper });
    });

    await waitFor(() => expect(screen.getByText(/Campo Estivo/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Scarica iCal/i }));

    await waitFor(() => expect(downloadEventIcal).toHaveBeenCalledWith(1));
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalled();
  });

  it("shows an error when the download fails", async () => {
    vi.mocked(downloadEventIcal).mockRejectedValue(new Error("boom"));
    const Wrapper = createWrapper();
    const user = userEvent.setup();

    await act(async () => {
      render(<EventDetailsPage />, { wrapper: Wrapper });
    });

    await waitFor(() => expect(screen.getByText(/Campo Estivo/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Scarica iCal/i }));

    await waitFor(() => expect(screen.getByText(/Impossibile scaricare il file iCal/i)).toBeInTheDocument());
  });
});
