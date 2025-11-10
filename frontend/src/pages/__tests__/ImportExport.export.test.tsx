import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { ImportExportPage } from "../ImportExport";
import { exportEvents, exportStructures } from "../../shared/api";
import { useAuth } from "../../shared/auth";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    exportStructures: vi.fn(),
    exportEvents: vi.fn()
  };
});

vi.mock("../../shared/auth", () => ({
  useAuth: vi.fn()
}));

const mockUseAuth = vi.mocked(useAuth);

describe("ImportExportPage exports", () => {
  const createObjectURLMock = vi.fn(() => "blob:download");
  const revokeObjectURLMock = vi.fn();

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "user-1",
        email: "admin@example.com",
        name: "Admin",
        is_admin: true,
        can_edit_structures: true,
        is_active: true,
        created_at: "2024-01-01T00:00:00Z"
      },
      accessToken: "token",
      status: "authenticated"
    });
    vi.mocked(exportStructures).mockResolvedValue(
      new Blob(["structures"], { type: "text/csv" })
    );
    vi.mocked(exportEvents).mockResolvedValue(new Blob(["events"], { type: "text/csv" }));
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

  it("exports structures with selected filters", async () => {
    const user = userEvent.setup();
    render(<ImportExportPage />);

    await user.type(screen.getByLabelText(/^Ricerca$/i), "alpina");
    await user.type(screen.getByLabelText(/^Provincia/i), "MI");
    await user.selectOptions(screen.getByLabelText(/Tipologia/i), "house");

    const [structuresCsvButton] = screen.getAllByRole("button", { name: /Esporta CSV/i });
    await user.click(structuresCsvButton);

    await waitFor(() => expect(exportStructures).toHaveBeenCalledWith(
      "csv",
      expect.objectContaining({ q: "alpina", province: "MI", type: "house" })
    ));
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalled();
    expect(
      screen.getByText(/Download avviato \(CSV\)/i)
    ).toBeInTheDocument();
  });

  it("exports events with additional filters", async () => {
    const user = userEvent.setup();
    render(<ImportExportPage />);

    const [, eventsCsvButton] = screen.getAllByRole("button", { name: /Esporta CSV/i });
    await user.type(screen.getByLabelText(/Ricerca eventi/i), "campo");
    await user.selectOptions(screen.getByLabelText(/^Branca/i), "LC");
    await user.selectOptions(screen.getByLabelText(/^Stato/i), "planning");
    await user.selectOptions(screen.getByLabelText(/^Budget/i), "with");
    await user.type(screen.getByLabelText(/^Dal/i), "2025-01-01");
    await user.type(screen.getByLabelText(/^Al/i), "2025-01-31");
    await user.click(eventsCsvButton);

    await waitFor(() =>
      expect(exportEvents).toHaveBeenCalledWith(
        "csv",
        expect.objectContaining({
          q: "campo",
          branch: "LC",
          status: "planning",
          budget: "with",
          from: "2025-01-01",
          to: "2025-01-31",
        })
      )
    );
  });

  it("shows import restriction message for non-admin users", () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "user-2",
        email: "user@example.com",
        name: "User",
        is_admin: false,
        can_edit_structures: false,
        is_active: true,
        created_at: "2024-01-01T00:00:00Z"
      },
      accessToken: "token",
      status: "authenticated"
    });
    render(<ImportExportPage />);

    expect(screen.getByText(/Solo gli amministratori/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Export/i })).toBeInTheDocument();
  });
});
