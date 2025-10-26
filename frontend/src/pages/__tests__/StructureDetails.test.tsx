import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ApiError, getStructureBySlug } from "../../shared/api";
import type { Structure } from "../../shared/types";
import { StructureDetailsPage } from "../StructureDetails";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    getStructureBySlug: vi.fn()
  };
});

const createWrapper = (initialPath: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const sampleStructure: Structure = {
  id: 1,
  name: "Casa Alpina",
  slug: "casa-alpina",
  province: "BS",
  address: "Via Roma 1",
  latitude: 45.6,
  longitude: 10.16,
  type: "house",
  created_at: new Date("2024-01-01T00:00:00Z").toISOString()
};

describe("StructureDetailsPage", () => {
  beforeEach(() => {
    vi.mocked(getStructureBySlug).mockResolvedValue(sampleStructure);
  });

  it("renders structure details when found", async () => {
    const Wrapper = createWrapper("/structures/casa-alpina");

    render(
      <Routes>
        <Route path="/structures/:slug" element={<StructureDetailsPage />} />
      </Routes>,
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(screen.getByText("Casa Alpina")).toBeInTheDocument());
    expect(screen.getByText(/Open in Google Maps/)).toBeInTheDocument();
    expect(screen.getByText(/Coordinates:/)).toBeInTheDocument();
  });

  it("shows not found state for missing structure", async () => {
    const Wrapper = createWrapper("/structures/unknown");
    vi.mocked(getStructureBySlug).mockRejectedValueOnce(new ApiError(404, {}));

    render(
      <Routes>
        <Route path="/structures/:slug" element={<StructureDetailsPage />} />
      </Routes>,
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(screen.getByText(/could not be located/i)).toBeInTheDocument());
  });
});
