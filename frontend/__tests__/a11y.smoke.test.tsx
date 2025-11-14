import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "jest-axe";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import * as api from "../src/shared/api";
import * as auth from "../src/shared/auth";
import type {
  Event,
  EventMember,
  EventSummary,
  QuoteCalcResponse,
  QuoteListItem,
  StructureSearchResponse
} from "../src/shared/types";
import { LandingPage } from "../src/pages/Landing";
import { StructuresPage } from "../src/pages/Structures";
import { EventDetailsPage } from "../src/pages/EventDetails";
import i18n from "../src/i18n";
import { I18nextProvider } from "react-i18next";

const structuresResponse: StructureSearchResponse = {
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
      distance_km: 12.4,
      estimated_cost: 11.75,
      cost_band: "medium",
      seasons: ["summer"],
      units: ["LC", "EG"]
    }
  ],
  page: 1,
  page_size: 6,
  total: 1,
  sort: "distance",
  order: "asc",
  base_coords: { lat: 45.5966, lon: 10.1655 }
};

const mockEvent: Event = {
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
  created_at: "2024-11-01T00:00:00Z",
  updated_at: "2024-11-01T00:00:00Z",
  candidates: [
    {
      id: 10,
      event_id: 1,
      structure_id: 5,
      status: "to_contact",
      assigned_user: null,
      assigned_user_id: null,
      last_update: "2024-11-05T12:00:00Z",
      structure: {
        id: 5,
        name: "Casa Alpina",
        slug: "casa-alpina",
        province: "BG"
      },
      assigned_user_name: null
    }
  ],
  tasks: []
};

const mockSummary: EventSummary = {
  status_counts: {
    to_contact: 1,
    contacting: 0,
    available: 0,
    unavailable: 0,
    followup: 0,
    confirmed: 0,
    option: 0
  },
  has_conflicts: false
};

const mockMembers: EventMember[] = [
  {
    id: 1,
    event_id: 1,
    role: "owner",
    user: { id: "1", email: "owner@example.com", name: "Owner" }
  }
];

const mockQuoteCalc: QuoteCalcResponse = {
  currency: "EUR",
  totals: { subtotal: 1000, utilities: 50, city_tax: 20, deposit: 100, total: 1170 },
  breakdown: [],
  scenarios: {
    best: 900,
    realistic: 1000,
    worst: 1200
  },
  inputs: {}
};

const mockQuotes: QuoteListItem[] = [
  {
    id: 1,
    event_id: 1,
    structure_id: 5,
    structure_name: "Casa Alpina",
    scenario: "realistic",
    currency: "EUR",
    total: 1000,
    created_at: "2024-11-01T00:00:00Z"
  }
];

const createClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity
      }
    }
  });

const renderWithProviders = (ui: React.ReactNode) => {
  const client = createClient();
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.spyOn(auth, "useAuth").mockReturnValue({
    user: {
      id: "1",
      name: "Test",
      email: "test@example.com",
      is_admin: false,
      is_active: true,
      can_edit_structures: false,
      user_type: null,
      created_at: "2024-01-01T00:00:00Z"
    },
    accessToken: "token",
    status: "authenticated"
  } as ReturnType<typeof auth.useAuth>);

  vi.spyOn(api, "getStructures").mockResolvedValue(structuresResponse);
  vi.spyOn(api, "getEvent").mockResolvedValue(mockEvent);
  vi.spyOn(api, "getEventSummary").mockResolvedValue(mockSummary);
  vi.spyOn(api, "getEventMembers").mockResolvedValue(mockMembers);
  vi.spyOn(api, "getSuggestions").mockResolvedValue([]);
  vi.spyOn(api, "getQuotes").mockResolvedValue(mockQuotes);
  vi.spyOn(api, "addCandidate").mockResolvedValue(mockEvent.candidates![0]);
  vi.spyOn(api, "addEventMember").mockResolvedValue(mockMembers[0]);
  vi.spyOn(api, "addTask").mockResolvedValue({
    id: 1,
    structure_id: null,
    status: "todo",
    outcome: "pending",
    assigned_user_id: null,
    assigned_user_name: null,
    notes: null,
    last_update: "2024-11-05T12:00:00Z"
  });
  vi.spyOn(api, "patchCandidate").mockResolvedValue(mockEvent.candidates![0]);
  vi.spyOn(api, "patchTask").mockResolvedValue({
    id: 1,
    structure_id: null,
    status: "in_progress",
    outcome: "pending",
    assigned_user_id: null,
    assigned_user_name: null,
    notes: null,
    last_update: "2024-11-05T12:00:00Z"
  });
  vi.spyOn(api, "removeEventMember").mockResolvedValue(undefined);
  vi.spyOn(api, "updateEventMember").mockResolvedValue(mockMembers[0]);
  vi.spyOn(api, "calcQuote").mockResolvedValue(mockQuoteCalc);
  vi.spyOn(api, "createQuote").mockResolvedValue(mockQuotes[0]);
  vi.spyOn(api, "exportQuote").mockResolvedValue(new Blob());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("accessibility smoke tests", () => {
  test("landing page has no critical violations", async () => {
    const { container } = renderWithProviders(
      <MemoryRouter initialEntries={["/"]}>
        <LandingPage />
      </MemoryRouter>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test("structures page has no critical violations", async () => {
    const { container, findByText } = renderWithProviders(
      <MemoryRouter initialEntries={["/structures"]}>
        <StructuresPage />
      </MemoryRouter>
    );

    await findByText(/Casa Alpina/);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test("event details page has no critical violations", async () => {
    const { container, findByText } = renderWithProviders(
      <MemoryRouter initialEntries={["/events/1"]}>
        <Routes>
          <Route path="/events/:eventId" element={<EventDetailsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await findByText(/Camp Invernale/);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
