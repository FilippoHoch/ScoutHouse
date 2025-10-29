import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, createStructure } from "../../shared/api";
import type { Structure } from "../../shared/types";
import { StructureCreatePage } from "../StructureCreate";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    createStructure: vi.fn()
  };
});

const createdStructure: Structure = {
  id: 1,
  name: "Base Bosco",
  slug: "base-bosco",
  province: "BS",
  address: "Via Bosco 1",
  latitude: 45.12,
  longitude: 9.12,
  type: "house",
  beds: 30,
  bathrooms: 4,
  showers: 4,
  dining_capacity: 40,
  has_kitchen: true,
  website_url: "https://example.org/base-bosco",
  notes: null,
  created_at: "2024-05-01T10:00:00Z",
  estimated_cost: null,
  cost_band: null,
  availabilities: null,
  cost_options: null,
  contacts: null
};

const createWrapper = (queryClient: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={["/structures/new"]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );

describe("StructureCreatePage", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    vi.mocked(createStructure).mockReset();
  });

  it("creates a structure and navigates to its detail page", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const Wrapper = createWrapper(queryClient);
    const user = userEvent.setup();
    vi.mocked(createStructure).mockResolvedValue(createdStructure);

    render(<StructureCreatePage />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText(/Nome/i), "Base Bosco");
    await user.selectOptions(screen.getByLabelText(/Tipologia/i), "house");
    await user.type(screen.getByLabelText(/Provincia/i), "bs");

    const slugInput = screen.getByLabelText(/Slug/i) as HTMLInputElement;
    expect(slugInput.value).toBe("base-bosco");

    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    await waitFor(() => expect(createStructure).toHaveBeenCalled());

    expect(createStructure).toHaveBeenCalledWith({
      name: "Base Bosco",
      slug: "base-bosco",
      type: "house",
      province: "BS",
      has_kitchen: false
    });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/structures/base-bosco"));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["structures"] });
  });

  it("shows an error message when the API rejects the request", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    const Wrapper = createWrapper(queryClient);
    const user = userEvent.setup();
    vi.mocked(createStructure).mockRejectedValue(new ApiError(400, { detail: "Slug already exists" }));

    render(<StructureCreatePage />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText(/Nome/i), "Base Bosco");
    await user.selectOptions(screen.getByLabelText(/Tipologia/i), "house");

    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    await waitFor(() =>
      expect(screen.getByText(/Slug already exists/i)).toBeInTheDocument()
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("validates required fields before submitting", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const Wrapper = createWrapper(queryClient);
    const user = userEvent.setup();

    render(<StructureCreatePage />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /Crea struttura/i }));

    expect(await screen.findByText(/Inserisci un nome per la struttura/i)).toBeInTheDocument();
    expect(screen.getByText(/Inserisci uno slug valido/i)).toBeInTheDocument();
    expect(screen.getByText(/Seleziona una tipologia/i)).toBeInTheDocument();
    expect(createStructure).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
