import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { I18nextProvider } from "react-i18next";

import i18n from "../src/i18n";
import { Layout } from "../src/shared/ui/Layout";

vi.mock("../src/shared/auth", () => ({
  useAuth: () => ({
    user: {
      id: "1",
      name: "Test",
      email: "test@example.com",
      is_admin: false,
      can_edit_structures: false,
      created_at: "2024-01-01T00:00:00Z"
    },
    accessToken: "token",
    status: "authenticated" as const
  }),
  logout: vi.fn()
}));

describe("i18n setup", () => {
  test("renders navigation labels in Italian", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <I18nextProvider i18n={i18n}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<div>Benvenuto</div>} />
            </Route>
          </Routes>
        </I18nextProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Strutture" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Eventi" })).toBeInTheDocument();
  });
});
