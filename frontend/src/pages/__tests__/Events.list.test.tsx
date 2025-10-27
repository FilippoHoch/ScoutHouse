import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getEvents } from "../../shared/api";
import type { EventListResponse } from "../../shared/types";
import { EventsPage } from "../Events";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    getEvents: vi.fn()
  };
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={["/events"]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const sampleResponse: EventListResponse = {
  items: [
    {
      id: 1,
      slug: "camp-invernale",
      title: "Camp Invernale",
      branch: "LC",
      start_date: "2025-02-10",
      end_date: "2025-02-13",
      participants: { lc: 20, eg: 0, rs: 0, leaders: 5 },
      budget_total: 4500,
      status: "planning",
      notes: null,
      created_at: "2024-10-01T09:00:00Z",
      updated_at: "2024-10-01T09:00:00Z",
      candidates: [],
      tasks: []
    }
  ],
  total: 1,
  page: 1,
  page_size: 20
};

describe("EventsPage", () => {
  beforeEach(() => {
    vi.mocked(getEvents).mockResolvedValue(sampleResponse);
  });

  it("renders events and summary", async () => {
    const Wrapper = createWrapper();
    render(<EventsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText(/Camp Invernale/)).toBeInTheDocument());
    expect(screen.getByText(/1 evento totale/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Camp Invernale/ })).toHaveAttribute("href", "/events/1");
  });

  it("applies status filter when submitting", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();
    render(<EventsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText(/Camp Invernale/)).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/Stato/i), "booked");
    await user.click(screen.getByRole("button", { name: /Filtra/i }));

    await waitFor(() =>
      expect(vi.mocked(getEvents)).toHaveBeenLastCalledWith({ page: 1, page_size: 20, status: "booked" })
    );
  });

  it("shows error message on failure", async () => {
    const Wrapper = createWrapper();
    vi.mocked(getEvents).mockRejectedValueOnce(new Error("boom"));

    render(<EventsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText(/Impossibile caricare gli eventi/i)).toBeInTheDocument());
  });
});
