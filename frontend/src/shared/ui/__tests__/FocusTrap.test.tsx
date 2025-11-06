import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FocusTrap } from "../FocusTrap";

describe("FocusTrap", () => {
  it("focuses the first focusable child on mount and restores focus on cleanup", async () => {
    const user = userEvent.setup();

    const outside = document.createElement("button");
    outside.type = "button";
    outside.textContent = "Outside";
    document.body.appendChild(outside);
    outside.focus();

    const { unmount } = render(
      <FocusTrap>
        <button type="button">First</button>
        <button type="button">Second</button>
      </FocusTrap>
    );

    const first = await screen.findByRole("button", { name: "First" });
    expect(document.activeElement).toBe(first);

    await user.tab();
    const second = screen.getByRole("button", { name: "Second" });
    expect(document.activeElement).toBe(second);

    unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("wraps focus when tabbing forward and backward", async () => {
    const user = userEvent.setup();

    render(
      <FocusTrap>
        <button type="button">First</button>
        <button type="button">Second</button>
        <button type="button">Third</button>
      </FocusTrap>
    );

    const first = screen.getByRole("button", { name: "First" });
    const second = screen.getByRole("button", { name: "Second" });
    const third = screen.getByRole("button", { name: "Third" });

    expect(document.activeElement).toBe(first);

    await user.tab();
    expect(document.activeElement).toBe(second);

    await user.tab();
    expect(document.activeElement).toBe(third);

    await user.tab();
    expect(document.activeElement).toBe(first);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(third);
  });

  it("focuses the container itself when no tabbable children exist", async () => {
    const user = userEvent.setup();

    render(
      <FocusTrap>
        <p>Just text</p>
      </FocusTrap>
    );

    const container = document.querySelector('[data-focus-trap]') as HTMLElement;
    expect(container).not.toBeNull();
    expect(document.activeElement).toBe(container);

    await user.tab();
    expect(document.activeElement).toBe(container);
  });
});
