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

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={["/structures"]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const sampleResponse: StructureSearchResponse = {
  items: [
    {
      id: 1,
      slug: "casa-alpina",
      name: "Casa Alpina",
      province: "BS",
      address: "Via Roma 1",
      latitude: 45.6,
      longitude: 10.16,
      type: "house",
      distance_km: 12.4
    },
    {
      id: 2,
      slug: "campo-verde",
      name: "Campo Verde",
      province: "VR",
      address: null,
      latitude: null,
      longitude: null,
      type: "land",
      distance_km: null
    }
  ],
  page: 1,
  page_size: 6,
  total: 2,
  sort: "distance",
  order: "asc",
  base_coords: { lat: 45.5966, lon: 10.1655 }
};

describe("StructuresPage", () => {
  beforeEach(() => {
    vi.mocked(getStructures).mockResolvedValue(sampleResponse);
  });

  it("renders filters and structure results", async () => {
    const Wrapper = createWrapper();
    render(<StructuresPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Casa Alpina")).toBeInTheDocument());
    expect(screen.getByLabelText(/Search/i)).toBeInTheDocument();
    expect(screen.getByText(/Distance: 12.4 km/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Casa Alpina/i })).toHaveAttribute(
      "href",
      "/structures/casa-alpina"
    );
  });

  it("applies filters when submitting the form", async () => {
    const Wrapper = createWrapper();
    const user = userEvent.setup();
    render(<StructuresPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Casa Alpina")).toBeInTheDocument());

    await user.type(screen.getByLabelText(/Search/i), "alpina");
    await user.selectOptions(screen.getByLabelText(/Province/i), "BS");
    await user.selectOptions(screen.getByLabelText(/Type/i), "house");
    await user.type(screen.getByLabelText(/Max distance/i), "25");
    await user.click(screen.getByRole("button", { name: /Apply/i }));

    await waitFor(() =>
      expect(vi.mocked(getStructures)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          q: "alpina",
          province: "BS",
          type: "house",
          max_km: 25,
          sort: "distance",
          order: "asc",
          page: 1,
          page_size: 6
        })
      )
    );
  });

  it("shows an error message when the API fails", async () => {
    const Wrapper = createWrapper();
    vi.mocked(getStructures).mockRejectedValueOnce(new Error("boom"));

    render(<StructuresPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText(/Unable to load structures/i)).toBeInTheDocument());
  });
});
