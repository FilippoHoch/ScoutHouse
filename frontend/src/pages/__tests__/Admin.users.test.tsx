import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminPage } from "../Admin";
import {
  createUser,
  listUsers,
  previewMailTemplate,
  sendTestMail,
  updateUser
} from "../../shared/api";
import { useAuth } from "../../shared/auth";

vi.mock("../../shared/api", async () => {
  const actual = await vi.importActual<typeof import("../../shared/api")>("../../shared/api");
  return {
    ...actual,
    listUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    previewMailTemplate: vi.fn(),
    sendTestMail: vi.fn()
  };
});

vi.mock("../../shared/auth", () => ({
  useAuth: vi.fn()
}));

const mockUseAuth = vi.mocked(useAuth);
const mockListUsers = vi.mocked(listUsers);
const scrollIntoViewMock = vi.fn();

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: scrollIntoViewMock
  });
});

afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: originalScrollIntoView
  });
});

const sampleUsers = [
  {
    id: "1",
    name: "Filippo Hoch",
    email: "hoch.filippo@gmail.com",
    is_admin: true,
    can_edit_structures: true,
    is_active: true,
    user_type: "LC",
    created_at: "2025-11-01T00:00:00Z"
  },
  {
    id: "2",
    name: "Luisa Bianchi",
    email: "luisa.bianchi@example.com",
    is_admin: false,
    can_edit_structures: false,
    is_active: false,
    user_type: null,
    created_at: "2025-10-15T00:00:00Z"
  }
];

describe("AdminPage user selection", () => {
  beforeEach(() => {
    scrollIntoViewMock.mockReset();
    mockUseAuth.mockReturnValue({
      user: {
        id: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        is_admin: true,
        can_edit_structures: true,
        is_active: true,
        user_type: null,
        created_at: "2024-01-01T00:00:00Z"
      },
      accessToken: "token",
      status: "authenticated"
    });

    mockListUsers.mockResolvedValue(sampleUsers);
    vi.mocked(createUser).mockResolvedValue(sampleUsers[0]);
    vi.mocked(updateUser).mockResolvedValue(sampleUsers[0]);
    vi.mocked(previewMailTemplate).mockResolvedValue({
      template: "reset_password",
      subject: "Subject",
      html: "<p>Preview</p>",
      text: "Preview"
    });
    vi.mocked(sendTestMail).mockResolvedValue({
      provider: "smtp",
      blocked: false,
      subject: "Subject",
      html: "<p>Mail</p>",
      text: "Mail",
      job_id: "job-1"
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the selected user details in the edit form when clicking Modifica", async () => {
    const user = userEvent.setup();
    render(<AdminPage />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Aggiorna elenco/i })).toBeInTheDocument()
    );
    await waitFor(() => expect(screen.getByText("Filippo Hoch")).toBeInTheDocument());

    const editCard = screen
      .getByRole("heading", { level: 2, name: /Modifica utente selezionato/i })
      .closest(".card");
    expect(editCard).not.toBeNull();

    const nameInput = within(editCard as HTMLElement).getByLabelText(/Nome completo/i);
    expect(nameInput).toHaveValue("Filippo Hoch");

    const secondRow = screen.getByRole("row", { name: /Luisa Bianchi/i });
    const editButton = within(secondRow).getByRole("button", { name: /Modifica/i });
    await user.click(editButton);

    await waitFor(() => expect(nameInput).toHaveValue("Luisa Bianchi"));
    await waitFor(() => expect(nameInput).toHaveFocus());
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });
});
