import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  exportQuote,
  getEvent,
  getEventSummary,
  getQuotes
} from "../../shared/api";
import type { Event, EventSummary, QuoteListItem } from "../../shared/types";
import { EventDetailsPage } from "../EventDetails";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    getEvent: vi.fn(),
    getEventSummary: vi.fn(),
    getQuotes: vi.fn(),
    exportQuote: vi.fn()
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

const listItems: QuoteListItem[] = [
  {
    id: 77,
    event_id: 1,
    structure_id: 5,
    structure_name: "Casa Alpina",
    scenario: "realistic",
    currency: "EUR",
    total: 575,
    created_at: "2024-05-03T10:00:00Z"
  }
];

const createObjectURLMock = vi.fn(() => "blob:download");
const revokeObjectURLMock = vi.fn();

beforeEach(() => {
  vi.mocked(getEvent).mockResolvedValue(eventData);
  vi.mocked(getEventSummary).mockResolvedValue(summary);
  vi.mocked(getQuotes).mockResolvedValue(listItems);
  vi.mocked(exportQuote).mockImplementation(async (_id, format) =>
    format === "xlsx" ? new Blob(["xlsx"], { type: "application/octet-stream" }) : "<html></html>"
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

describe("Event quotes export", () => {
  it("exports selected quote in both formats", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();
    const openMock = vi.spyOn(window, "open").mockImplementation(() => ({
      document: {
        write: vi.fn(),
        close: vi.fn()
      }
    }) as unknown as Window);

    await act(async () => {
      render(<EventDetailsPage />, { wrapper: Wrapper });
    });

    await waitFor(() => expect(screen.getByText(/Campo Estivo/)).toBeInTheDocument());
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Preventivi/i }));
    });
    await waitFor(() => expect(screen.getByText(/Casa Alpina/)).toBeInTheDocument());

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Esporta XLSX/i }));
    });
    await waitFor(() => expect(exportQuote).toHaveBeenCalledWith(77, "xlsx"));
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalled();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Stampa \(HTML\)/i }));
    });
    await waitFor(() => expect(exportQuote).toHaveBeenCalledWith(77, "html"));
    expect(openMock).toHaveBeenCalled();
  });
});
