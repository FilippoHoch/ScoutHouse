import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { LandingPage } from "../Landing";

describe("LandingPage", () => {
  it("renders call to action", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Welcome to ScoutHouse/i)).toBeInTheDocument();
  });
});
