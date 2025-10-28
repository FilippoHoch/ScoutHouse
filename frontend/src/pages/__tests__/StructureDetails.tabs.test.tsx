import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { getStructureBySlug } from "../../shared/api";
import type { Structure } from "../../shared/types";
import { StructureDetailsPage } from "../StructureDetails";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    getStructureBySlug: vi.fn()
  };
});

const Wrapper = ({ initialPath, children }: { initialPath: string; children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const structureWithDetails: Structure = {
  id: 99,
  name: "Test Base",
  slug: "test-base",
  province: "BS",
  address: null,
  latitude: null,
  longitude: null,
  type: "mixed",
  created_at: new Date("2024-05-01T00:00:00Z").toISOString(),
  estimated_cost: 9.5,
  cost_band: "cheap",
  availabilities: [
    { id: 1, season: "summer", units: ["LC"], capacity_min: 10, capacity_max: 40 }
  ],
  cost_options: [
    {
      id: 2,
      model: "per_person_day",
      amount: 9.5,
      currency: "EUR",
      deposit: 50,
      city_tax_per_night: 1.2,
      utilities_flat: null,
      age_rules: null
    }
  ]
};

describe("StructureDetailsPage tabs", () => {
  beforeEach(() => {
    vi.mocked(getStructureBySlug).mockResolvedValue(structureWithDetails);
  });

  it("shows availability and cost information in dedicated tabs", async () => {
    const user = userEvent.setup();
    render(
      <Routes>
        <Route path="/structures/:slug" element={<StructureDetailsPage />} />
      </Routes>,
      { wrapper: ({ children }) => <Wrapper initialPath="/structures/test-base">{children}</Wrapper> }
    );

    await waitFor(() => expect(screen.getByText(/Test Base/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Availability/i }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText(/summer/i)).toBeInTheDocument();
    expect(screen.getByText(/LC/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Costs/i }));
    expect(screen.getByText(/per_person_day/i)).toBeInTheDocument();
    expect(screen.getByText(/Deposit:/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Allegati/i }));
    expect(screen.getByText(/Accedi per visualizzare gli allegati/)).toBeInTheDocument();
  });
});
