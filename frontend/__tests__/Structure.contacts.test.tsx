import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StructureDetailsPage } from "../src/pages/StructureDetails";
import {
  createStructureContact,
  getStructureBySlug,
  updateStructureContact
} from "../src/shared/api";
import type { Contact, Structure } from "../src/shared/types";

vi.mock("../src/shared/api", async () => {
  const actual = await vi.importActual<typeof import("../src/shared/api")>("../src/shared/api");
  return {
    ...actual,
    getStructureBySlug: vi.fn(),
    createStructureContact: vi.fn(),
    updateStructureContact: vi.fn()
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

describe("Structure contacts management", () => {
  let structureData: Structure;

  beforeEach(() => {
    structureData = {
      id: 12,
      name: "Base Test",
      slug: "base-test",
      province: "MI",
      address: "Via Test 1",
      latitude: 45.0,
      longitude: 9.0,
      type: "house",
      created_at: new Date("2024-03-01T10:00:00Z").toISOString(),
      estimated_cost: null,
      cost_band: null,
      availabilities: [],
      cost_options: [],
      contacts: [
        {
          id: 1,
          structure_id: 12,
          name: "Mario Rossi",
          role: "Referente",
          email: "mario@example.com",
          phone: "+39 123456789",
          preferred_channel: "email",
          is_primary: false,
          notes: null,
          gdpr_consent_at: null,
          created_at: new Date("2024-03-02T09:00:00Z").toISOString(),
          updated_at: new Date("2024-03-02T09:00:00Z").toISOString()
        }
      ]
    };

    vi.mocked(getStructureBySlug).mockImplementation(async () => structureData);

    vi.mocked(createStructureContact).mockImplementation(async () => {
      const newContact: Contact = {
        id: 2,
        structure_id: 12,
        name: "Lucia Bianchi",
        role: "Amministrazione",
        email: "lucia@example.com",
        phone: "+39 987654321",
        preferred_channel: "phone",
        is_primary: true,
        notes: null,
        gdpr_consent_at: null,
        created_at: new Date("2024-03-03T08:00:00Z").toISOString(),
        updated_at: new Date("2024-03-03T08:00:00Z").toISOString()
      };
      structureData = {
        ...structureData,
        contacts: [
          ...structureData.contacts!.map((contact) => ({ ...contact, is_primary: false })),
          newContact
        ]
      };
      return newContact;
    });

    vi.mocked(updateStructureContact).mockImplementation(async (_structureId, contactId, payload) => {
      structureData = {
        ...structureData,
        contacts: structureData.contacts!.map((contact) => {
          if (contact.id === contactId) {
            return { ...contact, ...payload };
          }
          if (payload.is_primary) {
            return { ...contact, is_primary: false };
          }
          return contact;
        })
      };
      const updated = structureData.contacts!.find((contact) => contact.id === contactId)!;
      return updated;
    });
  });

  it("allows creating a contact and promoting primary", async () => {
    const Wrapper = createWrapper("/structures/base-test");

    render(
      <Routes>
        <Route path="/structures/:slug" element={<StructureDetailsPage />} />
      </Routes>,
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(screen.getByText("Base Test")).toBeInTheDocument());

    const contactsTab = screen.getByRole("button", { name: "Contatti" });
    fireEvent.click(contactsTab);

    await waitFor(() => expect(screen.getByText("Mario Rossi")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Nuovo contatto" }));

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Lucia Bianchi" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "lucia@example.com" } });
    fireEvent.change(screen.getByLabelText("Telefono"), { target: { value: "+39 987654321" } });
    fireEvent.change(screen.getByLabelText("Canale preferito"), { target: { value: "phone" } });
    fireEvent.click(screen.getByLabelText("Segna come contatto primario"));

    fireEvent.click(screen.getByRole("button", { name: "Crea contatto" }));

    await waitFor(() => expect(screen.getByText("Lucia Bianchi")).toBeInTheDocument());

    const rows = screen.getAllByRole("row");
    const firstDataRow = rows[1];
    const secondDataRow = rows[2];

    expect(within(firstDataRow).getByText("Lucia Bianchi")).toBeInTheDocument();
    expect(within(firstDataRow).getByText("Sì")).toBeInTheDocument();
    expect(within(secondDataRow).getByText("Mario Rossi")).toBeInTheDocument();
    expect(within(secondDataRow).getByText("No")).toBeInTheDocument();

    fireEvent.click(
      within(secondDataRow).getByRole("button", { name: "Imposta come primario" })
    );

    await waitFor(() => expect(vi.mocked(updateStructureContact)).toHaveBeenCalled());

    await waitFor(() => {
      expect(within(secondDataRow).getByText("Sì")).toBeInTheDocument();
      expect(within(firstDataRow).getByText("No")).toBeInTheDocument();
    });
  });
});
