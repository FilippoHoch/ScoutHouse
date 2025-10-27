import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { getStructures } from "../../shared/api";
import type { StructureSearchResponse } from "../../shared/types";
import { StructuresPage } from "../Structures";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    getStructures: vi.fn()
  };
});

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false }
    }
  });

  return (
    <MemoryRouter initialEntries={["/structures"]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const sample: StructureSearchResponse = {
  items: [],
  page: 1,
  page_size: 6,
  total: 0,
  sort: "distance",
  order: "asc",
  base_coords: { lat: 45.5966, lon: 10.1655 }
};

describe("StructuresPage filters", () => {
  beforeEach(() => {
    vi.mocked(getStructures).mockResolvedValue(sample);
  });

  it("sends season, unit, and cost band filters", async () => {
    const user = userEvent.setup();
    render(<StructuresPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /^Stagione$/i })).toBeInTheDocument()
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /^Stagione$/i }), "summer");
    await user.selectOptions(screen.getByRole("combobox", { name: /^Unità$/i }), "LC");
    await user.selectOptions(screen.getByRole("combobox", { name: /Fascia di costo/i }), "cheap");
    await user.click(screen.getByRole("button", { name: /Applica/i }));

    await waitFor(() =>
      expect(vi.mocked(getStructures)).toHaveBeenLastCalledWith(
        expect.objectContaining({ season: "summer", unit: "LC", cost_band: "cheap" })
      )
    );
  });
});
