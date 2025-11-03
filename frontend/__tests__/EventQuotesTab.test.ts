import { describe, expect, it } from "vitest";

import { computeNights } from "../src/pages/EventQuotesTab";

describe("computeNights", () => {
  it("returns zero when start and end dates are the same", () => {
    expect(computeNights("2024-05-01", "2024-05-01")).toBe(0);
  });

  it("returns the difference in nights when end date is after start date", () => {
    expect(computeNights("2024-05-01", "2024-05-04")).toBe(3);
  });
});
