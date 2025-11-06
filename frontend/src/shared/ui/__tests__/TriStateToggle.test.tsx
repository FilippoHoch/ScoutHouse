import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TriStateToggle } from "../TriStateToggle";

const labels = {
  yes: "Sì",
  no: "No",
  unknown: "Sconosciuto",
};

describe("TriStateToggle", () => {
  it("maps tri-state values to select options and triggers onChange", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <TriStateToggle value={null} onChange={handleChange} labels={labels} />
    );

    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("unknown");

    await user.selectOptions(select, "yes");
    expect(handleChange).toHaveBeenLastCalledWith(true);

    rerender(
      <TriStateToggle value={true} onChange={handleChange} labels={labels} />
    );
    expect(select).toHaveValue("yes");

    await user.selectOptions(select, "no");
    expect(handleChange).toHaveBeenLastCalledWith(false);

    rerender(
      <TriStateToggle value={false} onChange={handleChange} labels={labels} />
    );
    expect(select).toHaveValue("no");

    await user.selectOptions(select, "unknown");
    expect(handleChange).toHaveBeenLastCalledWith(null);
  });

  it("supports disabling and custom attributes", () => {
    const handleChange = vi.fn();

    render(
      <TriStateToggle
        id="availability"
        name="availability"
        className="custom-class"
        ariaDescribedBy="hint"
        value={null}
        disabled
        onChange={handleChange}
        labels={labels}
      />
    );

    const select = screen.getByRole("combobox");
    expect(select).toHaveClass("tri-state-toggle__select", "custom-class");
    expect(select).toBeDisabled();
    expect(select).toHaveAttribute("aria-describedby", "hint");
    expect(select).toHaveAttribute("name", "availability");
    expect(select).toHaveAttribute("id", "availability");
  });
});
